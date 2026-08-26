import { authFontVariables } from "@/lib/auth-fonts";

export default function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={authFontVariables}>{children}</div>
  );
}
