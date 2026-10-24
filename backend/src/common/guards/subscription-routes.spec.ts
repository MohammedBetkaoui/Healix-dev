import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';

import { AiAnalysisRunsController } from '../../ai-analysis-runs/ai-analysis-runs.controller';
import { AppointmentsController } from '../../appointments/appointments.controller';
import { DoctorsController } from '../../doctors/doctors.controller';
import { PatientsController } from '../../patients/patients.controller';
import { PrescriptionsController } from '../../prescriptions/prescriptions.controller';
import { ReportsController } from '../../reports/reports.controller';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from '../decorators/requires-active-subscription.decorator';
import { SubscriptionGuard } from './subscription.guard';
import { VerifiedAccountGuard } from './verified-account.guard';

type Controller = { prototype: Record<string, unknown> };

// The handlers of a controller, with the HTTP method they answer.
function handlers(controller: Controller) {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({
      gated: Boolean(
        Reflect.getMetadata(
          REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
          controller.prototype[name] as object,
        ),
      ),
      method: Reflect.getMetadata(
        METHOD_METADATA,
        controller.prototype[name] as object,
      ) as RequestMethod | undefined,
      name,
    }))
    .filter((handler) => handler.method !== undefined);
}

// The clinical write actions that need a live subscription (ACTIVE or
// TRIALING). Everything else (reading, PDFs, exports, messaging, account,
// settings, the subscription and payment pages) stays open.
const GATED: [string, Controller, string[]][] = [
  [
    'PatientsController',
    PatientsController as unknown as Controller,
    // a patient, a consultation, a document, an AI record
    ['create', 'createConsultation', 'uploadDocument', 'createAiAnalysis'],
  ],
  [
    'AppointmentsController',
    AppointmentsController as unknown as Controller,
    ['create'],
  ],
  [
    'PrescriptionsController',
    PrescriptionsController as unknown as Controller,
    ['create', 'renew', 'submit', 'validate'],
  ],
  [
    'ReportsController',
    ReportsController as unknown as Controller,
    ['amend', 'create', 'finalize', 'importDocument'],
  ],
  [
    'AiAnalysisRunsController',
    AiAnalysisRunsController as unknown as Controller,
    ['create'],
  ],
  [
    'DoctorsController',
    DoctorsController as unknown as Controller,
    // the invitation of a doctor
    ['create'],
  ],
];

describe('the routes that need a live subscription', () => {
  it.each(GATED)(
    '%s marks exactly the write actions of the list',
    (_name, controller, expected) => {
      const gated = handlers(controller)
        .filter((handler) => handler.gated)
        .map((handler) => handler.name)
        .sort();

      expect(gated).toEqual([...expected].sort());
    },
  );

  it.each(GATED)(
    '%s runs SubscriptionGuard after VerifiedAccountGuard',
    (_name, controller) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        controller,
      ) as unknown[];

      expect(guards.indexOf(SubscriptionGuard)).toBeGreaterThan(
        guards.indexOf(VerifiedAccountGuard),
      );
      expect(guards).toContain(SubscriptionGuard);
    },
  );

  it.each(GATED)(
    '%s never gates a read: no GET (list, detail, PDF, download) carries it',
    (_name, controller) => {
      const gatedReads = handlers(controller).filter(
        (handler) => handler.gated && handler.method === RequestMethod.GET,
      );

      expect(gatedReads).toEqual([]);
    },
  );
});
