export const dashboardAr = {
  common: {
    roles: {
      establishment: "مؤسسة صحية",
      doctor: "طبيب مستقل",
    },
    breadcrumb: {
      pages: "الصفحات",
      dashboard: "لوحة التحكم",
    },
    title: "لوحة التحكم",
    demoBadge: "الوضع التجريبي",
    accountStatus: {
      label: "حالة الحساب",
      value: "BASIC_ACCOUNT",
      action: "تحقق",
      statusCardTitle: "الحساب في الوضع التجريبي",
      statusCardDescription:
        "حسابك حاليًا في الوضع التجريبي. للوصول إلى الوظائف الطبية الحقيقية، يرجى إكمال التحقق المهني.",
      startVerification: "بدء التحقق",
    },
    actions: {
      profile: "الملف الشخصي",
      notifications: "الإشعارات",
      theme: "المظهر",
      menu: "القائمة",
    },
    status: {
      completed: "مكتمل",
      generated: "تم الإنشاء",
      created: "تم الإنشاء",
      pending: "قيد الانتظار",
    },
    charts: {
      legendPrimary: "التحاليل",
      legendSecondary: "الملفات",
      days30: "آخر 30 يومًا",
    },
  },
  sidebar: {
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
  establishment: {
    title: "لوحة تحكم المؤسسة",
    stats: {
      patients: {
        label: "المرضى المسجلون",
        hint: "+12 هذا الشهر",
      },
      doctors: {
        label: "الأطباء المرتبطون",
        hint: "+2 هذا الشهر",
      },
      analyses: {
        label: "تحاليل الذكاء الاصطناعي",
        hint: "+18%",
      },
      account: {
        label: "حالة الحساب",
        hint: "الوصول التجريبي مفعل",
      },
    },
    charts: {
      activityTitle: "النشاط الطبي",
      activitySubtitle:
        "التحاليل والملفات التي تم إنشاؤها خلال آخر 30 يومًا",
      distributionTitle: "توزيع تحاليل الذكاء الاصطناعي",
      distributionSubtitle: "أحجام تجريبية حسب الفئة",
      distribution: {
        brain: "Brain MRI",
        cardiology: "Cardiology",
        reports: "Reports",
        pending: "Pending",
      },
    },
    table: {
      title: "النشاط الأخير",
      columns: {
        type: "النوع",
        patient: "المريض",
        date: "التاريخ",
        status: "الحالة",
        cta: "إجراء",
      },
      rows: {
        analysis: "تحليل بالذكاء الاصطناعي",
        report: "تقرير PDF",
        record: "ملف طبي",
        patient1: "مريض تجريبي 01",
        patient2: "مريض تجريبي 02",
        patient3: "مريض تجريبي 03",
        today: "اليوم",
        yesterday: "أمس",
        june12: "12 يونيو",
        open: "فتح",
      },
    },
    quickActions: {
      title: "إجراءات سريعة",
      addPatient: {
        label: "إضافة مريض",
        description: "إنشاء ملف مريض افتراضي للوضع التجريبي.",
      },
      inviteDoctor: {
        label: "دعوة طبيب",
        description: "إعداد وصول طبيب قبل التحقق المهني.",
      },
      newAnalysis: {
        label: "تحليل جديد بالذكاء الاصطناعي",
        description: "بدء مسار تصوير تجريبي بنتائج افتراضية.",
      },
      verification: {
        label: "متابعة التحقق",
        description: "إكمال الخطوات اللازمة لتفعيل الاستخدام الحقيقي.",
      },
    },
  },
  doctor: {
    title: "لوحة تحكم الطبيب المستقل",
    stats: {
      patients: {
        label: "مرضاي",
        hint: "+4 هذا الشهر",
      },
      analyses: {
        label: "تحاليل الذكاء الاصطناعي",
        hint: "+11%",
      },
      reports: {
        label: "التقارير المُنشأة",
        hint: "+6 هذا الشهر",
      },
      account: {
        label: "حالة الحساب",
        hint: "الوصول التجريبي مفعل",
      },
    },
    charts: {
      activityTitle: "نشاط الاستشارات",
      activitySubtitle: "المرضى والتحاليل خلال آخر 30 يومًا",
      distributionTitle: "أنواع التحاليل",
      distributionSubtitle: "توزيع الاستخدامات التجريبية",
      distribution: {
        brain: "Brain",
        cardiology: "Cardiology",
        reports: "Reports",
        pending: "Pending",
      },
    },
    table: {
      title: "آخر الأنشطة",
      columns: {
        action: "الإجراء",
        patient: "المريض",
        date: "التاريخ",
        status: "الحالة",
      },
      rows: {
        analysis: "تحليل بالذكاء الاصطناعي",
        report: "تقرير PDF",
        consultation: "استشارة",
        patient1: "مريض تجريبي 07",
        patient2: "مريض تجريبي 08",
        patient3: "مريض تجريبي 09",
        today: "اليوم",
        yesterday: "أمس",
        june12: "12 يونيو",
      },
    },
    quickActions: {
      title: "إجراءات سريعة",
      addPatient: {
        label: "إضافة مريض",
        description: "إنشاء بطاقة متابعة تجريبية.",
      },
      newAnalysis: {
        label: "تحليل جديد بالذكاء الاصطناعي",
        description: "إعداد تحليل تجريبي بخطوات سريعة.",
      },
      generateReport: {
        label: "إنشاء تقرير",
        description: "إعداد تقرير PDF افتراضي جاهز للمشاركة.",
      },
      verification: {
        label: "متابعة التحقق",
        description: "إكمال التحقق المهني لتفعيل الاستخدام الحقيقي.",
      },
    },
  },
} as const;
