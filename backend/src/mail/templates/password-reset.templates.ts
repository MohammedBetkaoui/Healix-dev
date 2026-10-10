// Password reset e-mails, in French. Plain text plus a sober HTML version:
// no remote image, no tracking link or pixel, only the link the user needs.

type Email = { html: string; subject: string; text: string };

const SIGNATURE_TEXT =
  '— HealixDz\nCe message est envoyé automatiquement, merci de ne pas y répondre.';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d9e0e6;border-radius:8px;padding:28px;">
<p style="margin:0 0 20px;font-size:18px;font-weight:bold;color:#0f3d56;">HealixDz</p>
${body}
<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#5f6b76;">Ce message est envoyé automatiquement, merci de ne pas y répondre.</p>
</div>
</body>
</html>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${html}</p>`;
}

export function passwordResetRequestEmail(input: {
  expiresInMinutes: number;
  fullName: string;
  resetUrl: string;
}): Email {
  const subject = 'Réinitialisation de votre mot de passe HealixDz';
  const name = input.fullName.trim();
  const greeting = name ? `Bonjour ${name},` : 'Bonjour,';
  const validity = `Ce lien est valable ${input.expiresInMinutes} minutes et ne peut servir qu'une seule fois.`;
  const ignore =
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste inchangé.";

  const text = [
    greeting,
    '',
    'Une demande de réinitialisation du mot de passe de votre compte HealixDz a été reçue.',
    '',
    'Pour choisir un nouveau mot de passe, ouvrez ce lien :',
    input.resetUrl,
    '',
    validity,
    '',
    ignore,
    '',
    SIGNATURE_TEXT,
  ].join('\n');

  const url = escapeHtml(input.resetUrl);
  const html = layout(
    subject,
    [
      paragraph(escapeHtml(greeting)),
      paragraph(
        'Une demande de réinitialisation du mot de passe de votre compte HealixDz a été reçue.',
      ),
      `<p style="margin:0 0 16px;"><a href="${url}" style="display:inline-block;padding:12px 20px;background:#0f6b8f;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">Choisir un nouveau mot de passe</a></p>`,
      paragraph(
        `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;color:#0f3d56;">${url}</span>`,
      ),
      paragraph(escapeHtml(validity)),
      paragraph(escapeHtml(ignore)),
    ].join('\n'),
  );

  return { html, subject, text };
}

export function passwordChangedEmail(input: {
  changedAt: Date;
  fullName: string;
}): Email {
  const subject = 'Votre mot de passe HealixDz a été modifié';
  const name = input.fullName.trim();
  const greeting = name ? `Bonjour ${name},` : 'Bonjour,';
  const when = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  }).format(input.changedAt);
  const changed = `Votre mot de passe a été modifié le ${when} (heure d'Alger).`;
  const sessions =
    'Par sécurité, toutes vos sessions ouvertes ont été fermées : reconnectez-vous avec votre nouveau mot de passe.';
  const notYou =
    "Si vous n'êtes pas à l'origine de cette modification, contactez sans attendre l'administration de HealixDz.";

  const text = [
    greeting,
    '',
    changed,
    '',
    sessions,
    '',
    notYou,
    '',
    SIGNATURE_TEXT,
  ].join('\n');

  const html = layout(
    subject,
    [
      paragraph(escapeHtml(greeting)),
      paragraph(escapeHtml(changed)),
      paragraph(escapeHtml(sessions)),
      paragraph(`<strong>${escapeHtml(notYou)}</strong>`),
    ].join('\n'),
  );

  return { html, subject, text };
}
