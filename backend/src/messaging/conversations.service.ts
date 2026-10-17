import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationType,
  type Message,
  type Patient,
  ParticipantStatus,
  Prisma,
  WorkspaceMembershipStatus,
} from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { type RequestContext } from '../common/utils/request-context';
import { sanitizeTextInput } from '../common/utils/sanitize';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import {
  caseScopeWhere,
  groupWorkspaceMemberWhere,
} from './conversation-access';
import {
  type ConversationListStatus,
  type CreateConversationDto,
  type ListConversationsQueryDto,
  type UpdateConversationDto,
} from './dto/conversations.dto';
import { MessageCrypto } from './message-crypto';
import { MessagingEvents } from './messaging-events';
import { type LastMessageView, toLastMessageView } from './message-views';
import {
  cannotMessageSelf,
  caseAlreadyOpen,
  contactBlocked,
  conversationNotFound,
  conversationTypeNotAvailable,
  groupOnly,
  invalidCaseMembers,
  invalidGroupMembers,
  invalidTitle,
  notPending,
  nothingToUpdate,
  ownerOnly,
  participantNotFound,
  patientNotFound,
  recipientNotFound,
} from './messaging-errors';
import {
  caseTitleFor,
  CONVERSATION_PAGE_LIMIT_DEFAULT,
  CONVERSATION_TITLE_MAX_LENGTH,
  type ConversationCursor,
  decodeCursor,
  directKeyFor,
  encodeCursor,
  PARTICIPANT_ROLE,
} from './messaging-rules';
import {
  MessagingUsersService,
  peerProfileSelect,
  reachableUserWhere,
  toPeerProfile,
} from './messaging-users.service';

export { groupWorkspaceMemberWhere } from './conversation-access';

// REFERRAL and SUPPORT (later lots) are refused, and never listed.
export const AVAILABLE_CONVERSATION_TYPES: ConversationType[] = [
  ConversationType.DIRECT,
  ConversationType.GROUP,
  ConversationType.CASE,
];

// The patient of a CASE discussion, as its participants see it.
const casePatientSelect = {
  birthDate: true,
  firstName: true,
  firstNameAr: true,
  id: true,
  lastName: true,
  lastNameAr: true,
} satisfies Prisma.PatientSelect;

export type CasePatientView = Prisma.PatientGetPayload<{
  select: typeof casePatientSelect;
}>;

export const participantsInclude = {
  participants: {
    include: { user: { select: peerProfileSelect } },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
  },
  patient: { select: casePatientSelect },
} satisfies Prisma.ConversationInclude;

export type ConversationWithParticipants = Prisma.ConversationGetPayload<{
  include: typeof participantsInclude;
}>;

type ParticipantRow = ConversationWithParticipants['participants'][number];

export type Participation = {
  conversation: ConversationWithParticipants;
  participant: ParticipantRow;
};

export type ConversationParticipantView = {
  userId: string;
  fullName: string;
  speciality: string | null;
  establishmentName: string | null;
  role: string;
  status: ParticipantStatus;
};

export type ConversationView = {
  id: string;
  type: ConversationType;
  title: string | null;
  workspaceId: string | null;
  createdById: string;
  lastSeq: number;
  lastMessageAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  me: {
    role: string;
    status: ParticipantStatus;
    lastReadSeq: number;
    mutedUntil: Date | null;
  };
  unreadCount: number;
  lastMessage: LastMessageView | null;
  participants: ConversationParticipantView[];
  // CASE: the patient discussed.
  patient: CasePatientView | null;
};

export type ConversationPage = {
  items: ConversationView[];
  nextCursor: string | null;
};

const OPEN_STATUSES: ParticipantStatus[] = [
  ParticipantStatus.ACTIVE,
  ParticipantStatus.PENDING,
];

const AUDIT_ENTITY = 'CONVERSATION';

function cursorWhere(
  cursor: ConversationCursor,
): Prisma.ConversationWhereInput {
  if (cursor.lastMessageAt === null) {
    return { id: { lt: cursor.id }, lastMessageAt: null };
  }

  return {
    OR: [
      { lastMessageAt: { lt: cursor.lastMessageAt } },
      { id: { lt: cursor.id }, lastMessageAt: cursor.lastMessageAt },
      { lastMessageAt: null },
    ],
  };
}

// Whether another discussion of this patient is open (not archived), the
// patient's row locked first: the creations and reopenings of one patient's
// discussions queue on it, so that only one stays open.
export async function otherOpenCaseExists(
  client: Prisma.TransactionClient,
  patientId: string,
  conversationId: string | null,
): Promise<boolean> {
  await client.$queryRaw`SELECT id FROM patients WHERE id = ${patientId} FOR UPDATE`;
  const open = await client.conversation.count({
    where: {
      archivedAt: null,
      patientId,
      type: ConversationType.CASE,
      ...(conversationId ? { id: { not: conversationId } } : {}),
    },
  });
  return open > 0;
}

function listStatusWhere(
  userId: string,
  status: ConversationListStatus,
): Prisma.ConversationWhereInput {
  if (status === 'pending') {
    return {
      participants: { some: { status: ParticipantStatus.PENDING, userId } },
    };
  }

  return {
    archivedAt: status === 'archived' ? { not: null } : null,
    participants: { some: { status: ParticipantStatus.ACTIVE, userId } },
  };
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: MessagingUsersService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly auditLogs: AuditLogsService,
    private readonly crypto: MessageCrypto,
    private readonly events: MessagingEvents,
    private readonly patients: PatientsService,
    private readonly patientAudit: PatientAuditService,
  ) {}

  // The caller's participation, in one of the given statuses; 404 for anyone
  // else, so that the conversation's existence is not revealed. A CASE
  // discussion also needs its patient still in the caller's scope: a doctor
  // who leaves the establishment loses it, in reading as in writing.
  async getParticipation(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    statuses: ParticipantStatus[] = [ParticipantStatus.ACTIVE],
  ): Promise<Participation> {
    const conversation = await this.prisma.conversation.findFirst({
      include: participantsInclude,
      where: {
        AND: [
          { id: conversationId, type: { in: AVAILABLE_CONVERSATION_TYPES } },
          groupWorkspaceMemberWhere(actor.sub),
        ],
      },
    });
    const participant = conversation?.participants.find(
      (entry) => entry.userId === actor.sub,
    );

    if (
      !conversation ||
      !participant ||
      !statuses.includes(participant.status) ||
      (conversation.type === ConversationType.CASE &&
        !(await this.hasPatientInScope(actor, conversation.patientId)))
    ) {
      throw conversationNotFound();
    }

    return { conversation, participant };
  }

  // The workspace whose patients the caller sees (the scope of
  // PatientsService), null without one: the CASE discussions they may read.
  async caseScopeWorkspaceId(
    actor: AuthenticatedUserPayload,
  ): Promise<string | null> {
    try {
      return (await this.patients.getPatientScope(actor)).workspaceId;
    } catch (error) {
      if (error instanceof ForbiddenException) return null;
      throw error;
    }
  }

  async list(
    actor: AuthenticatedUserPayload,
    query: ListConversationsQueryDto,
  ): Promise<ConversationPage> {
    const limit = query.limit ?? CONVERSATION_PAGE_LIMIT_DEFAULT;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const scopeWorkspaceId = await this.caseScopeWorkspaceId(actor);
    const rows = await this.prisma.conversation.findMany({
      include: participantsInclude,
      // MySQL sorts NULL last in descending order: conversations without a
      // message come after the others.
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      where: {
        AND: [
          { type: query.type ?? { in: AVAILABLE_CONVERSATION_TYPES } },
          listStatusWhere(actor.sub, query.status ?? 'active'),
          groupWorkspaceMemberWhere(actor.sub),
          cursor ? cursorWhere(cursor) : {},
          caseScopeWhere(scopeWorkspaceId),
        ],
      },
    });
    const page = rows.slice(0, limit);
    const lastMessages = await this.findLastMessages(page);
    const last = page.at(-1);

    return {
      items: page.map((conversation) =>
        this.toView(
          conversation,
          actor.sub,
          lastMessages.get(conversation.id) ?? null,
        ),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ id: last.id, lastMessageAt: last.lastMessageAt })
          : null,
    };
  }

  async getOne(
    actor: AuthenticatedUserPayload,
    conversationId: string,
  ): Promise<ConversationView> {
    const { conversation } = await this.getParticipation(
      actor,
      conversationId,
      OPEN_STATUSES,
    );
    return this.view(conversation, actor.sub);
  }

  async create(
    actor: AuthenticatedUserPayload,
    dto: CreateConversationDto,
    context: RequestContext,
  ): Promise<{ conversation: ConversationView; created: boolean }> {
    switch (dto.type) {
      case ConversationType.DIRECT:
        return this.createDirect(actor, dto.participantId ?? '', context);
      case ConversationType.GROUP:
        return this.createGroup(
          actor,
          dto.title ?? '',
          dto.participantIds ?? [],
          context,
        );
      case ConversationType.CASE:
        return this.openCase(
          actor,
          dto.patientId ?? '',
          dto.participantIds ?? [],
          context,
        );
      default:
        throw conversationTypeNotAvailable();
    }
  }

  async update(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationView> {
    const { conversation, participant } = await this.getParticipation(
      actor,
      conversationId,
    );

    if (
      dto.title === undefined &&
      dto.archived === undefined &&
      dto.mutedUntil === undefined
    ) {
      throw nothingToUpdate();
    }

    const isGroup = conversation.type === ConversationType.GROUP;
    const isOwner = participant.role === PARTICIPANT_ROLE.OWNER;
    const changes: Prisma.ConversationUpdateInput = {};

    if (dto.title !== undefined) {
      if (!isGroup) throw groupOnly();
      if (!isOwner) throw ownerOnly();
      changes.title = this.readTitle(dto.title);
    }

    // Archiving is the conversation's, shared by its participants: the
    // OWNER's decision for a group, any participant's for a DIRECT or a CASE.
    // A new message brings it back. A patient has one open discussion: an
    // archived one comes back only if no other was opened meanwhile.
    if (dto.archived !== undefined) {
      if (isGroup && !isOwner) throw ownerOnly();
      changes.archivedAt = dto.archived
        ? (conversation.archivedAt ?? new Date())
        : null;
    }
    const reopensCase =
      conversation.type === ConversationType.CASE &&
      dto.archived === false &&
      conversation.archivedAt !== null &&
      conversation.patientId !== null;

    // Muting is the caller's own; a date already past unmutes.
    const mutedUntil =
      dto.mutedUntil === undefined
        ? undefined
        : dto.mutedUntil === null || new Date(dto.mutedUntil) <= new Date()
          ? null
          : new Date(dto.mutedUntil);

    await this.prisma.$transaction(async (transaction) => {
      if (
        reopensCase &&
        (await otherOpenCaseExists(
          transaction,
          conversation.patientId as string,
          conversation.id,
        ))
      ) {
        throw caseAlreadyOpen();
      }
      if (Object.keys(changes).length > 0) {
        await transaction.conversation.update({
          data: changes,
          where: { id: conversation.id },
        });
      }
      if (mutedUntil !== undefined) {
        await transaction.conversationParticipant.update({
          data: { mutedUntil },
          where: { id: participant.id },
        });
      }
    });

    if (Object.keys(changes).length > 0) {
      await this.events.conversationUpdated(conversation.id);
    } else {
      this.events.conversationUpdatedFor([actor.sub], conversation.id);
    }

    return this.getOne(actor, conversationId);
  }

  async addParticipants(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    userIds: string[],
    context: RequestContext,
  ): Promise<ConversationView> {
    const { conversation, participant } = await this.getParticipation(
      actor,
      conversationId,
    );

    // A group's members are its OWNER's to manage; any participant of a case
    // discussion brings in colleagues of the patient's workspace.
    const isCase = conversation.type === ConversationType.CASE;
    if (conversation.type !== ConversationType.GROUP && !isCase) {
      throw groupOnly();
    }
    if (!isCase && participant.role !== PARTICIPANT_ROLE.OWNER) {
      throw ownerOnly();
    }

    const memberIds = [...new Set(userIds)].filter((id) => id !== actor.sub);
    if (isCase) {
      await this.assertCaseMembers(conversation.workspaceId, memberIds);
    } else {
      await this.assertGroupMembers(conversation.workspaceId, memberIds);
    }

    await this.prisma.$transaction((transaction) =>
      this.join(transaction, conversation, memberIds, actor, context),
    );
    await this.events.conversationUpdated(conversation.id);

    return this.getOne(actor, conversationId);
  }

  // Makes these users ACTIVE members; returns those who were not. A member
  // who joins reads the history, with nothing unread.
  private async join(
    transaction: Prisma.TransactionClient,
    conversation: ConversationWithParticipants,
    userIds: string[],
    actor: AuthenticatedUserPayload,
    context: RequestContext,
  ): Promise<string[]> {
    const current = new Map(
      conversation.participants.map((entry) => [entry.userId, entry]),
    );
    const added = [...new Set(userIds)].filter(
      (userId) => current.get(userId)?.status !== ParticipantStatus.ACTIVE,
    );

    for (const userId of added) {
      await transaction.conversationParticipant.upsert({
        create: {
          conversationId: conversation.id,
          lastReadSeq: conversation.lastSeq,
          role: PARTICIPANT_ROLE.MEMBER,
          status: ParticipantStatus.ACTIVE,
          userId,
        },
        update: {
          joinedAt: new Date(),
          lastReadSeq: conversation.lastSeq,
          leftAt: null,
          role: PARTICIPANT_ROLE.MEMBER,
          status: ParticipantStatus.ACTIVE,
        },
        where: {
          conversationId_userId: { conversationId: conversation.id, userId },
        },
      });
      await this.audit(
        'CONVERSATION_MEMBER_ADDED',
        actor,
        conversation.id,
        { memberId: userId },
        context,
        transaction,
      );
    }

    return added;
  }

  // The OWNER removes a member of a group; any member removes themselves
  // (leaves), of a group or of a case discussion. An OWNER who leaves hands
  // it to its longest-standing member.
  async removeParticipant(
    actor: AuthenticatedUserPayload,
    conversationId: string,
    userId: string,
    context: RequestContext,
  ): Promise<{ id: string; status: ParticipantStatus } | ConversationView> {
    const { conversation, participant } = await this.getParticipation(
      actor,
      conversationId,
    );

    const leaving = userId === actor.sub;
    const isOwner = participant.role === PARTICIPANT_ROLE.OWNER;

    if (
      conversation.type !== ConversationType.GROUP &&
      !(conversation.type === ConversationType.CASE && leaving)
    ) {
      throw groupOnly();
    }
    if (!leaving && !isOwner) throw ownerOnly();

    const target = conversation.participants.find(
      (entry) =>
        entry.userId === userId && OPEN_STATUSES.includes(entry.status),
    );

    if (!target) throw participantNotFound();

    const successor =
      leaving && isOwner
        ? conversation.participants.find(
            (entry) =>
              entry.userId !== actor.sub &&
              entry.status === ParticipantStatus.ACTIVE,
          )
        : undefined;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.conversationParticipant.update({
        data: {
          leftAt: new Date(),
          role: PARTICIPANT_ROLE.MEMBER,
          status: ParticipantStatus.LEFT,
        },
        where: { id: target.id },
      });
      if (successor) {
        await transaction.conversationParticipant.update({
          data: { role: PARTICIPANT_ROLE.OWNER },
          where: { id: successor.id },
        });
      }
      await this.audit(
        leaving ? 'CONVERSATION_LEFT' : 'CONVERSATION_MEMBER_REMOVED',
        actor,
        conversation.id,
        leaving
          ? { newOwnerId: successor?.userId ?? null }
          : { memberId: userId },
        context,
        transaction,
      );
    });

    await this.events.conversationUpdated(conversation.id, { also: [userId] });

    return leaving
      ? { id: conversation.id, status: ParticipantStatus.LEFT }
      : this.getOne(actor, conversationId);
  }

  async accept(
    actor: AuthenticatedUserPayload,
    conversationId: string,
  ): Promise<ConversationView> {
    const { participant } = await this.getParticipation(
      actor,
      conversationId,
      OPEN_STATUSES,
    );

    if (participant.status !== ParticipantStatus.PENDING) throw notPending();

    await this.prisma.conversationParticipant.update({
      data: { status: ParticipantStatus.ACTIVE },
      where: { id: participant.id },
    });
    await this.events.conversationUpdated(conversationId);
    return this.getOne(actor, conversationId);
  }

  // The request leaves the recipient's list; the sender cannot write again
  // (CONVERSATION_CLOSED) unless the recipient starts the conversation.
  async decline(
    actor: AuthenticatedUserPayload,
    conversationId: string,
  ): Promise<{ id: string; status: ParticipantStatus }> {
    const { participant } = await this.getParticipation(
      actor,
      conversationId,
      OPEN_STATUSES,
    );

    if (participant.status !== ParticipantStatus.PENDING) throw notPending();

    await this.prisma.conversationParticipant.update({
      data: { leftAt: new Date(), status: ParticipantStatus.LEFT },
      where: { id: participant.id },
    });
    await this.events.conversationUpdated(conversationId, {
      also: [actor.sub],
    });
    return { id: conversationId, status: ParticipantStatus.LEFT };
  }

  // --- Creation ---------------------------------------------------------------

  // One conversation per pair. The other professional must be verified and
  // usable, and either a member of a workspace of the caller or listed in
  // the directory; outside the caller's workspaces, they receive a request
  // (PENDING) carrying a single message until they accept it.
  private async createDirect(
    actor: AuthenticatedUserPayload,
    otherUserId: string,
    context: RequestContext,
  ) {
    if (otherUserId === actor.sub) throw cannotMessageSelf();

    const blocks = await this.users.blockRelation(actor.sub, otherUserId);

    if (blocks.blockedMe) throw recipientNotFound();
    if (blocks.blockedByMe) throw contactBlocked();

    const other = await this.prisma.user.findFirst({
      select: { discoverableByPeers: true, id: true },
      where: { AND: [{ id: otherUserId }, reachableUserWhere] },
    });

    if (!other) throw recipientNotFound();

    const sameWorkspace = await this.users.shareWorkspace(actor.sub, other.id);

    if (!sameWorkspace && !other.discoverableByPeers) throw recipientNotFound();

    const directKey = directKeyFor(actor.sub, other.id);
    const existing = await this.findDirect(directKey);

    if (existing) {
      return {
        conversation: await this.reopenDirect(existing, actor),
        created: false,
      };
    }

    try {
      const conversation = await this.prisma.$transaction(
        async (transaction) => {
          const created = await transaction.conversation.create({
            data: {
              createdById: actor.sub,
              directKey,
              participants: {
                create: [
                  {
                    role: PARTICIPANT_ROLE.MEMBER,
                    status: ParticipantStatus.ACTIVE,
                    userId: actor.sub,
                  },
                  {
                    role: PARTICIPANT_ROLE.MEMBER,
                    status: sameWorkspace
                      ? ParticipantStatus.ACTIVE
                      : ParticipantStatus.PENDING,
                    userId: other.id,
                  },
                ],
              },
              type: ConversationType.DIRECT,
            },
            include: participantsInclude,
          });
          await this.audit(
            'CONVERSATION_CREATED',
            actor,
            created.id,
            {
              participantIds: [other.id],
              request: !sameWorkspace,
              type: ConversationType.DIRECT,
            },
            context,
            transaction,
          );
          return created;
        },
      );
      await this.events.conversationUpdated(conversation.id);
      return {
        conversation: await this.view(conversation, actor.sub),
        created: true,
      };
    } catch (error) {
      // Both sides opened it at the same time: the other request won.
      const raced = isUniqueViolation(error)
        ? await this.findDirect(directKey)
        : null;
      if (!raced) throw error;
      return {
        conversation: await this.reopenDirect(raced, actor),
        created: false,
      };
    }
  }

  private findDirect(directKey: string) {
    return this.prisma.conversation.findUnique({
      include: participantsInclude,
      where: { directKey },
    });
  }

  // Opening an existing DIRECT conversation makes the caller ACTIVE again:
  // a request they had not answered, or had declined, counts as accepted.
  private async reopenDirect(
    conversation: ConversationWithParticipants,
    actor: AuthenticatedUserPayload,
  ): Promise<ConversationView> {
    const mine = conversation.participants.find(
      (entry) => entry.userId === actor.sub,
    );

    if (mine && mine.status !== ParticipantStatus.ACTIVE) {
      await this.prisma.conversationParticipant.update({
        data: { leftAt: null, status: ParticipantStatus.ACTIVE },
        where: { id: mine.id },
      });
      await this.events.conversationUpdated(conversation.id);
      return this.getOne(actor, conversation.id);
    }

    return this.view(conversation, actor.sub);
  }

  // A team conversation of the caller's workspace: every member is a
  // verified professional with an ACTIVE membership of that workspace.
  private async createGroup(
    actor: AuthenticatedUserPayload,
    rawTitle: string,
    participantIds: string[],
    context: RequestContext,
  ) {
    const title = this.readTitle(rawTitle);
    const { workspaceId } = await this.workspaceContext.resolveWorkspaceForUser(
      {
        role: actor.role,
        userId: actor.sub,
      },
    );
    const memberIds = [...new Set(participantIds)].filter(
      (id) => id !== actor.sub,
    );
    await this.assertGroupMembers(workspaceId, memberIds);

    const conversation = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.conversation.create({
        data: {
          createdById: actor.sub,
          participants: {
            create: [
              {
                role: PARTICIPANT_ROLE.OWNER,
                status: ParticipantStatus.ACTIVE,
                userId: actor.sub,
              },
              ...memberIds.map((userId) => ({
                role: PARTICIPANT_ROLE.MEMBER,
                status: ParticipantStatus.ACTIVE,
                userId,
              })),
            ],
          },
          title,
          type: ConversationType.GROUP,
          workspaceId,
        },
        include: participantsInclude,
      });
      await this.audit(
        'CONVERSATION_CREATED',
        actor,
        created.id,
        {
          participantIds: memberIds,
          type: ConversationType.GROUP,
          workspaceId,
        },
        context,
        transaction,
      );
      return created;
    });
    await this.events.conversationUpdated(conversation.id);

    return {
      conversation: await this.view(conversation, actor.sub),
      created: true,
    };
  }

  // The discussion of a patient the caller has in scope: one open (not
  // archived) per patient. The first call creates it, titled after the
  // patient, in the patient's workspace; the next ones reopen it, adding the
  // caller (and the colleagues asked) if they were not in. Concurrent calls
  // queue on the patient's row: never two open discussions.
  private async openCase(
    actor: AuthenticatedUserPayload,
    patientId: string,
    participantIds: string[],
    context: RequestContext,
  ) {
    const patient = await this.patientInScope(actor, patientId);
    const workspaceId = patient.workspaceId as string;
    const memberIds = [...new Set(participantIds)].filter(
      (id) => id !== actor.sub,
    );
    if (memberIds.length > 0) {
      await this.assertCaseMembers(workspaceId, memberIds);
    }

    const opened = await this.prisma.$transaction(async (transaction) => {
      await otherOpenCaseExists(transaction, patient.id, null);
      const existing = await transaction.conversation.findFirst({
        include: participantsInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        where: {
          archivedAt: null,
          patientId: patient.id,
          type: ConversationType.CASE,
        },
      });

      if (existing) {
        const joined = await this.join(
          transaction,
          existing,
          [actor.sub, ...memberIds],
          actor,
          context,
        );
        return { created: false, id: existing.id, joined };
      }

      const created = await transaction.conversation.create({
        data: {
          createdById: actor.sub,
          participants: {
            create: [
              {
                role: PARTICIPANT_ROLE.OWNER,
                status: ParticipantStatus.ACTIVE,
                userId: actor.sub,
              },
              ...memberIds.map((userId) => ({
                role: PARTICIPANT_ROLE.MEMBER,
                status: ParticipantStatus.ACTIVE,
                userId,
              })),
            ],
          },
          patientId: patient.id,
          title: caseTitleFor(patient),
          type: ConversationType.CASE,
          workspaceId,
        },
      });
      return { created: true, id: created.id, joined: memberIds };
    });

    if (opened.created) {
      // In the patient's audit trail, never the text: who opened it, with
      // whom.
      await this.patientAudit.log(
        actor,
        'CASE_CONVERSATION_CREATED',
        opened.id,
        {
          participantIds: memberIds,
          patientId: patient.id,
        },
      );
    }
    if (opened.created || opened.joined.length > 0) {
      await this.events.conversationUpdated(opened.id);
    }

    return {
      conversation: await this.getOne(actor, opened.id),
      created: opened.created,
    };
  }

  // getPatientInScope's rule, answered with the messaging's 404.
  private async patientInScope(
    actor: AuthenticatedUserPayload,
    patientId: string,
  ): Promise<Patient> {
    try {
      const patient = await this.patients.getPatientInScope(actor, patientId);
      if (!patient.workspaceId) throw patientNotFound();
      return patient;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw patientNotFound();
      }
      throw error;
    }
  }

  private async hasPatientInScope(
    actor: AuthenticatedUserPayload,
    patientId: string | null,
  ): Promise<boolean> {
    if (!patientId) return false;
    try {
      await this.patientInScope(actor, patientId);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  private async assertGroupMembers(
    workspaceId: string | null,
    memberIds: string[],
  ): Promise<void> {
    if (
      memberIds.length === 0 ||
      !(await this.areWorkspaceMembers(workspaceId, memberIds))
    ) {
      throw invalidGroupMembers();
    }
  }

  // The colleagues brought into a patient's discussion: verified
  // professionals with an ACTIVE membership of the patient's workspace.
  private async assertCaseMembers(
    workspaceId: string | null,
    memberIds: string[],
  ): Promise<void> {
    if (
      memberIds.length === 0 ||
      !(await this.areWorkspaceMembers(workspaceId, memberIds))
    ) {
      throw invalidCaseMembers();
    }
  }

  private async areWorkspaceMembers(
    workspaceId: string | null,
    memberIds: string[],
  ): Promise<boolean> {
    if (!workspaceId) return false;

    const eligible = await this.prisma.user.count({
      where: {
        AND: [
          { id: { in: memberIds } },
          reachableUserWhere,
          {
            workspaceMemberships: {
              some: { status: WorkspaceMembershipStatus.ACTIVE, workspaceId },
            },
          },
        ],
      },
    });

    return eligible === memberIds.length;
  }

  private readTitle(value: string): string {
    const title = sanitizeTextInput(value);

    if (title.length === 0 || title.length > CONVERSATION_TITLE_MAX_LENGTH) {
      throw invalidTitle();
    }

    return title;
  }

  // --- Views ------------------------------------------------------------------

  private async view(
    conversation: ConversationWithParticipants,
    userId: string,
  ): Promise<ConversationView> {
    const lastMessages = await this.findLastMessages([conversation]);
    return this.toView(
      conversation,
      userId,
      lastMessages.get(conversation.id) ?? null,
    );
  }

  private async findLastMessages(
    conversations: ConversationWithParticipants[],
  ): Promise<Map<string, Message>> {
    const withMessages = conversations.filter(({ lastSeq }) => lastSeq > 0);

    if (withMessages.length === 0) {
      return new Map();
    }

    const messages = await this.prisma.message.findMany({
      where: {
        OR: withMessages.map(({ id, lastSeq }) => ({
          conversationId: id,
          seq: lastSeq,
        })),
      },
    });
    return new Map(
      messages.map((message) => [message.conversationId, message]),
    );
  }

  private toView(
    conversation: ConversationWithParticipants,
    userId: string,
    lastMessage: Message | null,
  ): ConversationView {
    const me = conversation.participants.find(
      (entry) => entry.userId === userId,
    ) as ParticipantRow;

    return {
      archivedAt: conversation.archivedAt,
      createdAt: conversation.createdAt,
      createdById: conversation.createdById,
      id: conversation.id,
      lastMessage: lastMessage
        ? toLastMessageView(this.crypto, lastMessage)
        : null,
      lastMessageAt: conversation.lastMessageAt,
      lastSeq: conversation.lastSeq,
      me: {
        lastReadSeq: me.lastReadSeq,
        mutedUntil: me.mutedUntil,
        role: me.role,
        status: me.status,
      },
      // Both sides of a DIRECT conversation are always named; a group shows
      // its current members.
      participants: conversation.participants
        .filter(
          (entry) =>
            conversation.type === ConversationType.DIRECT ||
            OPEN_STATUSES.includes(entry.status),
        )
        .map((entry) => {
          const profile = toPeerProfile(entry.user);
          return {
            establishmentName: profile.establishmentName,
            fullName: profile.fullName,
            role: entry.role,
            speciality: profile.speciality,
            status: entry.status,
            userId: entry.userId,
          };
        }),
      patient:
        conversation.type === ConversationType.CASE
          ? conversation.patient
          : null,
      title: conversation.title,
      type: conversation.type,
      unreadCount: Math.max(0, conversation.lastSeq - me.lastReadSeq),
      workspaceId: conversation.workspaceId,
    };
  }

  // Never the text of a message: identifiers only.
  private audit(
    action: string,
    actor: AuthenticatedUserPayload,
    conversationId: string,
    metadata: Prisma.InputJsonObject,
    context: RequestContext,
    client: Prisma.TransactionClient,
  ) {
    return this.auditLogs.createAuditLog(
      {
        action,
        entityId: conversationId,
        entityType: AUDIT_ENTITY,
        ipAddress: context.ipAddress,
        metadata,
        userAgent: context.userAgent,
        userId: actor.sub,
      },
      client,
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
