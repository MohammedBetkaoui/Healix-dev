export const ADMIN_GATE_PATH =
  process.env.NEXT_PUBLIC_ADMIN_GATE_PATH ?? "/hzdz-control-gate-2026";

export const adminRoutes = {
  auditLogs: `${ADMIN_GATE_PATH}/audit-logs`,
  dashboard: `${ADMIN_GATE_PATH}/dashboard`,
  login: `${ADMIN_GATE_PATH}/login`,
  settings: `${ADMIN_GATE_PATH}/settings`,
  users: `${ADMIN_GATE_PATH}/users`,
  verificationDetail: (id: string) => `${ADMIN_GATE_PATH}/verifications/${id}`,
  verifications: `${ADMIN_GATE_PATH}/verifications`,
} as const;
