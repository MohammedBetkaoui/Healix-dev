export const registerAr = {
  metadata: {
    title: "التسجيل | HealixDZ",
    description:
      "إنشاء حساب مؤسسة صحية أو طبيب مستقل على HealixDZ.",
  },
  page: {
    lang: "ar",
    formAriaLabel: "استمارة التسجيل",
    demoAccess:
      "بعد التسجيل، سيكون بإمكانك الوصول إلى الوضع التجريبي. سيتم تفعيل الوصول إلى البيانات الطبية الحقيقية بعد التحقق المهني واختيار اشتراك.",
  },
  hero: {
    title: "نظام مستشفى ذكي",
    subtitle:
      "إدارة طبية، ذكاء اصطناعي لتحليل الصور الطبية، وتكامل HL7/FHIR في منصة واحدة.",
    demoBadge: "وضع تجريبي متاح بعد التسجيل",
    valuePoints: {
      patientRecords: "إدارة آمنة للمرضى والملفات الطبية",
      medicalAi: "تحليل الصور الطبية بالذكاء الاصطناعي",
      workflow: "سير عمل مهني مع التحقق والتدقيق",
    },
    illustration: {
      admission: "القبول",
      unifiedRecord: "ملف موحد",
      imaging: "التصوير",
      assistedAi: "ذكاء اصطناعي مساعد",
      audit: "التدقيق",
      controlledAccess: "وصول مضبوط",
      traceability: "تتبع نشط",
    },
    activation: {
      title: "مسار التفعيل",
      steps: {
        accountCreated: "إنشاء الحساب",
        demoMode: "الوضع التجريبي",
        professionalVerification: "التحقق المهني",
        fullActivation: "التفعيل الكامل",
      },
    },
    demoMode: {
      badge: "متاح مباشرة",
      text: "استكشف HealixDZ باستخدام بيانات تجريبية قبل التحقق المهني.",
    },
  },
  accountType: {
    eyebrow: "تسجيل سريع",
    title: "اختر نوع الحساب",
    description:
      "هذه المرحلة تتيح الوصول إلى الوضع التجريبي. سيتم طلب التحقق المهني لاحقًا.",
    establishment: {
      title: "مؤسسة صحية",
      description:
        "للعيادات، المستشفيات، مراكز التصوير الطبي، المخابر والهياكل الصحية.",
    },
    independentDoctor: {
      title: "طبيب مستقل",
      description:
        "للأطباء الذين يمارسون نشاطهم دون ارتباط بمؤسسة مسجلة.",
    },
  },
  progress: {
    ariaLabel: "مراحل التسجيل",
    steps: {
      account: "الحساب",
      verification: "التحقق",
      subscription: "الاشتراك",
      activation: "التفعيل",
    },
  },
  security: {
    title: "الأمان والخصوصية",
    body: "تُستخدم معلوماتك فقط لإنشاء حسابك. يتطلب الوصول إلى الوظائف الطبية الحقيقية تحققًا مهنيًا. سيتم حماية البيانات الحساسة وفق قواعد السرية والأمان الخاصة بالمنصة.",
  },
  establishmentTypes: {
    clinic: "عيادة",
    hospital: "مستشفى",
    imagingCenter: "مركز تصوير طبي",
    laboratory: "مخبر",
    groupPractice: "عيادة جماعية",
  },
  forms: {
    selectPlaceholder: "اختر",
    terms: {
      acceptTerms: "أوافق على شروط الاستخدام وسياسة الخصوصية",
      acceptVerification:
        "أفهم أن الوصول إلى الوظائف الطبية الحقيقية يتطلب تحققًا مهنيًا",
    },
    signInPrompt: "لديك حساب بالفعل؟",
    signInLink: "تسجيل الدخول",
    establishment: {
      submit: "إنشاء مساحة المؤسسة",
      loading: "جاري إنشاء الحساب...",
      fields: {
        establishmentName: {
          label: "اسم المؤسسة",
          placeholder: "عيادة الأمان",
        },
        establishmentType: {
          label: "نوع المؤسسة",
        },
        wilaya: {
          label: "الولاية",
        },
        address: {
          label: "العنوان",
          placeholder: "العنوان المهني للمؤسسة",
        },
        professionalEmail: {
          label: "البريد الإلكتروني المهني",
          placeholder: "contact@etablissement.dz",
        },
        phone: {
          label: "رقم الهاتف",
          placeholder: "+213 555 00 00 00",
        },
        managerFullName: {
          label: "اسم مسؤول الحساب",
          placeholder: "الاسم واللقب",
        },
        password: {
          label: "كلمة المرور",
        },
        confirmPassword: {
          label: "تأكيد كلمة المرور",
        },
      },
    },
    doctor: {
      submit: "إنشاء حساب الطبيب",
      loading: "جاري إنشاء الحساب...",
      fields: {
        fullName: {
          label: "الاسم الكامل",
          placeholder: "د. الاسم واللقب",
        },
        speciality: {
          label: "التخصص",
          placeholder: "الأشعة، أمراض القلب...",
        },
        wilaya: {
          label: "الولاية",
        },
        professionalAddress: {
          label: "العنوان المهني أو العيادة",
          placeholder: "عنوان العيادة أو مكان الممارسة",
        },
        email: {
          label: "البريد الإلكتروني",
          placeholder: "nom@cabinet.dz",
        },
        phone: {
          label: "رقم الهاتف",
          placeholder: "+213 555 00 00 00",
        },
        password: {
          label: "كلمة المرور",
        },
        confirmPassword: {
          label: "تأكيد كلمة المرور",
        },
      },
    },
  },
  password: {
    hint: "استخدم 8 أحرف على الأقل مع حروف وأرقام ورموز خاصة.",
    strength: "قوة كلمة المرور",
    levels: {
      weak: "ضعيفة",
      medium: "متوسطة",
      strong: "قوية",
    },
    show: "إظهار كلمة المرور",
    hide: "إخفاء كلمة المرور",
  },
  feedback: {
    success:
      "تم إنشاء الحساب بنجاح. يمكنك الآن الوصول إلى الوضع التجريبي.",
    apiErrors: {
      alertTitle: "تعذر إتمام التسجيل",
      addressRequired: "العنوان المهني مطلوب.",
      conditionsRequired: "يجب الموافقة على شروط الاستخدام.",
      database: "حدث خطأ في قاعدة البيانات. يرجى المحاولة مرة أخرى.",
      emailConflict: "هذا البريد الإلكتروني مستخدم بالفعل.",
      emailInvalid: "البريد الإلكتروني غير صالح.",
      fullNameRequired: "الاسم الكامل مطلوب.",
      notFound: "خدمة التسجيل غير متاحة حالياً.",
      passwordMismatch: "كلمتا المرور غير متطابقتين.",
      passwordTooShort: "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.",
      phoneConflict: "رقم الهاتف مستخدم بالفعل.",
      phoneRequired: "رقم الهاتف مطلوب.",
      specialityRequired: "التخصص مطلوب.",
      validation: "يرجى التحقق من المعلومات المدخلة.",
      verificationRequired: "يجب الموافقة على التحقق المهني.",
      wilayaRequired: "الولاية مطلوبة.",
      network: "تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت.",
      server: "حدث خطأ. يرجى المحاولة مرة أخرى.",
      generic: "حدث خطأ. يرجى المحاولة مرة أخرى.",
    },
    successCard: {
      title: "تم إنشاء الحساب بنجاح",
      description:
        "تم إنشاء مساحة المؤسسة الخاصة بك. يمكنك الآن الوصول إلى الوضع التجريبي. يتطلب الوصول إلى الوظائف الطبية الحقيقية تحققًا مهنيًا.",
      doctorTitle: "تم إنشاء حساب الطبيب بنجاح",
      doctorDescription:
        "تم إنشاء حساب الطبيب المستقل الخاص بك. يمكنك الآن الوصول إلى الوضع التجريبي. يتطلب الوصول إلى الوظائف الطبية الحقيقية تحققًا مهنيًا.",
      demoAction: "الدخول إلى الوضع التجريبي",
      verificationAction: "المتابعة إلى التحقق",
    },
  },
  errors: {
    required: "هذا الحقل مطلوب",
    emailInvalid: "البريد الإلكتروني غير صالح",
    phoneRequired: "رقم الهاتف مطلوب",
    phoneInvalid: "رقم الهاتف غير صالح",
    passwordTooShort: "كلمة المرور قصيرة جدًا",
    passwordMismatch: "كلمتا المرور غير متطابقتين",
    acceptTerms: "يرجى الموافقة على الشروط",
    maxLength: "الحد الأقصى {max} حرفًا",
  },
} as const;
