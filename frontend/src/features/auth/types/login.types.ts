export type LoginAccountType = "ESTABLISHMENT" | "INDEPENDENT_DOCTOR";

export type LoginPayload = {
  accountType: LoginAccountType;
  email: string;
  password: string;
};

export type LoginUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: "ESTABLISHMENT_ADMIN" | "INDEPENDENT_DOCTOR";
  accountStatus: string;
};

export type LoginResponse = {
  message: string;
  user: LoginUser;
  redirectTo: string;
};

export type LogoutResponse = {
  message: string;
};
