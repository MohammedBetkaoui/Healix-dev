export const adminAuthAr = {
  dashboard: {
    actions: {
      logout: "تسجيل الخروج",
      verifications: "الانتقال إلى طلبات التحقق",
    },
    cards: {
      auditLogs: {
        label: "سجلات التدقيق",
        value: "128",
      },
      pendingAccounts: {
        label: "حسابات قيد الانتظار",
        value: "22",
      },
      verificationRequests: {
        label: "طلبات التحقق",
        value: "36",
      },
    },
    loading: "جارٍ التحقق من الجلسة...",
    restricted: "جلسة مسؤول مطلوبة.",
    title: "مرحبًا، مسؤول HealixDZ",
    subtitle:
      "تابع طلبات التحقق والإجراءات الحساسة داخل المنصة.",
  },
  errors: {
    emailInvalid: "البريد الإلكتروني للمسؤول غير صالح.",
    emailRequired: "البريد الإلكتروني للمسؤول مطلوب.",
    generic: "حدث خطأ. يرجى المحاولة مرة أخرى.",
    invalidCredentials: "بيانات دخول المسؤول غير صحيحة.",
    network: "تعذر الاتصال بالخادم.",
    passwordMinLength: "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.",
    passwordRequired: "كلمة المرور مطلوبة.",
  },
  form: {
    emailLabel: "البريد الإلكتروني للمسؤول",
    emailPlaceholder: "admin@healixdz.local",
    hidePassword: "إخفاء كلمة المرور",
    loading: "جارٍ التحقق...",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "كلمة مرور المسؤول",
    showPassword: "إظهار كلمة المرور",
    submit: "الدخول إلى الإدارة",
  },
  hero: {
    cards: {
      audit: {
        description: "يتم تتبع جميع عمليات الدخول والإجراءات الحساسة.",
        title: "سجلات التدقيق",
      },
      gate: {
        description:
          "الوصول مخصص فقط لأدوار SUPER_ADMIN و ADMIN_VERIFICATION.",
        title: "وصول مقيّد",
      },
      security: {
        description:
          "جلسة منفصلة عبر cookies httpOnly مخصصة للإدارة.",
        title: "أمان منفصل",
      },
    },
    description:
      "سجّل الدخول لإدارة طلبات التحقق، مراجعة الملفات المرسلة، وإدارة منصة HealixDZ.",
    subtitle: "وصول آمن مخصص للفريق المخول.",
    title: "إدارة HealixDZ",
  },
  notice: {
    description:
      "هذه الواجهة مخصصة فقط للمسؤولين المخولين. يتم تسجيل جميع عمليات الدخول.",
    title: "وصول مقيّد",
  },
  success: "تم تسجيل دخول المسؤول بنجاح.",
};
