export const loginAr = {
  metadata: {
    title: "تسجيل الدخول | HealixDZ",
    description: "سجّل الدخول إلى فضائك الطبي الذكي على HealixDZ.",
  },
  page: {
    title: "تسجيل الدخول",
    subtitle: "اختر نوع حسابك وسجّل الدخول إلى فضائك.",
  },
  hero: {
    title: "مرحبًا بك في HealixDZ",
    subtitle: "سجّل الدخول إلى فضائك الطبي الذكي.",
    description:
      "ادخل إلى منصة آمنة لإدارة البيانات الطبية، تحاليل الذكاء الاصطناعي، التقارير وسير العمل المهني.",
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
    accountTypeLabel: "نوع الحساب",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "nom@structure.dz",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "كلمة المرور الخاصة بك",
    rememberMe: "تذكرني",
    forgotPassword: "هل نسيت كلمة المرور؟",
    submit: "تسجيل الدخول",
    loading: "جاري تسجيل الدخول...",
    signUpPrompt: "ليس لديك حساب؟",
    signUpLink: "إنشاء حساب",
  },
  accountType: {
    establishment: "مؤسسة صحية",
    doctor: "طبيب مستقل",
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
