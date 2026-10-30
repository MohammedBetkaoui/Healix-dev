import { FormEvent, useState } from "react";
import { ReleaseFooter } from "../updates";

export function LoginPage({
  error,
  onSubmit,
}: {
  error: string;
  onSubmit: (input: {
    accountType: "INDEPENDENT_DOCTOR" | "ESTABLISHMENT";
    email: string;
    password: string;
    deviceName: string;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  return (
    <main className="login-shell">
      <section className="login-hero" aria-label="HealixDz Desktop">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M4 17h6l2.7-7 4.1 13 3.2-9 1.8 3H28"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="login-brand-name">
            Healix<span>Dz</span>
          </span>
          <span className="login-brand-product">Desktop</span>
        </div>

        <div className="login-hero-copy">
          <p className="login-compliance">
            <span aria-hidden="true" /> Accès clinique sécurisé
          </p>
          <h1>
            La continuité des soins,
            <em> même hors connexion.</em>
          </h1>
          <p>
            Préparez vos consultations et ordonnances avec les données autorisées
            de votre espace de soin.
          </p>
        </div>

        <div className="login-trust-rail" aria-label="Garanties HealixDz Desktop">
          <article>
            <span className="login-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </span>
            <div>
              <strong>Appareil protégé</strong>
              <span>Clés stockées localement</span>
            </div>
          </article>
          <article>
            <span className="login-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M3 12h4l2-5 4 10 2.5-7 2 3H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <strong>Mode hors ligne</strong>
              <span>Synchronisation contrôlée</span>
            </div>
          </article>
          <article>
            <span className="login-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3 5.5 5.7v5.1c0 4.4 2.7 7.7 6.5 10.1 3.8-2.4 6.5-5.7 6.5-10.1V5.7L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="m9.4 12 1.7 1.7 3.6-3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <strong>Accès audité</strong>
              <span>Périmètre patient respecté</span>
            </div>
          </article>
        </div>
      </section>

      <div className="login-pulse-divider" aria-hidden="true">
        <svg viewBox="0 0 58 1000" preserveAspectRatio="none">
          <path d="M29 0v360H18l6 32 8-80 7 134 6-86H29v640" />
        </svg>
      </div>

      <section className="login-form-column">
        <form
          className="login-card"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            void onSubmit({
              accountType: data.get("accountType") as
                | "INDEPENDENT_DOCTOR"
                | "ESTABLISHMENT",
              email: String(data.get("email")),
              password: String(data.get("password")),
              deviceName: String(data.get("deviceName")),
            }).finally(() => setBusy(false));
          }}
        >
          <header className="login-card-header">
            <div>
              <p className="eyebrow">Espace professionnel</p>
              <h2>Se connecter</h2>
              <p>
                Connectez cet appareil à votre espace HealixDz pour activer le
                travail hors ligne.
              </p>
            </div>
            <span className="login-shield" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 2.5 5 5.3v5.4c0 4.6 2.9 8 7 10.5 4.1-2.5 7-5.9 7-10.5V5.3L12 2.5Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
                <path d="m9.3 11.5 1.8 1.8 3.8-4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </header>

          <input type="hidden" name="accountType" value="INDEPENDENT_DOCTOR" />
          <p className="login-profile-note">
            Accès médecin indépendant ou médecin affilié.
          </p>

          <label className="login-field" htmlFor="desktop-email">
            <span>E-mail professionnel <b>*</b></span>
            <span className="login-input-shell">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                id="desktop-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                placeholder="nom@cabinet.dz"
              />
            </span>
          </label>

          <label className="login-field" htmlFor="desktop-password">
            <span>Mot de passe <b>*</b></span>
            <span className="login-input-shell">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                id="desktop-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Votre mot de passe"
              />
              <button
                className="login-password-toggle"
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {passwordVisible ? "Masquer" : "Afficher"}
              </button>
            </span>
          </label>

          <label className="login-field" htmlFor="desktop-device-name">
            <span>Nom de l’appareil <b>*</b></span>
            <span className="login-input-shell">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                id="desktop-device-name"
                name="deviceName"
                defaultValue="Poste clinique"
                required
                autoComplete="off"
              />
            </span>
            <small>Ce nom vous aidera à reconnaître ce poste dans votre espace.</small>
          </label>

          {error && (
            <p className="error login-error" role="alert" aria-live="assertive">
              <span aria-hidden="true">!</span>
              {error}
            </p>
          )}

          <button className="primary login-submit" disabled={busy}>
            {busy ? (
              <><span className="login-spinner" aria-hidden="true" /> Connexion en cours…</>
            ) : (
              <>Connexion sécurisée <span aria-hidden="true">→</span></>
            )}
          </button>

          <p className="login-security-note">
            <span aria-hidden="true">✓</span>
            La première connexion nécessite Internet. Vos informations restent
            protégées sur cet appareil.
          </p>
        </form>
        <ReleaseFooter />
      </section>
    </main>
  );
}
