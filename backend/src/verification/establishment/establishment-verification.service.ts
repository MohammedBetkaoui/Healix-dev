import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  type Establishment,
  type EstablishmentVerificationData,
  type Prisma,
  type VerificationDocument,
  type VerificationRequest,
} from '@prisma/client';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import {
  establishmentVerificationDocumentTypes,
  requiredEstablishmentDocumentTypes,
  VerificationDocumentType,
} from '../../common/enums/verification-document-type.enum';
import { VerificationDocumentStatus } from '../../common/enums/verification-document-status.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { VerificationStep } from '../../common/enums/verification-step.enum';
import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from '../../common/utils/sanitize';
import { PrismaService } from '../../prisma/prisma.service';
import { VerificationDocumentService } from '../documents/verification-document.service';
import { VerificationFileStorageService } from '../documents/verification-file-storage.service';
import { VerificationFileValidator } from '../documents/verification-file-validator';
import {
  type EstablishmentPrefillResponse,
  type RequestContext,
} from '../types/verification.types';
import { SubmitEstablishmentVerificationDto } from './dto/submit-establishment-verification.dto';
import { UpdateEstablishmentVerificationDto } from './dto/update-establishment-verification.dto';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type VerificationRequestWithDataAndDocuments = VerificationRequest & {
  data: EstablishmentVerificationData | null;
  documents: VerificationDocument[];
};

type VerificationRequestWithDocuments = VerificationRequest & {
  documents: VerificationDocument[];
};

type EstablishmentDocumentUploadInput = {
  documentType: VerificationDocumentType;
  file: Express.Multer.File;
};

@Injectable()
export class EstablishmentVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly documentService: VerificationDocumentService,
    private readonly fileStorageService: VerificationFileStorageService,
    private readonly fileValidator: VerificationFileValidator,
  ) {}

  async getPrefill(
    userId: string,
  ): Promise<EstablishmentPrefillResponse & { draftData?: unknown }> {
    const establishment = await this.getOwnedEstablishment(userId);
    const request = (await this.findRequest(establishment.id, {
      data: true,
      documents: true,
    })) as VerificationRequestWithDataAndDocuments | null;

    return {
      establishment: this.toPrefillEstablishment(establishment),
      verification: this.toVerificationSummary(request),
      documents:
        request?.documents.map((document) =>
          this.documentService.toDocumentSummary(document),
        ) ?? [],
      draftData: request?.data ? this.toVerificationDataResponse(request.data) : undefined,
    };
  }

  async getStatus(userId: string) {
    const establishment = await this.getOwnedEstablishment(userId);
    const request = (await this.findRequest(establishment.id, {
      documents: true,
    })) as VerificationRequestWithDocuments | null;
    const documents = request?.documents ?? [];
    const missingDocuments =
      this.documentService.getMissingRequiredDocuments(documents);

    return {
      status: request?.status ?? establishment.verificationStatus,
      currentStep: request?.currentStep ?? VerificationStep.ESTABLISHMENT_INFO,
      requiredDocuments: requiredEstablishmentDocumentTypes,
      uploadedDocuments: documents.map((document) =>
        this.documentService.toDocumentSummary(document),
      ),
      missingDocuments,
      canSubmit:
        Boolean(request) &&
        this.isRequestSubmittable(request?.status) &&
        missingDocuments.length === 0,
    };
  }

  async getRequest(userId: string) {
    const establishment = await this.getOwnedEstablishment(userId);
    const request = (await this.findRequest(establishment.id, {
      data: true,
      documents: true,
    })) as VerificationRequestWithDataAndDocuments | null;

    if (!request) {
      throw new NotFoundException('Demande de vérification introuvable.');
    }

    return this.toRequestResponse(request);
  }

  async createDraft(
    userId: string,
    dto: UpdateEstablishmentVerificationDto = {},
    context: RequestContext = {},
  ) {
    const establishment = await this.getOwnedEstablishment(userId);
    const draftInput = dto ?? {};

    try {
      const request = await this.prisma.$transaction(async (transaction) => {
        const draft = await this.getOrCreateDraft(
          establishment,
          userId,
          context,
          transaction,
        );

        if (Object.keys(draftInput).length > 0) {
          return this.updateDraftData(
            draft.id,
            draftInput,
            userId,
            context,
            transaction,
          );
        }

        return this.findRequestOrThrow(establishment.id, transaction);
      });

      return this.toRequestResponse(request);
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async updateDraft(
    userId: string,
    dto: UpdateEstablishmentVerificationDto = {},
    context: RequestContext = {},
  ) {
    const establishment = await this.getOwnedEstablishment(userId);
    const request = await this.getDraftRequest(establishment.id);

    const updatedRequest = await this.prisma.$transaction((transaction) =>
      this.updateDraftData(request.id, dto, userId, context, transaction),
    );

    return this.toRequestResponse(updatedRequest);
  }

  async uploadDocument(
    userId: string,
    input: EstablishmentDocumentUploadInput,
    context: RequestContext = {},
  ) {
    if (!input.file) {
      throw new BadRequestException('Document obligatoire manquant.');
    }

    this.assertAllowedDocumentType(input.documentType);

    const extension = this.fileValidator.validate(input.file);
    const establishment = await this.getOwnedEstablishment(userId);
    const request = await this.getDraftRequest(establishment.id);
    const existingDocument = await this.documentService.findExistingDocument(
      request.id,
      input.documentType,
    );

    // Malware scanning must be added before production.
    const storedFile = await this.fileStorageService.storeVerificationFile({
      documentType: input.documentType,
      extension,
      file: input.file,
      ownerId: establishment.id,
      ownerType: 'establishments',
      verificationRequestId: request.id,
    });

    try {
      const document = await this.prisma.$transaction(async (transaction) => {
        const savedDocument = await this.documentService.upsertDocument(
          {
            verificationRequestId: request.id,
            documentType: input.documentType,
            originalName: storedFile.originalName,
            storedName: storedFile.storedName,
            mimeType: input.file.mimetype,
            size: input.file.size,
            localPath: storedFile.localPath,
            checksum: storedFile.checksum,
          },
          transaction,
        );

        await this.auditLogsService.createAuditLog(
          {
            userId,
            action: 'ESTABLISHMENT_VERIFICATION_DOCUMENT_UPLOADED',
            entityType: 'VERIFICATION_DOCUMENT',
            entityId: savedDocument.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            metadata: {
              verificationRequestId: request.id,
              establishmentId: establishment.id,
              documentType: input.documentType,
              status: VerificationDocumentStatus.UPLOADED,
              currentStep: request.currentStep,
            },
          },
          transaction,
        );

        return savedDocument;
      });

      if (existingDocument?.localPath) {
        await this.fileStorageService.deleteLocalFile(existingDocument.localPath);
      }

      return {
        document: this.documentService.toDocumentSummary(document),
      };
    } catch (error) {
      await this.fileStorageService.deleteLocalFile(storedFile.localPath);
      this.rethrowKnownError(error);
    }
  }

  async deleteDocument(
    userId: string,
    documentId: string,
    context: RequestContext = {},
  ) {
    const establishment = await this.getOwnedEstablishment(userId);
    const request = await this.getDraftRequest(establishment.id);
    const document = await this.documentService.findDocumentForEstablishment(
      documentId,
      establishment.id,
    );

    if (!document || document.verificationRequestId !== request.id) {
      throw new NotFoundException('Document introuvable.');
    }

    const deletedDocument = await this.prisma.$transaction(async (transaction) => {
      const deleted = await this.documentService.deleteDocument(
        document.id,
        transaction,
      );

      await this.auditLogsService.createAuditLog(
        {
          userId,
          action: 'ESTABLISHMENT_VERIFICATION_DOCUMENT_DELETED',
          entityType: 'VERIFICATION_DOCUMENT',
          entityId: deleted.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: {
            verificationRequestId: request.id,
            establishmentId: establishment.id,
            documentType: deleted.documentType,
            status: request.status,
            currentStep: request.currentStep,
          },
        },
        transaction,
      );

      return deleted;
    });

    await this.fileStorageService.deleteLocalFile(deletedDocument.localPath);

    return {
      message: 'Document supprimé avec succès.',
    };
  }

  async submit(
    userId: string,
    dto: SubmitEstablishmentVerificationDto,
    context: RequestContext = {},
  ) {
    const establishment = await this.getOwnedEstablishment(userId);
    const request = await this.getDraftRequest(establishment.id);

    const submittedRequest = await this.prisma.$transaction(async (transaction) => {
      await transaction.establishmentVerificationData.update({
        where: {
          verificationRequestId: request.id,
        },
        data: {
          confirmationAccuracy: dto.confirmationAccuracy,
        },
      });

      const hydratedRequest = await transaction.verificationRequest.findUnique({
        where: { id: request.id },
        include: {
          data: true,
          documents: true,
        },
      });

      if (!hydratedRequest) {
        throw new NotFoundException('Demande de vérification introuvable.');
      }

      this.assertRequestCanBeSubmitted(hydratedRequest);

      const submitted = await transaction.verificationRequest.update({
        where: { id: request.id },
        data: {
          status: VerificationStatus.PENDING_VERIFICATION,
          currentStep: VerificationStep.SUBMISSION,
          submittedAt: new Date(),
        },
      });

      await transaction.establishment.update({
        where: { id: establishment.id },
        data: {
          verificationStatus: VerificationStatus.PENDING_VERIFICATION,
        },
      });

      await this.auditLogsService.createAuditLog(
        {
          userId,
          action: 'ESTABLISHMENT_VERIFICATION_SUBMITTED',
          entityType: 'VERIFICATION_REQUEST',
          entityId: submitted.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: {
            verificationRequestId: submitted.id,
            establishmentId: establishment.id,
            status: submitted.status,
            currentStep: submitted.currentStep,
          },
        },
        transaction,
      );

      return submitted;
    });

    return {
      message: 'Demande de vérification envoyée avec succès.',
      status: submittedRequest.status,
      submittedAt: submittedRequest.submittedAt,
    };
  }

  private async getOwnedEstablishment(
    userId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<Establishment> {
    const establishment = await client.establishment.findUnique({
      where: {
        ownerId: userId,
      },
    });

    if (!establishment) {
      throw new NotFoundException('Établissement introuvable.');
    }

    return establishment;
  }

  private async getOrCreateDraft(
    establishment: Establishment,
    userId: string,
    context: RequestContext,
    client: PrismaExecutor,
  ) {
    const existingRequest = await client.verificationRequest.findUnique({
      where: {
        establishmentId: establishment.id,
      },
      include: {
        data: true,
        documents: true,
      },
    });

    if (existingRequest) {
      this.assertRequestIsMutable(existingRequest.status);
      return existingRequest;
    }

    const request = await client.verificationRequest.create({
      data: {
        establishmentId: establishment.id,
        userId,
        type: 'ESTABLISHMENT',
        status: VerificationStatus.DRAFT,
        currentStep: VerificationStep.ESTABLISHMENT_INFO,
        data: {
          create: this.createPrefilledVerificationData(establishment),
        },
      },
      include: {
        data: true,
        documents: true,
      },
    });

    await this.auditLogsService.createAuditLog(
      {
        userId,
        action: 'ESTABLISHMENT_VERIFICATION_DRAFT_CREATED',
        entityType: 'VERIFICATION_REQUEST',
        entityId: request.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          verificationRequestId: request.id,
          establishmentId: establishment.id,
          status: request.status,
          currentStep: request.currentStep,
        },
      },
      client,
    );

    return request;
  }

  private async getDraftRequest(establishmentId: string) {
    const request = (await this.findRequest(establishmentId, {
      data: true,
      documents: true,
    })) as VerificationRequestWithDataAndDocuments | null;

    if (!request) {
      throw new NotFoundException('Demande de vérification introuvable.');
    }

    this.assertRequestIsMutable(request.status);

    return request;
  }

  private async findRequestOrThrow(
    establishmentId: string,
    client: PrismaExecutor,
  ) {
    const request = await client.verificationRequest.findUnique({
      where: { establishmentId },
      include: {
        data: true,
        documents: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Demande de vérification introuvable.');
    }

    return request;
  }

  private findRequest(
    establishmentId: string,
    include?: Prisma.VerificationRequestInclude,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.verificationRequest.findUnique({
      where: { establishmentId },
      include,
    });
  }

  private async updateDraftData(
    verificationRequestId: string,
    dto: UpdateEstablishmentVerificationDto,
    userId: string,
    context: RequestContext,
    client: PrismaExecutor,
  ) {
    const { currentStep, ...dataDto } = dto;
    const updateData = this.toVerificationDataUpdateInput(dataDto);

    const request = await client.verificationRequest.update({
      where: { id: verificationRequestId },
      data: {
        currentStep: currentStep ?? undefined,
        data: {
          update: updateData,
        },
      },
      include: {
        data: true,
        documents: true,
      },
    });

    await this.auditLogsService.createAuditLog(
      {
        userId,
        action: 'ESTABLISHMENT_VERIFICATION_DRAFT_UPDATED',
        entityType: 'VERIFICATION_REQUEST',
        entityId: request.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          verificationRequestId: request.id,
          establishmentId: request.establishmentId,
          status: request.status,
          currentStep: request.currentStep,
        },
      },
      client,
    );

    return request;
  }

  private createPrefilledVerificationData(
    establishment: Establishment,
  ): Prisma.EstablishmentVerificationDataCreateWithoutVerificationRequestInput {
    return {
      name: establishment.name,
      type: establishment.type,
      wilaya: establishment.wilaya,
      address: establishment.address,
      phone: establishment.phone,
      professionalEmail: establishment.professionalEmail,
      legalRepresentativeFullName: establishment.managerFullName,
      legalRepresentativePhone: establishment.phone,
      legalRepresentativeEmail: establishment.professionalEmail,
    };
  }

  private toVerificationDataUpdateInput(
    dto: Omit<UpdateEstablishmentVerificationDto, 'currentStep'>,
  ): Prisma.EstablishmentVerificationDataUpdateInput {
    return {
      name: this.sanitizeOptionalText(dto.name),
      type: dto.type,
      legalForm: this.sanitizeOptionalText(dto.legalForm),
      wilaya: this.sanitizeOptionalText(dto.wilaya),
      commune: this.sanitizeOptionalText(dto.commune),
      address: this.sanitizeOptionalText(dto.address),
      phone: dto.phone ? sanitizePhone(dto.phone) : undefined,
      professionalEmail: dto.professionalEmail
        ? normalizeEmail(dto.professionalEmail)
        : undefined,
      website: this.sanitizeOptionalText(dto.website),
      commercialRegisterNumber: this.sanitizeOptionalText(
        dto.commercialRegisterNumber,
      ),
      commercialRegisterIssuedAt: this.toOptionalDate(
        dto.commercialRegisterIssuedAt,
      ),
      commercialRegisterWilaya: this.sanitizeOptionalText(
        dto.commercialRegisterWilaya,
      ),
      nif: this.sanitizeOptionalText(dto.nif),
      nis: this.sanitizeOptionalText(dto.nis),
      taxCenter: this.sanitizeOptionalText(dto.taxCenter),
      healthAuthorizationNumber: this.sanitizeOptionalText(
        dto.healthAuthorizationNumber,
      ),
      healthAuthorizationIssuedAt: this.toOptionalDate(
        dto.healthAuthorizationIssuedAt,
      ),
      healthAuthorizationAuthority: this.sanitizeOptionalText(
        dto.healthAuthorizationAuthority,
      ),
      healthDirectionWilaya: this.sanitizeOptionalText(
        dto.healthDirectionWilaya,
      ),
      authorizedActivityType: this.sanitizeOptionalText(
        dto.authorizedActivityType,
      ),
      legalRepresentativeFullName: this.sanitizeOptionalText(
        dto.legalRepresentativeFullName,
      ),
      legalRepresentativeFunction: this.sanitizeOptionalText(
        dto.legalRepresentativeFunction,
      ),
      legalRepresentativeNinOrId: this.sanitizeOptionalText(
        dto.legalRepresentativeNinOrId,
      ),
      legalRepresentativePhone: dto.legalRepresentativePhone
        ? sanitizePhone(dto.legalRepresentativePhone)
        : undefined,
      legalRepresentativeEmail: dto.legalRepresentativeEmail
        ? normalizeEmail(dto.legalRepresentativeEmail)
        : undefined,
      confirmationAccuracy: dto.confirmationAccuracy,
    };
  }

  private assertRequestIsMutable(status: string): void {
    if (
      status === VerificationStatus.VERIFIED ||
      status === VerificationStatus.SUSPENDED
    ) {
      throw new ConflictException('La demande ne peut plus être modifiée.');
    }
  }

  private assertAllowedDocumentType(documentType: VerificationDocumentType): void {
    if (
      !establishmentVerificationDocumentTypes.includes(
        documentType as (typeof establishmentVerificationDocumentTypes)[number],
      )
    ) {
      throw new BadRequestException('Type de document non autorisé.');
    }
  }

  private assertRequestCanBeSubmitted(
    request: VerificationRequestWithDataAndDocuments,
  ): void {
    this.assertRequestIsMutable(request.status);

    if (!request.data) {
      throw new BadRequestException('Informations de vérification manquantes.');
    }

    this.assertRequiredField(request.data.name);
    this.assertRequiredField(request.data.legalForm);
    this.assertRequiredField(request.data.wilaya);
    this.assertRequiredField(request.data.commune);
    this.assertRequiredField(request.data.address);
    this.assertRequiredField(request.data.phone);
    this.assertRequiredField(request.data.professionalEmail);
    this.assertRequiredField(request.data.commercialRegisterNumber);
    this.assertRequiredField(request.data.nif);
    this.assertRequiredField(request.data.healthAuthorizationNumber);
    this.assertRequiredField(request.data.legalRepresentativeFullName);
    this.assertRequiredField(request.data.legalRepresentativeNinOrId);

    if (!request.data.confirmationAccuracy) {
      throw new BadRequestException(
        'Vous devez confirmer que les informations fournies sont exactes.',
      );
    }

    this.documentService.assertRequiredDocumentsPresent(request.documents);
  }

  private assertRequiredField(value: string | null): void {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException('Données obligatoires manquantes.');
    }
  }

  private sanitizeOptionalText(value: string | undefined): string | undefined {
    return value === undefined ? undefined : sanitizeTextInput(value);
  }

  private toOptionalDate(value: string | undefined): Date | undefined {
    return value ? new Date(value) : undefined;
  }

  private toPrefillEstablishment(establishment: Establishment) {
    return {
      id: establishment.id,
      name: establishment.name,
      type: establishment.type,
      wilaya: establishment.wilaya,
      address: establishment.address,
      professionalEmail: establishment.professionalEmail,
      phone: establishment.phone,
      managerFullName: establishment.managerFullName,
    };
  }

  private toVerificationSummary(
    request:
      | (VerificationRequest & { documents?: VerificationDocument[] })
      | null,
  ) {
    const documents = request?.documents ?? [];
    const missingDocuments =
      this.documentService.getMissingRequiredDocuments(documents);

    return {
      status: request?.status ?? VerificationStatus.NOT_STARTED,
      currentStep: request?.currentStep ?? VerificationStep.ESTABLISHMENT_INFO,
      canSubmit:
        Boolean(request) &&
        this.isRequestSubmittable(request?.status) &&
        missingDocuments.length === 0,
    };
  }

  private isRequestSubmittable(status?: string | null): boolean {
    return Boolean(
      status &&
        status !== VerificationStatus.VERIFIED &&
        status !== VerificationStatus.SUSPENDED,
    );
  }

  private toRequestResponse(request: VerificationRequestWithDataAndDocuments) {
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      currentStep: request.currentStep,
      submittedAt: request.submittedAt,
      reviewedAt: request.reviewedAt,
      rejectionReason: request.rejectionReason,
      data: request.data ? this.toVerificationDataResponse(request.data) : null,
      documents: request.documents.map((document) =>
        this.documentService.toDocumentSummary(document),
      ),
      missingDocuments: this.documentService.getMissingRequiredDocuments(
        request.documents,
      ),
    };
  }

  private toVerificationDataResponse(data: EstablishmentVerificationData) {
    return {
      name: data.name,
      type: data.type,
      legalForm: data.legalForm,
      wilaya: data.wilaya,
      commune: data.commune,
      address: data.address,
      phone: data.phone,
      professionalEmail: data.professionalEmail,
      website: data.website,
      commercialRegisterNumber: data.commercialRegisterNumber,
      commercialRegisterIssuedAt: data.commercialRegisterIssuedAt,
      commercialRegisterWilaya: data.commercialRegisterWilaya,
      nif: data.nif,
      nis: data.nis,
      taxCenter: data.taxCenter,
      healthAuthorizationNumber: data.healthAuthorizationNumber,
      healthAuthorizationIssuedAt: data.healthAuthorizationIssuedAt,
      healthAuthorizationAuthority: data.healthAuthorizationAuthority,
      healthDirectionWilaya: data.healthDirectionWilaya,
      authorizedActivityType: data.authorizedActivityType,
      legalRepresentativeFullName: data.legalRepresentativeFullName,
      legalRepresentativeFunction: data.legalRepresentativeFunction,
      legalRepresentativeNinOrId: data.legalRepresentativeNinOrId,
      legalRepresentativePhone: data.legalRepresentativePhone,
      legalRepresentativeEmail: data.legalRepresentativeEmail,
      confirmationAccuracy: data.confirmationAccuracy,
    };
  }

  private rethrowKnownError(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    throw new InternalServerErrorException(
      'Une erreur inattendue est survenue.',
    );
  }
}
