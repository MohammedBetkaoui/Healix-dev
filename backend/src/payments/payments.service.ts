import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { type Payment, type Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountType } from '../common/enums/account-type.enum';
import { BillingPeriod } from '../common/enums/billing-period.enum';
import { PaymentMethod } from '../common/enums/payment-method.enum';
import { PaymentProofDocumentType } from '../common/enums/payment-proof-document-type.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionPlansService } from '../subscriptions/plans/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { SyntheticChargilyPaymentDto } from './dto/synthetic-chargily-payment.dto';
import { UploadPaymentProofDto } from './dto/upload-payment-proof.dto';
import { PaymentProofService } from './proofs/payment-proof.service';
import { PaymentProofStorageService } from './proofs/payment-proof-storage.service';
import { PaymentProofValidator } from './proofs/payment-proof-validator';
import { getCardLast4, normalizeCardHolderName } from './utils/card-mask.util';
import { createPaymentReference } from './utils/payment-reference.util';
import { isValidSyntheticChargilyCard } from './utils/synthetic-card-validator';

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type UploadPaymentProofInput = {
  file: Express.Multer.File;
  proofType: PaymentProofDocumentType;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly plansService: SubscriptionPlansService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly proofService: PaymentProofService,
    private readonly proofStorageService: PaymentProofStorageService,
    private readonly proofValidator: PaymentProofValidator,
  ) {}

  async createIntent(
    userId: string,
    dto: CreatePaymentIntentDto,
    context: RequestContext = {},
  ) {
    const user = await this.prisma.user.findUnique({
      include: {
        doctorProfile: true,
        establishment: true,
      },
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }

    const accountContext =
      this.subscriptionsService.getAccountContextFromUser(user);
    this.subscriptionsService.assertCanStartPayment(accountContext);

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        active: true,
        OR: [{ id: dto.planId }, { code: dto.planId }],
      },
    });

    if (!plan) {
      throw new NotFoundException('Plan introuvable.');
    }

    if (plan.custom) {
      throw new BadRequestException(
        "Ce plan necessite un contact avec l'equipe HealixDZ.",
      );
    }

    if (plan.accountType !== accountContext.accountType) {
      throw new ForbiddenException('Ce plan ne correspond pas a votre compte.');
    }

    const amount = this.getPlanAmount(plan, dto.billingPeriod);
    const status = this.getInitialPaymentStatus(dto.paymentMethod);
    const reference = await this.generateUniqueReference();

    const payment = await this.prisma.payment.create({
      data: {
        accountType: accountContext.accountType,
        amount,
        billingPeriod: dto.billingPeriod,
        currency: plan.currency,
        method: dto.paymentMethod,
        planId: plan.id,
        provider:
          dto.paymentMethod === PaymentMethod.SYNTHETIC_CHARGILY
            ? 'CHARGILY_DEMO'
            : null,
        reference,
        status,
        syntheticMode: true,
        userId,
      },
    });

    await this.auditLogsService.createAuditLog({
      action: 'PAYMENT_INTENT_CREATED',
      entityId: payment.id,
      entityType: 'PAYMENT',
      ipAddress: context.ipAddress,
      metadata: {
        accountType: accountContext.accountType,
        amount,
        billingPeriod: dto.billingPeriod,
        method: dto.paymentMethod,
        planId: plan.id,
        reference,
      },
      userAgent: context.userAgent,
      userId,
    });

    return {
      paymentId: payment.id,
      reference: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      nextAction: this.getNextAction(payment.method),
      redirectTo: this.getCheckoutRedirect(payment.method, payment.id),
      ccp: this.getCcpForMethod(payment.method),
    };
  }

  async payWithSyntheticChargily(
    userId: string,
    paymentId: string,
    dto: SyntheticChargilyPaymentDto,
    context: RequestContext = {},
  ) {
    this.assertExpiryIsValid(dto.expiryYear);
    const payment = await this.findOwnedPaymentOrThrow(userId, paymentId);

    if (payment.method !== PaymentMethod.SYNTHETIC_CHARGILY) {
      throw new BadRequestException('Methode de paiement invalide.');
    }

    this.assertPaymentCanBePaid(payment);

    // This is a demo synthetic payment flow only. Production must use Chargily checkout + webhook.
    if (!isValidSyntheticChargilyCard(dto)) {
      await this.prisma.payment.update({
        data: {
          providerStatus: 'FAILED_DEMO_CARD',
          status: PaymentStatus.FAILED,
        },
        where: { id: payment.id },
      });
      await this.auditLogsService.createAuditLog({
        action: 'SYNTHETIC_CHARGILY_PAYMENT_FAILED',
        entityId: payment.id,
        entityType: 'PAYMENT',
        ipAddress: context.ipAddress,
        metadata: {
          last4: getCardLast4(dto.cardNumber),
          reason: 'DEMO_CARD_REJECTED',
          reference: payment.reference,
        },
        userAgent: context.userAgent,
        userId,
      });
      throw new BadRequestException(
        'Paiement refuse. Verifiez les informations de paiement.',
      );
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const updatedPayment = await transaction.payment.update({
        data: {
          cardHolderName: normalizeCardHolderName(dto.cardHolderName),
          cardLast4: getCardLast4(dto.cardNumber),
          paidAt: new Date(),
          providerStatus: 'PAID_DEMO',
          status: PaymentStatus.PAID,
        },
        where: { id: payment.id },
      });

      const subscription =
        await this.subscriptionsService.activateSubscriptionForPayment(
          updatedPayment,
          transaction,
        );

      await transaction.payment.update({
        data: {
          subscriptionId: subscription.id,
        },
        where: {
          id: updatedPayment.id,
        },
      });

      await this.subscriptionsService.updateAccountToActive(
        updatedPayment.userId,
        updatedPayment.accountType,
        transaction,
      );

      await this.auditLogsService.createAuditLog(
        {
          action: 'SYNTHETIC_CHARGILY_PAYMENT_SUCCESS',
          entityId: updatedPayment.id,
          entityType: 'PAYMENT',
          ipAddress: context.ipAddress,
          metadata: {
            amount: updatedPayment.amount,
            last4: updatedPayment.cardLast4,
            reference: updatedPayment.reference,
          },
          userAgent: context.userAgent,
          userId,
        },
        transaction,
      );
      await this.auditLogsService.createAuditLog(
        {
          action: 'SUBSCRIPTION_ACTIVATED',
          entityId: subscription.id,
          entityType: 'SUBSCRIPTION',
          ipAddress: context.ipAddress,
          metadata: {
            accountType: updatedPayment.accountType,
            paymentId: updatedPayment.id,
            planId: updatedPayment.planId,
            reference: updatedPayment.reference,
          },
          userAgent: context.userAgent,
          userId,
        },
        transaction,
      );

      return {
        payment: updatedPayment,
        subscription,
      };
    });

    return {
      message: 'Paiement demo accepte. Abonnement active.',
      payment: this.toPublicPayment(result.payment),
      subscriptionId: result.subscription.id,
    };
  }

  async uploadProof(
    userId: string,
    paymentId: string,
    input: UploadPaymentProofInput,
    context: RequestContext = {},
  ) {
    const payment = await this.findOwnedPaymentOrThrow(userId, paymentId);

    if (
      payment.method !== PaymentMethod.MANUAL_POST_TRANSFER &&
      payment.method !== PaymentMethod.BARIDIMOB_RECEIPT
    ) {
      throw new BadRequestException(
        'Cette methode ne necessite pas de preuve de paiement.',
      );
    }

    if (payment.status === PaymentStatus.PAID) {
      throw new ConflictException('Ce paiement est deja valide.');
    }

    this.proofService.assertProofTypeMatchesPaymentMethod(
      payment.method,
      input.proofType,
    );

    const extension = this.proofValidator.validate(input.file);
    const previousProof = await this.proofService.findByPaymentId(payment.id);
    const storedProof = await this.proofStorageService.storePaymentProof({
      extension,
      file: input.file,
      paymentId: payment.id,
      proofType: input.proofType,
      userId,
    });

    const proof = await this.prisma.$transaction(async (transaction) => {
      const savedProof = await this.proofService.upsertProof(
        {
          checksum: storedProof.checksum,
          documentType: input.proofType,
          localPath: storedProof.localPath,
          mimeType: input.file.mimetype,
          originalName: storedProof.originalName,
          paymentId: payment.id,
          size: input.file.size,
          storedName: storedProof.storedName,
        },
        transaction,
      );

      await transaction.payment.update({
        data: {
          proofDocumentId: savedProof.id,
          status: PaymentStatus.WAITING_ADMIN_REVIEW,
        },
        where: { id: payment.id },
      });

      await this.auditLogsService.createAuditLog(
        {
          action:
            input.proofType === PaymentProofDocumentType.BARIDIMOB_RECEIPT
              ? 'BARIDIMOB_RECEIPT_UPLOADED'
              : 'PAYMENT_PROOF_UPLOADED',
          entityId: payment.id,
          entityType: 'PAYMENT',
          ipAddress: context.ipAddress,
          metadata: {
            documentType: input.proofType,
            method: payment.method,
            reference: payment.reference,
          },
          userAgent: context.userAgent,
          userId,
        },
        transaction,
      );

      return savedProof;
    });

    if (previousProof) {
      await this.proofStorageService.deleteLocalFile(previousProof.localPath);
    }

    return {
      message: 'Preuve de paiement envoyee avec succes.',
      paymentStatus: PaymentStatus.WAITING_ADMIN_REVIEW,
      proof: this.proofService.toPublicProof(proof),
    };
  }

  async getPayment(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      include: {
        plan: true,
        proofDocument: true,
        subscription: true,
      },
      where: {
        id: paymentId,
        userId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Paiement introuvable.');
    }

    return this.toPublicPayment(payment);
  }

  async findPaymentForActivation(
    paymentId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    const payment = await client.payment.findUnique({
      include: {
        plan: true,
        proofDocument: true,
        user: {
          include: {
            doctorProfile: true,
            establishment: true,
          },
        },
      },
      where: {
        id: paymentId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Paiement introuvable.');
    }

    return payment;
  }

  getPlanAmount(
    plan: { annualPrice: number | null; monthlyPrice: number | null },
    billingPeriod: BillingPeriod,
  ): number {
    const amount =
      billingPeriod === BillingPeriod.ANNUAL
        ? plan.annualPrice
        : plan.monthlyPrice;

    if (!amount) {
      throw new BadRequestException('Plan non payable directement.');
    }

    return amount;
  }

  toPublicPayment(
    payment: Payment & {
      plan?: {
        id: string;
        name: string;
        code: string;
        currency: string;
        monthlyPrice: number | null;
        annualPrice: number | null;
      };
      proofDocument?: {
        id: string;
        documentType: string;
        originalName: string;
        mimeType: string;
        size: number;
        uploadedAt: Date;
      } | null;
      subscription?: {
        id: string;
        status: string;
        startedAt: Date | null;
        expiresAt: Date | null;
      } | null;
    },
  ) {
    return {
      id: payment.id,
      reference: payment.reference,
      accountType: payment.accountType,
      amount: payment.amount,
      currency: payment.currency,
      billingPeriod: payment.billingPeriod,
      method: payment.method,
      status: payment.status,
      cardLast4: payment.cardLast4,
      cardHolderName: payment.cardHolderName,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      rejectionReason: payment.rejectionReason,
      plan: payment.plan,
      proof: payment.proofDocument
        ? this.proofService.toPublicProof(payment.proofDocument)
        : null,
      subscription: payment.subscription,
    };
  }

  private async findOwnedPaymentOrThrow(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        userId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Paiement introuvable.');
    }

    return payment;
  }

  private assertPaymentCanBePaid(payment: Payment): void {
    if (payment.status === PaymentStatus.PAID) {
      throw new ConflictException('Ce paiement est deja valide.');
    }

    if (
      payment.status !== PaymentStatus.CREATED &&
      payment.status !== PaymentStatus.WAITING_PAYMENT
    ) {
      throw new ConflictException('Ce paiement ne peut plus etre traite.');
    }
  }

  private assertExpiryIsValid(expiryYear: string): void {
    const year = Number(expiryYear);
    const currentYear = new Date().getFullYear();

    if (!Number.isInteger(year) || year < currentYear) {
      throw new BadRequestException('Date expiration invalide.');
    }
  }

  private getInitialPaymentStatus(method: PaymentMethod): PaymentStatus {
    if (method === PaymentMethod.SYNTHETIC_CHARGILY) {
      return PaymentStatus.CREATED;
    }

    if (method === PaymentMethod.MANUAL_CASH) {
      return PaymentStatus.WAITING_ADMIN_REVIEW;
    }

    return PaymentStatus.WAITING_PAYMENT;
  }

  private getNextAction(method: PaymentMethod): string {
    if (method === PaymentMethod.SYNTHETIC_CHARGILY) {
      return 'OPEN_SYNTHETIC_CHARGILY_PAGE';
    }

    if (method === PaymentMethod.MANUAL_CASH) {
      return 'WAIT_ADMIN_CASH_ACTIVATION';
    }

    return 'UPLOAD_PAYMENT_PROOF';
  }

  private getCheckoutRedirect(method: PaymentMethod, paymentId: string): string {
    if (method === PaymentMethod.SYNTHETIC_CHARGILY) {
      return `/subscription/checkout/synthetic-chargily?paymentId=${paymentId}`;
    }

    if (method === PaymentMethod.BARIDIMOB_RECEIPT) {
      return `/subscription/checkout/baridimob?paymentId=${paymentId}`;
    }

    if (method === PaymentMethod.MANUAL_POST_TRANSFER) {
      return `/subscription/checkout/manual-proof?paymentId=${paymentId}`;
    }

    return `/subscription/payment-status/${paymentId}`;
  }

  private getCcpForMethod(method: PaymentMethod): string | null {
    if (
      method === PaymentMethod.MANUAL_POST_TRANSFER ||
      method === PaymentMethod.BARIDIMOB_RECEIPT
    ) {
      return '00799999002888754878';
    }

    return null;
  }

  private async generateUniqueReference(): Promise<string> {
    const currentCount = await this.prisma.payment.count();

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const reference = createPaymentReference(currentCount + attempt);
      const existing = await this.prisma.payment.findUnique({
        select: { id: true },
        where: { reference },
      });

      if (!existing) {
        return reference;
      }
    }

    throw new ConflictException('Impossible de generer une reference unique.');
  }
}
