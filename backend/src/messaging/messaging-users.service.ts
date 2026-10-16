import { Injectable } from '@nestjs/common';
import {
  Prisma,
  VerificationStatus,
  WorkspaceMembershipStatus,
} from '@prisma/client';

import { AccountStatus } from '../common/enums/account-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

// What a professional may see of another: never the e-mail nor the phone.
export const peerProfileSelect = {
  id: true,
  fullName: true,
  role: true,
  discoverableByPeers: true,
  doctorProfile: {
    select: {
      speciality: true,
      wilaya: true,
      establishment: { select: { name: true } },
    },
  },
  establishment: { select: { name: true, wilaya: true } },
} satisfies Prisma.UserSelect;

export type PeerProfileRow = Prisma.UserGetPayload<{
  select: typeof peerProfileSelect;
}>;

export type PeerProfile = {
  id: string;
  fullName: string;
  role: string;
  speciality: string | null;
  wilaya: string | null;
  establishmentName: string | null;
};

export function toPeerProfile(user: PeerProfileRow): PeerProfile {
  return {
    establishmentName:
      user.establishment?.name ??
      user.doctorProfile?.establishment?.name ??
      null,
    fullName: user.fullName,
    id: user.id,
    role: user.role,
    speciality: user.doctorProfile?.speciality ?? null,
    wilaya: user.doctorProfile?.wilaya ?? user.establishment?.wilaya ?? null,
  };
}

// A professional of the messaging whose account is verified and usable: the
// rule of VerifiedAccountGuard (profile VERIFIED, account neither suspended
// nor rejected), applied to the other side of a conversation.
export const reachableUserWhere: Prisma.UserWhereInput = {
  accountStatus: {
    notIn: [AccountStatus.SUSPENDED, AccountStatus.REJECTED],
  },
  OR: [
    {
      role: UserRole.ESTABLISHMENT_ADMIN,
      establishment: { verificationStatus: VerificationStatus.VERIFIED },
    },
    {
      role: { in: [UserRole.INDEPENDENT_DOCTOR, UserRole.AFFILIATED_DOCTOR] },
      doctorProfile: { verificationStatus: VerificationStatus.VERIFIED },
    },
  ],
};

export type BlockRelation = {
  // The caller blocked the other user.
  blockedByMe: boolean;
  // The other user blocked the caller.
  blockedMe: boolean;
};

@Injectable()
export class MessagingUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async activeWorkspaceIds(
    userId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<string[]> {
    const memberships = await client.workspaceMembership.findMany({
      select: { workspaceId: true },
      where: { status: WorkspaceMembershipStatus.ACTIVE, userId },
    });
    return memberships.map(({ workspaceId }) => workspaceId);
  }

  // Both users hold an ACTIVE membership of one same workspace.
  async shareWorkspace(
    userId: string,
    otherUserId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<boolean> {
    const workspaceIds = await this.activeWorkspaceIds(userId, client);

    if (workspaceIds.length === 0) {
      return false;
    }

    const shared = await client.workspaceMembership.count({
      where: {
        status: WorkspaceMembershipStatus.ACTIVE,
        userId: otherUserId,
        workspaceId: { in: workspaceIds },
      },
    });
    return shared > 0;
  }

  async blockRelation(
    userId: string,
    otherUserId: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<BlockRelation> {
    const blocks = await client.userBlock.findMany({
      select: { blockerId: true },
      where: {
        OR: [
          { blockedId: otherUserId, blockerId: userId },
          { blockedId: userId, blockerId: otherUserId },
        ],
      },
    });
    return {
      blockedByMe: blocks.some(({ blockerId }) => blockerId === userId),
      blockedMe: blocks.some(({ blockerId }) => blockerId === otherUserId),
    };
  }
}
