export const subscriptionFr = {
  access: {
    active: {
      description:
        "Votre compte est actif. Vous pouvez renouveler votre abonnement ou changer de plan selon vos besoins.",
      title: "Compte actif",
    },
    pending: {
      action: "Voir le statut de vérification",
      description:
        "Votre demande de vérification est en cours d'examen par l'administration HealixDZ. Vous pourrez choisir un abonnement après validation.",
      title: "Vérification en attente",
    },
    rejected: {
      action: "Corriger la vérification",
      description:
        "Votre demande de vérification a été refusée. Veuillez corriger les informations ou documents demandés, puis renvoyer la demande.",
      title: "Vérification refusée",
    },
    suspended: {
      description:
        "Votre compte est suspendu. Veuillez contacter l'administration HealixDZ avant toute action d'abonnement ou de paiement.",
      title: "Compte suspendu",
    },
    unverified: {
      action: "Compléter la vérification",
      description:
        "Votre compte n'est pas encore vérifié. Vous devez compléter la vérification professionnelle avant de pouvoir activer un abonnement.",
      title: "Compte non vérifié",
    },
    verified: {
      description:
        "Votre compte est vérifié. Choisissez un abonnement pour activer les fonctionnalités médicales.",
      title: "Compte vérifié",
    },
  },
  accountType: {
    ESTABLISHMENT: "Établissement de santé",
    INDEPENDENT_DOCTOR: "Médecin indépendant",
  },
  badges: {
    popular: "Le plus populaire",
    recommended: "Recommandé",
  },
  billing: {
    annual: "Annuel",
    annualSaving: "Économisez 16,67% avec l'abonnement annuel.",
    freeMonths: "2 mois gratuits",
    monthly: "Mensuel",
    perMonth: "/ mois",
    perYear: "/ an",
    savePercent: "Économisez 16,67%",
    title: "Période de facturation",
  },
  checkout: {
    accountType: "Type de compte",
    confirm: "Confirmer et continuer",
    loading: "Préparation du paiement...",
    method: "Méthode de paiement",
    noPaymentMethod: "Aucune méthode sélectionnée",
    noPlan: "Aucun plan sélectionné",
    period: "Période",
    plan: "Plan",
    price: "Prix",
    saving: "Économie",
    status: "Statut du compte",
    subtitle: "Vérifiez le plan et le montant avant de continuer.",
    title: "Résumé de paiement",
  },
  comparison: {
    features: "Fonctionnalités",
    limits: "Limites",
    plan: "Plan",
    price: "Prix",
    subtitle: "Comparez rapidement les différences essentielles.",
    title: "Comparaison des plans",
  },
  current: {
    active: "Compte actif",
    changePlan: "Changer de plan",
    period: "Du {start} au {end}",
    plan: "Plan actuel",
    renew: "Renouveler",
  },
  faq: {
    items: {
      activation: {
        answer:
          "Après paiement confirmé côté backend, le compte passera au statut actif.",
        question: "Quand mon compte sera activé ?",
      },
      annual: {
        answer:
          "Oui. L'abonnement annuel applique une remise équivalente à deux mois gratuits.",
        question: "Puis-je payer annuellement ?",
      },
      cardData: {
        answer:
          "Non. Les données de carte seront traitées par une passerelle sécurisée.",
        question: "Est-ce que les données de carte sont stockées ?",
      },
      changePlan: {
        answer:
          "Oui. Le changement de plan sera géré plus tard depuis le backend d'abonnement.",
        question: "Puis-je changer de plan ?",
      },
      manual: {
        answer:
          "Oui. Le paiement manuel sera disponible avec dépôt sécurisé de preuve.",
        question: "Puis-je payer manuellement ?",
      },
      verification: {
        answer:
          "Aucun abonnement ne peut être activé avant la validation professionnelle.",
        question: "Que se passe-t-il si la vérification n'est pas validée ?",
      },
    },
    subtitle: "Réponses courtes sur l'activation, le paiement et la sécurité.",
    title: "Questions fréquentes",
  },
  header: {
    doctorSubtitle: "Choisissez le plan adapté à votre activité médicale.",
    establishmentSubtitle:
      "Choisissez le plan adapté à votre structure médicale.",
    eyebrow: "Subscription HealixDZ",
    title: "Abonnement et paiement",
  },
  manual: {
    amount: "Montant à payer",
    beneficiary: "Nom du bénéficiaire",
    description:
      "Utilisez ces informations comme instructions mock. L'envoi réel de preuve sera connecté plus tard au backend.",
    proof: "Preuve de paiement",
    proofLater: "Envoi de preuve après intégration backend.",
    reference: "Référence",
    title: "Paiement manuel",
    uploadSoon: "Envoyer la preuve bientôt disponible",
    cashActivation:
      "L'administration activera votre abonnement après réception du paiement.",
    cashButton: "Activation par l'administration",
    cashDescription:
      "Une demande de paiement cash sera créée. L'administration validera l'abonnement après réception.",
    generatedLater: "Générée après confirmation",
  },
  mock: {
    changePlanSoon: "Le changement de plan sera disponible bientôt.",
    paymentRedirect:
      "Redirection vers la passerelle de paiement bientôt disponible.",
    renewSoon: "Le renouvellement sera disponible bientôt.",
  },
  payment: {
    methodLabels: {
      BARIDIMOB_RECEIPT: "BaridiMob / CCP",
      MANUAL_CASH: "Paiement cash",
      MANUAL_POST_TRANSFER: "Virement CCP",
      SYNTHETIC_CHARGILY: "Chargily Pay démo",
    },
    methodTitle: "Méthode de paiement",
    methods: {
      baridimob: {
        description: "Paiement manuel avec envoi d'une preuve.",
        title: "BaridiMob / CCP",
      },
      chargily: {
        description: "Paiement en ligne par carte CIB ou EDAHABIA.",
        title: "Chargily Pay",
      },
      manual: {
        description: "Virement CCP avec preuve de paiement.",
        title: "Virement postal",
      },
      cash: {
        description:
          "Paiement main à main avec activation par l'administration.",
        title: "Paiement cash",
      },
    },
    recommended: "Recommandé",
  },
  paymentFlow: {
    acceptedFormats: "PDF, JPG ou PNG - 5 MB maximum",
    amount: "Montant",
    baridimobTitle: "Paiement par BaridiMob",
    cardDemo: "Carte de test démo",
    cardHolder: "Nom sur la carte",
    cardNumber: "Numéro de carte",
    ccp: "CCP HealixDZ",
    dashboard: "Retour au dashboard",
    demoNotice:
      "Cette page simule un paiement Chargily Pay. Aucun vrai paiement ne sera effectué.",
    expiry: "Expiration",
    manualTitle: "Paiement manuel par virement postal",
    loading: "Chargement...",
    pay: "Payer en mode démo",
    paymentStatus: "Statut du paiement",
    proofUpload: "Téléverser la preuve",
    psv: "PSV",
    reference: "Référence",
    rejected: "Paiement refusé.",
    security:
      "Ne saisissez jamais une vraie carte bancaire. Ce flux est strictement démo.",
    selectFile: "Choisir un fichier",
    sendReceipt: "Envoyer le reçu BaridiMob",
    sendProof: "Envoyer la preuve",
    statusTitle: "Suivi du paiement",
    syntheticTitle: "Paiement sécurisé simulé",
    testCardNumber: "1234 1234 1234 1234",
    testCardExpiry: "09/2030",
    testCardPsv: "353",
    testCardHolder: "BARKAOUI MOURAD",
    waitingAdmin:
      "Votre paiement est en attente de vérification par l'administration.",
    status: {
      CANCELED: "Annulé",
      CREATED: "Créé",
      EXPIRED: "Expiré",
      FAILED: "Échoué",
      PAID: "Payé",
      REJECTED: "Refusé",
      WAITING_ADMIN_REVIEW: "En attente de validation admin",
      WAITING_PAYMENT: "En attente de paiement",
    },
  },
  plans: {
    doctor: {
      premium: {
        description:
          "Pour médecin utilisant régulièrement les modules d'intelligence artificielle.",
        features: {
          allPro: "Toutes les fonctionnalités Pro",
          comparison: "Comparaison longitudinale",
          premiumAi: "Analyses IA premium",
          priorityAi: "Priorité de traitement IA",
          segmentation: "Segmentation médicale",
          support: "Support premium",
        },
        limits: {
          ai: "300 analyses IA / mois",
          modules: "Modules IA avancés",
          patients: "Patients illimités",
          support: "Support premium",
        },
        name: "Premium AI",
      },
      pro: {
        description: "Pour médecin actif avec un volume moyen de patients.",
        features: {
          advancedAi: "Analyses IA avancées",
          allStarter: "Toutes les fonctionnalités Starter",
          detailedReports: "Rapports détaillés",
          exportPdf: "Export PDF",
          longitudinal: "Historique longitudinal",
          prioritySupport: "Support prioritaire",
          unlimitedPatients: "Patients illimités",
        },
        limits: {
          ai: "100 analyses IA / mois",
          patients: "Patients illimités",
          reports: "Rapports détaillés",
          users: "1 utilisateur",
        },
        name: "Pro",
      },
      starter: {
        description:
          "Pour médecin indépendant ou petit cabinet avec besoins simples.",
        features: {
          ai: "Nombre limité d'analyses IA par mois",
          consultations: "Historique des consultations",
          dashboard: "Tableau de bord médecin",
          patients: "Gestion des patients",
          reports: "Rapports simples",
          support: "Support standard",
        },
        limits: {
          ai: "20 analyses IA / mois",
          patients: "100 patients",
          reports: "Rapports PDF simples",
          users: "1 utilisateur",
        },
        name: "Starter",
      },
    },
    establishment: {
      basic: {
        description:
          "Pour petite clinique, cabinet de groupe ou centre médical débutant.",
        features: {
          ai: "Analyses IA limitées",
          dashboard: "Dashboard établissement",
          doctors: "Gestion des médecins affiliés",
          patients: "Gestion des patients",
          reports: "Rapports médicaux",
          support: "Support standard",
        },
        limits: {
          ai: "100 analyses IA / mois",
          doctors: "5 médecins",
          patients: "500 patients",
          sites: "1 établissement",
        },
        name: "Basic Clinic",
      },
      custom: {
        description:
          "Pour hôpital, réseau multi-sites ou établissement nécessitant une intégration spécifique.",
        features: {
          accompaniment: "Accompagnement technique",
          deployment: "Déploiement spécifique",
          fhir: "Intégration HL7/FHIR",
          multisite: "Multi-sites",
          offer: "Offre personnalisée",
          sla: "SLA personnalisé",
          support: "Support dédié",
        },
        limits: {
          integration: "Intégration personnalisée",
          scope: "Volume sur devis",
          support: "Support dédié",
        },
        name: "Custom",
      },
      enterprise: {
        description:
          "Pour grand établissement avec plusieurs médecins, services ou volumes élevés.",
        features: {
          allPro: "Toutes les fonctionnalités Pro Center",
          audit: "Audit logs avancés",
          doctors: "Nombre élevé de médecins",
          fhir: "Préparation HL7/FHIR",
          premiumAi: "IA premium",
          roles: "Gestion avancée des rôles",
          segmentation: "Segmentation médicale",
          support: "Support premium",
        },
        limits: {
          ai: "2 000 analyses IA / mois",
          doctors: "100 médecins",
          patients: "Patients illimités",
          services: "Multi-services",
        },
        name: "Enterprise",
      },
      pro: {
        description:
          "Pour centre médical, laboratoire ou centre d'imagerie avec activité régulière.",
        features: {
          advancedAi: "Analyses IA avancées",
          allBasic: "Toutes les fonctionnalités Basic Clinic",
          detailedReports: "Rapports détaillés",
          doctors: "Médecins affiliés étendus",
          services: "Gestion multi-services",
          support: "Support prioritaire",
          unlimitedPatients: "Patients illimités",
        },
        limits: {
          ai: "500 analyses IA / mois",
          doctors: "20 médecins",
          patients: "Patients illimités",
          services: "3 services médicaux",
        },
        name: "Pro Center",
      },
    },
  },
  pricing: {
    choosePlan: "Choisir ce plan",
    contactTeam: "Contacter l'équipe HealixDZ",
    customPrice: "Sur devis",
    features: "Fonctionnalités incluses",
    limits: "Limites du plan",
    selected: "Plan sélectionné",
    subtitle: "Les plans sont affichés en lecture seule si le compte n'est pas vérifié.",
    title: "Choisissez votre abonnement",
  },
  security: {
    cardData:
      "HealixDZ ne stocke aucune donnée de carte bancaire. Le paiement en ligne sera traité via une passerelle sécurisée.",
    description:
      "Aucune donnée de carte bancaire n'est demandée sur cette page. L'activation réelle dépendra d'une confirmation backend sécurisée.",
    title: "Sécurité du paiement",
  },
  status: {
    account: {
      ACTIVE: "Compte actif",
      BASIC_ACCOUNT: "Compte non vérifié",
      PENDING_VERIFICATION: "Vérification en attente",
      REJECTED: "Compte refusé",
      SUSPENDED: "Compte suspendu",
      VERIFIED_NO_PLAN: "Compte vérifié",
    },
  },
};
