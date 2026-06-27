import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  type DoctorProfile,
  type DoctorVerificationData,
  type Prisma,
  type User,
  type VerificationDocument,
  type VerificationRequest,
} from '@prisma/client';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { DoctorType } from '../../common/enums/doctor-type.enum';
import { DoctorVerificationStep } from '../../common/enums/doctor-verification-step.enum';
import {
  doctorVerificationDocumentTypes,
  requiredDoctorDocumentTypes,
  VerificationDocumentType,
} from '../../common/enums/verification-document-type.enum';
import { VerificationDocumentStatus } from '../../common/enums/verification-document-status.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
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
  type DoctorPrefillResponse,
  type RequestContext,
} from '../types/doctor-verification.types';
import { SubmitDoctorVerificationDto } from './dto/submit-doctor-verification.dto';
import { UpdateDoctorVerificationDto } from './dto/update-doctor-verification.dto';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type OwnedDoctorProfile = DoctorProfile & {
  user: Pick<User, 'email' | 'fullName' | 'phone'>;
};

type VerificationRequestWithDoctorDataAndDocuments = VerificationRequest & {
  doctorData: DoctorVerificationData | null;
  documents: VerificationDocument[];
};

type VerificationRequestWithDocuments = VerificationRequest & {
  doctorData: Pick<DoctorVerificationData, 'doctorType'> | null;
  documents: VerificationDocument[];
};

type DoctorDocumentUploadInput = {
  documentType: VerificationDocumentType;
  file: Express.Multer.File;
};

@Injectable()
export class DoctorVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly documentService: VerificationDocumentService,
    private readonly fileStorageService: VerificationFileStorageService,
    private readonly fileValidator: VerificationFileValidator,
  ) {}

  async getPrefill(
    userId: string,
  ): Promise<DoctorPrefillResponse & { draftData?: unknown }> {
    const doctorProfile = await this.getOwnedDoctorProfile(userId);
    const request = (await this.findRequest(doctorProfile.id, {
      doctorData: true,
      documents: true,
    })) as VerificationRequestWithDoctorDataAndDocuments | null;

    return {
      doctor: this.toPrefillDoctor(doctorProfile),
      verification: this.toVerificationSummary(request),
      documents:
        request?.documents.map((document) =>
          this.documentService.toDocumentSummary(document),
        ) ?? [],
      draftData: request?.doctorData
        ? this.toDoctorVerificationDataResponse(request.doctorData)
        : undefined,
    };
  }

  async getStatus(userId: string) {
    const doctorProfile = await this.getOwnedDoctorProfile(userId);
    const request = (await this.findRequest(doctorProfile.id, {
      doctorData: {
        select: {
          doctorType: true,
        },
      },
      documents: true,
    })) as VerificationRequestWithDocuments | null;
    const documents = request?.documents ?? [];
    const missingDocuments =
      this.documentService.getMissingRequiredDoctorDocuments(
        documents,
        request?.doctorData?.doctorType,
      );

    return {
      status: request?.status ?? doctorProfile.verificationStatus,
      currentStep:
        request?.doctorCurrentStep ?? DoctorVerificationStep.IDENTITY,
      requiredDocuments: this.getRequiredDocumentTypes(
        request?.doctorData?.doctorType,
      ),
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
    const doctorProfile = await this.getOwnedDoctorProfile(userId);
    const request = (await this.findRequest(doctorProfile.id, {
      doctorData: true,
      documents: true,
    })) as VerificationRequestWithDoctorDataAndDocuments | null;

    if (!request) {
      throw new NotFoundException('Demande de vérification introuvable.');
    }

    return this.toRequestResponse(request);
  }

  async createDraft(
    userId: string,
    dto: UpdateDoctorVerificationDto = {},
    context: RequestContext = {},
  ) {
    const doctorProfile = await this.getOwnedDoctorProfile(userId);
    const draftInput = dto ?? {};

    try {
      const request = await this.prisma.$transaction(async (transaction) => {
        const draft = await this.getOrCreateDraft(
          doctorProfile,
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

        return this.findRequestOrThrow(doctorProfile.id, transaction);
      });

      return this.toRequestResponse(request);
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async updateDraft(
    userId: string,
    dto: UpdateDoctorVerificationDto = {},
    context: RequestContext = {},
  ) {
    const doctorProfile = await this.getOwnedDoctorProfile(userId);
    const request = await this.getDraftRequest(doctorProfile.id);

    const updatedRequest = await this.prisma.$transaction((transaction) =>
      this.updateDraftData(request.id, dto, userId, context, transaction),
    );

    return this.toRequestResponse(updatedRequest);
  }

  async uploadDocument(
    userId: string,
    input: DoctorDocumentUploadInput,
    context: RequestContext = {},
  ) {
    if (!input.file) {
      throw new BadRequestException('Document obligatoire manquant.');
    }

    this.assertAllowedDocumentType(input.documentType);

    const extension = this.fileValidator.validate(input.file);
    const doctorProfile = await this.getOwnedDoctorProfile(userId);
    const request = await this.getDraftRequest(doctorProfile.id);
    const existingDocument = await this.documentService.findExistingDocument(
      request.id,
      input.documentType,
    );

    // Malware scanning must be added before production.
    const storedFile = await this.fileStorageService.storeVerificationFile({
      documentType: input.documentType,
      extension,
      file: input.file,
      ownerId: doctorProfile.id,
      ownerType: 'doctors',
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
            action: 'DOCTOR_VERIFICATION_DOCUMENT_UPLOADED',
            entityType: 'VERIFICATION_DOCUMENT',
            entityId: savedDocument.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            metadata: {
              verificationRequestId: request.id,
              doctorProfileId: doctorProfile.id,
              userId,
              documentType: input.documentType,
              status: VerificationDocumentStatus.UPLOADED,
              currentStep:
                request.doctorCurrentStep ?? DoctorVerificationStep.IDENTITY,
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
    const doctorProfile = await this.getOwnedDoctorProfile(userId);
    const request = await this.getDraftRequest(doctorProfile.id);
    const document = await this.documentService.findDocumentForDoctorProfile(
      documentId,
      doctorProfile.id,
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
          action: 'DOCTOR_VERIFICATION_DOCUMENT_DELETED',
          entityType: 'VERIFICATION_DOCUMENT',
          entityId: deleted.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: {
            verificationRequestId: request.id,
            doctorProfileId: doctorProfile.id,
            userId,
            documentType: deleted.documentType,
            status: request.status,
            currentStep:
              request.doctorCurrentStep ?? DoctorVerificationStep.IDENTITY,
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
    dto: SubmitDoctorVerificationDto,
    context: RequestContext = {},
  ) {
    const doctorProfile = await this.getOwnedDoctorProfile(userId);
    const request = await this.getDraftRequest(doctorProfile.id);

    const submittedRequest = await this.prisma.$transaction(async (transaction) => {
      await transaction.doctorVerificationData.update({
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
          doctorData: true,
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
          doctorCurrentStep: DoctorVerificationStep.DOCUMENTS_SUBMISSION,
          submittedAt: new Date(),
        },
      });

      await transaction.doctorProfile.update({
        where: { id: doctorProfile.id },
        data: {
          verificationStatus: VerificationStatus.PENDING_VERIFICATION,
        },
      });

      await this.auditLogsService.createAuditLog(
        {
          userId,
          action: 'DOCTOR_VERIFICATION_SUBMITTED',
          entityType: 'VERIFICATION_REQUEST',
          entityId: submitted.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: {
            verificationRequestId: submitted.id,
            doctorProfileId: doctorProfile.id,
            userId,
            status: submitted.status,
            currentStep:
              submitted.doctorCurrentStep ??
              DoctorVerificationStep.DOCUMENTS_SUBMISSION,
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

  private async getOwnedDoctorProfile(
    userId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<OwnedDoctorProfile> {
    const doctorProfile = await client.doctorProfile.findUnique({
      where: {
        userId,
      },
      include: {
        user: {
          select: {
            email: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });

    if (!doctorProfile || !doctorProfile.isIndependent) {
      throw new NotFoundException('Profil médecin introuvable.');
    }

    return doctorProfile;
  }

  private async getOrCreateDraft(
    doctorProfile: OwnedDoctorProfile,
    userId: string,
    context: RequestContext,
    client: PrismaExecutor,
  ) {
    const existingRequest = await client.verificationRequest.findFirst({
      where: {
        doctorProfileId: doctorProfile.id,
      },
      include: {
        doctorData: true,
        documents: true,
      },
    });

    if (existingRequest) {
      this.assertRequestIsMutable(existingRequest.status);
      return existingRequest;
    }

    const request = await client.verificationRequest.create({
      data: {
        doctorProfileId: doctorProfile.id,
        establishmentId: null,
        userId,
        type: 'INDEPENDENT_DOCTOR',
        status: VerificationStatus.DRAFT,
        doctorCurrentStep: DoctorVerificationStep.IDENTITY,
        doctorData: {
          create: this.createPrefilledDoctorVerificationData(doctorProfile),
        },
      },
      include: {
        doctorData: true,
        documents: true,
      },
    });

    await this.auditLogsService.createAuditLog(
      {
        userId,
        action: 'DOCTOR_VERIFICATION_DRAFT_CREATED',
        entityType: 'VERIFICATION_REQUEST',
        entityId: request.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          verificationRequestId: request.id,
          doctorProfileId: doctorProfile.id,
          userId,
          status: request.status,
          currentStep: request.doctorCurrentStep,
        },
      },
      client,
    );

    return request;
  }

  private async getDraftRequest(doctorProfileId: string) {
    const request = (await this.findRequest(doctorProfileId, {
      doctorData: true,
      documents: true,
    })) as VerificationRequestWithDoctorDataAndDocuments | null;

    if (!request) {
      throw new NotFoundException('Demande de vérification introuvable.');
    }

    this.assertRequestIsMutable(request.status);

    return request;
  }

  private async findRequestOrThrow(
    doctorProfileId: string,
    client: PrismaExecutor,
  ) {
    const request = await client.verificationRequest.findFirst({
      where: { doctorProfileId },
      include: {
        doctorData: true,
        documents: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Demande de vérification introuvable.');
    }

    return request;
  }

  private findRequest(
    doctorProfileId: string,
    include?: Prisma.VerificationRequestInclude,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.verificationRequest.findFirst({
      where: { doctorProfileId },
      include,
    });
  }

  private async updateDraftData(
    verificationRequestId: string,
    dto: UpdateDoctorVerificationDto,
    userId: string,
    context: RequestContext,
    client: PrismaExecutor,
  ) {
    const { currentStep, ...dataDto } = dto;
    const updateData = this.toDoctorVerificationDataUpdateInput(dataDto);

    const request = await client.verificationRequest.update({
      where: { id: verificationRequestId },
      data: {
        doctorCurrentStep: currentStep ?? undefined,
        doctorData: {
          update: updateData,
        },
      },
      include: {
        doctorData: true,
        documents: true,
      },
    });

    await this.auditLogsService.createAuditLog(
      {
        userId,
        action: 'DOCTOR_VERIFICATION_DRAFT_UPDATED',
        entityType: 'VERIFICATION_REQUEST',
        entityId: request.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          verificationRequestId: request.id,
          doctorProfileId: request.doctorProfileId,
          userId,
          status: request.status,
          currentStep: request.doctorCurrentStep,
        },
      },
      client,
    );

    return request;
  }

  private createPrefilledDoctorVerificationData(
    doctorProfile: OwnedDoctorProfile,
  ): Prisma.DoctorVerificationDataCreateWithoutVerificationRequestInput {
    return {
      fullName: doctorProfile.user.fullName,
      phone: doctorProfile.user.phone,
      professionalEmail: doctorProfile.user.email,
      wilaya: doctorProfile.wilaya,
      address: doctorProfile.professionalAddress,
      speciality: doctorProfile.speciality,
      cabinetAddress: doctorProfile.professionalAddress,
      cabinetWilaya: doctorProfile.wilaya,
    };
  }

  private toDoctorVerificationDataUpdateInput(
    dto: Omit<UpdateDoctorVerificationDto, 'currentStep'>,
  ): Prisma.DoctorVerificationDataUpdateInput {
    return {
      fullName: this.sanitizeOptionalText(dto.fullName),
      birthDate: this.toOptionalDate(dto.birthDate),
      birthPlace: this.sanitizeOptionalText(dto.birthPlace),
      nationality: this.sanitizeOptionalText(dto.nationality),
      ninOrIdNumber: this.sanitizeOptionalText(dto.ninOrIdNumber),
      identityDocumentType: dto.identityDocumentType,
      phone: dto.phone ? sanitizePhone(dto.phone) : undefined,
      professionalEmail: dto.professionalEmail
        ? normalizeEmail(dto.professionalEmail)
        : undefined,
      wilaya: this.sanitizeOptionalText(dto.wilaya),
      commune: this.sanitizeOptionalText(dto.commune),
      address: this.sanitizeOptionalText(dto.address),
      doctorType: dto.doctorType,
      speciality: this.sanitizeOptionalText(dto.speciality),
      mainDegree: this.sanitizeOptionalText(dto.mainDegree),
      university: this.sanitizeOptionalText(dto.university),
      graduationYear: dto.graduationYear,
      specialityDegree: this.sanitizeOptionalText(dto.specialityDegree),
      specialityGraduationYear: dto.specialityGraduationYear,
      orderRegistrationNumber: this.sanitizeOptionalText(
        dto.orderRegistrationNumber,
      ),
      regionalCouncil: this.sanitizeOptionalText(dto.regionalCouncil),
      registrationWilaya: this.sanitizeOptionalText(dto.registrationWilaya),
      registrationDate: this.toOptionalDate(dto.registrationDate),
      professionalStatus: dto.professionalStatus,
      practiceAuthorizationNumber: this.sanitizeOptionalText(
        dto.practiceAuthorizationNumber,
      ),
      authorizationAuthority: this.sanitizeOptionalText(
        dto.authorizationAuthority,
      ),
      cabinetName: this.sanitizeOptionalText(dto.cabinetName),
      cabinetType: dto.cabinetType,
      cabinetAddress: this.sanitizeOptionalText(dto.cabinetAddress),
      cabinetWilaya: this.sanitizeOptionalText(dto.cabinetWilaya),
      cabinetCommune: this.sanitizeOptionalText(dto.cabinetCommune),
      cabinetPhone: dto.cabinetPhone ? sanitizePhone(dto.cabinetPhone) : undefined,
      cabinetEmail: dto.cabinetEmail
        ? normalizeEmail(dto.cabinetEmail)
        : undefined,
      healthDirectionWilaya: this.sanitizeOptionalText(
        dto.healthDirectionWilaya,
      ),
      cabinetOpeningAuthorization: this.sanitizeOptionalText(
        dto.cabinetOpeningAuthorization,
      ),
      nif: this.sanitizeOptionalText(dto.nif),
      taxCenter: this.sanitizeOptionalText(dto.taxCenter),
      casnosNumber: this.sanitizeOptionalText(dto.casnosNumber),
      fiscalActivityType: dto.fiscalActivityType,
      professionalRib: this.sanitizeOptionalText(dto.professionalRib),
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
      !doctorVerificationDocumentTypes.includes(
        documentType as (typeof doctorVerificationDocumentTypes)[number],
      )
    ) {
      throw new BadRequestException('Type de document non autorisé.');
    }
  }

  private assertRequestCanBeSubmitted(
    request: VerificationRequestWithDoctorDataAndDocuments,
  ): void {
    this.assertRequestIsMutable(request.status);

    if (!request.doctorData) {
      throw new BadRequestException('Informations de vérification manquantes.');
    }

    this.assertRequiredField(request.doctorData.fullName);
    this.assertRequiredDate(request.doctorData.birthDate);
    this.assertRequiredField(request.doctorData.ninOrIdNumber);
    this.assertRequiredField(request.doctorData.identityDocumentType);
    this.assertRequiredField(request.doctorData.phone);
    this.assertRequiredField(request.doctorData.professionalEmail);
    this.assertRequiredField(request.doctorData.wilaya);
    this.assertRequiredField(request.doctorData.commune);
    this.assertRequiredField(request.doctorData.speciality);
    this.assertRequiredField(request.doctorData.doctorType);
    this.assertRequiredField(request.doctorData.mainDegree);
    this.assertRequiredField(request.doctorData.university);
    this.assertRequiredNumber(request.doctorData.graduationYear);
    this.assertRequiredField(request.doctorData.orderRegistrationNumber);
    this.assertRequiredField(request.doctorData.registrationWilaya);
    this.assertRequiredDate(request.doctorData.registrationDate);
    this.assertRequiredField(request.doctorData.professionalStatus);
    this.assertRequiredField(request.doctorData.cabinetType);
    this.assertRequiredField(request.doctorData.cabinetAddress);
    this.assertRequiredField(request.doctorData.cabinetWilaya);
    this.assertRequiredField(request.doctorData.cabinetCommune);
    this.assertRequiredField(request.doctorData.healthDirectionWilaya);
    this.assertRequiredField(request.doctorData.nif);
    this.assertRequiredField(request.doctorData.taxCenter);
    this.assertRequiredField(request.doctorData.fiscalActivityType);

    if (!request.doctorData.confirmationAccuracy) {
      throw new BadRequestException(
        'Vous devez confirmer que les informations fournies sont exactes.',
      );
    }

    this.documentService.assertRequiredDoctorDocumentsPresent(
      request.documents,
      request.doctorData.doctorType,
    );
  }

  private assertRequiredField(value: string | null): void {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException('Données obligatoires manquantes.');
    }
  }

  private assertRequiredDate(value: Date | null): void {
    if (!value) {
      throw new BadRequestException('Données obligatoires manquantes.');
    }
  }

  private assertRequiredNumber(value: number | null): void {
    if (value === null || value === undefined) {
      throw new BadRequestException('Données obligatoires manquantes.');
    }
  }

  private getRequiredDocumentTypes(
    doctorType?: string | null,
  ): VerificationDocumentType[] {
    const documentTypes: VerificationDocumentType[] = [
      ...requiredDoctorDocumentTypes,
    ];

    if (doctorType === DoctorType.SPECIALIST) {
      documentTypes.push(VerificationDocumentType.SPECIALITY_DEGREE);
    }

    return documentTypes;
  }

  private sanitizeOptionalText(value: string | undefined): string | undefined {
    return value === undefined ? undefined : sanitizeTextInput(value);
  }

  private toOptionalDate(value: string | undefined): Date | undefined {
    return value ? new Date(value) : undefined;
  }

  private toPrefillDoctor(doctorProfile: OwnedDoctorProfile) {
    return {
      id: doctorProfile.id,
      userId: doctorProfile.userId,
      fullName: doctorProfile.user.fullName,
      email: doctorProfile.user.email,
      phone: doctorProfile.user.phone,
      speciality: doctorProfile.speciality,
      wilaya: doctorProfile.wilaya,
      professionalAddress: doctorProfile.professionalAddress,
      isIndependent: doctorProfile.isIndependent,
    };
  }

  private toVerificationSummary(
    request:
      | (VerificationRequest & {
          doctorData?: Pick<DoctorVerificationData, 'doctorType'> | null;
          documents?: VerificationDocument[];
        })
      | null,
  ) {
    const documents = request?.documents ?? [];
    const missingDocuments =
      this.documentService.getMissingRequiredDoctorDocuments(
        documents,
        request?.doctorData?.doctorType,
      );

    return {
      status: request?.status ?? VerificationStatus.NOT_STARTED,
      currentStep:
        request?.doctorCurrentStep ?? DoctorVerificationStep.IDENTITY,
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

  private toRequestResponse(request: VerificationRequestWithDoctorDataAndDocuments) {
    const doctorType = request.doctorData?.doctorType;

    return {
      id: request.id,
      type: request.type,
      status: request.status,
      currentStep: request.doctorCurrentStep ?? DoctorVerificationStep.IDENTITY,
      submittedAt: request.submittedAt,
      reviewedAt: request.reviewedAt,
      rejectionReason: request.rejectionReason,
      data: request.doctorData
        ? this.toDoctorVerificationDataResponse(request.doctorData)
        : null,
      documents: request.documents.map((document) =>
        this.documentService.toDocumentSummary(document),
      ),
      requiredDocuments: this.getRequiredDocumentTypes(doctorType),
      missingDocuments: this.documentService.getMissingRequiredDoctorDocuments(
        request.documents,
        doctorType,
      ),
    };
  }

  private toDoctorVerificationDataResponse(data: DoctorVerificationData) {
    return {
      fullName: data.fullName,
      birthDate: data.birthDate,
      birthPlace: data.birthPlace,
      nationality: data.nationality,
      ninOrIdNumber: data.ninOrIdNumber,
      identityDocumentType: data.identityDocumentType,
      phone: data.phone,
      professionalEmail: data.professionalEmail,
      wilaya: data.wilaya,
      commune: data.commune,
      address: data.address,
      doctorType: data.doctorType,
      speciality: data.speciality,
      mainDegree: data.mainDegree,
      university: data.university,
      graduationYear: data.graduationYear,
      specialityDegree: data.specialityDegree,
      specialityGraduationYear: data.specialityGraduationYear,
      orderRegistrationNumber: data.orderRegistrationNumber,
      regionalCouncil: data.regionalCouncil,
      registrationWilaya: data.registrationWilaya,
      registrationDate: data.registrationDate,
      professionalStatus: data.professionalStatus,
      practiceAuthorizationNumber: data.practiceAuthorizationNumber,
      authorizationAuthority: data.authorizationAuthority,
      cabinetName: data.cabinetName,
      cabinetType: data.cabinetType,
      cabinetAddress: data.cabinetAddress,
      cabinetWilaya: data.cabinetWilaya,
      cabinetCommune: data.cabinetCommune,
      cabinetPhone: data.cabinetPhone,
      cabinetEmail: data.cabinetEmail,
      healthDirectionWilaya: data.healthDirectionWilaya,
      cabinetOpeningAuthorization: data.cabinetOpeningAuthorization,
      nif: data.nif,
      taxCenter: data.taxCenter,
      casnosNumber: data.casnosNumber,
      fiscalActivityType: data.fiscalActivityType,
      professionalRib: data.professionalRib,
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
