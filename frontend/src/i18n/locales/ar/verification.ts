export const verificationAr = {
  page: {
    breadcrumb: "التحقق",
    title: "التحقق المهني",
    subtitle: "أكمل المعلومات المطلوبة لتفعيل الوصول الحقيقي إلى الوظائف الطبية.",
  },
  status: {
    current: "الحالة الحالية",
    demoBadge: "الوضع التجريبي",
    start: "بدء التحقق",
    notStarted:
      "حسابك حاليًا في الوضع التجريبي. يتطلب الوصول إلى الوظائف الطبية الحقيقية التحقق من مؤسستك.",
    pendingTitle: "طلبك قيد المراجعة",
    pendingDescription:
      "طلبك قيد المراجعة. سيتم إشعارك بعد انتهاء مراجعة الإدارة.",
    values: {
      NOT_STARTED: "NOT_STARTED",
      DRAFT: "DRAFT",
      PENDING_VERIFICATION: "PENDING_VERIFICATION",
      VERIFIED: "VERIFIED",
      REJECTED: "REJECTED",
    },
  },
  stepper: {
    establishmentInfo: "معلومات المؤسسة",
    officialDocuments: "الوثائق الرسمية",
    submission: "إرسال الطلب",
    adminValidation: "مراجعة الإدارة",
  },
  form: {
    prefillLoading: "جارٍ تحميل معلومات المؤسسة...",
    prefillError: "تعذر تحميل المعلومات المسجلة. يرجى تحديث الصفحة.",
    establishmentName: "اسم المؤسسة",
    establishmentType: "نوع المؤسسة",
    wilaya: "الولاية",
    address: "العنوان",
    professionalEmail: "البريد الإلكتروني المهني",
    phone: "رقم الهاتف",
    managerFullName: "اسم المسؤول",
    nif: "رقم التعريف الجبائي NIF",
    commercialRegisterNumber: "رقم السجل التجاري",
    healthAuthorizationNumber: "رقم الترخيص الصحي",
    placeholders: {
      establishmentName: "Clinique El Shifa",
      address: "الشارع الرئيسي، الجزائر",
      professionalEmail: "contact@clinique.dz",
      phone: "+213555000000",
      managerFullName: "د. كريم منصوري",
      nif: "123456789012345",
      commercialRegisterNumber: "RC-16/00-1234567A",
      healthAuthorizationNumber: "AUT-SAN-2026-001",
    },
  },
  documents: {
    title: "الوثائق الرسمية",
    subtitle: "أضف الوثائق المطلوبة. الصيغ المقبولة: PDF و JPG و PNG.",
    acceptedFormats: "الصيغ المقبولة: PDF و JPG و PNG",
    maxSize: "الحد الأقصى: 5 MB",
    selectFile: "اختيار ملف",
    replaceFile: "استبدال",
    dragDrop: "اسحب الملف هنا أو اضغط للاختيار",
    statuses: {
      MISSING: "غير مضاف",
      READY: "جاهز للإرسال",
      UPLOADED: "تم الإرسال",
      REJECTED: "مرفوض",
    },
    items: {
      commercialRegister: {
        title: "السجل التجاري",
        description: "نسخة واضحة وكاملة من الوثيقة الرسمية.",
      },
      nif: {
        title: "رقم التعريف الجبائي NIF",
        description: "إثبات جبائي خاص بالمؤسسة.",
      },
      healthAuthorization: {
        title: "الترخيص الصحي أو الاعتماد",
        description: "ترخيص ساري صادر عن الجهة المختصة.",
      },
      managerId: {
        title: "بطاقة هوية المسؤول",
        description: "بطاقة وطنية أو جواز سفر أو وثيقة مكافئة.",
      },
      addressProof: {
        title: "إثبات العنوان المهني",
        description: "وثيقة حديثة تؤكد عنوان المؤسسة.",
      },
    },
  },
  security: {
    title: "الأمان والخصوصية",
    text:
      "سيتم استخدام الوثائق المقدمة فقط للتحقق المهني من مؤسستك. ستتم معالجتها بشكل آمن ولن تكون متاحة إلا للمسؤولين المخولين.",
  },
  submit: {
    title: "إرسال الطلب",
    infoCompleted: "المعلومات المكتملة",
    documentsAdded: "الوثائق المضافة",
    status: "الحالة",
    ready: "جاهز",
    incomplete: "غير مكتمل",
    button: "إرسال طلب التحقق",
    loading: "جارٍ الإرسال...",
    success: "تم إرسال طلب التحقق بنجاح",
  },
  errors: {
    required: "وثيقة مطلوبة",
    emailInvalid: "البريد الإلكتروني غير صالح",
    formatNotAccepted: "صيغة الملف غير مقبولة",
    fileTooLarge: "حجم الملف كبير جدًا",
  },
} as const;
