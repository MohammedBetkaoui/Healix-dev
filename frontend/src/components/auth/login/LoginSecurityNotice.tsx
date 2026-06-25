type LoginSecurityNoticeProps = {
  t: (key: string) => string;
};

export function LoginSecurityNotice({ t }: LoginSecurityNoticeProps) {
  return (
    <div className="rounded-xl border border-cyan-100 bg-white/75 p-4 text-sm leading-6 text-slate-700 shadow-sm backdrop-blur">
      <p className="font-semibold text-slate-900">
        {t("login.security.title")}
      </p>
      <p className="mt-2">{t("login.security.description")}</p>
    </div>
  );
}
