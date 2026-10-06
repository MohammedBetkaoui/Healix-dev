// Labels of the AI analyses module. The model facts themselves live in
// features/ai-analyses/ai-models.registry.ts; models.<id> is keyed by its ids.
export const aiAnalysesFr = {
  page: {
    breadcrumb: "Analyses IA",
    context: "Espace clinique · Intelligence",
    title: "Analyses IA",
    subtitle:
      "Modèles d’aide à la décision par spécialité, avec leurs métriques de validation interne et leurs limites connues.",
    disclaimer:
      "Aide à la décision. Ne remplace pas l’avis médical. Modèles non certifiés comme dispositifs médicaux.",
  },
  modules: {
    brain: {
      title: "Imagerie cérébrale",
      description: "IRM : classification et segmentation des tumeurs cérébrales.",
    },
    cardiology: {
      title: "Cardiologie",
      description: "Radiographie thoracique et segmentation cardiaque.",
    },
    pathology: {
      title: "Pathologie",
      description: "Histopathologie : modèles à l’étude.",
    },
  },
  statuses: {
    available: "Disponible",
    in_design: "En conception",
    exploring: "En exploration",
  },
  tasks: {
    classification: "Classification",
    segmentation: "Segmentation",
  },
  modalities: {
    brainMri2d: "IRM cérébrale 2D",
    brainMri: "IRM cérébrale",
    brainMriT1ceToFlair: "IRM cérébrale (T1ce → FLAIR)",
    chestXray: "Radiographie thoracique",
    cardiacCineMri: "IRM cardiaque ciné",
    cardiacCt: "Scanner cardiaque",
    histopathology: "Images d’histopathologie",
  },
  classes: {
    glioma: "Gliome",
    meningioma: "Méningiome",
    notumor: "Pas de tumeur",
    pituitary: "Tumeur hypophysaire",
    normal: "Normal",
    cardiomegaly: "Cardiomégalie",
    effusion: "Épanchement",
    edema: "Œdème",
    leftVentricle: "Ventricule gauche (VG)",
    rightVentricle: "Ventricule droit (VD)",
    myocardium: "Myocarde (MYO)",
    nuclei: "Noyaux cellulaires",
  },
  metrics: {
    cvAccuracy: "Exactitude (validation croisée)",
    auc: "AUC",
    dice: "Dice",
  },
  limitations: {
    notCertified: "Non certifié comme dispositif médical : aide à la décision uniquement.",
    internalValidation:
      "Métriques issues d’une validation interne : performances à confirmer sur les données de votre établissement.",
    undocumentedPerformance: "Performances non documentées à ce jour.",
    closedSet:
      "Ne reconnaît que les classes listées : une anomalie d’un autre type ne peut pas être signalée comme telle.",
    singleSlice:
      "Analyse d’images 2D : le contexte volumique de l’examen (autres coupes) n’est pas pris en compte.",
  },
  models: {
    "brain-efficientnetb4-tumor-classification": {
      name: "EfficientNetB4",
      intendedUse:
        "Aide à la classification d’IRM cérébrales 2D : gliome, méningiome, tumeur hypophysaire ou absence de tumeur.",
    },
    "brain-unet-glioma-segmentation": {
      name: "U-Net gliome",
      intendedUse: "Aide à la délimitation des gliomes.",
    },
    "brain-unet-meningioma-segmentation": {
      name: "U-Net méningiome",
      intendedUse: "Aide à la délimitation des méningiomes sur IRM cérébrale.",
    },
    "brain-unet-pituitary-segmentation": {
      name: "U-Net hypophyse",
      intendedUse: "Aide à la délimitation des tumeurs hypophysaires sur IRM cérébrale.",
    },
    "brain-flair-segmentation": {
      name: "Segmentation FLAIR",
      intendedUse: "Aide à la segmentation sur IRM cérébrale (T1ce → FLAIR).",
    },
    "cardiology-densenet121-chest-xray": {
      name: "DenseNet121",
      intendedUse:
        "Aide à la classification de radiographies thoraciques : normal, cardiomégalie, épanchement ou œdème.",
    },
    "cardiology-acdc-segmentation": {
      name: "ACDC (VG + VD + MYO)",
      intendedUse:
        "Prévu : segmentation du ventricule gauche, du ventricule droit et du myocarde sur IRM cardiaque ciné.",
    },
    "cardiology-ct-heart-segmentation": {
      name: "CT Heart",
      intendedUse: "Prévu : segmentation cardiaque sur scanner.",
    },
    "pathology-hovernet-nuclei-segmentation": {
      name: "HoVer-Net",
      intendedUse: "À l’étude : segmentation des noyaux cellulaires sur images d’histopathologie.",
    },
    "pathology-breakhis-classification": {
      name: "BreakHis",
      intendedUse: "À l’étude : classification d’images d’histopathologie.",
    },
  },
  card: {
    version: "Version",
    task: "Tâche",
    modality: "Modalité",
    mainMetric: "Métrique principale",
    internalValidation: "validation interne",
    notProvided: "Non renseigné",
    openSheet: "Fiche modèle",
    openSheetFor: "Fiche modèle : {name}",
    newAnalysis: "Nouvelle analyse",
    nextStep: "Disponible à l’étape suivante",
    comingSoon: "Bientôt",
  },
  sheet: {
    eyebrow: "Fiche modèle",
    close: "Fermer la fiche",
    architecture: "Architecture",
    version: "Version",
    intendedUse: "Usage prévu",
    inputs: "Entrées",
    modality: "Modalité",
    formats: "Formats acceptés",
    outputs: "Sorties",
    task: "Tâche",
    classes: "Classes de sortie",
    trainingData: "Données d’entraînement",
    metrics: "Métriques",
    metric: "Métrique",
    value: "Valeur",
    dataset: "Jeu de données",
    metricsNote: "Validation interne : performances à confirmer sur vos propres données.",
    limitations: "Limites connues",
    populations: "Populations non représentées",
  },
} as const;
