export const loginFr = {
  metadata: {
    title: "Connexion | HealixDZ",
    description: "Connectez-vous a votre espace medical intelligent HealixDZ.",
  },
  page: {
    title: "Connexion",
    subtitle:
      "Choisissez votre type de compte et connectez-vous a votre espace.",
  },
  hero: {
    title: "Bienvenue sur HealixDZ",
    subtitle: "Connectez-vous a votre espace medical intelligent.",
    description:
      "Accedez a une plateforme securisee pour gerer vos donnees medicales, vos analyses IA, vos rapports et votre workflow professionnel.",
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
    accountTypeLabel: "Type de compte",
    emailLabel: "Email",
    emailPlaceholder: "nom@structure.dz",
    passwordLabel: "Mot de passe",
    passwordPlaceholder: "Votre mot de passe",
    rememberMe: "Se souvenir de moi",
    forgotPassword: "Mot de passe oublie ?",
    submit: "Se connecter",
    loading: "Connexion en cours...",
    signUpPrompt: "Pas encore de compte ?",
    signUpLink: "Creer un compte",
  },
  accountType: {
    establishment: "Etablissement de sante",
    doctor: "Medecin independant",
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
