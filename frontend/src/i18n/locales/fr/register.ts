export const registerFr = {
  metadata: {
    title: "Inscription | HealixDZ",
    description:
      "Créer un compte établissement de santé ou médecin indépendant sur HealixDZ.",
  },
  page: {
    lang: "fr",
    formAriaLabel: "Formulaire d’inscription",
    demoAccess:
      "Après inscription, vous aurez accès au mode démonstration. L’accès aux données médicales réelles sera activé après vérification professionnelle et choix d’un abonnement.",
  },
  hero: {
    title: "Système hospitalier intelligent",
    subtitle:
      "Gestion médicale, IA d’imagerie et interopérabilité HL7/FHIR dans une seule plateforme.",
    demoBadge: "Mode démo disponible après inscription",
    valuePoints: {
      patientRecords:
        "Gestion sécurisée des patients et dossiers médicaux",
      medicalAi: "Analyse IA des images médicales",
      workflow: "Workflow professionnel avec vérification et audit",
    },
    illustration: {
      admission: "Admission",
      unifiedRecord: "Dossier unifié",
      imaging: "Imagerie",
      assistedAi: "IA assistée",
      audit: "Audit",
      controlledAccess: "Accès contrôlé",
      traceability: "Traçabilité active",
    },
    activation: {
      title: "Parcours d’activation",
      steps: {
        accountCreated: "Compte créé",
        demoMode: "Mode démo",
        professionalVerification: "Vérification professionnelle",
        fullActivation: "Activation complète",
      },
    },
    demoMode: {
      badge: "Disponible immédiatement",
      text: "Explorez HealixDZ avec des données fictives avant la validation professionnelle.",
    },
  },
  accountType: {
    eyebrow: "Inscription rapide",
    title: "Choisissez votre type de compte",
    description:
      "Cette étape ouvre le mode démonstration. La vérification professionnelle sera demandée ensuite.",
    establishment: {
      title: "Établissement de santé",
      description:
        "Pour cliniques, hôpitaux, centres d’imagerie, laboratoires et structures médicales.",
    },
    independentDoctor: {
      title: "Médecin indépendant",
      description:
        "Pour les médecins exerçant sans rattachement à un établissement inscrit.",
    },
  },
  progress: {
    ariaLabel: "Progression de l’inscription",
    steps: {
      account: "Compte",
      verification: "Vérification",
      subscription: "Abonnement",
      activation: "Activation",
    },
  },
  security: {
    title: "Sécurité et confidentialité",
    body: "Vos informations sont utilisées uniquement pour créer votre compte. L’accès aux fonctionnalités médicales réelles nécessite une vérification professionnelle. Les données sensibles seront protégées selon les règles de confidentialité et de sécurité de la plateforme.",
  },
  establishmentTypes: {
    clinic: "Clinique",
    hospital: "Hôpital",
    imagingCenter: "Centre d’imagerie",
    laboratory: "Laboratoire",
    groupPractice: "Cabinet de groupe",
  },
  forms: {
    selectPlaceholder: "Sélectionner",
    terms: {
      acceptTerms:
        "J’accepte les conditions d’utilisation et la politique de confidentialité",
      acceptVerification:
        "Je comprends que l’accès aux fonctionnalités médicales réelles nécessite une vérification professionnelle",
    },
    signInPrompt: "Déjà un compte ?",
    signInLink: "Se connecter",
    establishment: {
      submit: "Créer mon espace établissement",
      loading: "Création du compte...",
      fields: {
        establishmentName: {
          label: "Nom de l’établissement",
          placeholder: "Clinique El Amane",
        },
        establishmentType: {
          label: "Type d’établissement",
        },
        wilaya: {
          label: "Wilaya",
        },
        address: {
          label: "Adresse",
          placeholder: "Adresse professionnelle de l’établissement",
        },
        professionalEmail: {
          label: "Email professionnel",
          placeholder: "contact@etablissement.dz",
        },
        phone: {
          label: "Téléphone",
          placeholder: "+213 555 00 00 00",
        },
        managerFullName: {
          label: "Nom du responsable du compte",
          placeholder: "Nom et prénom",
        },
        password: {
          label: "Mot de passe",
        },
        confirmPassword: {
          label: "Confirmation du mot de passe",
        },
      },
    },
    doctor: {
      submit: "Créer mon compte médecin",
      loading: "Création du compte...",
      fields: {
        fullName: {
          label: "Nom complet",
          placeholder: "Dr Nom et prénom",
        },
        speciality: {
          label: "Spécialité",
          placeholder: "Radiologie, cardiologie...",
        },
        wilaya: {
          label: "Wilaya",
        },
        professionalAddress: {
          label: "Adresse professionnelle ou cabinet",
          placeholder: "Adresse du cabinet ou lieu d’exercice",
        },
        email: {
          label: "Email",
          placeholder: "nom@cabinet.dz",
        },
        phone: {
          label: "Téléphone",
          placeholder: "+213 555 00 00 00",
        },
        password: {
          label: "Mot de passe",
        },
        confirmPassword: {
          label: "Confirmation du mot de passe",
        },
      },
    },
  },
  password: {
    hint:
      "Utilisez au moins 8 caractères avec lettres, chiffres et caractères spéciaux.",
    strength: "Robustesse",
    levels: {
      weak: "faible",
      medium: "moyenne",
      strong: "forte",
    },
    show: "Afficher le mot de passe",
    hide: "Masquer le mot de passe",
  },
  feedback: {
    success:
      "Compte créé avec succès. Vous pouvez maintenant accéder au mode démonstration.",
    apiErrors: {
      alertTitle: "Inscription impossible",
      addressRequired: "L'adresse professionnelle est obligatoire.",
      conditionsRequired: "Vous devez accepter les conditions d'utilisation.",
      database:
        "Une erreur de base de données est survenue. Veuillez réessayer.",
      emailConflict: "Cet email est déjà utilisé.",
      emailInvalid: "Email invalide.",
      fullNameRequired: "Le nom complet est obligatoire.",
      notFound: "Le service d'inscription est actuellement indisponible.",
      passwordMismatch: "Les mots de passe ne correspondent pas.",
      passwordTooShort: "Le mot de passe doit contenir au moins 8 caractères.",
      phoneConflict: "Ce numéro de téléphone est déjà utilisé.",
      phoneRequired: "Le téléphone est obligatoire.",
      specialityRequired: "La spécialité est obligatoire.",
      validation: "Veuillez vérifier les informations saisies.",
      verificationRequired:
        "Vous devez accepter la vérification professionnelle.",
      wilayaRequired: "La wilaya est obligatoire.",
      network: "Impossible de contacter le serveur. Vérifiez votre connexion.",
      server: "Une erreur est survenue. Veuillez réessayer.",
      generic: "Une erreur est survenue. Veuillez réessayer.",
    },
    successCard: {
      title: "Compte créé avec succès",
      description:
        "Votre espace établissement est maintenant créé. Vous pouvez accéder au mode démonstration. L’accès aux fonctionnalités médicales réelles nécessitera une vérification professionnelle.",
      doctorTitle: "Compte médecin créé avec succès",
      doctorDescription:
        "Votre compte médecin indépendant est maintenant créé. Vous pouvez accéder au mode démonstration. L’accès aux fonctionnalités médicales réelles nécessitera une vérification professionnelle.",
      demoAction: "Accéder au mode démo",
      verificationAction: "Continuer vers la vérification",
    },
  },
  errors: {
    required: "Ce champ est obligatoire",
    emailInvalid: "Email invalide",
    phoneRequired: "Téléphone obligatoire",
    phoneInvalid: "Téléphone invalide",
    passwordTooShort: "Mot de passe trop court",
    passwordMismatch: "Les mots de passe ne correspondent pas",
    acceptTerms: "Veuillez accepter les conditions",
    maxLength: "Maximum {max} caractères",
  },
} as const;
