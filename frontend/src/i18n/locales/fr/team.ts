export const teamFr = {
  page: {
    breadcrumb: "Compte / Équipe",
    title: "Équipe & accès",
    subtitle:
      "Les membres de votre établissement, leurs invitations et ce que chaque rôle peut faire. Tout est décidé côté serveur, rôle par rôle.",
  },
  tabs: {
    label: "Sections de l’équipe",
    members: "Membres",
    invitations: "Invitations",
    roles: "Rôles & accès",
  },
  states: {
    loading: "Chargement de l’équipe",
    errorTitle: "Impossible de charger l’équipe",
    retry: "Réessayer",
  },
  errors: {
    unknown: "Une erreur est survenue. Réessayez dans un instant.",
    network:
      "Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.",
    tooManyRequests:
      "Trop de tentatives. Patientez une minute avant de réessayer.",
    forbidden: "Vous n’êtes pas autorisé à effectuer cette action.",
    invalid: "Les informations saisies sont invalides.",
    emailInvalid: "L’e-mail est invalide.",
    emailAlreadyPending: "Une invitation est déjà en attente pour cet e-mail.",
    accountExists: "Un compte existe déjà avec cet e-mail.",
    phoneUsed: "Ce numéro de téléphone est déjà utilisé.",
    quotaReached:
      "Le quota de médecins autorisé par votre abonnement est atteint.",
    subscriptionInactive:
      "Votre abonnement est inactif : le compte est en lecture seule.",
  },
  notices: {
    invited: "Invitation envoyée à {email}.",
    resent: "Invitation renvoyée à {email}.",
    revoked: "Invitation révoquée.",
    suspended: "Membre suspendu : ses sessions ont été fermées.",
    reactivated: "Membre réactivé.",
    resetSent:
      "Lien de réinitialisation envoyé à l’adresse du membre (valable 30 minutes).",
  },
  members: {
    title: "Membres",
    subtitle:
      "Les personnes rattachées à votre établissement et l’état de leur compte.",
    invite: "Inviter un membre",
    empty: "Aucun membre pour le moment.",
    usage: {
      label: "Places de médecins",
      limited: "{active} actif(s) sur {max} autorisé(s) par votre abonnement",
      unlimited: "{active} actif(s), sans limite dans votre abonnement",
    },
    roles: {
      OWNER: "Propriétaire",
      ADMIN: "Administrateur",
      DOCTOR: "Médecin",
      RECEPTIONIST: "Réception",
    },
    accountStatuses: {
      ACTIVE: "Compte actif",
      SUSPENDED: "Compte suspendu",
    },
    emailNotVerified: "E-mail non vérifié",
    emailHidden: "E-mail masqué dans cette vue",
    joinedOn: "Membre depuis le {date}",
    you: "Vous",
    actions: {
      suspend: "Suspendre",
      suspendNote: "Ferme les sessions du membre et bloque son accès.",
      reactivate: "Réactiver",
      resetLink: "Lien de réinitialisation",
      resetLinkNote:
        "Envoie au membre un lien pour choisir un nouveau mot de passe. Aucun mot de passe n’est visible ici.",
    },
    doctor: {
      speciality: "Spécialité",
      wilaya: "Wilaya",
      profilePending: "Profil à compléter",
    },
  },
  invitations: {
    title: "Invitations",
    subtitle:
      "Les liens d’invitation valables 72 h envoyés aux nouvelles personnes.",
    empty: "Aucune invitation.",
    statuses: {
      PENDING: "En attente",
      EXPIRED: "Expirée",
      REVOKED: "Révoquée",
      USED: "Acceptée",
    },
    expiresOn: "Expire le {date}",
    sentOn: "Envoyée le {date}",
    sentBy: "Par {name}",
    actions: {
      resend: "Renvoyer",
      resendNote: "Crée un nouveau lien de 72 h ; l’ancien devient invalide.",
      revoke: "Révoquer",
      revokeNote: "L’invitation ne sera plus utilisable.",
    },
  },
  inviteForm: {
    title: "Inviter un membre",
    subtitle:
      "Un e-mail d’invitation part avec un lien valable 72 h. La personne crée son compte par ce lien, jamais avec un mot de passe temporaire.",
    fields: {
      email: "E-mail professionnel",
      emailHelp:
        "L’adresse de travail du nouveau membre : elle deviendra son identifiant de connexion.",
      role: "Rôle dans l’établissement",
    },
    roles: {
      DOCTOR: "Médecin",
      ADMIN: "Administrateur",
    },
    roleDescriptions: {
      DOCTOR:
        "Consulte l’établissement et son équipe, exerce sur la plateforme.",
      ADMIN:
        "Gère l’organisation opérationnelle, les médecins et les invitations de médecins.",
    },
    adminRoleRefused:
      "Seul le propriétaire peut inviter un autre administrateur.",
    submit: "Envoyer l’invitation",
    sending: "Envoi en cours…",
    cancel: "Annuler",
  },
  roles: {
    title: "Rôles & accès",
    subtitle:
      "Ce que chaque rôle de votre établissement peut faire, décidé par la plateforme.",
    card: {
      OWNER: {
        title: "Propriétaire",
        points: [
          "L’identité légale et les informations de l’organisation",
          "L’équipe au complet : invitations, suspension, réactivation",
          "Le paiement et l’abonnement de l’établissement",
        ],
      },
      ADMIN: {
        title: "Administrateur",
        points: [
          "Les coordonnées opérationnelles, les horaires et la protection des données",
          "Les médecins : invitations, suspension, réactivation, mot de passe",
          "L’équipe de direction n’est pas modifiable : pas d’invitation d’administrateur",
        ],
      },
      DOCTOR: {
        title: "Médecin",
        points: [
          "L’annuaire de l’établissement et de l’équipe (sans contacts personnels des autres)",
          "Toutes les fonctions cliniques : patients, consultations, prescriptions",
          "Aucune gestion : l’organisation et les invitations restent réservées",
        ],
      },
    },
    note: "Le rôle Propriétaire ne peut jamais être rétrogradé, suspendu ni retiré : c’est une règle de la plateforme, pas une permission.",
  },
  invite: {
    page: {
      title: "Rejoindre l’organisation",
      subtitle: "Vous avez été invité à créer votre compte HealixDz.",
    },
    checking: "Vérification de l’invitation…",
    inspection: {
      card: "Détails de l’invitation",
      workspace: "Espace de travail",
      establishment: "Établissement",
      role: "Rôle proposé",
      expiry: "Valable jusqu’au {date}",
      expiresOn: "Expire le {date}",
      status: {
        PENDING: "En attente d’acceptation",
        EXPIRED: "Expirée",
        REVOKED: "Révoquée",
        USED: "Déjà acceptée",
      },
    },
    form: {
      accountTitle: "Créer votre compte",
      accountSubtitle: "Ces identifiants servent à vous connecter à HealixDz.",
      fullName: "Nom complet",
      phone: "Téléphone",
      password: "Mot de passe",
      confirmPassword: "Confirmer le mot de passe",
      passwordHint:
        "Au moins 8 caractères. Ce mot de passe n’est visible par personne.",
      showPassword: "Afficher le mot de passe",
      hidePassword: "Masquer le mot de passe",
      strength: "Robustesse",
      strengthLevels: {
        weak: "faible",
        medium: "moyenne",
        strong: "forte",
      },
      professionalTitle: "Vos informations professionnelles (optionnel)",
      professionalSubtitle:
        "Elles se complètent ensuite dans la vérification professionnelle.",
      speciality: "Spécialité",
      wilaya: "Wilaya",
      professionalAddress: "Adresse professionnelle",
      submit: "Créer mon compte",
      creating: "Création en cours…",
    },
    states: {
      invalidTitle: "Invitation introuvable",
      invalid:
        "Ce lien d’invitation n’existe pas ou est mal formé. Demandez une nouvelle invitation au gestionnaire de votre établissement.",
      expiredTitle: "Invitation expirée",
      expired:
        "Cette invitation a dépassé ses 72 heures. Demandez une nouvelle invitation.",
      revokedTitle: "Invitation révoquée",
      revoked:
        "Cette invitation a été annulée par le gestionnaire de l’établissement.",
      usedTitle: "Invitation déjà utilisée",
      used: "Cette invitation a déjà servi à créer un compte. Connectez-vous avec vos identifiants.",
      successTitle: "Compte créé",
      success:
        "Votre compte est prêt. Connectez-vous pour commencer à utiliser HealixDz.",
      goLogin: "Aller à la connexion",
      backToLogin: "J’ai déjà un compte : me connecter",
    },
    errors: {
      required: "Ce champ est obligatoire.",
      passwordTooShort: "Le mot de passe doit contenir au moins 8 caractères.",
      passwordMismatch: "Les mots de passe ne correspondent pas.",
      phoneInvalid: "Le numéro de téléphone est invalide.",
      accountExists: "Un compte existe déjà avec cet e-mail : connectez-vous.",
      phoneUsed: "Ce numéro est déjà utilisé.",
      forbidden: "Vous n’êtes pas autorisé à effectuer cette action.",
      tooManyRequests:
        "Trop de tentatives. Patientez une minute avant de réessayer.",
      network:
        "Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.",
      unknown: "Une erreur est survenue. Réessayez dans un instant.",
      invalid: "Les informations saisies sont invalides.",
      emailInvalid: "L’e-mail est invalide.",
      emailAlreadyPending:
        "Une invitation est déjà en attente pour cet e-mail.",
    },
  },
} as const;
