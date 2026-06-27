export const adminAuthFr = {
  dashboard: {
    actions: {
      logout: "Déconnexion",
      verifications: "Aller aux vérifications",
    },
    cards: {
      auditLogs: {
        label: "Audit logs",
        value: "128",
      },
      pendingAccounts: {
        label: "Comptes en attente",
        value: "22",
      },
      verificationRequests: {
        label: "Demandes de vérification",
        value: "36",
      },
    },
    loading: "Vérification de la session...",
    restricted: "Session administrateur requise.",
    title: "Bonjour, administrateur HealixDZ",
    subtitle:
      "Supervisez les demandes de vérification et les actions sensibles de la plateforme.",
  },
  errors: {
    emailInvalid: "Email administrateur invalide.",
    emailRequired: "Email administrateur obligatoire.",
    generic: "Une erreur est survenue. Veuillez réessayer.",
    invalidCredentials: "Identifiants administrateur incorrects.",
    network: "Impossible de contacter le serveur.",
    passwordMinLength:
      "Le mot de passe doit contenir au moins 8 caractères.",
    passwordRequired: "Mot de passe obligatoire.",
  },
  form: {
    emailLabel: "Email administrateur",
    emailPlaceholder: "admin@healixdz.local",
    hidePassword: "Masquer le mot de passe",
    loading: "Vérification en cours...",
    passwordLabel: "Mot de passe",
    passwordPlaceholder: "Mot de passe administrateur",
    showPassword: "Afficher le mot de passe",
    submit: "Accéder à l’administration",
  },
  hero: {
    cards: {
      audit: {
        description: "Toutes les connexions et actions critiques sont suivies.",
        title: "Journalisation",
      },
      gate: {
        description: "Accès réservé aux rôles SUPER_ADMIN et ADMIN_VERIFICATION.",
        title: "Accès restreint",
      },
      security: {
        description: "Session isolée via cookies httpOnly dédiés à l’administration.",
        title: "Sécurité séparée",
      },
    },
    description:
      "Connectez-vous pour gérer les demandes de vérification, consulter les dossiers soumis et administrer la plateforme HealixDZ.",
    subtitle: "Accès sécurisé réservé à l’équipe autorisée.",
    title: "Administration HealixDZ",
  },
  notice: {
    description:
      "Cette interface est réservée aux administrateurs autorisés. Toutes les connexions sont journalisées.",
    title: "Accès restreint",
  },
  success: "Connexion administrateur réussie.",
};
