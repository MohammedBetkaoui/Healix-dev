import { Injectable } from '@nestjs/common';

import {
  mapVerificationListItem,
  type VerificationRequestForAdmin,
} from '../shared/admin-response.mapper';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  requiredDoctorDocumentTypes,
  requiredEstablishmentDocumentTypes,
} from '../../common/enums/verification-document-type.enum';
import { DoctorType } from '../../common/enums/doctor-type.enum';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      pendingVerifications,
      verifiedRequests,
      rejectedRequests,
      totalUsers,
      establishments,
      independentDoctors,
      recentVerificationRequests,
      activityRequests,
    ] = await Promise.all([
      this.prisma.verificationRequest.count({
        where: { status: VerificationStatus.PENDING_VERIFICATION },
      }),
      this.prisma.verificationRequest.count({
        where: { status: VerificationStatus.VERIFIED },
      }),
      this.prisma.verificationRequest.count({
        where: { status: VerificationStatus.REJECTED },
      }),
      this.prisma.user.count(),
      this.prisma.establishment.count(),
      this.prisma.doctorProfile.count({ where: { isIndependent: true } }),
      this.prisma.verificationRequest.findMany({
        include: this.getVerificationRequestInclude(),
        orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
        where: {
          submittedAt: {
            not: null,
          },
        },
      }),
      this.prisma.verificationRequest.findMany({
        select: {
          createdAt: true,
          status: true,
        },
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
      }),
    ]);

    return {
      stats: {
        pendingVerifications,
        verifiedRequests,
        rejectedRequests,
        totalUsers,
        establishments,
        independentDoctors,
      },
      recentVerificationRequests: recentVerificationRequests.map((request) =>
        mapVerificationListItem(
          request as VerificationRequestForAdmin,
          this.getRequiredDocumentsCount(request as VerificationRequestForAdmin),
        ),
      ),
      weeklyVerificationActivity:
        this.createWeeklyVerificationActivity(activityRequests),
      usersDistribution: {
        establishments,
        independentDoctors,
      },
    };
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

  private getRequiredDocumentsCount(request: VerificationRequestForAdmin) {
    if (request.type === 'ESTABLISHMENT') {
      return requiredEstablishmentDocumentTypes.length;
    }

    const baseCount = requiredDoctorDocumentTypes.length;
    return request.doctorData?.doctorType === DoctorType.SPECIALIST
      ? baseCount + 1
      : baseCount;
  }

  private createWeeklyVerificationActivity(
    requests: Array<{ createdAt: Date; status: string }>,
  ) {
    const buckets = Array.from({ length: 7 }, (_value, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);

      return {
        date: key,
        pending: 0,
        verified: 0,
        rejected: 0,
      };
    });
    const bucketMap = new Map(buckets.map((bucket) => [bucket.date, bucket]));

    for (const request of requests) {
      const key = request.createdAt.toISOString().slice(0, 10);
      const bucket = bucketMap.get(key);

      if (!bucket) {
        continue;
      }

      if (request.status === VerificationStatus.VERIFIED) {
        bucket.verified += 1;
      } else if (request.status === VerificationStatus.REJECTED) {
        bucket.rejected += 1;
      } else {
        bucket.pending += 1;
      }
    }

    return buckets;
  }
}
