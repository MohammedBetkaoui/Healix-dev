import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Readable } from 'node:stream';

import { type HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from './attachments.service';
import { CaseRecordService } from './case-record.service';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { MessagingModule } from './messaging.module';

// Lot 4 against a migrated test database (TEST_DATABASE_URL, a name ending
// in "_test"), as messaging.integration.spec.ts; skipped without it. Files go
// to a temporary UPLOAD_ROOT, removed at the end.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = testDatabaseUrl
  ? new URL(testDatabaseUrl).pathname.slice(1)
  : '';
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };
const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n', 'latin1'),
  randomBytes(20_000),
]);

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { code: string }).code;

function upload(buffer: Buffer, originalname: string) {
  return { buffer, originalname, size: buffer.length } as Express.Multer.File;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describeWithDatabase('case discussions against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let conversations: ConversationsService;
  let messages: MessagesService;
  let attachments: AttachmentsService;
  let caseRecord: CaseRecordService;
  let patients: PatientsService;
  let uploadRoot: string;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const created = { users: [] as string[], workspaces: [] as string[] };
  const actors = {} as Record<
    'adminA' | 'doctorA1' | 'doctorA2' | 'adminB',
    AuthenticatedUserPayload
  >;
  const ids = {} as Record<
    'workspaceA' | 'patientA' | 'patientA2' | 'membershipA2',
    string
  >;

  let counter = 0;
  async function user(key: keyof typeof actors, role: string) {
    counter += 1;
    const row = await prisma.user.create({
      data: {
        accountStatus: 'ACTIVE',
        email: `case-${suffix}-${counter}@healix.test`,
        fullName: `Dr Cas ${suffix} ${counter}`,
        passwordHash: 'not-a-real-hash',
        phone: `case-${suffix}-${counter}`,
        role: role as never,
      },
    });
    created.users.push(row.id);
    actors[key] = {
      email: row.email,
      role: role as AuthenticatedUserPayload['role'],
      sub: row.id,
      tokenType: 'access',
    };
    return row;
  }

  async function establishment(ownerId: string, name: string) {
    const row = await prisma.establishment.create({
      data: {
        address: 'Alger',
        managerFullName: 'Direction',
        name: `${name} ${suffix}`,
        ownerId,
        phone: '0550000000',
        professionalEmail: `case-clinic-${suffix}-${ownerId}@healix.test`,
        subscriptionStatus: 'NO_PLAN',
        type: 'CLINIC',
        verificationStatus: 'VERIFIED',
        wilaya: 'Alger',
      },
    });
    const workspace = await prisma.workspace.create({
      data: { establishmentId: row.id, name: row.name, type: 'ESTABLISHMENT' },
    });
    created.workspaces.push(workspace.id);
    await prisma.workspaceMembership.create({
      data: { role: 'OWNER', userId: ownerId, workspaceId: workspace.id },
    });
    return { establishment: row, workspace };
  }

  async function doctor(
    key: keyof typeof actors,
    establishmentId: string,
    workspaceId: string,
  ) {
    const row = await user(key, 'AFFILIATED_DOCTOR');
    await prisma.doctorProfile.create({
      data: {
        establishmentId,
        isIndependent: false,
        professionalAddress: 'Alger',
        speciality: 'Cardiologie',
        subscriptionStatus: 'NO_PLAN',
        userId: row.id,
        verificationStatus: 'VERIFIED',
        wilaya: 'Alger',
      },
    });
    const membership = await prisma.workspaceMembership.create({
      data: { role: 'DOCTOR', userId: row.id, workspaceId },
    });
    return { membership, row };
  }

  async function patient(workspaceId: string, lastName: string) {
    const row = await prisma.patient.create({
      data: {
        address: 'Alger',
        birthDate: new Date('1980-05-01T00:00:00Z'),
        commune: 'Alger Centre',
        emergencyContactName: 'Contact',
        emergencyContactPhone: '0550000001',
        firstName: 'Amina',
        firstNameAr: 'أمينة',
        gender: 'FEMALE',
        insurance: 'CNAS',
        lastName,
        lastNameAr: 'بن علي',
        nationalId: `nid-${suffix}-${lastName}`,
        phone: '0550000002',
        sector: 'PUBLIC',
        wilaya: 'Alger',
        workspaceId,
      },
    });
    return row.id;
  }

  const openCase = (actor: AuthenticatedUserPayload, patientId: string) =>
    conversations.create(actor, { patientId, type: 'CASE' }, context);

  const send = (
    actor: AuthenticatedUserPayload,
    conversationId: string,
    body: string,
    extra: Record<string, unknown> = {},
  ) =>
    messages.send(actor, conversationId, {
      body,
      clientMessageId: randomUUID(),
      ...extra,
    });

  beforeAll(async () => {
    if (!databaseName.endsWith('_test')) {
      throw new Error(
        `TEST_DATABASE_URL must name a database ending in "_test", not "${databaseName}".`,
      );
    }
    uploadRoot = await mkdtemp(join(tmpdir(), 'healix-cases-'));
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.MESSAGING_KEYS = `k1:${randomBytes(32).toString('base64')}`;
    process.env.UPLOAD_ROOT = uploadRoot;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        MessagingModule,
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    conversations = moduleRef.get(ConversationsService);
    messages = moduleRef.get(MessagesService);
    attachments = moduleRef.get(AttachmentsService);
    caseRecord = moduleRef.get(CaseRecordService);
    patients = moduleRef.get(PatientsService);

    // Workspace A: an establishment, two doctors, two patients.
    const adminA = await user('adminA', 'ESTABLISHMENT_ADMIN');
    const a = await establishment(adminA.id, 'Clinique Cas A');
    ids.workspaceA = a.workspace.id;
    await doctor('doctorA1', a.establishment.id, a.workspace.id);
    const a2 = await doctor('doctorA2', a.establishment.id, a.workspace.id);
    ids.membershipA2 = a2.membership.id;
    ids.patientA = await patient(a.workspace.id, 'Benali');
    ids.patientA2 = await patient(a.workspace.id, 'Haddad');

    // Workspace B: another establishment.
    const adminB = await user('adminB', 'ESTABLISHMENT_ADMIN');
    await establishment(adminB.id, 'Clinique Cas B');
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      // What keeps a user (Restrict) first: files, notes, conversations
      // (their messages, acknowledgements and views go with them), patients
      // (their documents).
      await prisma.messageAttachment.deleteMany({
        where: { uploaderId: { in: created.users } },
      });
      await prisma.patientClinicalNote.deleteMany({
        where: { authorId: { in: created.users } },
      });
      await prisma.conversation.deleteMany({
        where: { createdById: { in: created.users } },
      });
      await prisma.patient.deleteMany({
        where: { workspaceId: { in: created.workspaces } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: created.users } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: created.workspaces } },
      });
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    }
    await moduleRef?.close();
    if (uploadRoot) await rm(uploadRoot, { force: true, recursive: true });
  });

  it('opens one discussion per patient, even when two doctors open it at once', async () => {
    const [first, second] = await Promise.all([
      openCase(actors.doctorA1, ids.patientA),
      openCase(actors.doctorA2, ids.patientA),
    ]);

    expect(first.conversation.id).toBe(second.conversation.id);
    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(
      await prisma.conversation.count({
        where: { archivedAt: null, patientId: ids.patientA, type: 'CASE' },
      }),
    ).toBe(1);

    const view = await conversations.getOne(
      actors.doctorA1,
      first.conversation.id,
    );
    expect(view.title).toMatch(/^Cas — BENALI Amina/);
    expect(view.patient).toMatchObject({
      id: ids.patientA,
      lastNameAr: 'بن علي',
    });
    expect(view.participants.map(({ userId }) => userId).sort()).toEqual(
      [actors.doctorA1.sub, actors.doctorA2.sub].sort(),
    );

    // Again, later: the same discussion.
    const again = await openCase(actors.adminA, ids.patientA);
    expect(again).toMatchObject({
      conversation: { id: first.conversation.id },
      created: false,
    });
  });

  it('is out of reach of another establishment, and of a doctor who leaves this one', async () => {
    const { conversation } = await openCase(actors.doctorA1, ids.patientA);

    expect(codeOf(await errorOf(openCase(actors.adminB, ids.patientA)))).toBe(
      'PATIENT_NOT_FOUND',
    );

    await send(actors.doctorA1, conversation.id, 'Avis sur l’ECG ?');
    await prisma.workspaceMembership.update({
      data: { status: 'SUSPENDED' },
      where: { id: ids.membershipA2 },
    });
    try {
      expect(
        codeOf(
          await errorOf(conversations.getOne(actors.doctorA2, conversation.id)),
        ),
      ).toBe('CONVERSATION_NOT_FOUND');
      expect(
        codeOf(
          await errorOf(messages.list(actors.doctorA2, conversation.id, {})),
        ),
      ).toBe('CONVERSATION_NOT_FOUND');
      expect(
        codeOf(await errorOf(send(actors.doctorA2, conversation.id, 'Oui'))),
      ).toBe('CONVERSATION_NOT_FOUND');
      const list = await conversations.list(actors.doctorA2, { type: 'CASE' });
      expect(list.items.map(({ id }) => id)).not.toContain(conversation.id);
      expect((await messages.unreadCount(actors.doctorA2)).total).toBe(0);
    } finally {
      await prisma.workspaceMembership.update({
        data: { status: 'ACTIVE' },
        where: { id: ids.membershipA2 },
      });
    }

    // Back in the establishment: back in the discussion.
    await expect(
      conversations.getOne(actors.doctorA2, conversation.id),
    ).resolves.toMatchObject({ id: conversation.id });
    expect((await messages.unreadCount(actors.doctorA2)).total).toBeGreaterThan(
      0,
    );
  });

  it('traces the reading in the patient record once a day per user', async () => {
    const { conversation } = await openCase(actors.doctorA1, ids.patientA2);
    await prisma.auditLog.deleteMany({
      where: { action: 'MESSAGES_VIEWED', entityId: conversation.id },
    });

    await Promise.all([
      messages.list(actors.doctorA1, conversation.id, {}),
      messages.list(actors.doctorA1, conversation.id, {}),
    ]);
    await messages.list(actors.doctorA1, conversation.id, { afterSeq: 0 });

    expect(
      await prisma.auditLog.count({
        where: {
          action: 'MESSAGES_VIEWED',
          entityId: conversation.id,
          userId: actors.doctorA1.sub,
        },
      }),
    ).toBe(1);
    const trail = await patients.listAuditLog(actors.doctorA1, ids.patientA2);
    expect(trail.map(({ action }) => action)).toEqual(
      expect.arrayContaining(['CASE_CONVERSATION_CREATED', 'MESSAGES_VIEWED']),
    );

    // A new day: traced again.
    await caseRecord.recordView(
      actors.doctorA1,
      { id: conversation.id, patientId: ids.patientA2, type: 'CASE' },
      new Date(Date.now() + 24 * 60 * 60_000),
    );
    expect(
      await prisma.auditLog.count({
        where: { action: 'MESSAGES_VIEWED', entityId: conversation.id },
      }),
    ).toBe(2);
  });

  it('accepts files by their content only, and stores them encrypted', async () => {
    const { conversation } = await openCase(actors.doctorA1, ids.patientA);
    const executable = Buffer.concat([
      Buffer.from('MZ', 'latin1'),
      randomBytes(1_000),
    ]);

    expect(
      codeOf(
        await errorOf(
          attachments.upload(
            actors.doctorA1,
            conversation.id,
            upload(executable, 'radio.png'),
          ),
        ),
      ),
    ).toBe('INVALID_ATTACHMENT_TYPE');

    const uploaded = await attachments.upload(
      actors.doctorA1,
      conversation.id,
      upload(PDF, 'ECG.pdf'),
    );
    const row = await prisma.messageAttachment.findUniqueOrThrow({
      where: { id: uploaded.id },
    });
    const onDisk = await readFile(row.storagePath as string);
    expect(row.storagePath).toContain(join('messaging', conversation.id));
    expect(onDisk.includes(Buffer.from('%PDF'))).toBe(false);
    expect(onDisk.includes(PDF.subarray(100, 200))).toBe(false);

    const { message } = await send(actors.doctorA1, conversation.id, '', {
      attachmentIds: [uploaded.id],
    });
    expect(message).toMatchObject({
      attachments: [{ id: uploaded.id, mimeType: 'application/pdf' }],
      body: null,
      kind: 'ATTACHMENT',
    });

    const file = await attachments.download(actors.doctorA2, uploaded.id);
    expect((await readAll(file.stream)).equals(PDF)).toBe(true);
  });

  it('refuses a file uploaded to another conversation, or by someone else', async () => {
    const caseOne = (await openCase(actors.doctorA1, ids.patientA))
      .conversation;
    const caseTwo = (await openCase(actors.doctorA1, ids.patientA2))
      .conversation;
    const uploaded = await attachments.upload(
      actors.doctorA1,
      caseOne.id,
      upload(PDF, 'ECG.pdf'),
    );

    expect(
      codeOf(
        await errorOf(
          send(actors.doctorA1, caseTwo.id, 'Voir pièce jointe', {
            attachmentIds: [uploaded.id],
          }),
        ),
      ),
    ).toBe('INVALID_ATTACHMENTS');
    expect(
      codeOf(
        await errorOf(
          send(actors.doctorA2, caseOne.id, 'Voir pièce jointe', {
            attachmentIds: [uploaded.id],
          }),
        ),
      ),
    ).toBe('INVALID_ATTACHMENTS');
    // Not sent: its uploader only may download it.
    expect(
      codeOf(await errorOf(attachments.download(actors.doctorA2, uploaded.id))),
    ).toBe('ATTACHMENT_NOT_FOUND');
  });

  it('shares a document of the record without copying it, and checks the access again at download', async () => {
    const { conversation } = await openCase(actors.doctorA1, ids.patientA);
    const folder = join(uploadRoot, 'patients', ids.patientA, 'documents');
    await mkdir(folder, { recursive: true });
    const localPath = join(folder, `bilan-${suffix}.pdf`);
    await writeFile(localPath, PDF);
    const document = await prisma.patientDocument.create({
      data: {
        documentType: 'MEDICAL_REPORT',
        localPath,
        mimeType: 'application/pdf',
        originalName: 'Bilan.pdf',
        patientId: ids.patientA,
        size: PDF.length,
        storedName: `bilan-${suffix}.pdf`,
        uploadedById: actors.doctorA1.sub,
      },
    });

    const shared = await attachments.fromRecord(
      actors.doctorA1,
      conversation.id,
      document.id,
    );
    expect(
      await prisma.messageAttachment.findUniqueOrThrow({
        where: { id: shared.id },
      }),
    ).toMatchObject({ patientDocumentId: document.id, storagePath: null });
    await send(actors.doctorA1, conversation.id, 'Le bilan', {
      attachmentIds: [shared.id],
    });

    const file = await attachments.download(actors.doctorA2, shared.id);
    expect((await readAll(file.stream)).equals(PDF)).toBe(true);

    await prisma.workspaceMembership.update({
      data: { status: 'SUSPENDED' },
      where: { id: ids.membershipA2 },
    });
    try {
      expect(
        codeOf(await errorOf(attachments.download(actors.doctorA2, shared.id))),
      ).toBe('ATTACHMENT_NOT_FOUND');
    } finally {
      await prisma.workspaceMembership.update({
        data: { status: 'ACTIVE' },
        where: { id: ids.membershipA2 },
      });
    }
  });

  it('acknowledges an urgent message once per recipient, never by its sender', async () => {
    const { conversation } = await openCase(actors.doctorA1, ids.patientA);
    const { message } = await send(
      actors.doctorA1,
      conversation.id,
      'Urgent : avis avant 14 h',
      { priority: 'URGENT', requiresAck: true },
    );
    expect(message.pendingAck.map(({ userId }) => userId)).toContain(
      actors.doctorA2.sub,
    );

    await messages.ack(actors.doctorA2, message.id, context);
    const again = await messages.ack(actors.doctorA2, message.id, context);

    expect(again).toMatchObject({ ackedByMe: true });
    expect(
      await prisma.messageAck.count({ where: { messageId: message.id } }),
    ).toBe(1);
    expect(
      codeOf(await errorOf(messages.ack(actors.doctorA1, message.id, context))),
    ).toBe('CANNOT_ACK_OWN_MESSAGE');

    const { items } = await messages.list(actors.doctorA1, conversation.id, {
      afterSeq: message.seq - 1,
    });
    expect(items[0].acks.map(({ userId }) => userId)).toEqual([
      actors.doctorA2.sub,
    ]);
    expect(items[0].pendingAck.map(({ userId }) => userId)).not.toContain(
      actors.doctorA2.sub,
    );
  });

  it('files a message to the record once, from a case discussion only', async () => {
    const { conversation } = await openCase(actors.doctorA1, ids.patientA);
    const { message } = await send(
      actors.doctorA1,
      conversation.id,
      'Avis : pas de contre-indication.',
    );

    const first = await caseRecord.fileToRecord(
      actors.doctorA2,
      message.id,
      'À revoir en consultation',
    );
    const second = await caseRecord.fileToRecord(
      actors.doctorA2,
      message.id,
      undefined,
    );

    expect(first.created).toBe(true);
    expect(second).toMatchObject({
      created: false,
      note: { id: first.note.id },
    });
    const notes = await patients.listClinicalNotes(
      actors.doctorA1,
      ids.patientA,
    );
    expect(
      notes.filter(({ sourceMessageId }) => sourceMessageId === message.id),
    ).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      comment: 'À revoir en consultation',
      content: 'Avis : pas de contre-indication.',
      sourceConversationId: conversation.id,
    });
    const { items } = await messages.list(actors.doctorA1, conversation.id, {
      afterSeq: message.seq - 1,
    });
    expect(items[0].filedToRecord).toBe(true);

    // A team group of the same establishment: not a case.
    const group = await conversations.create(
      actors.adminA,
      {
        participantIds: [actors.doctorA1.sub],
        title: 'Équipe cas',
        type: 'GROUP',
      },
      context,
    );
    const { message: groupMessage } = await send(
      actors.adminA,
      group.conversation.id,
      'Réunion demain',
    );
    expect(
      codeOf(
        await errorOf(
          caseRecord.fileToRecord(actors.adminA, groupMessage.id, undefined),
        ),
      ),
    ).toBe('CASE_ONLY');
  });
});
