export const loginAr = {
  metadata: {
    title: "تسجيل الدخول | HealixDZ",
    description: "سجّل الدخول إلى فضائك الطبي الذكي على HealixDZ.",
  },
  brandSubtitle: "المنصة الطبية الجزائرية",
  page: {
    title: "تسجيل الدخول",
    subtitle: "ادخل إلى فضائك الطبي الآمن.",
  },
  hero: {
    compliance: "متوافق مع القانون 18-07",
    titleLead: "ولوج سريري،",
    titleAccent: "هادئ",
    titleEnd: "وآمن بدقة.",
    title: "مرحبًا بك في HealixDZ",
    subtitle: "سجّل الدخول إلى فضائك الطبي الذكي.",
    description:
      "سجّل الدخول إلى HealixDz لإدارة المواعيد والملفات والتحليلات المدعومة بالذكاء الاصطناعي والعمليات الطبية الحيوية، من فضاء صُمّم لوتيرة فرق الرعاية الصحية.",
    stats: {
      sessions: {
        label: "الجلسات",
        value: "AES-256",
        description: "تشفير البيانات",
      },
      availability: {
        label: "التوافر",
        value: "99.9%",
        description: "خدمة سريرية",
      },
      audit: {
        label: "التدقيق",
        value: "10 سنوات",
        description: "مدة الاحتفاظ",
      },
    },
    cards: {
      secureSpace: {
        title: "فضاء آمن",
        description: "وصول محمي للحسابات المهنية.",
      },
      demoMode: {
        title: "الوضع التجريبي",
        description: "استكشف المنصة ببيانات تجريبية.",
      },
      professionalVerification: {
        title: "التحقق المهني",
        description: "الوصول الحقيقي يتطلب التحقق.",
      },
      medicalAi: {
        title: "ذكاء اصطناعي طبي",
        description: "تحليل ذكي للصور الطبية.",
      },
    },
    trust: {
      title: "الأمان والخصوصية",
      description:
        "معلومات تسجيل الدخول الخاصة بك محمية. الوصول إلى البيانات الطبية الحقيقية يتطلب تحققًا مهنيًا.",
    },
  },
  form: {
    eyebrow: "المصادقة",
    accountTypeLabel: "الملف",
    optional: "اختياري",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "admin@clinique.dz",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "كلمة المرور الخاصة بك",
    rememberMe: "إبقاء الجلسة نشطة",
    forgotPassword: "هل نسيت كلمة المرور؟",
    submit: "تسجيل الدخول",
    loading: "جاري تسجيل الدخول...",
    ssoComingSoon: "الدخول الموحّد متاح قريبًا",
    signUpPrompt: "ليس لديك حساب؟",
    signUpLink: "إنشاء حساب جديد",
  },
  accountType: {
    establishment: "مؤسسة صحية",
    establishmentDescription: "عيادة، مستشفى أو مخبر",
    establishmentHintTitle: "مؤسسة صحية",
    establishmentHintDescription:
      "مسار مخصص لإدارة المؤسسة وعدة ممارسين صحيين.",
    doctor: "طبيب مستقل",
    doctorDescription: "عيادة خاصة أو نشاط حر",
    doctorHintTitle: "طبيب مستقل",
    doctorHintDescription:
      "ولوج شخصي لإدارة عيادتك وملفات مرضاك.",
  },
  feedback: {
    success: "تم تسجيل الدخول بنجاح.",
    apiErrors: {
      alertTitle: "خطأ في تسجيل الدخول",
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      accountBlocked: "الحساب موقوف أو مرفوض.",
      network: "تعذر الاتصال بالخادم.",
      validation: "يرجى التحقق من المعلومات المدخلة.",
      generic: "حدث خطأ. يرجى المحاولة مرة أخرى.",
    },
  },
  security: {
    title: "اتصال محمي",
    description:
      "لا يتم تخزين معلومات الدخول في المتصفح. يتيح لك الوضع التجريبي استكشاف HealixDZ قبل التحقق المهني.",
  },
  hello: {
    establishment: {
      title: "مرحبًا، فضاء المؤسسة",
      description:
        "حساب المؤسسة جاهز للوضع التجريبي. المرحلة التالية هي التحقق المهني.",
    },
    doctor: {
      title: "مرحبًا، فضاء الطبيب المستقل",
      description:
        "حساب الطبيب جاهز للوضع التجريبي. المرحلة التالية هي التحقق المهني.",
    },
    badge: "BASIC_ACCOUNT",
    backToLogin: "العودة إلى تسجيل الدخول",
    continueToVerification: "المتابعة إلى التحقق",
  },
  errors: {
    accountTypeRequired: "يرجى اختيار نوع الحساب.",
    emailRequired: "البريد الإلكتروني مطلوب.",
    emailInvalid: "البريد الإلكتروني غير صالح.",
    passwordRequired: "كلمة المرور مطلوبة.",
    passwordMinLength: "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.",
  },
} as const;
