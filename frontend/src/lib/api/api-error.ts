import { isAxiosError } from "axios";

export type ApiErrorMessages = {
  accountBlocked?: string;
  addressRequired: string;
  alertTitle: string;
  conditionsRequired: string;
  database: string;
  emailConflict: string;
  emailInvalid: string;
  fullNameRequired: string;
  generic: string;
  invalidCredentials?: string;
  network: string;
  notFound: string;
  passwordMismatch: string;
  passwordTooShort: string;
  phoneConflict: string;
  phoneRequired: string;
  server: string;
  specialityRequired: string;
  validation: string;
  verificationRequired: string;
  wilayaRequired: string;
};

export type NormalizedApiError = {
  details: string[];
  message: string;
  status?: number;
  title: string;
};

const defaultMessages: ApiErrorMessages = {
  accountBlocked: "Compte suspendu ou refuse.",
  addressRequired: "L'adresse professionnelle est obligatoire.",
  alertTitle: "Erreur",
  conditionsRequired: "Vous devez accepter les conditions d'utilisation.",
  database: "Une erreur de base de donnees est survenue. Veuillez reessayer.",
  emailConflict: "Cet email est deja utilise.",
  emailInvalid: "Email invalide.",
  fullNameRequired: "Le nom complet est obligatoire.",
  generic: "Une erreur est survenue. Veuillez reessayer.",
  invalidCredentials: "Email ou mot de passe incorrect.",
  network: "Impossible de contacter le serveur. Verifiez votre connexion.",
  notFound: "Le service est actuellement indisponible.",
  passwordMismatch: "Les mots de passe ne correspondent pas.",
  passwordTooShort: "Le mot de passe doit contenir au moins 8 caracteres.",
  phoneConflict: "Ce numero de telephone est deja utilise.",
  phoneRequired: "Le telephone est obligatoire.",
  server: "Une erreur est survenue. Veuillez reessayer.",
  specialityRequired: "La specialite est obligatoire.",
  validation: "Veuillez verifier les informations saisies.",
  verificationRequired: "Vous devez accepter la verification professionnelle.",
  wilayaRequired: "La wilaya est obligatoire.",
};

function extractBackendMessages(data: unknown): string[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const message = (data as { message?: unknown }).message;

  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === "string");
  }

  if (typeof message === "string") {
    return [message];
  }

  return [];
}

function normalizeComparableMessage(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .trim();
}

function mapBackendMessage(
  message: string,
  messages: ApiErrorMessages,
): string {
  const comparable = normalizeComparableMessage(message);

  if (
    comparable.includes("email ou mot de passe incorrect") ||
    comparable.includes("identifiants administrateur incorrects") ||
    comparable.includes("invalid credentials")
  ) {
    return messages.invalidCredentials ?? messages.validation;
  }

  if (
    comparable.includes("suspendu") ||
    comparable.includes("rejete") ||
    comparable.includes("refuse")
  ) {
    return messages.accountBlocked ?? messages.server;
  }

  if (comparable.includes("email")) {
    if (comparable.includes("deja") || comparable.includes("utilise")) {
      return messages.emailConflict;
    }

    if (comparable.includes("invalide")) {
      return messages.emailInvalid;
    }
  }

  if (
    comparable.includes("phone") ||
    comparable.includes("telephone") ||
    comparable.includes("numero")
  ) {
    if (comparable.includes("deja") || comparable.includes("utilise")) {
      return messages.phoneConflict;
    }

    if (comparable.includes("obligatoire")) {
      return messages.phoneRequired;
    }
  }

  if (comparable.includes("mot de passe")) {
    if (comparable.includes("correspondent pas")) {
      return messages.passwordMismatch;
    }

    if (
      comparable.includes("8 caracteres") ||
      comparable.includes("8 caractere") ||
      comparable.includes("trop court")
    ) {
      return messages.passwordTooShort;
    }
  }

  if (comparable.includes("nom complet")) {
    return messages.fullNameRequired;
  }

  if (comparable.includes("specialite")) {
    return messages.specialityRequired;
  }

  if (comparable.includes("wilaya")) {
    return messages.wilayaRequired;
  }

  if (comparable.includes("adresse")) {
    return messages.addressRequired;
  }

  if (comparable.includes("conditions")) {
    return messages.conditionsRequired;
  }

  if (comparable.includes("verification professionnelle")) {
    return messages.verificationRequired;
  }

  if (comparable.includes("champ est obligatoire")) {
    return messages.validation;
  }

  return message;
}

function uniqueMessages(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function normalizeApiError(
  error: unknown,
  messages: ApiErrorMessages = defaultMessages,
): NormalizedApiError {
  if (!isAxiosError(error)) {
    return {
      details: [],
      message: messages.generic,
      title: messages.alertTitle,
    };
  }

  if (!error.response) {
    return {
      details: [],
      message: messages.network,
      title: messages.alertTitle,
    };
  }

  const status = error.response.status;
  const backendMessages = extractBackendMessages(error.response.data);
  const mappedDetails = uniqueMessages(
    backendMessages.map((entry) => mapBackendMessage(entry, messages)),
  );
  const comparableText = normalizeComparableMessage(backendMessages.join(" "));

  if (status === 400) {
    return {
      details: mappedDetails.slice(1),
      message: mappedDetails[0] ?? messages.validation,
      status,
      title: messages.alertTitle,
    };
  }

  if (status === 401) {
    return {
      details: [],
      message:
        mappedDetails[0] ?? messages.invalidCredentials ?? messages.validation,
      status,
      title: messages.alertTitle,
    };
  }

  if (status === 403) {
    return {
      details: [],
      message: mappedDetails[0] ?? messages.accountBlocked ?? messages.server,
      status,
      title: messages.alertTitle,
    };
  }

  if (status === 409) {
    const conflictMessage = comparableText.includes("email")
      ? messages.emailConflict
      : comparableText.includes("phone") ||
          comparableText.includes("telephone") ||
          comparableText.includes("numero")
        ? messages.phoneConflict
        : mappedDetails[0] ?? messages.generic;

    return {
      details: [],
      message: conflictMessage,
      status,
      title: messages.alertTitle,
    };
  }

  if (status === 404) {
    return {
      details: [],
      message: messages.notFound,
      status,
      title: messages.alertTitle,
    };
  }

  if (status >= 500) {
    const message =
      comparableText.includes("prisma") ||
      comparableText.includes("database") ||
      comparableText.includes("sql")
        ? messages.database
        : messages.server;

    return {
      details: [],
      message,
      status,
      title: messages.alertTitle,
    };
  }

  return {
    details: mappedDetails.slice(1),
    message: mappedDetails[0] ?? messages.generic,
    status,
    title: messages.alertTitle,
  };
}
