export const verificationFr = {
  page: {
    breadcrumb: "Verification",
    title: "Verification professionnelle",
    subtitle:
      "Completez les informations necessaires pour activer l'acces reel aux fonctionnalites medicales.",
  },
  status: {
    current: "Statut actuel",
    demoBadge: "Mode demonstration",
    start: "Commencer la verification",
    notStarted:
      "Votre compte est actuellement en mode demonstration. L'acces aux fonctionnalites medicales reelles necessite une validation de votre etablissement.",
    pendingTitle: "Votre demande est en cours d'examen",
    pendingDescription:
      "Votre demande est en cours d'examen. Vous serez notifie apres validation par l'administration.",
    verifiedTitle: "Verification acceptee",
    verifiedDescription:
      "Votre etablissement est verifie. L'acces aux fonctionnalites medicales reelles peut maintenant etre active selon votre abonnement.",
    rejectedTitle: "Verification refusee",
    rejectedDescription:
      "Votre demande a ete refusee par l'administration. Vous pouvez corriger les informations et renvoyer votre dossier.",
    suspendedTitle: "Verification suspendue",
    suspendedDescription:
      "Votre verification est suspendue. Veuillez contacter l'administration HealixDZ pour plus d'informations.",
    editNoticeTitle: "Vérification déjà envoyée",
    editNoticeDescription:
      "Votre demande est en attente de validation par l'administration. Pendant cette periode, vous pouvez encore modifier les informations et remplacer des documents. Les anciens documents seront conserves jusqu'a l'enregistrement final des modifications.",
    rejectedEditTitle: "Correction de la demande requise",
    rejectedEditDescription:
      "Votre dossier a ete refuse. Vous pouvez modifier les informations ou remplacer les documents, puis soumettre la demande a nouveau.",
    editButton: "Modifier ma demande",
    correctButton: "Corriger ma demande",
    values: {
      NOT_STARTED: "NOT_STARTED",
      DRAFT: "DRAFT",
      PENDING_VERIFICATION: "PENDING_VERIFICATION",
      VERIFIED: "VERIFIED",
      REJECTED: "REJECTED",
      SUSPENDED: "SUSPENDED",
    },
  },
  stepper: {
    establishmentInfo: "Informations etablissement",
    officialDocuments: "Documents officiels",
    submission: "Soumission",
    adminValidation: "Validation admin",
  },
  form: {
    prefillLoading: "Chargement des informations de l'etablissement...",
    prefillError:
      "Impossible de charger les informations enregistrees. Veuillez actualiser la page.",
    establishmentName: "Nom de l'etablissement",
    establishmentType: "Type d'etablissement",
    legalForm: "Forme juridique",
    wilaya: "Wilaya",
    commune: "Commune",
    address: "Adresse",
    professionalEmail: "Email professionnel",
    phone: "Telephone",
    managerFullName: "Nom du responsable",
    legalRepresentativeNinOrId: "NIN ou numero de piece du responsable",
    nif: "Numero d'identification fiscale NIF",
    commercialRegisterNumber: "Numero registre de commerce",
    healthAuthorizationNumber: "Numero d'autorisation sanitaire",
    placeholders: {
      establishmentName: "Clinique El Shifa",
      legalForm: "SARL, SPA, association medicale...",
      commune: "Alger Centre",
      address: "Rue principale, Alger",
      professionalEmail: "contact@clinique.dz",
      phone: "+213555000000",
      managerFullName: "Dr Karim Mansouri",
      legalRepresentativeNinOrId: "Numero NIN ou piece d'identite",
      nif: "123456789012345",
      commercialRegisterNumber: "RC-16/00-1234567A",
      healthAuthorizationNumber: "AUT-SAN-2026-001",
    },
  },
  documents: {
    title: "Documents officiels",
    subtitle:
      "Ajoutez les pieces justificatives requises. Formats acceptes : PDF, JPG, PNG.",
    acceptedFormats: "Formats acceptes : PDF, JPG, PNG",
    maxSize: "Taille maximale : 5 MB",
    selectFile: "Choisir un fichier",
    replaceFile: "Remplacer",
    dragDrop: "Deposez votre fichier ici ou cliquez pour selectionner",
    statuses: {
      MISSING: "Non ajoute",
      READY: "Pret a envoyer",
      UPLOADED: "Envoye",
      REJECTED: "Refuse",
    },
    items: {
      commercialRegister: {
        title: "Registre de commerce",
        description: "Version lisible et complete du document officiel.",
      },
      nif: {
        title: "Numero d'identification fiscale NIF",
        description: "Preuve fiscale de l'etablissement.",
      },
      healthAuthorization: {
        title: "Autorisation sanitaire ou agrement",
        description: "Autorisation valide delivree par l'autorite competente.",
      },
      managerId: {
        title: "Piece d'identite du responsable",
        description: "Carte nationale, passeport ou document equivalent.",
      },
      addressProof: {
        title: "Justificatif d'adresse professionnelle",
        description: "Document recent confirmant l'adresse de l'etablissement.",
      },
    },
  },
  security: {
    title: "Securite et confidentialite",
    text:
      "Les documents fournis seront utilises uniquement pour la verification professionnelle de votre etablissement. Ils seront traites de maniere securisee et accessibles uniquement aux administrateurs autorises.",
  },
  submit: {
    title: "Soumission",
    infoCompleted: "Informations completees",
    documentsAdded: "Documents ajoutes",
    status: "Statut",
    ready: "Pret",
    incomplete: "Incomplet",
    button: "Soumettre la demande de verification",
    loading: "Envoi en cours...",
    success: "Demande de verification envoyee avec succes.",
    updateButton: "Enregistrer les modifications",
    updateLoading: "Enregistrement en cours...",
    updateSuccess: "Modifications enregistrees avec succes.",
  },
  errors: {
    required: "Document obligatoire",
    emailInvalid: "Email invalide",
    formatNotAccepted: "Format non accepte",
    fileTooLarge: "Fichier trop volumineux",
    submitFailed:
      "La demande n'a pas pu etre envoyee. Veuillez verifier les informations et les documents.",
  },
} as const;
