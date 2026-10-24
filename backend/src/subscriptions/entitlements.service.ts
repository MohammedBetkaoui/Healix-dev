import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  AiAnalysisRunStatus,
  PatientAdministrativeStatus,
  type Prisma,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceType,
} from '@prisma/client';

import { AccountType } from '../common/enums/account-type.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { type UserRole } from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import {
  findCurrentSubscription,
  lockCurrentSubscription,
} from './current-subscription';
import {
  aiUsageSince,
  buildEntitlements,
  type Entitlements,
  type EntitlementUsage,
  type SubscriptionForEntitlements,
} from './entitlements';
import { isPipelineAllowed, type QuotaKey } from './plans/plan-quotas';
import {
  pipelineNotInPlan,
  quotaExceeded,
  subscriptionInactive,
} from './subscription-errors';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

// The account that pays for a workspace: the doctor who owns a private
// practice, the owner of an establishment (affiliated doctors work under the
// subscription of their establishment).
export type BillingOwner = {
  userId: string;
  accountType: AccountType;
  workspaceType: WorkspaceType;
};

const USAGE_OF_QUOTA: Record<QuotaKey, keyof EntitlementUsage> = {
  aiAnalysesPerMonth: 'aiAnalysesThisMonth',
  maxDoctors: 'doctors',
  maxPatients: 'patients',
};

// The pure part of a quota check: readOnly first, then the pipeline, then the
// number. Throws the error the API answers with.
export function assertQuotaAvailable(
  entitlements: Entitlements,
  quota: QuotaKey,
  pipeline?: string,
): void {
  if (entitlements.readOnly) {
    throw subscriptionInactive(entitlements.status, entitlements.expiresAt);
  }

  if (pipeline && !isPipelineAllowed(entitlements.quotas, pipeline)) {
    throw pipelineNotInPlan(pipeline);
  }

  const limit = entitlements.quotas[quota];
  const used = entitlements.usage[USAGE_OF_QUOTA[quota]];

  if (limit !== null && used >= limit) {
    throw quotaExceeded(quota, used, limit, entitlements.trial);
  }
}

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  // The entitlements of the workspace of a signed-in user (affiliated doctors
  // included: their workspace is the establishment's).
  async getEntitlementsForUser(user: {
    sub: string;
    role: UserRole;
  }): Promise<Entitlements> {
    const context = await this.workspaceContext.resolveWorkspaceForUser({
      role: user.role,
      userId: user.sub,
    });

    return this.getEntitlements(context.workspaceId);
  }

  async getEntitlements(
    workspaceId: string,
    now: Date = new Date(),
  ): Promise<Entitlements> {
    const owner = await this.resolveBillingOwner(this.prisma, workspaceId);

    return this.computeFor(this.prisma, workspaceId, owner, now);
  }

  // The same, from the paying account (the admin console starts from it).
  async getEntitlementsForAccount(
    userId: string,
    accountType: AccountType,
    now: Date = new Date(),
  ): Promise<Entitlements> {
    const workspace = await this.prisma.workspace.findFirst({
      select: { id: true },
      where:
        accountType === AccountType.ESTABLISHMENT
          ? { establishment: { ownerId: userId } }
          : { ownerDoctorProfile: { userId } },
    });

    if (!workspace) {
      return buildEntitlements(
        await findCurrentSubscription(this.prisma, userId),
        { aiAnalysesThisMonth: 0, doctors: 0, patients: 0 },
        now,
      );
    }

    return this.getEntitlements(workspace.id, now);
  }

  // Runs `run` (the creation of the patient, of the AI analysis run, of the
  // doctor) in a transaction that holds the lock of the subscription, after
  // checking there that the account may write and has quota left. Counting and
  // creating under the same lock is what makes "10 left, 15 requests" let
  // exactly 10 through.
  async withQuota<T>(
    workspaceId: string,
    quota: QuotaKey,
    run: (client: Prisma.TransactionClient) => Promise<T>,
    options: { pipeline?: string } = {},
  ): Promise<T> {
    const owner = await this.resolveBillingOwner(this.prisma, workspaceId);

    if (!owner) {
      throw subscriptionInactive(SubscriptionStatus.NO_PLAN, null);
    }

    return this.prisma.$transaction(async (transaction) => {
      await lockCurrentSubscription(transaction, owner.userId);
      const entitlements = await this.computeFor(
        transaction,
        workspaceId,
        owner,
        new Date(),
        quota,
      );

      assertQuotaAvailable(entitlements, quota, options.pipeline);

      return run(transaction);
    });
  }

  async resolveBillingOwner(
    client: PrismaExecutor,
    workspaceId: string,
  ): Promise<BillingOwner | null> {
    const workspace = await client.workspace.findUnique({
      select: {
        establishment: { select: { ownerId: true } },
        ownerDoctorProfile: { select: { userId: true } },
        type: true,
      },
      where: { id: workspaceId },
    });

    if (!workspace) {
      return null;
    }

    if (workspace.type === WorkspaceType.ESTABLISHMENT) {
      return workspace.establishment
        ? {
            accountType: AccountType.ESTABLISHMENT,
            userId: workspace.establishment.ownerId,
            workspaceType: workspace.type,
          }
        : null;
    }

    return workspace.ownerDoctorProfile
      ? {
          accountType: AccountType.INDEPENDENT_DOCTOR,
          userId: workspace.ownerDoctorProfile.userId,
          workspaceType: workspace.type,
        }
      : null;
  }

  // `only`: the one usage a quota check needs (the others are left at 0).
  private async computeFor(
    client: PrismaExecutor,
    workspaceId: string,
    owner: BillingOwner | null,
    now: Date,
    only?: QuotaKey,
  ): Promise<Entitlements> {
    const subscription: SubscriptionForEntitlements | null = owner
      ? await findCurrentSubscription(client, owner.userId)
      : null;
    const usage: EntitlementUsage = {
      aiAnalysesThisMonth: 0,
      doctors: 0,
      patients: 0,
    };
    // Counted one after the other: inside a transaction they share one
    // connection.
    if (!only || only === 'maxPatients') {
      usage.patients = await client.patient.count({
        where: {
          administrativeStatus: PatientAdministrativeStatus.ACTIVE,
          workspaceId,
        },
      });
    }
    if (!only || only === 'aiAnalysesPerMonth') {
      usage.aiAnalysesThisMonth = await client.aiAnalysisRun.count({
        where: {
          createdAt: { gte: aiUsageSince(subscription, now) },
          patient: { workspaceId },
          // A technical failure is not an analysis the account used.
          status: { not: AiAnalysisRunStatus.FAILED },
        },
      });
    }
    if (!only || only === 'maxDoctors') {
      usage.doctors = await this.countDoctors(client, workspaceId, owner);
    }

    return buildEntitlements(subscription, usage, now);
  }

  // The doctors of an establishment: its affiliated doctors who may sign in
  // (a suspended doctor frees a seat). A private practice is its one doctor.
  private async countDoctors(
    client: PrismaExecutor,
    workspaceId: string,
    owner: BillingOwner | null,
  ): Promise<number> {
    if (owner?.workspaceType !== WorkspaceType.ESTABLISHMENT) {
      return owner ? 1 : 0;
    }

    return client.workspaceMembership.count({
      where: {
        role: WorkspaceMembershipRole.DOCTOR,
        status: WorkspaceMembershipStatus.ACTIVE,
        user: {
          accountStatus: {
            notIn: [AccountStatus.SUSPENDED, AccountStatus.REJECTED],
          },
        },
        workspaceId,
      },
    });
  }
}
