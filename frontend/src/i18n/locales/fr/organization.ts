export const organizationFr = {
  page: {
    breadcrumb: "Compte / Organisation",
    title: "Organisation",
    subtitle:
      "L’identité, les informations légales, les coordonnées, les horaires et la protection des données de votre établissement.",
  },
  states: {
    loading: "Chargement en cours",
    errorTitle: "Impossible de charger les données",
    retry: "Réessayer",
  },
  actions: {
    save: "Enregistrer les modifications",
    saving: "Enregistrement…",
    reset: "Annuler les modifications",
  },
  notices: {
    saved: "Modifications enregistrées.",
    nothingToSave: "Aucune modification à enregistrer.",
  },
  errors: {
    unknown: "Une erreur est survenue. Réessayez dans un instant.",
    network:
      "Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.",
    tooManyRequests:
      "Trop de tentatives. Patientez une minute avant de réessayer.",
    forbidden: "Vous n’êtes pas autorisé à effectuer cette action.",
    invalid: "Les informations saisies sont invalides.",
    invalidOpeningHours: "Les horaires saisis sont invalides.",
  },
  identity: {
    title: "Identité",
    subtitle: "Ces informations décrivent votre établissement.",
    fields: {
      name: "Nom",
      type: "Type",
      wilaya: "Wilaya",
      commune: "Commune",
      address: "Adresse",
    },
    notProvided: "Non renseigné",
    // Where the identity shown comes from, and why it is read-only either way.
    verifiedNote:
      "Informations vérifiées : issues de votre dossier de vérification, elles ne se modifient plus ici.",
    registrationNote:
      "Issue de votre inscription, elle ne se modifie pas ici : complétez la vérification pour l’officialiser.",
    subscriptionLabel: "Abonnement",
    openVerification: "Voir la vérification",
    openSubscription: "Voir l’abonnement",
  },
  legal: {
    title: "Informations légales",
    subtitle:
      "Ce que votre dossier de vérification a enregistré sur votre établissement.",
    lockedLabel: "Informations vérifiées",
    lockedHelp:
      "Ces informations ont été vérifiées : elles ne se modifient plus ici.",
    pendingHelp:
      "Ces informations viennent de votre dossier de vérification : elles ne se modifient pas ici.",
    empty:
      "Aucune information légale enregistrée pour le moment : complétez votre dossier de vérification.",
    fields: {
      legalForm: "Forme juridique",
      representative: "Représentant légal",
      representativeFunction: "Fonction du représentant",
      commercialRegisterNumber: "Numéro du registre de commerce",
      commercialRegisterIssuedAt: "Registre de commerce — date",
      commercialRegisterWilaya: "Registre de commerce — wilaya",
      nif: "Numéro d’identification fiscale (NIF)",
      nis: "Numéro d’identification statistique (NIS)",
      taxCenter: "Centre des impôts",
      healthAuthorizationNumber: "Numéro d’autorisation sanitaire",
      healthAuthorizationIssuedAt: "Autorisation sanitaire — date",
      healthAuthorizationAuthority: "Autorité de délivrance de l’autorisation",
      healthDirectionWilaya: "Direction de la santé — wilaya",
      authorizedActivityType: "Activité autorisée",
    },
  },
  contacts: {
    title: "Coordonnées",
    subtitle: "Les contacts professionnels de votre établissement.",
    fields: {
      phone: "Téléphone professionnel",
      professionalEmail: "E-mail professionnel",
      website: "Site web",
      defaultAppointmentDuration: "Durée par défaut d’un rendez-vous",
    },
    durationSuffix: "{minutes} minutes",
    websiteHelp: "Optionnel : laissez vide pour retirer le site web existant.",
    errors: {
      website: "Le site web est invalide.",
      phoneRequired: "Le téléphone professionnel est obligatoire.",
      phoneInvalid: "Le téléphone professionnel est invalide.",
      emailRequired: "L’e-mail professionnel est obligatoire.",
      emailInvalid: "L’e-mail professionnel est invalide.",
    },
  },
  hours: {
    title: "Horaires d’ouverture",
    subtitle:
      "La semaine type de votre établissement, telle qu’elle est appliquée aux rendez-vous.",
    closed: "Fermé",
    addPeriod: "Ajouter une période",
    removePeriod: "Retirer cette période",
    periodStart: "Heure de début",
    periodEnd: "Heure de fin",
    days: {
      sunday: "Dimanche",
      monday: "Lundi",
      tuesday: "Mardi",
      wednesday: "Mercredi",
      thursday: "Jeudi",
      friday: "Vendredi",
      saturday: "Samedi",
    },
    errors: {
      noPeriod: "Un jour ouvert doit avoir au moins une période.",
      missingTime:
        "Chaque période doit avoir une heure de début et une heure de fin.",
      startBeforeEnd: "Le début d’une période doit être avant sa fin.",
      overlap: "Les périodes d’un même jour ne peuvent pas se chevaucher.",
    },
  },
  protection: {
    title: "Protection des données",
    subtitle: "Le délégué à la protection des données de votre établissement.",
    fields: {
      name: "Nom du délégué",
      email: "E-mail du délégué",
      phone: "Téléphone du délégué",
    },
    help: "Tout est optionnel : une information effacée est retirée de votre établissement.",
    errors: {
      nameTooShort: "Le nom du délégué est trop court.",
      emailInvalid: "L’e-mail du délégué est invalide.",
      phoneInvalid: "Le téléphone du délégué est invalide.",
    },
  },
} as const;
