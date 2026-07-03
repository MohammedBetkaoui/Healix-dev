export const subscriptionAr = {
  access: {
    active: {
      description:
        "حسابك مفعل. يمكنك تجديد الاشتراك أو تغيير الباقة حسب احتياجاتك.",
      title: "الحساب مفعل",
    },
    pending: {
      action: "عرض حالة التحقق",
      description:
        "طلب التحقق الخاص بك قيد المراجعة من طرف إدارة HealixDZ. يمكنك اختيار اشتراك بعد قبول التحقق.",
      title: "التحقق قيد المراجعة",
    },
    rejected: {
      action: "تصحيح التحقق",
      description:
        "تم رفض طلب التحقق. يرجى تصحيح المعلومات أو الوثائق المطلوبة ثم إرسال الطلب من جديد.",
      title: "تم رفض التحقق",
    },
    suspended: {
      description:
        "حسابك معلق. يرجى التواصل مع إدارة HealixDZ قبل أي إجراء متعلق بالاشتراك أو الدفع.",
      title: "الحساب معلق",
    },
    unverified: {
      action: "إكمال التحقق",
      description:
        "حسابك غير موثق بعد. يجب إكمال التحقق المهني قبل تفعيل أي اشتراك.",
      title: "الحساب غير موثق",
    },
    verified: {
      description:
        "حسابك موثق. اختر اشتراكًا لتفعيل الوظائف الطبية الحقيقية.",
      title: "الحساب موثق",
    },
  },
  accountType: {
    ESTABLISHMENT: "مؤسسة صحية",
    INDEPENDENT_DOCTOR: "طبيب مستقل",
  },
  badges: {
    popular: "الأكثر اختيارًا",
    recommended: "موصى به",
  },
  billing: {
    annual: "سنوي",
    annualSaving: "وفر 16.67% مع الاشتراك السنوي.",
    freeMonths: "شهران مجانًا",
    monthly: "شهري",
    perMonth: "/ شهر",
    perYear: "/ سنة",
    savePercent: "وفر 16.67%",
    title: "فترة الفوترة",
  },
  checkout: {
    accountType: "نوع الحساب",
    confirm: "تأكيد والمتابعة",
    loading: "جاري تحضير الدفع...",
    method: "طريقة الدفع",
    noPaymentMethod: "لم يتم اختيار طريقة دفع",
    noPlan: "لم يتم اختيار أي باقة",
    period: "الفترة",
    plan: "الباقة",
    price: "السعر",
    saving: "التوفير",
    status: "حالة الحساب",
    subtitle: "راجع الباقة والمبلغ قبل المتابعة.",
    title: "ملخص الدفع",
  },
  comparison: {
    features: "الميزات",
    limits: "الحدود",
    plan: "الباقة",
    price: "السعر",
    subtitle: "قارن بسرعة الفروقات الأساسية.",
    title: "مقارنة الباقات",
  },
  current: {
    active: "الحساب مفعل",
    changePlan: "تغيير الباقة",
    period: "من {start} إلى {end}",
    plan: "الباقة الحالية",
    renew: "تجديد",
  },
  faq: {
    items: {
      activation: {
        answer:
          "بعد تأكيد الدفع من طرف backend سيتم تحويل الحساب إلى الحالة المفعلة.",
        question: "متى يتم تفعيل حسابي؟",
      },
      annual: {
        answer: "نعم. الاشتراك السنوي يمنح خصمًا يعادل شهرين مجانًا.",
        question: "هل يمكنني الدفع سنويًا؟",
      },
      cardData: {
        answer: "لا. بيانات البطاقة ستتم معالجتها عبر بوابة دفع آمنة.",
        question: "هل يتم تخزين بيانات البطاقة؟",
      },
      changePlan: {
        answer:
          "نعم. تغيير الباقة سيتم لاحقًا عبر نظام الاشتراكات في backend.",
        question: "هل يمكنني تغيير الباقة؟",
      },
      manual: {
        answer: "نعم. الدفع اليدوي سيكون متاحًا مع رفع آمن لإثبات الدفع.",
        question: "هل يمكنني الدفع يدويًا؟",
      },
      verification: {
        answer: "لا يمكن تفعيل أي اشتراك قبل قبول التحقق المهني.",
        question: "ماذا يحدث إذا لم يتم قبول التحقق؟",
      },
    },
    subtitle: "إجابات مختصرة حول التفعيل والدفع والأمان.",
    title: "الأسئلة الشائعة",
  },
  header: {
    doctorSubtitle: "اختر الباقة المناسبة لنشاطك الطبي.",
    establishmentSubtitle: "اختر الباقة المناسبة لمؤسستك الطبية.",
    eyebrow: "اشتراك HealixDZ",
    title: "الاشتراك والدفع",
  },
  manual: {
    amount: "المبلغ المطلوب",
    beneficiary: "اسم المستفيد",
    description:
      "هذه تعليمات تجريبية فقط. إرسال إثبات الدفع الحقيقي سيتم ربطه لاحقًا مع backend.",
    proof: "إثبات الدفع",
    proofLater: "إرسال الإثبات بعد ربط backend.",
    reference: "المرجع",
    title: "الدفع اليدوي",
    uploadSoon: "إرسال الإثبات سيكون متاحًا قريبًا",
    cashActivation: "ستقوم الإدارة بتفعيل الاشتراك بعد استلام الدفع.",
    cashButton: "التفعيل من طرف الإدارة",
    cashDescription:
      "سيتم إنشاء طلب دفع نقدي. تقوم الإدارة بتفعيل الاشتراك بعد استلام المبلغ.",
    generatedLater: "يتم إنشاؤه بعد التأكيد",
  },
  mock: {
    changePlanSoon: "تغيير الباقة سيكون متاحًا قريبًا.",
    paymentRedirect: "إعادة التوجيه إلى بوابة الدفع ستكون متاحة قريبًا.",
    renewSoon: "تجديد الاشتراك سيكون متاحًا قريبًا.",
  },
  payment: {
    methodLabels: {
      BARIDIMOB_RECEIPT: "BaridiMob / CCP",
      MANUAL_CASH: "الدفع نقدًا",
      MANUAL_POST_TRANSFER: "تحويل CCP",
      SYNTHETIC_CHARGILY: "Chargily Pay تجريبي",
    },
    methodTitle: "طريقة الدفع",
    methods: {
      baridimob: {
        description: "دفع يدوي مع إرسال إثبات الدفع.",
        title: "BaridiMob / CCP",
      },
      chargily: {
        description: "دفع عبر الإنترنت باستعمال بطاقة CIB أو الذهبية.",
        title: "Chargily Pay",
      },
      manual: {
        description: "تحويل CCP مع إثبات الدفع.",
        title: "تحويل بريدي",
      },
      cash: {
        description: "دفع نقدي مع تفعيل الاشتراك من طرف الإدارة.",
        title: "الدفع نقدًا",
      },
    },
    recommended: "موصى به",
  },
  paymentFlow: {
    acceptedFormats: "PDF أو JPG أو PNG - الحجم الأقصى 5 MB",
    amount: "المبلغ",
    baridimobTitle: "الدفع عبر BaridiMob",
    cardDemo: "بطاقة اختبار تجريبية",
    cardHolder: "الاسم على البطاقة",
    cardNumber: "رقم البطاقة",
    ccp: "CCP HealixDZ",
    dashboard: "العودة إلى لوحة التحكم",
    demoNotice:
      "هذه الصفحة تحاكي دفع Chargily Pay. لن يتم تنفيذ أي دفع حقيقي.",
    expiry: "تاريخ الانتهاء",
    manualTitle: "الدفع اليدوي عبر تحويل بريدي",
    loading: "جاري التحميل...",
    pay: "الدفع في الوضع التجريبي",
    paymentStatus: "حالة الدفع",
    proofUpload: "رفع إثبات الدفع",
    psv: "PSV",
    reference: "المرجع",
    rejected: "تم رفض الدفع.",
    security:
      "لا تُدخل أبدًا بطاقة بنكية حقيقية. هذا المسار مخصص للتجربة فقط.",
    selectFile: "اختيار ملف",
    sendReceipt: "إرسال وصل BaridiMob",
    sendProof: "إرسال الإثبات",
    statusTitle: "متابعة الدفع",
    syntheticTitle: "دفع آمن محاكى",
    testCardNumber: "1234 1234 1234 1234",
    testCardExpiry: "09/2030",
    testCardPsv: "353",
    testCardHolder: "BARKAOUI MOURAD",
    waitingAdmin: "الدفع في انتظار التحقق من طرف الإدارة.",
    status: {
      CANCELED: "ملغى",
      CREATED: "تم إنشاؤه",
      EXPIRED: "منتهي",
      FAILED: "فشل",
      PAID: "مدفوع",
      REJECTED: "مرفوض",
      WAITING_ADMIN_REVIEW: "في انتظار مراجعة الإدارة",
      WAITING_PAYMENT: "في انتظار الدفع",
    },
  },
  plans: {
    doctor: {
      premium: {
        description:
          "للطبيب الذي يستخدم وحدات الذكاء الاصطناعي بشكل منتظم.",
        features: {
          allPro: "كل ميزات Pro",
          comparison: "مقارنة طولية",
          premiumAi: "تحاليل ذكاء اصطناعي Premium",
          priorityAi: "أولوية معالجة الذكاء الاصطناعي",
          segmentation: "تقسيم طبي ذكي",
          support: "دعم Premium",
        },
        limits: {
          ai: "300 تحليل ذكاء اصطناعي / شهر",
          modules: "وحدات ذكاء اصطناعي متقدمة",
          patients: "مرضى غير محدودين",
          support: "دعم Premium",
        },
        name: "الذكاء الاصطناعي المتقدم",
      },
      pro: {
        description: "للطبيب النشط مع حجم متوسط من المرضى.",
        features: {
          advancedAi: "تحاليل ذكاء اصطناعي متقدمة",
          allStarter: "كل ميزات Starter",
          detailedReports: "تقارير مفصلة",
          exportPdf: "تصدير PDF",
          longitudinal: "تاريخ طبي طولي",
          prioritySupport: "دعم ذو أولوية",
          unlimitedPatients: "مرضى غير محدودين",
        },
        limits: {
          ai: "100 تحليل ذكاء اصطناعي / شهر",
          patients: "مرضى غير محدودين",
          reports: "تقارير مفصلة",
          users: "مستخدم واحد",
        },
        name: "الباقة الاحترافية",
      },
      starter: {
        description: "لطبيب مستقل أو عيادة صغيرة باحتياجات بسيطة.",
        features: {
          ai: "عدد محدود من تحاليل الذكاء الاصطناعي شهريًا",
          consultations: "تاريخ الاستشارات",
          dashboard: "لوحة تحكم الطبيب",
          patients: "إدارة المرضى",
          reports: "تقارير بسيطة",
          support: "دعم عادي",
        },
        limits: {
          ai: "20 تحليل ذكاء اصطناعي / شهر",
          patients: "100 مريض",
          reports: "تقارير PDF بسيطة",
          users: "مستخدم واحد",
        },
        name: "الباقة الأساسية",
      },
    },
    establishment: {
      basic: {
        description: "لعيادة صغيرة أو مجموعة طبية أو مركز طبي في البداية.",
        features: {
          ai: "تحاليل ذكاء اصطناعي محدودة",
          dashboard: "لوحة تحكم المؤسسة",
          doctors: "إدارة الأطباء المرتبطين",
          patients: "إدارة المرضى",
          reports: "تقارير طبية",
          support: "دعم عادي",
        },
        limits: {
          ai: "100 تحليل ذكاء اصطناعي / شهر",
          doctors: "5 أطباء",
          patients: "500 مريض",
          sites: "مؤسسة واحدة",
        },
        name: "العيادة الأساسية",
      },
      custom: {
        description:
          "لمستشفى أو شبكة متعددة المواقع أو مؤسسة تحتاج إلى تكامل خاص.",
        features: {
          accompaniment: "مرافقة تقنية",
          deployment: "نشر خاص",
          fhir: "تكامل HL7/FHIR",
          multisite: "عدة مواقع",
          offer: "عرض مخصص",
          sla: "اتفاقية خدمة مخصصة",
          support: "دعم مخصص",
        },
        limits: {
          integration: "تكامل مخصص",
          scope: "الحجم حسب العرض",
          support: "دعم مخصص",
        },
        name: "عرض مخصص",
      },
      enterprise: {
        description:
          "لمؤسسة كبيرة مع عدة أطباء أو خدمات أو حجم نشاط مرتفع.",
        features: {
          allPro: "كل ميزات Pro Center",
          audit: "سجلات تدقيق متقدمة",
          doctors: "عدد كبير من الأطباء",
          fhir: "تحضير HL7/FHIR",
          premiumAi: "ذكاء اصطناعي Premium",
          roles: "إدارة متقدمة للأدوار",
          segmentation: "تقسيم طبي",
          support: "دعم Premium",
        },
        limits: {
          ai: "2,000 تحليل ذكاء اصطناعي / شهر",
          doctors: "100 طبيب",
          patients: "مرضى غير محدودين",
          services: "عدة خدمات",
        },
        name: "المؤسسات الكبرى",
      },
      pro: {
        description: "لمركز طبي أو مخبر أو مركز تصوير بنشاط منتظم.",
        features: {
          advancedAi: "تحاليل ذكاء اصطناعي متقدمة",
          allBasic: "كل ميزات Basic Clinic",
          detailedReports: "تقارير مفصلة",
          doctors: "أطباء مرتبطون أكثر",
          services: "إدارة عدة خدمات",
          support: "دعم ذو أولوية",
          unlimitedPatients: "مرضى غير محدودين",
        },
        limits: {
          ai: "500 تحليل ذكاء اصطناعي / شهر",
          doctors: "20 طبيبًا",
          patients: "مرضى غير محدودين",
          services: "3 خدمات طبية",
        },
        name: "المركز الاحترافي",
      },
    },
  },
  pricing: {
    choosePlan: "اختيار هذه الباقة",
    contactTeam: "التواصل مع فريق HealixDZ",
    customPrice: "حسب العرض",
    features: "الميزات المتوفرة",
    limits: "حدود الباقة",
    selected: "تم اختيار الباقة",
    subtitle: "تظهر الباقات للقراءة فقط إذا لم يكن الحساب موثقًا.",
    title: "اختر الاشتراك المناسب",
  },
  security: {
    cardData:
      "لا تقوم HealixDZ بتخزين أي بيانات خاصة بالبطاقة البنكية. سيتم الدفع عبر بوابة دفع آمنة.",
    description:
      "لا يتم طلب أي بيانات بطاقة في هذه الصفحة. التفعيل الحقيقي يعتمد على تأكيد آمن من backend.",
    title: "أمان الدفع",
  },
  status: {
    account: {
      ACTIVE: "الحساب مفعل",
      BASIC_ACCOUNT: "الحساب غير موثق",
      PENDING_VERIFICATION: "التحقق قيد المراجعة",
      REJECTED: "الحساب مرفوض",
      SUSPENDED: "الحساب معلق",
      VERIFIED_NO_PLAN: "الحساب موثق",
    },
  },
};
