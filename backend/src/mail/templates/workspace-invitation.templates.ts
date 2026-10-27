// Workspace invitation e-mails, in French. Plain text plus a sober HTML
// version: no remote image, no tracking link or pixel, only the link the
// invitee needs. The same layout as the password reset e-mails (breed of the
// same module), never more data than what the invitee already has.

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

export const INVITATION_TTL_HOURS = 72;

export function invitationRoleLabel(role: string): string {
  return role === 'ADMIN'
    ? 'administrateur ou administratrice de la plateforme'
    : 'médecin affilié ou médecin affiliée';
}

export function workspaceInvitationEmail(input: {
  expiresAt: Date;
  invitationUrl: string;
  role: string;
  workspaceName: string;
}): Email {
  const subject = 'Invitation à rejoindre une équipe sur HealixDz';
  const role = invitationRoleLabel(input.role);
  const when = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  }).format(input.expiresAt);
  const validity = `Cette invitation expire le ${when} (heure d'Alger) et ne peut servir qu'une seule fois.`;
  const ignore =
    "Si vous ne connaissez pas cet établissement, ignorez ce message : aucune adresse n'est inscrite sans cette invitation.";

  const text = [
    'Bonjour,',
    '',
    `Vous êtes invité(e) à rejoindre l'équipe de « ${input.workspaceName} » sur HealixDz en tant que ${role}.`,
    '',
    'Pour créer votre compte (nom, téléphone et mot de passe), ouvrez ce lien :',
    input.invitationUrl,
    '',
    validity,
    '',
    ignore,
    '',
    SIGNATURE_TEXT,
  ].join('\n');

  const url = escapeHtml(input.invitationUrl);
  const html = layout(
    subject,
    [
      paragraph('Bonjour,'),
      paragraph(
        `Vous êtes invité(e) à rejoindre l'équipe de <strong>${escapeHtml(input.workspaceName)}</strong> sur HealixDz en tant que <strong>${escapeHtml(role)}</strong>.`,
      ),
      `<p style="margin:0 0 16px;"><a href="${url}" style="display:inline-block;padding:12px 20px;background:#0f6b8f;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">Rejoindre l’équipe</a></p>`,
      paragraph(
        `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;color:#0f3d56;">${url}</span>`,
      ),
      paragraph(escapeHtml(validity)),
      paragraph(escapeHtml(ignore)),
    ].join('\n'),
  );

  return { html, subject, text };
}
