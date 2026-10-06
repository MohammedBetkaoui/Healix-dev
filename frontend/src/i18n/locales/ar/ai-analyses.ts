// Labels of the AI analyses module. The model facts themselves live in
// features/ai-analyses/ai-models.registry.ts; models.<id> is keyed by its ids.
export const aiAnalysesAr = {
  page: {
    breadcrumb: "تحاليل الذكاء الاصطناعي",
    context: "الفضاء السريري · الذكاء",
    title: "تحاليل الذكاء الاصطناعي",
    subtitle:
      "نماذج المساعدة على اتخاذ القرار حسب التخصص، مع مقاييس التحقق الداخلي وحدودها المعروفة.",
    disclaimer:
      "أداة مساعدة على اتخاذ القرار. لا تحل محل الرأي الطبي. النماذج غير معتمدة كأجهزة طبية.",
  },
  modules: {
    brain: {
      title: "تصوير الدماغ",
      description: "الرنين المغناطيسي: تصنيف أورام الدماغ وتجزئتها.",
    },
    cardiology: {
      title: "طب القلب",
      description: "أشعة الصدر وتجزئة القلب.",
    },
    pathology: {
      title: "علم الأمراض",
      description: "التشريح المرضي النسيجي: نماذج قيد الدراسة.",
    },
  },
  statuses: {
    available: "متاح",
    in_design: "قيد التصميم",
    exploring: "قيد الاستكشاف",
  },
  tasks: {
    classification: "تصنيف",
    segmentation: "تجزئة",
  },
  modalities: {
    brainMri2d: "رنين مغناطيسي للدماغ ثنائي الأبعاد",
    brainMri: "رنين مغناطيسي للدماغ",
    brainMriT1ceToFlair: "رنين مغناطيسي للدماغ (T1ce → FLAIR)",
    chestXray: "صورة أشعة للصدر",
    cardiacCineMri: "رنين مغناطيسي قلبي سينمائي",
    cardiacCt: "تصوير مقطعي للقلب",
    histopathology: "صور التشريح المرضي النسيجي",
  },
  classes: {
    glioma: "ورم دبقي",
    meningioma: "ورم سحائي",
    notumor: "لا يوجد ورم",
    pituitary: "ورم الغدة النخامية",
    normal: "طبيعي",
    cardiomegaly: "تضخم القلب",
    effusion: "انصباب",
    edema: "وذمة",
    leftVentricle: "البطين الأيسر (LV)",
    rightVentricle: "البطين الأيمن (RV)",
    myocardium: "عضلة القلب (MYO)",
    nuclei: "أنوية الخلايا",
  },
  metrics: {
    cvAccuracy: "الدقة (التحقق المتقاطع)",
    auc: "AUC",
    dice: "Dice",
  },
  limitations: {
    notCertified: "غير معتمد كجهاز طبي: أداة مساعدة على اتخاذ القرار فقط.",
    internalValidation:
      "مقاييس ناتجة عن تحقق داخلي: يجب تأكيد الأداء على بيانات مؤسستكم.",
    undocumentedPerformance: "الأداء غير موثق حتى الآن.",
    closedSet:
      "لا يتعرف إلا على الفئات المدرجة: لا يمكنه الإشارة إلى حالة من نوع آخر بصفتها تلك.",
    singleSlice:
      "تحليل صور ثنائية الأبعاد: لا يؤخذ السياق الحجمي للفحص (المقاطع الأخرى) بعين الاعتبار.",
  },
  models: {
    "brain-efficientnetb4-tumor-classification": {
      name: "EfficientNetB4",
      intendedUse:
        "المساعدة على تصنيف صور الرنين المغناطيسي للدماغ ثنائية الأبعاد: ورم دبقي أو ورم سحائي أو ورم الغدة النخامية أو عدم وجود ورم.",
    },
    "brain-unet-glioma-segmentation": {
      name: "U-Net الورم الدبقي",
      intendedUse: "المساعدة على تحديد حدود الأورام الدبقية.",
    },
    "brain-unet-meningioma-segmentation": {
      name: "U-Net الورم السحائي",
      intendedUse: "المساعدة على تحديد حدود الأورام السحائية في الرنين المغناطيسي للدماغ.",
    },
    "brain-unet-pituitary-segmentation": {
      name: "U-Net الغدة النخامية",
      intendedUse: "المساعدة على تحديد حدود أورام الغدة النخامية في الرنين المغناطيسي للدماغ.",
    },
    "brain-flair-segmentation": {
      name: "تجزئة FLAIR",
      intendedUse: "المساعدة على التجزئة في الرنين المغناطيسي للدماغ (T1ce → FLAIR).",
    },
    "cardiology-densenet121-chest-xray": {
      name: "DenseNet121",
      intendedUse:
        "المساعدة على تصنيف صور أشعة الصدر: طبيعي أو تضخم القلب أو انصباب أو وذمة.",
    },
    "cardiology-acdc-segmentation": {
      name: "ACDC (LV + RV + MYO)",
      intendedUse:
        "مُخطَّط: تجزئة البطين الأيسر والبطين الأيمن وعضلة القلب في الرنين المغناطيسي القلبي السينمائي.",
    },
    "cardiology-ct-heart-segmentation": {
      name: "CT Heart",
      intendedUse: "مُخطَّط: تجزئة القلب في التصوير المقطعي.",
    },
    "pathology-hovernet-nuclei-segmentation": {
      name: "HoVer-Net",
      intendedUse: "قيد الدراسة: تجزئة أنوية الخلايا في صور التشريح المرضي النسيجي.",
    },
    "pathology-breakhis-classification": {
      name: "BreakHis",
      intendedUse: "قيد الدراسة: تصنيف صور التشريح المرضي النسيجي.",
    },
  },
  card: {
    version: "الإصدار",
    task: "المهمة",
    modality: "نوع التصوير",
    mainMetric: "المقياس الرئيسي",
    internalValidation: "تحقق داخلي",
    notProvided: "غير محدد",
    openSheet: "بطاقة النموذج",
    openSheetFor: "بطاقة النموذج: {name}",
    newAnalysis: "تحليل جديد",
    nextStep: "متاح في المرحلة التالية",
    comingSoon: "قريبًا",
  },
  sheet: {
    eyebrow: "بطاقة النموذج",
    close: "إغلاق البطاقة",
    architecture: "البنية",
    version: "الإصدار",
    intendedUse: "الاستخدام المقصود",
    inputs: "المدخلات",
    modality: "نوع التصوير",
    formats: "الصيغ المقبولة",
    outputs: "المخرجات",
    task: "المهمة",
    classes: "فئات المخرجات",
    trainingData: "بيانات التدريب",
    metrics: "المقاييس",
    metric: "المقياس",
    value: "القيمة",
    dataset: "مجموعة البيانات",
    metricsNote: "تحقق داخلي: يجب تأكيد الأداء على بياناتكم.",
    limitations: "الحدود المعروفة",
    populations: "الفئات السكانية غير الممثلة",
  },
} as const;
