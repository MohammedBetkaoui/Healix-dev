import { type Locale } from "@/i18n";

import { type AttachmentProblem } from "./messaging-rules";

// The texts of the case discussions, the attachments and the urgent
// messages (messaging, lot 4), in French and Arabic; the rest of the
// Messages interface is in messaging.copy.ts.

export type CaseMessagingCopy = {
  list: {
    casePill: string;
    attachmentPreview: string;
  };
  thread: {
    caseNotice: string;
    caseSubtitle: (count: number) => string;
  };
  message: {
    attachments: string;
    download: (name: string) => string;
    imageAlt: (name: string) => string;
    fromRecord: string;
    attachmentUnavailable: string;
    ackRequested: string;
    ackedBy: (names: string, time: string) => string;
    ackPending: (count: number) => string;
    ackPendingNames: (names: string) => string;
    ack: string;
    acked: string;
    fileToRecord: string;
    filed: string;
    attachmentLine: string;
  };
  composer: {
    attach: string;
    attachFromRecord: string;
    dropHere: string;
    attachments: string;
    uploading: (percent: string) => string;
    uploadFailed: string;
    retryUpload: string;
    remove: (name: string) => string;
    requiresAck: string;
    requiresAckHint: string;
    problems: Record<AttachmentProblem, string>;
  };
  panel: {
    patient: string;
    age: (years: number) => string;
    born: (date: string) => string;
    openRecord: string;
    openAnalyses: string;
    leaveCase: string;
    leaveCaseConfirm: string;
  };
  recordPicker: {
    title: string;
    subtitle: string;
    loading: string;
    error: string;
    empty: string;
    attach: string;
    close: string;
  };
  fileDialog: {
    title: string;
    intro: string;
    author: (name: string, date: string) => string;
    comment: string;
    commentHint: string;
    confirm: string;
    cancel: string;
    done: string;
  };
  record: {
    discussCase: string;
    discussCaseHint: string;
    notesTab: string;
    notesTitle: string;
    notesIntro: string;
    notesEmpty: string;
    notesError: string;
    opinionBy: (name: string, date: string) => string;
    filedBy: (name: string, date: string) => string;
    comment: string;
    openMessage: string;
  };
  errors: Record<string, string>;
};

const fr: CaseMessagingCopy = {
  composer: {
    attach: "Joindre",
    attachFromRecord: "Joindre un document du dossier",
    attachments: "Pièces jointes du message",
    dropHere: "Déposez vos fichiers ici (PDF, PNG ou JPEG, 10 Mo au plus)",
    problems: {
      tooLarge: "Fichier trop volumineux : 10 Mo au plus.",
      tooMany: "5 pièces jointes au plus par message.",
      type: "Seuls les fichiers PDF, PNG et JPEG sont acceptés.",
    },
    remove: (name) => `Retirer ${name}`,
    requiresAck: "Accusé de réception requis",
    requiresAckHint: "Cochez d’abord « Urgent ».",
    retryUpload: "Réessayer",
    uploadFailed: "Échec de l’envoi",
    uploading: (percent) => `Envoi : ${percent} %`,
  },
  errors: {
    ACK_REQUIRES_URGENT: "L’accusé de réception ne se demande que pour un message urgent.",
    ATTACHMENT_NOT_FOUND: "Cette pièce jointe n’est plus disponible.",
    ATTACHMENT_TOO_LARGE: "Une pièce jointe ne doit pas dépasser 10 Mo.",
    CANNOT_ACK_OWN_MESSAGE: "Vous ne pouvez pas accuser réception de votre propre message.",
    CASE_ALREADY_OPEN: "Une autre discussion est déjà ouverte pour ce patient.",
    CASE_ONLY: "Cette action ne concerne que les discussions de cas.",
    DOCUMENT_NOT_FOUND: "Ce document n’est plus dans le dossier du patient.",
    INVALID_ATTACHMENTS: "Une pièce jointe n’a pas pu être envoyée : joignez-la de nouveau.",
    INVALID_ATTACHMENT_TYPE: "Seuls les fichiers PDF, PNG et JPEG sont acceptés.",
    INVALID_CASE_MEMBERS: "Seuls les professionnels vérifiés de l’espace du patient peuvent participer.",
    INVALID_COMMENT: "Le commentaire ne doit pas dépasser 1 000 caractères.",
    MESSAGE_DELETED: "Ce message a été supprimé.",
    MESSAGE_UNAVAILABLE: "Le contenu de ce message n’est pas disponible.",
    PATIENT_NOT_FOUND: "Ce patient est introuvable ou hors de votre espace.",
  },
  fileDialog: {
    author: (name, date) => `Avis de ${name} · ${date}`,
    cancel: "Annuler",
    comment: "Commentaire (facultatif)",
    commentHint: "1 000 caractères au plus. Il accompagne la note dans le dossier.",
    confirm: "Verser au dossier",
    done: "Message versé au dossier du patient.",
    intro: "Ce texte sera copié tel quel dans le dossier du patient, avec son auteur et sa date :",
    title: "Verser au dossier du patient",
  },
  list: {
    attachmentPreview: "Pièce jointe",
    casePill: "Cas",
  },
  message: {
    ack: "Accuser réception",
    acked: "Réception accusée",
    ackedBy: (names, time) => `Accusé par ${names} à ${time}`,
    ackPending: (count) => `En attente d’accusé (${count})`,
    ackPendingNames: (names) => `Déjà accusé par ${names}`,
    ackRequested: "Accusé de réception demandé",
    attachmentLine: "Pièce jointe",
    attachmentUnavailable: "Pièce jointe indisponible.",
    attachments: "Pièces jointes",
    download: (name) => `Télécharger ${name}`,
    fileToRecord: "Verser au dossier",
    filed: "Versé au dossier",
    fromRecord: "Document du dossier",
    imageAlt: (name) => `Image jointe : ${name}`,
  },
  panel: {
    age: (years) => (years > 1 ? `${years} ans` : `${years} an`),
    born: (date) => `Né(e) le ${date}`,
    leaveCase: "Quitter la discussion",
    leaveCaseConfirm: "Vous ne verrez plus cette discussion. Vous pourrez la rouvrir depuis le dossier du patient.",
    openAnalyses: "Analyses IA",
    openRecord: "Ouvrir le dossier",
    patient: "Patient",
  },
  record: {
    comment: "Commentaire",
    discussCase: "Discuter du cas",
    discussCaseHint: "Ouvre la discussion de ce patient avec vos collègues ; chaque accès est tracé dans ce dossier.",
    filedBy: (name, date) => `Versé au dossier par ${name} le ${date}`,
    notesEmpty: "Aucune note. Versez un avis depuis la discussion de cas du patient.",
    notesError: "Impossible de charger les notes.",
    notesIntro: "Avis versés depuis les discussions de cas, tels qu’ils ont été écrits.",
    notesTab: "Notes",
    notesTitle: "Notes cliniques",
    openMessage: "Voir dans la discussion",
    opinionBy: (name, date) => `Avis de ${name} · ${date}`,
  },
  recordPicker: {
    attach: "Joindre",
    close: "Fermer",
    empty: "Aucun document PDF, PNG ou JPEG dans le dossier de ce patient.",
    error: "Impossible de charger les documents du dossier.",
    loading: "Chargement des documents…",
    subtitle: "Le document reste dans le dossier : il est partagé, pas copié, et l’accès est vérifié à chaque ouverture.",
    title: "Joindre un document du dossier",
  },
  thread: {
    caseNotice: "Discussion de cas — chaque accès est tracé dans le dossier du patient.",
    caseSubtitle: (count) => `Discussion de cas · ${count} participant${count > 1 ? "s" : ""}`,
  },
};

const ar: CaseMessagingCopy = {
  composer: {
    attach: "إرفاق",
    attachFromRecord: "إرفاق وثيقة من الملف",
    attachments: "مرفقات الرسالة",
    dropHere: "أفلتوا ملفاتكم هنا (PDF أو PNG أو JPEG، 10 ميغابايت كحد أقصى)",
    problems: {
      tooLarge: "الملف كبير جدًا: 10 ميغابايت كحد أقصى.",
      tooMany: "5 مرفقات كحد أقصى لكل رسالة.",
      type: "تُقبل ملفات PDF وPNG وJPEG فقط.",
    },
    remove: (name) => `إزالة ${name}`,
    requiresAck: "إشعار الاستلام مطلوب",
    requiresAckHint: "اختاروا «عاجل» أولًا.",
    retryUpload: "إعادة المحاولة",
    uploadFailed: "تعذر الإرسال",
    uploading: (percent) => `جارٍ الإرسال: ${percent}٪`,
  },
  errors: {
    ACK_REQUIRES_URGENT: "لا يُطلب إشعار الاستلام إلا لرسالة عاجلة.",
    ATTACHMENT_NOT_FOUND: "هذا المرفق لم يعد متاحًا.",
    ATTACHMENT_TOO_LARGE: "يجب ألا يتجاوز المرفق 10 ميغابايت.",
    CANNOT_ACK_OWN_MESSAGE: "لا يمكنكم إشعار استلام رسالتكم.",
    CASE_ALREADY_OPEN: "يوجد نقاش آخر مفتوح لهذا المريض.",
    CASE_ONLY: "يخص هذا الإجراء نقاشات الحالات فقط.",
    DOCUMENT_NOT_FOUND: "لم تعد هذه الوثيقة في ملف المريض.",
    INVALID_ATTACHMENTS: "تعذر إرسال أحد المرفقات: أرفقوه من جديد.",
    INVALID_ATTACHMENT_TYPE: "تُقبل ملفات PDF وPNG وJPEG فقط.",
    INVALID_CASE_MEMBERS: "لا يشارك إلا المهنيون الموثقون في فضاء المريض.",
    INVALID_COMMENT: "يجب ألا يتجاوز التعليق 1000 حرف.",
    MESSAGE_DELETED: "حُذفت هذه الرسالة.",
    MESSAGE_UNAVAILABLE: "محتوى هذه الرسالة غير متاح.",
    PATIENT_NOT_FOUND: "هذا المريض غير موجود أو خارج فضائكم.",
  },
  fileDialog: {
    author: (name, date) => `رأي ${name} · ${date}`,
    cancel: "إلغاء",
    comment: "تعليق (اختياري)",
    commentHint: "1000 حرف كحد أقصى. يُرفق بالملاحظة في الملف.",
    confirm: "إضافة إلى الملف",
    done: "أُضيفت الرسالة إلى ملف المريض.",
    intro: "سيُنسخ هذا النص كما هو في ملف المريض، مع كاتبه وتاريخه:",
    title: "إضافة إلى ملف المريض",
  },
  list: {
    attachmentPreview: "مرفق",
    casePill: "حالة",
  },
  message: {
    ack: "إشعار بالاستلام",
    acked: "تم الإشعار بالاستلام",
    ackedBy: (names, time) => `أشعر بالاستلام ${names} في ${time}`,
    ackPending: (count) => `في انتظار إشعار الاستلام (${count})`,
    ackPendingNames: (names) => `أشعر بالاستلام: ${names}`,
    ackRequested: "إشعار الاستلام مطلوب",
    attachmentLine: "مرفق",
    attachmentUnavailable: "المرفق غير متاح.",
    attachments: "المرفقات",
    download: (name) => `تنزيل ${name}`,
    fileToRecord: "إضافة إلى الملف",
    filed: "أُضيف إلى الملف",
    fromRecord: "وثيقة من الملف",
    imageAlt: (name) => `صورة مرفقة: ${name}`,
  },
  panel: {
    age: (years) => `${years} سنة`,
    born: (date) => `تاريخ الميلاد: ${date}`,
    leaveCase: "مغادرة النقاش",
    leaveCaseConfirm: "لن تروا هذا النقاش بعد الآن. يمكنكم إعادة فتحه من ملف المريض.",
    openAnalyses: "تحاليل الذكاء الاصطناعي",
    openRecord: "فتح الملف",
    patient: "المريض",
  },
  record: {
    comment: "تعليق",
    discussCase: "مناقشة الحالة",
    discussCaseHint: "يفتح نقاش هذا المريض مع زملائكم؛ كل دخول يُسجَّل في هذا الملف.",
    filedBy: (name, date) => `أضافه إلى الملف ${name} في ${date}`,
    notesEmpty: "لا توجد ملاحظات. أضيفوا رأيًا من نقاش حالة المريض.",
    notesError: "تعذر تحميل الملاحظات.",
    notesIntro: "آراء أُضيفت من نقاشات الحالات، كما كُتبت.",
    notesTab: "الملاحظات",
    notesTitle: "الملاحظات السريرية",
    openMessage: "عرض في النقاش",
    opinionBy: (name, date) => `رأي ${name} · ${date}`,
  },
  recordPicker: {
    attach: "إرفاق",
    close: "إغلاق",
    empty: "لا توجد وثيقة PDF أو PNG أو JPEG في ملف هذا المريض.",
    error: "تعذر تحميل وثائق الملف.",
    loading: "جارٍ تحميل الوثائق…",
    subtitle: "تبقى الوثيقة في الملف: تُشارَك ولا تُنسخ، ويُتحقق من صلاحية الوصول عند كل فتح.",
    title: "إرفاق وثيقة من الملف",
  },
  thread: {
    caseNotice: "نقاش حالة — كل دخول يُسجَّل في ملف المريض.",
    caseSubtitle: (count) => `نقاش حالة · ${count === 1 ? "مشارك واحد" : `${count} مشاركين`}`,
  },
};

export const caseMessagingCopy: Record<Locale, CaseMessagingCopy> = { ar, fr };
