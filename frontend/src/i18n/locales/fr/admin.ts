export const adminFr = {
  actions: {
    approve: "Approuver",
    back: "Retour",
    close: "Fermer",
    download: "Télécharger",
    exportCsv: "Exporter CSV",
    filter: "Filtrer",
    next: "Suivant",
    previous: "Précédent",
    logout: "Déconnexion",
    reactivate: "Réactiver",
    refuse: "Refuser",
    reset: "Réinitialiser",
    suspend: "Suspendre",
    viewDetails: "Voir détails",
    viewDocument: "Voir document",
    viewFile: "Voir dossier",
  },
  audit: {
    actions: {
      ADMIN_DOWNLOADED_VERIFICATION_DOCUMENT: {
        description:
          "{actor} a téléchargé un document rattaché à {entity}.",
        label: "Document téléchargé",
      },
      ADMIN_LOGIN_FAILED: {
        description:
          "Une tentative de connexion administrateur a échoué pour {actor}.",
        label: "Connexion admin échouée",
      },
      ADMIN_LOGIN_SUCCESS: {
        description:
          "{actor} s'est connecté avec succès à l'espace d'administration.",
        label: "Connexion admin réussie",
      },
      ADMIN_LOGOUT: {
        description: "{actor} a quitté l'espace d'administration.",
        label: "Déconnexion admin",
      },
      ADMIN_REFRESH_TOKEN_FAILED: {
        description:
          "Le renouvellement de session administrateur a échoué pour {actor}.",
        label: "Renouvellement refusé",
      },
      ADMIN_REFRESH_TOKEN_USED: {
        description:
          "La session administrateur de {actor} a été renouvelée de manière sécurisée.",
        label: "Session renouvelée",
      },
      ADMIN_VIEWED_AUDIT_LOG: {
        description: "{actor} a consulté un journal d'audit.",
        label: "Audit consulté",
      },
      ADMIN_VIEWED_USER: {
        description: "{actor} a consulté un profil utilisateur.",
        label: "Utilisateur consulté",
      },
      ADMIN_VIEWED_VERIFICATION: {
        description:
          "{actor} a ouvert un dossier de vérification pour analyse.",
        label: "Dossier consulté",
      },
      ADMIN_VIEWED_VERIFICATION_DOCUMENT: {
        description:
          "{actor} a prévisualisé un document soumis dans {entity}.",
        label: "Document consulté",
      },
      DOCTOR_VERIFICATION_SUBMITTED: {
        description:
          "Un médecin indépendant a soumis une demande de vérification.",
        label: "Vérification médecin soumise",
      },
      ESTABLISHMENT_VERIFICATION_SUBMITTED: {
        description:
          "Un établissement a soumis une demande de vérification.",
        label: "Vérification établissement soumise",
      },
      LOGOUT: {
        description: "{actor} s'est déconnecté de la plateforme.",
        label: "Déconnexion utilisateur",
      },
      USER_REACTIVATED: {
        description: "{actor} a réactivé un compte utilisateur.",
        label: "Compte réactivé",
      },
      USER_SUSPENDED: {
        description: "{actor} a suspendu un compte utilisateur.",
        label: "Compte suspendu",
      },
      VERIFICATION_APPROVED: {
        description:
          "{actor} a approuvé une demande de vérification professionnelle.",
        label: "Demande approuvée",
      },
      VERIFICATION_REJECTED: {
        description:
          "{actor} a refusé une demande de vérification professionnelle.",
        label: "Demande refusée",
      },
    },
    detail: {
      action: "Action effectuée",
      actor: "Acteur",
      contextDescription:
        "Ces informations proviennent du journal sécurisé et servent à comprendre le contexte de l'action.",
      contextTitle: "Contexte enregistré",
      date: "Date et heure",
      defaultDescription:
        "{actor} a effectué l'action « {action} » sur {entity}.",
      device: "Appareil et navigateur",
      entity: "Ressource concernée",
      entityId: "ID ressource",
      ip: "Adresse IP",
      noMetadata: "Aucune métadonnée non sensible n'est associée à cet événement.",
      role: "Rôle",
      structuredData: "Données structurées disponibles",
      unknownDevice: "Appareil non renseigné",
    },
    detailTitle: "Détails de l'audit",
    entities: {
      AUTH_SESSION: "Session d'authentification",
      AUDIT_LOG: "Journal d'audit",
      USER: "Compte utilisateur",
      VERIFICATION_DOCUMENT: "Document de vérification",
      VERIFICATION_REQUEST: "Demande de vérification",
    },
    error: "Impossible de charger les audit logs.",
    filters: {
      action: "Type d'action",
      date: "Date",
      ip: "IP",
      role: "Rôle",
      search: "Recherche utilisateur/action",
      status: "Statut",
    },
    page: {
      subtitle:
        "Suivez les actions importantes pour la sécurité et la conformité.",
      title: "Audit logs",
    },
    loading: "Chargement des audit logs...",
    metadata: {
      adminNote: "Note administrateur",
      currentStep: "Étape actuelle",
      documentType: "Type de document",
      email: "Email concerné",
      reason: "Raison",
      role: "Rôle concerné",
      status: "Statut",
      type: "Type de demande",
      userId: "Utilisateur concerné",
      verificationRequestId: "Demande concernée",
    },
    pagination: "Page {page} sur {totalPages} · {total} résultats",
    table: {
      action: "Action",
      date: "Date",
      details: "Détails",
      entity: "Entité",
      ip: "Adresse IP",
      role: "Rôle",
      status: "Statut",
      user: "Utilisateur",
      userAgent: "User agent",
    },
  },
  badges: {
    accountStatus: {
      ACTIVE: "ACTIVE",
      BASIC_ACCOUNT: "BASIC_ACCOUNT",
      PAYMENT_PENDING: "PAYMENT_PENDING",
      PENDING_VERIFICATION: "PENDING_VERIFICATION",
      REJECTED: "REJECTED",
      SUSPENDED: "SUSPENDED",
      VERIFIED_NO_PLAN: "VERIFIED_NO_PLAN",
    },
    auditStatus: {
      FAILED: "Échec",
      INFO: "Info",
      SUCCESS: "Succès",
    },
    documents: {
      complete: "Complet",
      incomplete: "Incomplet",
    },
    priority: {
      NORMAL: "Normal",
      REVIEW: "À vérifier",
      URGENT: "Urgent",
    },
    roles: {
      ADMIN_VERIFICATION: "ADMIN_VERIFICATION",
      ESTABLISHMENT_ADMIN: "ESTABLISHMENT_ADMIN",
      INDEPENDENT_DOCTOR: "INDEPENDENT_DOCTOR",
      SUPER_ADMIN: "SUPER_ADMIN",
    },
    status: {
      DRAFT: "DRAFT",
      NOT_STARTED: "NOT_STARTED",
      PENDING_VERIFICATION: "PENDING_VERIFICATION",
      REJECTED: "REJECTED",
      SUSPENDED: "SUSPENDED",
      VERIFIED: "VERIFIED",
    },
    type: {
      ESTABLISHMENT: "Établissement",
      INDEPENDENT_DOCTOR: "Médecin indépendant",
    },
  },
  common: {
    all: "Tous",
    noResults: "Aucun résultat trouvé",
    search: "Rechercher",
    system: "Système",
    yes: "Oui",
    no: "Non",
  },
  breadcrumb: {
    pages: "Pages",
  },
  dashboard: {
    actions: {
      audit: "Voir les audit logs",
      users: "Consulter les utilisateurs",
      verifications: "Voir les demandes en attente",
    },
    chart: {
      title: "Demandes de vérification par semaine",
      subtitle: "Volumes simulés des dossiers soumis et validés",
      pending: "En attente",
      verified: "Validées",
    },
    distribution: {
      establishments: "Établissements",
      doctors: "Médecins",
      title: "Répartition des comptes",
    },
    page: {
      subtitle:
        "Vue générale sur l'activité de vérification et les utilisateurs HealixDZ.",
      title: "Tableau de bord admin",
    },
    loading: "Chargement des données administrateur...",
    error:
      "Impossible de charger les données du dashboard administrateur. Vérifiez votre session admin.",
    quickActions: "Actions rapides",
    recent: {
      title: "Dernières demandes soumises",
    },
    stats: {
      doctors: "Médecins indépendants",
      establishments: "Établissements",
      pending: "Demandes en attente",
      registeredUsers: "Utilisateurs inscrits",
      rejected: "Demandes refusées",
      verified: "Demandes validées",
    },
  },
  detail: {
    error: "Impossible de charger le dossier de vérification.",
    checklist: {
      address: "Adresse cohérente",
      documents: "Documents obligatoires présents",
      fiscal: "Informations fiscales présentes",
      identity: "Identité cohérente",
      noIssue: "Aucune incohérence visible",
      professional: "Autorisation professionnelle présente",
      problem: "Problème",
      review: "À vérifier",
      title: "Checklist admin",
      valid: "OK",
    },
    decision: {
      approved: "Dossier approuvé avec succès.",
      approvedDescription:
        "La demande est approuvée. Le compte utilisateur affiche maintenant le statut de vérification correspondant.",
      approvedTitle: "Demande approuvée",
      confirmation:
        "Je confirme avoir vérifié les informations et les documents fournis.",
      lockedTitle: "Décision déjà enregistrée",
      rejected: "Dossier refusé avec succès.",
      rejectedDescription:
        "La demande est refusée. L'utilisateur pourra corriger son dossier et le renvoyer.",
      rejectedTitle: "Demande refusée",
      rejectionReason: "Raison du refus",
      rejectionRequired: "Veuillez indiquer la raison du refus.",
      savedReason: "Raison enregistrée",
      title: "Décision admin",
      unavailableDescription:
        "Aucune action admin n'est disponible pour ce statut.",
    },
    documents: {
      optional: "Optionnel",
      required: "Obligatoire",
      title: "Documents soumis",
      types: {
        COMMERCIAL_REGISTER: "Registre de commerce",
        NIF_DOCUMENT: "Numéro d'identification fiscale (NIF)",
        HEALTH_AUTHORIZATION: "Autorisation sanitaire ou agrément",
        LEGAL_REPRESENTATIVE_ID: "Pièce d'identité du responsable légal",
        ADDRESS_PROOF: "Justificatif d'adresse professionnelle",
        IDENTITY_DOCUMENT: "Pièce d'identité",
        MEDICAL_DEGREE: "Diplôme de docteur en médecine",
        ORDRE_REGISTRATION: "Attestation d'inscription à l'Ordre",
        PRACTICE_AUTHORIZATION: "Autorisation d'exercice",
        CABINET_ADDRESS_PROOF: "Justificatif d'adresse du cabinet",
        SPECIALITY_DEGREE: "Diplôme de spécialité",
      },
    },
    header: {
      completeness: "Score de complétude",
      submittedAt: "Date de soumission",
    },
    info: {
      legal: "Informations légales / professionnelles",
      main: "Informations principales",
      summary: "Résumé du dossier",
    },
    modal: {
      title: "Aperçu du document",
      loading: "Chargement du document...",
      error: "Impossible de charger le document.",
      file: "Fichier soumis",
      unsupportedFormat: "Ce format ne peut pas être affiché directement.",
      unsupportedFormatHint: "Téléchargez le fichier pour le consulter.",
    },
    page: {
      subtitle:
        "Analysez les informations, documents et signaux de cohérence avant décision.",
      title: "Détail de la demande",
    },
    loading: "Chargement du dossier de vérification...",
    summary: {
      accountType: "Type de compte",
      currentStatus: "Statut actuel",
      email: "Email",
      name: "Nom",
      phone: "Téléphone",
      registeredAt: "Date d'inscription",
      submittedAt: "Date de soumission",
      wilaya: "Wilaya",
    },
    timeline: "Historique de la demande",
  },
  filters: {
    completeness: "Documents complets",
    date: "Date de soumission",
    priority: "Niveau de priorité",
    role: "Rôle",
    status: "Statut",
    type: "Type",
    wilaya: "Wilaya",
  },
  header: {
    notification: "Notifications",
    role: "SUPER_ADMIN",
    searchPlaceholder: "Recherche admin mock...",
    secureSession: "Session sécurisée",
    today: "Aujourd'hui",
  },
  layout: {
    adminBadge: "Admin",
    secureAccess: "Accès sécurisé",
    secureAccessDescription: "Interface réservée à l'administration.",
    brand: "HealixDZ Admin",
    nav: {
      auditLogs: "Audit logs",
      dashboard: "Tableau de bord",
      logout: "Déconnexion",
      patients: "Patients",
      settings: "Paramètres",
      users: "Utilisateurs",
      verifications: "Demandes de vérification",
    },
  },
  users: {
    error: "Impossible de charger les utilisateurs inscrits.",
    filters: {
      createdAt: "Date d'inscription",
      role: "Rôle",
      search: "Recherche nom/email/téléphone",
      status: "Statut compte",
      wilaya: "Wilaya",
    },
    page: {
      subtitle: "Consultez les comptes créés sur la plateforme HealixDZ.",
      title: "Utilisateurs inscrits",
    },
    loading: "Chargement des utilisateurs...",
    pagination: "Page {page} sur {totalPages} · {total} résultats",
    table: {
      action: "Action",
      createdAt: "Date d'inscription",
      email: "Email",
      name: "Nom",
      phone: "Téléphone",
      role: "Rôle",
      status: "Statut compte",
      verification: "Vérification",
    },
  },
  verifications: {
    error: "Impossible de charger les demandes de vérification.",
    filters: {
      date: "Date de soumission",
      documentsComplete: "Documents complets",
      priority: "Niveau de priorité",
      search: "Recherche par nom, email, téléphone",
      status: "Statut",
      submittedFrom: "Soumis depuis",
      submittedTo: "Soumis jusqu'au",
      type: "Type",
      wilaya: "Wilaya",
    },
    page: {
      subtitle:
        "Consultez, filtrez et analysez les dossiers soumis avant décision.",
      title: "Demandes de vérification",
    },
    loading: "Chargement des demandes de vérification...",
    pagination: "Page {page} sur {totalPages} · {total} résultats",
    table: {
      action: "Action",
      completeness: "Score complétude",
      documents: "Documents",
      docsShort: "{completed}/{total} docs",
      requester: "Demandeur",
      status: "Statut",
      submittedAt: "Date de soumission",
      type: "Type",
      updatedAt: "Dernière mise à jour",
      wilaya: "Wilaya",
    },
  },
};
