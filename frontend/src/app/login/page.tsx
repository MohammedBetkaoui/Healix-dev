import { LoginPage } from "@/components/auth/login/LoginPage";
import { redirectAuthenticatedUserFromAuthPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await redirectAuthenticatedUserFromAuthPage();

  return <LoginPage />;
}
