export type AdminRole = "SUPER_ADMIN" | "ADMIN_VERIFICATION";

export type AdminLoginPayload = {
  email: string;
  password: string;
};

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: AdminRole;
  accountStatus: "ACTIVE";
};

export type AdminLoginResponse = {
  message: string;
  admin: AdminUser;
  redirectTo: string;
};

export type AdminMeResponse = {
  admin: AdminUser;
};

export type AdminLogoutResponse = {
  message: string;
};
