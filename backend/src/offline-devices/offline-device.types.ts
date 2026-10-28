import { type Request } from 'express';

import { type UserRole } from '../common/enums/user-role.enum';

export type OfflineCapabilities = {
  patients: { readCached: true; searchLocal: true };
  consultations: {
    create: true;
    updateDraft: true;
    completeOnSync: true;
  };
  appointments: { read: true; write: false };
  prescriptions: { draft: false; validate: false };
  ai: false;
  dicom: false;
};

export type OfflineScope = {
  policy: 'PRIVATE_PRACTICE_ACTIVE' | 'ASSIGNED_CLINICAL_RELATIONSHIP';
  recentConsultationDays: number;
  upcomingAppointmentDays: number;
};

export type OfflineGrantClaims = {
  tokenType: 'offline-grant';
  grantId: string;
  userId: string;
  deviceId: string;
  workspaceId: string;
  role: UserRole;
  offlineCapabilities: OfflineCapabilities;
  offlineScope: OfflineScope;
  iat: number;
  exp: number;
  iss: 'healixdz-api';
  aud: 'healixdz-desktop';
};

export type OfflineActor = {
  grantId: string;
  userId: string;
  deviceId: string;
  workspaceId: string;
  role: UserRole;
  offlineCapabilities: OfflineCapabilities;
  offlineScope: OfflineScope;
};

export type OfflineAuthenticatedRequest = Request & {
  offlineActor: OfflineActor;
};

export const OFFLINE_CAPABILITIES: OfflineCapabilities = {
  patients: { readCached: true, searchLocal: true },
  consultations: {
    create: true,
    updateDraft: true,
    completeOnSync: true,
  },
  appointments: { read: true, write: false },
  prescriptions: { draft: false, validate: false },
  ai: false,
  dicom: false,
};
