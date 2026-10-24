import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  NotificationCategory,
  NotificationResourceType,
  NotificationSeverity,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { type Payment, type Prisma } from '@prisma/client';
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationProducerService } from '../../notifications/notification-producer.service';
import {
  createPaginationMeta,
  getPagination,
} from '../../admin/shared/admin-pagination.util';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import {
  AdminApprovePaymentDto,
  AdminRejectPaymentDto,
} from '../dto/admin-review-payment.dto';
import { ListPaymentsQueryDto } from '../dto/list-payments-query.dto';
import { PaymentProofService } from '../proofs/payment-proof.service';
import { PaymentsService } from '../payments.service';

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type DocumentStreamResult = {
  stream: ReturnType<typeof createReadStream>;
  originalName: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class AdminPaymentsService {
  private readonly uploadRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly paymentsService: PaymentsService,
    private readonly proofService: PaymentProofService,
    private readonly subscriptionsService: SubscriptionsService,
    configService: ConfigService,
    @Optional()
    private readonly notificationProducer?: NotificationProducerService,
  ) {
    this.uploadRoot = resolve(
      process.cwd(),
      configService.get<string>('UPLOAD_ROOT') ?? './uploads',
    );
  }

  async listPayments(query: ListPaymentsQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where = this.buildWhere(query);

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        include: {
          plan: true,
          proofDocument: true,
          user: {
            select: {
              email: true,
              fullName: true,
              phone: true,
              role: true,
            },
          },
        },
        orderBy: {
          [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
        },
        skip,
        take: limit,
        where,
      }),
    ]);

    return {
      data: payments.map((payment) => ({
        id: payment.id,
        reference: payment.reference,
        userName: payment.user.fullName,
        userEmail: payment.user.email,
        userPhone: payment.user.phone,
        userRole: payment.user.role,
        accountType: payment.accountType,
        plan: {
          id: payment.plan.id,
          name: payment.plan.name,
          code: payment.plan.code,
        },
        amount: payment.amount,
        currency: payment.currency,
        billingPeriod: payment.billingPeriod,
        method: payment.method,
        status: payment.status,
        createdAt: payment.createdAt,
        proof: this.proofService.toPublicProof(payment.proofDocument),
      })),
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async getPaymentById(
    id: string,
    adminId: string,
    context: RequestContext = {},
  ) {
    const payment = await this.findPaymentOrThrow(id);

    await this.auditLogsService.createAuditLog({
      action: 'ADMIN_VIEWED_PAYMENT',
      entityId: payment.id,
      entityType: 'PAYMENT',
      ipAddress: context.ipAddress,
      metadata: {
        method: payment.method,
        reference: payment.reference,
        status: payment.status,
      },
      userAgent: context.userAgent,
      userId: adminId,
    });

    return this.toAdminPaymentDetail(payment);
  }

  async approvePayment(
    id: string,
    adminId: string,
    dto: AdminApprovePaymentDto,
    context: RequestContext = {},
  ) {
    const payment = await this.findPaymentOrThrow(id);

    if (
      payment.method !== PaymentMethod.MANUAL_POST_TRANSFER &&
      payment.method !== PaymentMethod.BARIDIMOB_RECEIPT
    ) {
      throw new BadRequestException(
        'Cette action est reservee aux paiements avec preuve.',
      );
    }

    this.assertWaitingAdminReview(payment);

    const result = await this.prisma.$transaction(async (transaction) => {
      await this.lockWaitingPayment(transaction, payment.id);

      const updatedPayment = await transaction.payment.update({
        data: {
          adminNote: dto.adminNote,
          paidAt: new Date(),
          reviewedAt: new Date(),
          reviewedById: adminId,
          status: PaymentStatus.PAID,
        },
        where: {
          id: payment.id,
        },
      });

      // The same rules as a card payment (days left kept, new plan at once).
      const outcome = await this.subscriptionsService.applyPurchase(
        updatedPayment,
        transaction,
        { actorId: adminId, context },
      );

      await this.auditLogsService.createAuditLog(
        {
          action: 'MANUAL_PAYMENT_APPROVED',
          entityId: updatedPayment.id,
          entityType: 'PAYMENT',
          ipAddress: context.ipAddress,
          metadata: {
            adminNote: dto.adminNote,
            method: updatedPayment.method,
            reference: updatedPayment.reference,
          },
          userAgent: context.userAgent,
          userId: adminId,
        },
        transaction,
      );

      return { outcome, payment: updatedPayment };
    });

    await this.subscriptionsService.notifyPurchase(result.outcome);
    await this.notificationProducer?.create({
      userId: result.payment.userId,
      category: NotificationCategory.PAYMENT,
      type: 'PAYMENT_APPROVED',
      severity: NotificationSeverity.SUCCESS,
      resourceType: NotificationResourceType.PAYMENT,
      resourceId: result.payment.id,
      data: { paymentId: result.payment.id },
      dedupeKey: `payment-approved:${result.payment.id}`,
    });

    return {
      message: 'Paiement approuve avec succes.',
      payment: this.paymentsService.toPublicPayment(result.payment),
    };
  }

  async rejectPayment(
    id: string,
    adminId: string,
    dto: AdminRejectPaymentDto,
    context: RequestContext = {},
  ) {
    const payment = await this.findPaymentOrThrow(id);
    this.assertWaitingAdminReview(payment);

    const updatedPayment = await this.prisma.payment.update({
      data: {
        adminNote: dto.adminNote,
        rejectionReason: dto.reason,
        reviewedAt: new Date(),
        reviewedById: adminId,
        status: PaymentStatus.REJECTED,
      },
      where: {
        id: payment.id,
      },
    });

    await this.auditLogsService.createAuditLog({
      action: 'MANUAL_PAYMENT_REJECTED',
      entityId: payment.id,
      entityType: 'PAYMENT',
      ipAddress: context.ipAddress,
      metadata: {
        method: payment.method,
        reason: dto.reason,
        reference: payment.reference,
      },
      userAgent: context.userAgent,
      userId: adminId,
    });

    await this.notificationProducer?.create({
      userId: updatedPayment.userId,
      category: NotificationCategory.PAYMENT,
      type: 'PAYMENT_REJECTED',
      severity: NotificationSeverity.WARNING,
      resourceType: NotificationResourceType.PAYMENT,
      resourceId: updatedPayment.id,
      data: { paymentId: updatedPayment.id },
      dedupeKey: `payment-rejected:${updatedPayment.id}`,
    });

    return {
      message: 'Paiement refuse avec succes.',
      payment: this.paymentsService.toPublicPayment(updatedPayment),
    };
  }

  async activateCashPayment(
    id: string,
    adminId: string,
    dto: AdminApprovePaymentDto,
    context: RequestContext = {},
  ) {
    const payment = await this.findPaymentOrThrow(id);

    if (payment.method !== PaymentMethod.MANUAL_CASH) {
      throw new BadRequestException('Ce paiement n est pas un paiement cash.');
    }

    this.assertWaitingAdminReview(payment);

    const result = await this.prisma.$transaction(async (transaction) => {
      await this.lockWaitingPayment(transaction, payment.id);

      const updatedPayment = await transaction.payment.update({
        data: {
          adminNote: dto.adminNote,
          paidAt: new Date(),
          reviewedAt: new Date(),
          reviewedById: adminId,
          status: PaymentStatus.PAID,
        },
        where: { id: payment.id },
      });

      const outcome = await this.subscriptionsService.applyPurchase(
        updatedPayment,
        transaction,
        { actorId: adminId, context },
      );

      await this.auditLogsService.createAuditLog(
        {
          action: 'CASH_PAYMENT_ACTIVATED',
          entityId: updatedPayment.id,
          entityType: 'PAYMENT',
          ipAddress: context.ipAddress,
          metadata: {
            adminNote: dto.adminNote,
            reference: updatedPayment.reference,
          },
          userAgent: context.userAgent,
          userId: adminId,
        },
        transaction,
      );

      return { outcome, payment: updatedPayment };
    });

    await this.subscriptionsService.notifyPurchase(result.outcome);

    return {
      message: 'Paiement cash active avec succes.',
      payment: this.paymentsService.toPublicPayment(result.payment),
    };
  }

  async getProofStream(
    paymentId: string,
    adminId: string,
    disposition: 'inline' | 'attachment',
    context: RequestContext = {},
  ): Promise<DocumentStreamResult> {
    const payment = await this.findPaymentOrThrow(paymentId);
    const proof = payment.proofDocument;

    if (!proof) {
      throw new NotFoundException('Preuve de paiement introuvable.');
    }

    const localPath = this.ensurePathInsideUploadRoot(proof.localPath);

    if (!existsSync(localPath)) {
      throw new NotFoundException('Fichier introuvable.');
    }

    await this.auditLogsService.createAuditLog({
      action:
        disposition === 'inline'
          ? 'ADMIN_VIEWED_PAYMENT_PROOF'
          : 'ADMIN_DOWNLOADED_PAYMENT_PROOF',
      entityId: payment.id,
      entityType: 'PAYMENT',
      ipAddress: context.ipAddress,
      metadata: {
        proofId: proof.id,
        reference: payment.reference,
      },
      userAgent: context.userAgent,
      userId: adminId,
    });

    return {
      mimeType: proof.mimeType,
      originalName: proof.originalName,
      size: proof.size,
      stream: createReadStream(localPath),
    };
  }

  private async findPaymentOrThrow(id: string) {
    const payment = await this.prisma.payment.findUnique({
      include: {
        plan: true,
        proofDocument: true,
        subscription: true,
        user: {
          select: {
            accountStatus: true,
            email: true,
            fullName: true,
            id: true,
            phone: true,
            role: true,
          },
        },
      },
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException('Paiement introuvable.');
    }

    return payment;
  }

  // The payment row is locked and read again: two administrators validating
  // the same payment at once extend the subscription once, the second one
  // finds it PAID.
  private async lockWaitingPayment(
    transaction: Prisma.TransactionClient,
    paymentId: string,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
    this.assertWaitingAdminReview(
      await transaction.payment.findUniqueOrThrow({
        where: { id: paymentId },
      }),
    );
  }

  private assertWaitingAdminReview(payment: Payment): void {
    if (payment.status === PaymentStatus.PAID) {
      throw new ConflictException('Ce paiement est deja valide.');
    }

    if (payment.status !== PaymentStatus.WAITING_ADMIN_REVIEW) {
      throw new ConflictException(
        "Ce paiement n'est pas en attente de validation admin.",
      );
    }
  }

  private buildWhere(query: ListPaymentsQueryDto): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};

    if (query.method) {
      where.method = query.method;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.accountType) {
      where.accountType = query.accountType;
    }

    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    if (query.search) {
      where.OR = [
        { reference: { contains: query.search } },
        { user: { fullName: { contains: query.search } } },
        { user: { email: { contains: query.search } } },
        { user: { phone: { contains: query.search } } },
      ];
    }

    return where;
  }

  private toAdminPaymentDetail(
    payment: Awaited<ReturnType<AdminPaymentsService['findPaymentOrThrow']>>,
  ) {
    return {
      id: payment.id,
      reference: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
      accountType: payment.accountType,
      billingPeriod: payment.billingPeriod,
      method: payment.method,
      status: payment.status,
      provider: payment.provider,
      providerStatus: payment.providerStatus,
      cardLast4: payment.cardLast4,
      cardHolderName: payment.cardHolderName,
      paidAt: payment.paidAt,
      reviewedAt: payment.reviewedAt,
      adminNote: payment.adminNote,
      rejectionReason: payment.rejectionReason,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      user: payment.user,
      plan: {
        id: payment.plan.id,
        name: payment.plan.name,
        code: payment.plan.code,
        accountType: payment.plan.accountType,
      },
      subscription: payment.subscription,
      proof: this.proofService.toPublicProof(payment.proofDocument),
    };
  }

  private ensurePathInsideUploadRoot(pathToCheck: string) {
    const resolvedPath = resolve(pathToCheck);

    if (
      resolvedPath !== this.uploadRoot &&
      !resolvedPath.startsWith(`${this.uploadRoot}\\`) &&
      !resolvedPath.startsWith(`${this.uploadRoot}/`)
    ) {
      throw new BadRequestException('Chemin de fichier invalide.');
    }

    return resolvedPath;
  }
}
