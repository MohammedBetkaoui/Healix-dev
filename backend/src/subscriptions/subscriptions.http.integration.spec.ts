/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AdminModule } from '../admin/admin.module';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AiAnalysisRunsModule } from '../ai-analysis-runs/ai-analysis-runs.module';
import { AiServiceClient } from '../ai-analysis-runs/ai-service.client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { PatientsModule } from '../patients/patients.module';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsModule } from './subscriptions.module';
import { createHash } from 'node:crypto';
import { TeamModule } from '../team/team.module';

// The routes themselves, over HTTP: the guards in their real order on the real
// controllers, the answers a browser gets (403 with its code and its figures),
// what stays readable without a subscription, and the validation of the admin
// console's requests. The sign-in is replaced by a header naming the user;
// everything else is real. TEST_DATABASE_URL names a database ending in
// "_test"; the spec is skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const DAY = 86_400_000;

// Signs in whoever the x-test-user header names.
const headerAuth: CanActivate = {
  canActivate(context: ExecutionContext) {
    const http = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: unknown;
    }>();
    const header = http.headers['x-test-user'];
    if (!header) return false;
    http.user = JSON.parse(header);
    return true;
  },
};

const as = (actor: object) => JSON.stringify(actor);

describeWithDatabase('the subscription over HTTP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let admin: { sub: string; email: string; role: string; tokenType: string };

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    // TeamModule pulls the auth module: the access-token strategy (and the
    // real-time authenticator behind it) is built at module compile time and
    // refuses to start without its secret, even though the sign-in is the
    // x-test-user header and no cookie is ever verified here.
    process.env.JWT_ACCESS_SECRET = `integration-user-access-${'c9Lw'.repeat(8)}`;
    process.env.JWT_REFRESH_SECRET = `integration-user-refresh-${'d2Nz'.repeat(8)}`;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PatientsModule,
        AiAnalysisRunsModule,
        TeamModule,
        SubscriptionsModule,
        AdminModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(headerAuth)
      .overrideGuard(AdminJwtGuard)
      .useValue(headerAuth)
      .overrideProvider(AiServiceClient)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
    prisma = moduleRef.get(PrismaService);
    fixtures = new IntegrationFixtures(prisma, 'http');
    const superAdmin = await fixtures.user('SUPER_ADMIN');
    admin = { ...fixtures.actor(superAdmin) };
  }, 60_000);

  afterAll(async () => {
    if (prisma) await fixtures?.cleanup();
    await app?.close();
  }, 60_000);

  describe('an expired account', () => {
    it('reads, and is refused every write with 403 SUBSCRIPTION_INACTIVE', async () => {
      const expiresAt = new Date(Date.now() - 2 * DAY);
      const doctor = await fixtures.independentDoctor({
        subscription: { expiresAt, status: 'EXPIRED' },
      });
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const header = as(doctor.actor);

      // Open without a subscription: reading, the subscription page.
      await request(app.getHttpServer())
        .get('/patients')
        .set('x-test-user', header)
        .expect(200)
        .expect(({ body }) =>
          expect(body.data.map((row: { id: string }) => row.id)).toEqual([
            patient.id,
          ]),
        );
      await request(app.getHttpServer())
        .get('/patients/' + patient.id)
        .set('x-test-user', header)
        .expect(200);
      await request(app.getHttpServer())
        .get('/subscription/entitlements')
        .set('x-test-user', header)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            canManage: true,
            readOnly: true,
            status: 'EXPIRED',
            trial: false,
          }),
        );

      // The writes of the clinical record, one by one.
      const writes: [string, string][] = [
        ['post', '/patients'],
        ['post', '/patients/' + patient.id + '/consultations'],
        ['post', '/patients/' + patient.id + '/documents'],
        ['post', '/patients/' + patient.id + '/ai-analyses'],
        ['post', '/patients/' + patient.id + '/ai-analysis-runs'],
      ];
      for (const [method, path] of writes) {
        const response = await request(app.getHttpServer())
          [method as 'post'](path)
          .set('x-test-user', header)
          .send({});

        expect([path, response.status, response.body.code]).toEqual([
          path,
          403,
          'SUBSCRIPTION_INACTIVE',
        ]);
        expect(response.body).toMatchObject({
          expiresAt: expiresAt.toISOString(),
          status: 'EXPIRED',
        });
      }
    }, 60_000);

    it('keeps the messaging, the account and the payment of a plan open', async () => {
      const doctor = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() - DAY),
          status: 'EXPIRED',
        },
      });

      // Not routes with a subscription gate: nothing answers 403
      // SUBSCRIPTION_INACTIVE (the subscription pages being the way back).
      const response = await request(app.getHttpServer())
        .get('/subscription/me')
        .set('x-test-user', as(doctor.actor));

      expect(response.status).toBe(200);
      expect(response.body.currentSubscription).toMatchObject({
        status: 'EXPIRED',
      });
    });
  });

  describe('a quota', () => {
    it('answers 403 QUOTA_EXCEEDED with the figures when the places are used', async () => {
      const doctor = await fixtures.independentDoctor({
        subscription: {
          customQuotas: {
            aiAnalysesPerMonth: null,
            aiPipelines: null,
            maxDoctors: 1,
            maxPatients: 1,
          },
        },
      });
      await fixtures.patient(doctor.workspace.id, doctor.profile.id);

      const response = await request(app.getHttpServer())
        .post('/patients')
        .set('x-test-user', as(doctor.actor))
        .send({
          address: 'Alger',
          birthDate: '1985-03-12',
          commune: 'Alger',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '0550000000',
          firstName: 'Amina',
          firstNameAr: 'أمينة',
          gender: 'FEMALE',
          insurance: 'CNAS',
          lastName: 'Quota',
          lastNameAr: 'حصة',
          nationalId: 'NID-HTTP-' + fixtures.suffix,
          phone: '0550000000',
          sector: 'PUBLIC',
          wilaya: 'Alger',
        });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'QUOTA_EXCEEDED',
        limit: 1,
        quota: 'maxPatients',
        trial: false,
        used: 1,
      });
    });
  });

  describe('an affiliated doctor', () => {
    it('reads the subscription of the establishment through the entitlements route, and is blocked with it', async () => {
      const clinic = await fixtures.establishmentWithDoctors(1);
      const [doctor] = clinic.doctors;

      await request(app.getHttpServer())
        .get('/subscription/entitlements')
        .set('x-test-user', as(doctor.actor))
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            // Sees the subscription, does not manage it.
            canManage: false,
            plan: { code: 'EST_BASIC_CLINIC' },
            readOnly: false,
            status: 'ACTIVE',
            usage: { doctors: 1 },
          }),
        );
      // The subscription of the doctor's own (there is none) is not a way in.
      await request(app.getHttpServer())
        .get('/subscription/me')
        .set('x-test-user', as(doctor.actor))
        .expect(403);

      await prisma.subscription.update({
        data: { status: 'CANCELED' },
        where: { id: clinic.subscription!.id },
      });
      const blocked = await request(app.getHttpServer())
        .post('/patients')
        .set('x-test-user', as(doctor.actor))
        .send({});
      expect([blocked.status, blocked.body.code]).toEqual([
        403,
        'SUBSCRIPTION_INACTIVE',
      ]);
    });

    it('is refused the seat of an exhausted plan at the acceptance, not the invitation', async () => {
      const clinic = await fixtures.establishmentWithDoctors(1, {
        subscription: {
          customQuotas: {
            aiAnalysesPerMonth: null,
            aiPipelines: null,
            maxDoctors: 1,
            maxPatients: null,
          },
        },
      });

      // The invitation itself takes no seat: sending one is always allowed.
      const invitation = await request(app.getHttpServer())
        .post('/establishment/team/invitations')
        .set('x-test-user', as(clinic.ownerActor))
        .send({
          email: 'nouveau-' + fixtures.suffix + '@healix.test',
          role: 'DOCTOR',
        });
      expect(invitation.status).toBe(201);

      // The raw token never leaves the mail: for the test, the stored hash
      // is swapped for one computed from a token the spec holds. The
      // invitation stays otherwise untouched (pending, unexpired).
      const token = 'x'.repeat(20) + '_' + 'A'.repeat(22);
      const invitationId = String(invitation.body.id);
      await prisma.workspaceInvitation.update({
        data: {
          tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
        },
        where: { id: invitationId },
      });

      const accept = await request(app.getHttpServer())
        .post('/team-invitations/accept')
        .send({
          confirmPassword: 'Nouveau-mdp-2026',
          fullName: 'Dr Nouveau',
          password: 'Nouveau-mdp-2026',
          phone: '0661' + String(Date.now()).slice(-6),
          professionalAddress: 'Alger',
          speciality: 'Cardiologie',
          token,
          wilaya: 'Alger',
        });

      expect(accept.body).toMatchObject({
        code: 'QUOTA_EXCEEDED',
        limit: 1,
        quota: 'maxDoctors',
        used: 1,
      });
      expect(accept.status).toBe(403);
    });
  });

  describe('the admin console', () => {
    it('validates every request: a reason is required, the days are bounded, the quotas are known', async () => {
      const doctor = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() + 4 * DAY),
          status: 'TRIALING',
          trial: true,
        },
      });
      const base = '/admin/subscriptions/' + doctor.user.id;
      const send = (method: 'post' | 'patch', path: string, body: object) =>
        request(app.getHttpServer())
          [method](base + path)
          .set('x-test-user', as(admin))
          .send(body);

      // No reason, a short one, too many days, an unknown field.
      expect((await send('post', '/extend-trial', { days: 5 })).status).toBe(
        400,
      );
      expect(
        (await send('post', '/extend-trial', { days: 5, reason: 'ok' })).status,
      ).toBe(400);
      expect(
        (
          await send('post', '/extend-trial', {
            days: 31,
            reason: 'Trente et un jours',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await send('post', '/extend-trial', {
            days: 5,
            extra: true,
            reason: 'Champ inconnu',
          })
        ).status,
      ).toBe(400);
      expect((await send('post', '/cancel', {})).status).toBe(400);
      expect(
        (await send('patch', '/quotas', { reason: 'Sans quotas' })).status,
      ).toBe(400);
      expect(
        (
          await send('patch', '/quotas', {
            quotas: { maxPatients: -3 },
            reason: 'Quota négatif',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await send('patch', '/quotas', {
            quotas: { aiPipelines: ['mystery'] },
            reason: 'Modèle inconnu',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await send('post', '/activate-custom', {
            planId: 'EST_CUSTOM',
            reason: 'Date invalide',
            until: 'demain',
          })
        ).status,
      ).toBe(400);
      // Nothing was written.
      expect(
        await prisma.subscriptionEvent.count({
          where: { subscription: { userId: doctor.user.id } },
        }),
      ).toBe(0);

      // And a valid request goes through.
      const extended = await send('post', '/extend-trial', {
        days: 7,
        reason: 'Démonstration prolongée',
      });
      expect(extended.status).toBe(201);
      expect(extended.body.subscription).toMatchObject({
        daysLeft: 11,
        status: 'TRIALING',
      });
      const quotas = await send('patch', '/quotas', {
        quotas: { aiAnalysesPerMonth: 50, aiPipelines: null },
        reason: 'Partenariat hospitalier',
      });
      expect(quotas.status).toBe(200);
      const detail = await request(app.getHttpServer())
        .get(base)
        .set('x-test-user', as(admin))
        .expect(200);
      expect(detail.body.subscription.customQuotas).toMatchObject({
        aiAnalysesPerMonth: 50,
        aiPipelines: null,
      });
      expect(
        detail.body.events.map((event: { type: string }) => event.type),
      ).toEqual(['QUOTAS_CHANGED', 'TRIAL_EXTENDED']);
    }, 60_000);

    it('is not open to a doctor', async () => {
      const doctor = await fixtures.independentDoctor();

      await request(app.getHttpServer())
        .get('/admin/subscriptions')
        .set('x-test-user', as(doctor.actor))
        .expect(403);
    });

    it('lists the accounts with their subscription, filtered', async () => {
      const doctor = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() + 3 * DAY),
          status: 'TRIALING',
          trial: true,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/admin/subscriptions')
        .query({
          expiresWithinDays: 7,
          limit: 10,
          page: 1,
          search: doctor.user.email,
          status: 'TRIALING',
        })
        .set('x-test-user', as(admin))
        .expect(200);

      expect(response.body.meta).toMatchObject({ page: 1, total: 1 });
      expect(response.body.data[0]).toMatchObject({
        accountId: doctor.user.id,
        daysLeft: 3,
        status: 'TRIALING',
        trial: true,
      });
    });
  });
});
