export const commonAr = {
  brand: "HealixDZ",
  metadata: {
    appTitle: "HealixDz | منصة رقمية للصحة في الجزائر",
    appDescription:
      "تجمع HealixDz ملفات المرضى والمواعيد والاستشارات والوثائق وتنسيق الفرق والخدمات الرقمية ضمن مساحات تناسب المؤسسات الصحية والأطباء.",
  },
  languageSwitcher: {
    label: "تغيير اللغة",
    languages: {
      fr: "Français",
      ar: "العربية",
    },
  },
  verificationRequired: {
    title: "التحقق المهني مطلوب",
    description:
      "الوظائف الطبية (ملفات المرضى والمواعيد) متاحة فقط للحسابات التي تم اعتماد التحقق المهني منها. أكملوا طلب التحقق أو تابعوه للوصول إليها.",
    action: "الانتقال إلى التحقق",
  },
  serviceUnavailable: {
    title: "الخدمة غير متاحة مؤقتًا، أعيدوا المحاولة",
    description:
      "تعذر على الخادم الرد. تبقى جلستكم مفتوحة: أعيدوا المحاولة بعد لحظات.",
    retry: "إعادة المحاولة",
  },
  rateLimited: "طلبات كثيرة جدًا، محاولة جديدة بعد {seconds} ث",
} as const;
