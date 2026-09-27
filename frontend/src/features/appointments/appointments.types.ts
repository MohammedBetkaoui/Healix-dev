// Mirrors backend/src/common/enums/appointment-status.enum.ts.
export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "CANCELED"
  | "COMPLETED"
  | "NO_SHOW";

// Wire shape returned by GET/POST/PATCH /appointments. Mirrors
// backend/src/appointments/appointments.service.ts#toAppointmentResponse.
export type Appointment = {
  consultationId: string | null;
  createdAt: string;
  createdById: string;
  doctorFullName: string;
  doctorProfileId: string;
  durationMinutes: number;
  id: string;
  notes: string | null;
  patientFirstName: string;
  patientFirstNameAr: string;
  patientId: string;
  patientLastName: string;
  patientLastNameAr: string;
  reason: string;
  scheduledAt: string;
  status: AppointmentStatus;
  updatedAt: string;
};

// Mirrors backend/src/appointments/dto/list-appointments-query.dto.ts.
// from/to are required server-side so an agenda never loads a full history.
export type AppointmentsListParams = {
  doctorProfileId?: string;
  from: string;
  patientId?: string;
  status?: AppointmentStatus;
  to: string;
};

// Mirrors backend/src/appointments/dto/create-appointment.dto.ts exactly.
// For an INDEPENDENT_DOCTOR the backend ignores doctorProfileId and always
// books with the caller's own profile.
export type CreateAppointmentPayload = {
  doctorProfileId: string;
  durationMinutes?: number;
  patientId: string;
  reason: string;
  scheduledAt: string;
};

// Mirrors backend/src/appointments/dto/update-appointment.dto.ts exactly.
export type UpdateAppointmentPayload = {
  durationMinutes?: number;
  notes?: string;
  reason?: string;
  scheduledAt?: string;
  status?: AppointmentStatus;
};

// Wire shape returned by GET /appointments/doctors.
export type AppointmentDoctor = {
  fullName: string;
  id: string;
  speciality: string;
};
