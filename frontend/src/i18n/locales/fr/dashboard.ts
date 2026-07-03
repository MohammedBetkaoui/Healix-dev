export const dashboardFr = {
  common: {
    roles: {
      establishment: "Établissement de santé",
      doctor: "Médecin indépendant",
    },
    breadcrumb: {
      pages: "Pages",
      dashboard: "Dashboard",
    },
    title: "Tableau de bord",
    demoBadge: "Mode démo",
    header: {
      searchPlaceholder: "Rechercher patient, rapport, analyse...",
      secureWorkspace: "Espace sécurisé",
    },
    accountStatus: {
      label: "Statut du compte",
      value: "BASIC_ACCOUNT",
      action: "Vérifier",
      statusCardTitle: "Compte en démonstration",
      statusCardDescription:
        "Votre compte est actuellement en mode démonstration. Pour accéder aux fonctionnalités médicales réelles, veuillez compléter la vérification professionnelle.",
      startVerification: "Commencer la vérification",
      actions: {
        correct: "Corriger la vérification",
        start: "Commencer la vérification",
      },
      descriptions: {
        active:
          "Votre compte est actif. Les fonctionnalités médicales réelles peuvent être utilisées selon votre abonnement et vos autorisations.",
        basic:
          "Votre compte est actuellement en mode démonstration. Pour accéder aux fonctionnalités médicales réelles, veuillez compléter la vérification professionnelle.",
        loading: "Chargement du statut de votre compte...",
        paymentPending:
          "Votre vérification est validée. L'activation complète dépend maintenant du paiement ou de l'abonnement.",
        pending:
          "Votre demande de vérification est en cours d'examen par l'administration HealixDZ.",
        rejected:
          "Votre demande de vérification a été refusée. Vous pouvez corriger les informations ou documents demandés.",
        suspended:
          "Votre compte est suspendu. Contactez l'administration HealixDZ pour plus d'informations.",
        unknown:
          "Impossible de confirmer le statut du compte pour le moment. Veuillez réessayer dans quelques instants.",
        verified:
          "Votre vérification professionnelle est validée. La prochaine étape concerne l'abonnement ou l'activation du plan.",
      },
      footers: {
        active: "Accès réel actif",
        basic: "Mode démo",
        loading: "Synchronisation",
        paymentPending: "Paiement requis",
        pending: "En attente admin",
        rejected: "Correction requise",
        suspended: "Accès suspendu",
        unknown: "Statut indisponible",
        verified: "Compte vérifié",
      },
      hints: {
        active: "Accès réel actif",
        basic: "Accès démo actif",
        loading: "Synchronisation...",
        paymentPending: "Paiement en attente",
        pending: "Validation admin en cours",
        rejected: "Correction nécessaire",
        suspended: "Accès temporairement bloqué",
        unknown: "Statut à recharger",
        verified: "Vérification validée",
      },
      statusLabels: {
        active: "Compte actif",
        basic: "Mode démonstration",
        loading: "Chargement...",
        paymentPending: "Paiement en attente",
        pending: "En cours de vérification",
        rejected: "Vérification refusée",
        suspended: "Compte suspendu",
        unknown: "Indisponible",
        verified: "Compte vérifié",
      },
      titles: {
        active: "Compte actif",
        basic: "Compte en démonstration",
        loading: "Statut du compte",
        paymentPending: "Paiement en attente",
        pending: "Vérification en cours",
        rejected: "Vérification à corriger",
        suspended: "Compte suspendu",
        unknown: "Statut indisponible",
        verified: "Compte vérifié",
      },
    },
    actions: {
      profile: "Profil",
      notifications: "Notifications",
      theme: "Thème",
      menu: "Menu",
    },
    status: {
      completed: "Terminé",
      generated: "Généré",
      created: "Créé",
      pending: "En attente",
    },
    charts: {
      legendPrimary: "Analyses",
      legendSecondary: "Dossiers",
      days30: "30 derniers jours",
    },
  },
  sidebar: {
    collapse: "Reduire la barre laterale",
    expand: "Afficher la barre laterale",
    sections: {
      clinic: "CLINIQUE",
      ai: "INTELLIGENCE ARTIFICIELLE",
      communication: "COMMUNICATION",
      account: "COMPTE",
      workspace: "Espace HealixDZ",
      profile: "Profil professionnel",
    },
    establishment: {
      dashboard: "Tableau de bord",
      patients: "Patients",
      doctors: "Médecins",
      appointments: "Rendez-vous",
      prescriptions: "Prescriptions",
      consultations: "Consultations",
      analyses: "Analyses IA",
      lab: "Laboratoire",
      reports: "Rapports",
      messages: "Messages",
      notifications: "Notifications",
      verification: "Vérification",
      subscription: "Abonnement",
      settings: "Paramètres",
      logout: "Déconnexion",
    },
    doctor: {
      dashboard: "Tableau de bord",
      patients: "Mes patients",
      appointments: "Rendez-vous",
      prescriptions: "Prescriptions",
      consultations: "Consultations",
      analyses: "Nouvelle analyse IA",
      lab: "Laboratoire",
      reports: "Mes rapports",
      messages: "Messages",
      notifications: "Notifications",
      verification: "Vérification",
      subscription: "Abonnement",
      settings: "Paramètres",
      logout: "Déconnexion",
    },
  },
  establishment: {
    title: "Tableau de bord établissement",
    stats: {
      patients: {
        label: "Patients enregistrés",
        hint: "+12 ce mois",
      },
      doctors: {
        label: "Médecins affiliés",
        hint: "+2 ce mois",
      },
      analyses: {
        label: "Analyses IA",
        hint: "+18%",
      },
      account: {
        label: "Statut du compte",
        hint: "Accès démo actif",
      },
    },
    charts: {
      activityTitle: "Activité médicale",
      activitySubtitle:
        "Analyses et dossiers créés durant les 30 derniers jours",
      distributionTitle: "Répartition des analyses IA",
      distributionSubtitle: "Volumes simulés par catégorie",
      distribution: {
        brain: "Brain MRI",
        cardiology: "Cardiology",
        reports: "Reports",
        pending: "Pending",
      },
    },
    table: {
      title: "Activité récente",
      columns: {
        type: "Type",
        patient: "Patient",
        date: "Date",
        status: "Statut",
        cta: "Action",
      },
      rows: {
        analysis: "Analyse IA",
        report: "Rapport PDF",
        record: "Dossier médical",
        patient1: "Patient démo 01",
        patient2: "Patient démo 02",
        patient3: "Patient démo 03",
        today: "Aujourd’hui",
        yesterday: "Hier",
        june12: "12 juin",
        open: "Ouvrir",
      },
    },
    quickActions: {
      title: "Actions rapides",
      addPatient: {
        label: "Ajouter patient",
        description: "Créer une fiche patient fictive pour le mode démo.",
      },
      inviteDoctor: {
        label: "Inviter médecin",
        description:
          "Préparer l’accès d’un praticien avant validation professionnelle.",
      },
      newAnalysis: {
        label: "Nouvelle analyse IA",
        description:
          "Lancer un workflow d’imagerie simulé avec résultats de démonstration.",
      },
      verification: {
        label: "Continuer vérification",
        description:
          "Compléter les étapes nécessaires pour débloquer l’usage réel.",
      },
    },
  },
  doctor: {
    title: "Tableau de bord médecin indépendant",
    stats: {
      patients: {
        label: "Mes patients",
        hint: "+4 ce mois",
      },
      analyses: {
        label: "Analyses IA",
        hint: "+11%",
      },
      reports: {
        label: "Rapports générés",
        hint: "+6 ce mois",
      },
      account: {
        label: "Statut du compte",
        hint: "Accès démo actif",
      },
    },
    charts: {
      activityTitle: "Activité de consultation",
      activitySubtitle: "Patients et analyses sur les 30 derniers jours",
      distributionTitle: "Types d’analyses",
      distributionSubtitle: "Répartition simulée des usages",
      distribution: {
        brain: "Brain",
        cardiology: "Cardiology",
        reports: "Reports",
        pending: "Pending",
      },
    },
    table: {
      title: "Dernières activités",
      columns: {
        action: "Action",
        patient: "Patient",
        date: "Date",
        status: "Statut",
      },
      rows: {
        analysis: "Analyse IA",
        report: "Rapport PDF",
        consultation: "Consultation",
        patient1: "Patient démo 07",
        patient2: "Patient démo 08",
        patient3: "Patient démo 09",
        today: "Aujourd’hui",
        yesterday: "Hier",
        june12: "12 juin",
      },
    },
    quickActions: {
      title: "Actions rapides",
      addPatient: {
        label: "Ajouter patient",
        description: "Créer une fiche de suivi de démonstration.",
      },
      newAnalysis: {
        label: "Nouvelle analyse IA",
        description: "Préparer une analyse simulée en quelques étapes.",
      },
      generateReport: {
        label: "Générer rapport",
        description: "Créer un rapport PDF fictif prêt à partager.",
      },
      verification: {
        label: "Continuer vérification",
        description:
          "Compléter la validation professionnelle pour activer l’usage réel.",
      },
    },
  },
} as const;
