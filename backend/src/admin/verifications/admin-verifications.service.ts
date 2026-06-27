import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma, type VerificationRequest } from '@prisma/client';
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { DoctorType } from '../../common/enums/doctor-type.enum';
import {
  requiredDoctorDocumentTypes,
  requiredEstablishmentDocumentTypes,
  VerificationDocumentType,
} from '../../common/enums/verification-document-type.enum';
import { VerificationDocumentStatus } from '../../common/enums/verification-document-status.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createPaginationMeta,
  getPagination,
} from '../shared/admin-pagination.util';
import {
  mapAuditLog,
  mapVerificationDocument,
  mapVerificationListItem,
  type VerificationRequestForAdmin,
} from '../shared/admin-response.mapper';
import { ApproveVerificationDto } from './dto/approve-verification.dto';
import { ListVerificationsQueryDto } from './dto/list-verifications-query.dto';
import { RejectVerificationDto } from './dto/reject-verification.dto';

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
export class AdminVerificationsService {
  private readonly uploadRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    configService: ConfigService,
  ) {
    this.uploadRoot = resolve(
      process.cwd(),
      configService.get<string>('UPLOAD_ROOT') ?? './uploads',
    );
  }

  async listVerifications(query: ListVerificationsQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where = this.buildVerificationWhere(query);
    const orderBy = this.buildVerificationOrderBy(query);

    const [total, requests] = await Promise.all([
      this.prisma.verificationRequest.count({ where }),
      this.prisma.verificationRequest.findMany({
        include: this.getVerificationRequestInclude(),
        orderBy,
        skip,
        take: limit,
        where,
      }),
    ]);

    return {
      data: requests.map((request) =>
        mapVerificationListItem(
          request as VerificationRequestForAdmin,
          this.getRequiredDocumentsCount(request as VerificationRequestForAdmin),
        ),
      ),
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async getVerificationById(
    id: string,
    adminId: string,
    context: RequestContext = {},
  ) {
    const request = await this.findVerificationOrThrow(id);
    const auditLogs = await this.prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 8,
      where: {
        OR: [
          {
            entityId: id,
          },
          {
            userId: request.userId,
          },
        ],
      },
    });

    await this.auditLogsService.createAuditLog({
      action: 'ADMIN_VIEWED_VERIFICATION',
      entityId: id,
      entityType: 'VERIFICATION_REQUEST',
      ipAddress: context.ipAddress,
      metadata: {
        status: request.status,
        type: request.type,
      },
      userAgent: context.userAgent,
      userId: adminId,
    });

    return {
      id: request.id,
      type: request.type,
      status: request.status,
      submittedAt: request.submittedAt,
      reviewedAt: request.reviewedAt,
      rejectionReason: request.rejectionReason,
      requester: {
        userId: request.user.id,
        name: request.user.fullName,
        email: request.user.email,
        phone: request.user.phone,
        role: request.user.role,
        accountStatus: request.user.accountStatus,
      },
      establishment: request.establishment,
      doctorProfile: request.doctorProfile,
      verificationData:
        request.type === 'ESTABLISHMENT' ? request.data : request.doctorData,
      documents: (request.documents ?? []).map(mapVerificationDocument),
      adminChecklist: this.createAdminChecklist(request),
      history: auditLogs.map(mapAuditLog),
    };
  }

  async approveVerification(
    id: string,
    adminId: string,
    dto: ApproveVerificationDto,
    context: RequestContext = {},
  ) {
    const request = await this.findVerificationOrThrow(id);
    this.assertPendingVerification(request);
    this.assertCanApprove(request);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.verificationRequest.update({
        data: {
          reviewedAt: new Date(),
          reviewedById: adminId,
          status: VerificationStatus.VERIFIED,
        },
        where: { id },
      });

      if (request.type === 'ESTABLISHMENT' && request.establishmentId) {
        await transaction.establishment.update({
          data: { verificationStatus: VerificationStatus.VERIFIED },
          where: { id: request.establishmentId },
        });
      }

      if (request.type === 'INDEPENDENT_DOCTOR' && request.doctorProfileId) {
        await transaction.doctorProfile.update({
          data: { verificationStatus: VerificationStatus.VERIFIED },
          where: { id: request.doctorProfileId },
        });
      }

      await transaction.user.update({
        data: { accountStatus: AccountStatus.VERIFIED_NO_PLAN },
        where: { id: request.userId },
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'VERIFICATION_APPROVED',
          entityId: id,
          entityType: 'VERIFICATION_REQUEST',
          ipAddress: context.ipAddress,
          metadata: {
            adminNote: dto.adminNote,
            type: request.type,
          },
          userAgent: context.userAgent,
          userId: adminId,
        },
        transaction,
      );
    });

    return {
      message: 'Demande approuvée avec succès.',
      status: VerificationStatus.VERIFIED,
    };
  }

  async rejectVerification(
    id: string,
    adminId: string,
    dto: RejectVerificationDto,
    context: RequestContext = {},
  ) {
    const request = await this.findVerificationOrThrow(id);
    this.assertPendingVerification(request);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.verificationRequest.update({
        data: {
          rejectionReason: dto.reason,
          reviewedAt: new Date(),
          reviewedById: adminId,
          status: VerificationStatus.REJECTED,
        },
        where: { id },
      });

      if (request.type === 'ESTABLISHMENT' && request.establishmentId) {
        await transaction.establishment.update({
          data: { verificationStatus: VerificationStatus.REJECTED },
          where: { id: request.establishmentId },
        });
      }

      if (request.type === 'INDEPENDENT_DOCTOR' && request.doctorProfileId) {
        await transaction.doctorProfile.update({
          data: { verificationStatus: VerificationStatus.REJECTED },
          where: { id: request.doctorProfileId },
        });
      }

      await this.auditLogsService.createAuditLog(
        {
          action: 'VERIFICATION_REJECTED',
          entityId: id,
          entityType: 'VERIFICATION_REQUEST',
          ipAddress: context.ipAddress,
          metadata: {
            adminNote: dto.adminNote,
            reason: dto.reason,
            type: request.type,
          },
          userAgent: context.userAgent,
          userId: adminId,
        },
        transaction,
      );
    });

    return {
      message: 'Demande refusée avec succès.',
      reason: dto.reason,
      status: VerificationStatus.REJECTED,
    };
  }

  async getDocumentStream(
    verificationRequestId: string,
    documentId: string,
    adminId: string,
    disposition: 'inline' | 'attachment',
    context: RequestContext = {},
  ): Promise<DocumentStreamResult> {
    const request = await this.prisma.verificationRequest.findUnique({
      include: {
        documents: {
          where: {
            id: documentId,
          },
        },
      },
      where: {
        id: verificationRequestId,
      },
    });

    if (!request) {
      throw new NotFoundException('Demande de vérification introuvable.');
    }

    const document = request.documents[0];

    if (!document) {
      throw new NotFoundException('Document introuvable.');
    }

    const safePath = this.ensureDocumentPathIsSafe(document.localPath);

    if (!existsSync(safePath)) {
      throw new NotFoundException('Document introuvable.');
    }

    await this.auditLogsService.createAuditLog({
      action:
        disposition === 'inline'
          ? 'ADMIN_VIEWED_VERIFICATION_DOCUMENT'
          : 'ADMIN_DOWNLOADED_VERIFICATION_DOCUMENT',
      entityId: document.id,
      entityType: 'VERIFICATION_DOCUMENT',
      ipAddress: context.ipAddress,
      metadata: {
        documentType: document.documentType,
        verificationRequestId,
      },
      userAgent: context.userAgent,
      userId: adminId,
    });

    return {
      stream: createReadStream(safePath),
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
    };
  }

  private buildVerificationWhere(
    query: ListVerificationsQueryDto,
  ): Prisma.VerificationRequestWhereInput {
    const search = query.search?.trim();
    const wilaya = query.wilaya?.trim();
    const where: Prisma.VerificationRequestWhereInput = {};

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.submittedFrom || query.submittedTo) {
      where.submittedAt = {
        gte: query.submittedFrom ? new Date(query.submittedFrom) : undefined,
        lte: query.submittedTo ? new Date(query.submittedTo) : undefined,
      };
    }

    if (wilaya) {
      where.OR = [
        { data: { wilaya: { contains: wilaya } } },
        { doctorData: { wilaya: { contains: wilaya } } },
        { establishment: { wilaya: { contains: wilaya } } },
        { doctorProfile: { wilaya: { contains: wilaya } } },
      ];
    }

    if (search) {
      const searchOr: Prisma.VerificationRequestWhereInput[] = [
        { user: { fullName: { contains: search } } },
        { user: { email: { contains: search } } },
        { user: { phone: { contains: search } } },
        { data: { name: { contains: search } } },
        { data: { professionalEmail: { contains: search } } },
        { data: { phone: { contains: search } } },
        { doctorData: { fullName: { contains: search } } },
        { doctorData: { professionalEmail: { contains: search } } },
        { doctorData: { phone: { contains: search } } },
      ];

      where.AND = [{ OR: where.OR }, { OR: searchOr }].filter(
        (condition) => condition.OR,
      );
      delete where.OR;
    }

    return where;
  }

  private buildVerificationOrderBy(
    query: ListVerificationsQueryDto,
  ): Prisma.VerificationRequestOrderByWithRelationInput[] {
    const sortOrder = query.sortOrder ?? 'desc';
    const sortBy = query.sortBy ?? 'submittedAt';

    if (sortBy === 'submittedAt') {
      return [{ submittedAt: sortOrder }, { updatedAt: 'desc' }];
    }

    return [{ [sortBy]: sortOrder }];
  }

  private getVerificationRequestInclude() {
    return {
      data: true,
      doctorData: true,
      doctorProfile: true,
      documents: true,
      establishment: true,
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
    } as const;
  }

  private async findVerificationOrThrow(id: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      include: this.getVerificationRequestInclude(),
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Demande de vérification introuvable.');
    }

    return request as VerificationRequestForAdmin;
  }

  private getRequiredDocumentTypes(
    request: VerificationRequestForAdmin,
  ): readonly VerificationDocumentType[] {
    if (request.type === 'ESTABLISHMENT') {
      return requiredEstablishmentDocumentTypes;
    }

    return request.doctorData?.doctorType === DoctorType.SPECIALIST
      ? [...requiredDoctorDocumentTypes, VerificationDocumentType.SPECIALITY_DEGREE]
      : requiredDoctorDocumentTypes;
  }

  private getRequiredDocumentsCount(request: VerificationRequestForAdmin) {
    return this.getRequiredDocumentTypes(request).length;
  }

  private getMissingRequiredDocuments(request: VerificationRequestForAdmin) {
    const uploadedTypes = new Set(
      request.documents
        ?.filter((document) => document.status === VerificationDocumentStatus.UPLOADED)
        .map((document) => document.documentType) ?? [],
    );

    return this.getRequiredDocumentTypes(request).filter(
      (documentType) => !uploadedTypes.has(documentType),
    );
  }

  private createAdminChecklist(request: VerificationRequestForAdmin) {
    const missingDocuments = this.getMissingRequiredDocuments(request);
    const verificationData =
      request.type === 'ESTABLISHMENT' ? request.data : request.doctorData;
    const legalInfoProvided =
      request.type === 'ESTABLISHMENT'
        ? Boolean(request.data?.nif && request.data?.commercialRegisterNumber)
        : Boolean(request.doctorData?.nif && request.doctorData?.taxCenter);
    const professionalAuthorizationProvided =
      request.type === 'ESTABLISHMENT'
        ? Boolean(request.data?.healthAuthorizationNumber)
        : Boolean(request.doctorData?.practiceAuthorizationNumber);
    const identityProvided =
      request.type === 'ESTABLISHMENT'
        ? Boolean(request.data?.legalRepresentativeFullName)
        : Boolean(request.doctorData?.fullName && request.doctorData?.ninOrIdNumber);
    const warnings = [
      ...missingDocuments.map((documentType) => `Document manquant: ${documentType}`),
      !legalInfoProvided ? 'Informations légales ou fiscales incomplètes.' : null,
      !professionalAuthorizationProvided
        ? 'Autorisation professionnelle non renseignée.'
        : null,
      !identityProvided ? 'Identité ou représentant légal incomplet.' : null,
    ].filter((warning): warning is string => Boolean(warning));

    return {
      requiredDocumentsPresent: missingDocuments.length === 0,
      identityProvided,
      legalInfoProvided,
      professionalAuthorizationProvided,
      canApprove:
        warnings.length === 0 &&
        Boolean(verificationData?.confirmationAccuracy),
      warnings,
    };
  }

  private assertPendingVerification(request: VerificationRequestForAdmin): void {
    if (request.status !== VerificationStatus.PENDING_VERIFICATION) {
      throw new ConflictException(
        "Cette demande n'est pas en attente de vérification.",
      );
    }
  }

  private assertCanApprove(request: VerificationRequestForAdmin): void {
    const checklist = this.createAdminChecklist(request);

    if (!checklist.canApprove) {
      throw new BadRequestException('Document obligatoire manquant.');
    }
  }

  private ensureDocumentPathIsSafe(localPath: string): string {
    const resolvedPath = resolve(localPath);

    if (
      resolvedPath !== this.uploadRoot &&
      !resolvedPath.startsWith(`${this.uploadRoot}\\`) &&
      !resolvedPath.startsWith(`${this.uploadRoot}/`)
    ) {
      throw new ForbiddenException(
        "Vous n'êtes pas autorisé à accéder à cette ressource.",
      );
    }

    return resolvedPath;
  }
}
