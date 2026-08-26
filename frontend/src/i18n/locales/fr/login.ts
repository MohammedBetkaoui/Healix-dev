export const loginFr = {
  metadata: {
    title: "Connexion | HealixDZ",
    description: "Connectez-vous à votre espace médical sécurisé HealixDZ.",
  },
  brandSubtitle: "Plateforme médicale algérienne",
  page: {
    title: "Connexion",
    subtitle: "Accédez à votre espace médical sécurisé.",
  },
  hero: {
    compliance: "Conforme Loi 18-07",
    titleLead: "Un accès clinique,",
    titleAccent: "calme",
    titleEnd: "et strictement sécurisé.",
    title: "Bienvenue sur HealixDZ",
    subtitle: "Connectez-vous a votre espace medical intelligent.",
    description:
      "Connectez-vous à HealixDz pour piloter les rendez-vous, les dossiers, les analyses assistées par IA et les opérations biomédicales, depuis un espace pensé pour le rythme d'une équipe soignante.",
    stats: {
      sessions: {
        label: "Sessions",
        value: "AES-256",
        description: "Chiffrement",
      },
      availability: {
        label: "Disponibilité",
        value: "99,9 %",
        description: "SLA clinique",
      },
      audit: {
        label: "Audit",
        value: "10 ans",
        description: "Conservation",
      },
    },
    cards: {
      secureSpace: {
        title: "Espace securise",
        description: "Acces protege aux comptes professionnels.",
      },
      demoMode: {
        title: "Mode demo",
        description: "Decouvrez la plateforme avec des donnees fictives.",
      },
      professionalVerification: {
        title: "Verification professionnelle",
        description: "L'acces reel necessite une validation.",
      },
      medicalAi: {
        title: "IA medicale",
        description: "Analyse intelligente des images medicales.",
      },
    },
    trust: {
      title: "Securite & confidentialite",
      description:
        "Vos informations de connexion sont protegees. L'acces aux donnees medicales reelles sera soumis a une verification professionnelle.",
    },
  },
  form: {
    eyebrow: "Authentification",
    accountTypeLabel: "Profil",
    optional: "Optionnel",
    emailLabel: "Adresse e-mail",
    emailPlaceholder: "admin@clinique.dz",
    passwordLabel: "Mot de passe",
    passwordPlaceholder: "Votre mot de passe",
    rememberMe: "Garder la session active",
    forgotPassword: "Mot de passe oublié ?",
    submit: "Se connecter",
    loading: "Connexion en cours...",
    ssoComingSoon: "SSO bientôt disponible",
    signUpPrompt: "Pas encore de compte ?",
    signUpLink: "Créer un accès",
  },
  accountType: {
    establishment: "Établissement",
    establishmentDescription: "Clinique, hôpital ou laboratoire",
    establishmentHintTitle: "Établissement de santé",
    establishmentHintDescription:
      "Parcours dédié à la gestion d'une structure et de plusieurs praticiens.",
    doctor: "Médecin indépendant",
    doctorDescription: "Cabinet privé ou activité libérale",
    doctorHintTitle: "Médecin indépendant",
    doctorHintDescription:
      "Accès personnel pour gérer votre cabinet et votre patientèle.",
  },
  feedback: {
    success: "Connexion reussie.",
    apiErrors: {
      alertTitle: "Erreur de connexion",
      invalidCredentials: "Email ou mot de passe incorrect.",
      accountBlocked: "Compte suspendu ou refuse.",
      network: "Impossible de contacter le serveur.",
      validation: "Veuillez verifier les informations saisies.",
      generic: "Une erreur est survenue. Veuillez reessayer.",
    },
  },
  security: {
    title: "Connexion protegee",
    description:
      "Vos identifiants ne sont jamais stockes cote navigateur. Le mode demonstration vous permet d'explorer HealixDZ avant validation professionnelle.",
  },
  hello: {
    establishment: {
      title: "Bonjour, espace etablissement",
      description:
        "Votre compte etablissement est pret pour le mode demonstration. La prochaine etape sera la verification professionnelle.",
    },
    doctor: {
      title: "Bonjour, espace medecin independant",
      description:
        "Votre compte medecin est pret pour le mode demonstration. La prochaine etape sera la verification professionnelle.",
    },
    badge: "BASIC_ACCOUNT",
    backToLogin: "Retour a la connexion",
    continueToVerification: "Continuer vers verification",
  },
  errors: {
    accountTypeRequired: "Veuillez choisir un type de compte.",
    emailRequired: "Email obligatoire.",
    emailInvalid: "Email invalide.",
    passwordRequired: "Mot de passe obligatoire.",
    passwordMinLength:
      "Le mot de passe doit contenir au moins 8 caracteres.",
  },
} as const;
