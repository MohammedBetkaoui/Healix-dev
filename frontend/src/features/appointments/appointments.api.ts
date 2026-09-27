import { apiClient } from "@/lib/api/http-client";

import {
  type Appointment,
  type AppointmentDoctor,
  type AppointmentsListParams,
  type CreateAppointmentPayload,
  type UpdateAppointmentPayload,
} from "./appointments.types";

export async function getAppointments(
  params: AppointmentsListParams,
): Promise<Appointment[]> {
  const response = await apiClient.get<Appointment[]>("/appointments", {
    params,
  });

  return response.data;
}

export async function getAppointmentById(id: string): Promise<Appointment> {
  const response = await apiClient.get<Appointment>(`/appointments/${id}`);

  return response.data;
}

export async function createAppointment(
  payload: CreateAppointmentPayload,
): Promise<Appointment> {
  const response = await apiClient.post<Appointment>("/appointments", payload);

  return response.data;
}

export async function updateAppointment(
  id: string,
  payload: UpdateAppointmentPayload,
): Promise<Appointment> {
  const response = await apiClient.patch<Appointment>(
    `/appointments/${id}`,
    payload,
  );

  return response.data;
}

export async function getAppointmentDoctors(): Promise<AppointmentDoctor[]> {
  const response = await apiClient.get<AppointmentDoctor[]>(
    "/appointments/doctors",
  );

  return response.data;
}
