import { clinicalWorkspaceAr } from "./clinical-workspace";

export const dashboardAr = {
  clinical: clinicalWorkspaceAr,
  common: {
    theme: {
      label: "مظهر الواجهة",
      system: "النظام",
      light: "فاتح",
      dark: "داكن",
    },
    roles: {
      establishment: "مؤسسة صحية",
      doctor: "طبيب مستقل",
    },
    breadcrumb: {
      pages: "الصفحات",
      dashboard: "لوحة التحكم",
    },
    title: "لوحة التحكم",
    header: {
      searchPlaceholder: "البحث عن مريض، تقرير أو تحليل...",
      secureWorkspace: "فضاء آمن",
    },
    accountStatus: {
      label: "حالة الحساب",
      value: "BASIC_ACCOUNT",
      action: "تحقق",
      statusCardTitle: "الحساب في الوضع التجريبي",
      statusCardDescription:
        "حسابك حاليًا في الوضع التجريبي. للوصول إلى الوظائف الطبية الحقيقية، يرجى إكمال التحقق المهني.",
      startVerification: "بدء التحقق",
      actions: {
        correct: "تصحيح التحقق",
        start: "بدء التحقق",
      },
      descriptions: {
        active:
          "حسابك نشط. يمكن استخدام الوظائف الطبية الحقيقية حسب الاشتراك والصلاحيات المتاحة.",
        basic:
          "حسابك حاليًا في الوضع التجريبي. للوصول إلى الوظائف الطبية الحقيقية، يرجى إكمال التحقق المهني.",
        loading: "جاري تحميل حالة حسابك...",
        paymentPending:
          "تم قبول التحقق المهني. التفعيل الكامل ينتظر الدفع أو الاشتراك.",
        pending: "طلب التحقق الخاص بك قيد المراجعة من طرف إدارة HealixDZ.",
        rejected:
          "تم رفض طلب التحقق. يمكنك تصحيح المعلومات أو الوثائق المطلوبة.",
        suspended:
          "حسابك موقوف. يرجى التواصل مع إدارة HealixDZ لمزيد من المعلومات.",
        unknown: "تعذر تأكيد حالة الحساب حاليًا. يرجى المحاولة بعد لحظات.",
        verified:
          "تم قبول التحقق المهني. الخطوة التالية مرتبطة بالاشتراك أو تفعيل الخطة.",
      },
      footers: {
        active: "وصول حقيقي مفعل",
        basic: "الوضع التجريبي",
        loading: "مزامنة",
        paymentPending: "الدفع مطلوب",
        pending: "بانتظار الإدارة",
        rejected: "تصحيح مطلوب",
        suspended: "الوصول موقوف",
        unknown: "الحالة غير متاحة",
        verified: "حساب موثق",
      },
      hints: {
        active: "وصول حقيقي مفعل",
        basic: "الوصول التجريبي مفعل",
        loading: "جاري المزامنة...",
        paymentPending: "الدفع قيد الانتظار",
        pending: "مراجعة الإدارة جارية",
        rejected: "التصحيح ضروري",
        suspended: "الوصول موقوف مؤقتًا",
        unknown: "أعد تحميل الحالة",
        verified: "تم قبول التحقق",
      },
      statusLabels: {
        active: "حساب نشط",
        basic: "الوضع التجريبي",
        loading: "جاري التحميل...",
        paymentPending: "الدفع قيد الانتظار",
        pending: "قيد التحقق",
        rejected: "تم رفض التحقق",
        suspended: "حساب موقوف",
        unknown: "غير متاح",
        verified: "حساب موثق",
      },
      titles: {
        active: "حساب نشط",
        basic: "الحساب في الوضع التجريبي",
        loading: "حالة الحساب",
        paymentPending: "الدفع قيد الانتظار",
        pending: "التحقق قيد المراجعة",
        rejected: "التحقق يحتاج إلى تصحيح",
        suspended: "حساب موقوف",
        unknown: "الحالة غير متاحة",
        verified: "حساب موثق",
      },
    },
    actions: {
      profile: "الملف الشخصي",
      notifications: "الإشعارات",
      theme: "المظهر",
      menu: "القائمة",
    },
  },
  sidebar: {
    collapse: "تصغير الشريط الجانبي",
    expand: "توسيع الشريط الجانبي",
    sections: {
      clinic: "العيادة",
      ai: "الذكاء الاصطناعي",
      communication: "التواصل",
      account: "الحساب",
      workspace: "مساحة HealixDZ",
      profile: "الملف المهني",
    },
    establishment: {
      dashboard: "لوحة التحكم",
      patients: "المرضى",
      doctors: "الأطباء",
      appointments: "المواعيد",
      prescriptions: "الوصفات الطبية",
      consultations: "الاستشارات",
      analyses: "تحاليل الذكاء الاصطناعي",
      lab: "المختبر",
      reports: "التقارير",
      messages: "الرسائل",
      notifications: "الإشعارات",
      verification: "التحقق",
      subscription: "الاشتراك",
      organization: "المنظمة",
      settings: "الإعدادات",
      logout: "تسجيل الخروج",
    },
    doctor: {
      dashboard: "لوحة التحكم",
      patients: "مرضاي",
      appointments: "المواعيد",
      prescriptions: "الوصفات الطبية",
      consultations: "الاستشارات",
      analyses: "تحليل جديد بالذكاء الاصطناعي",
      lab: "المختبر",
      reports: "تقاريري",
      messages: "الرسائل",
      notifications: "الإشعارات",
      verification: "التحقق",
      subscription: "الاشتراك",
      settings: "الإعدادات",
      logout: "تسجيل الخروج",
    },
  },
  doctor: {
    quickActions: {
      addPatient: {
        label: "إضافة مريض",
      },
      newAnalysis: {
        label: "تحليل جديد بالذكاء الاصطناعي",
      },
      verification: {
        label: "متابعة التحقق",
      },
    },
  },
} as const;
