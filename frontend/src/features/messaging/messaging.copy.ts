import { type Locale } from "@/i18n";

import { type ComposerBlockReason, type MuteOption } from "./messaging-rules";
import { type ConversationFilter } from "./messaging.types";

// The texts of the Messages interface, in French and Arabic. Dates and
// times are formatted by messaging-format.ts (Intl, Algiers time zone).

type MessagingCopy = {
  title: string;
  workspace: {
    subtitle: string;
    eyebrow: string;
    direct: string;
    group: string;
    directHint: string;
    groupHint: string;
  };
  list: {
    search: string;
    searchPlaceholder: string;
    searchScope: string;
    clearSearch: string;
    noResults: string;
    results: (count: string) => string;
    label: string;
    filtersLabel: string;
    filters: Record<ConversationFilter, string>;
    newConversation: string;
    empty: Record<ConversationFilter, string>;
    emptyHint: string;
    loadMore: string;
    errorTitle: string;
    retry: string;
    muted: string;
    you: string;
    deletedPreview: string;
    noMessages: string;
    group: string;
    request: string;
    pendingRequests: (count: number) => string;
    unread: (count: number) => string;
  };
  thread: {
    latest: string;
    startTitle: string;
    startHint: string;
    selectTitle: string;
    selectHint: string;
    back: string;
    details: string;
    patientNotice: string;
    requestReceived: (name: string) => string;
    accept: string;
    decline: string;
    block: string;
    requestSent: string;
    firstMessageOnly: string;
    reconnecting: string;
    loadOlder: string;
    newMessages: string;
    today: string;
    yesterday: string;
    typing: (names: string[]) => string;
    logLabel: string;
    errorTitle: string;
    notFound: string;
    formerMember: string;
    group: (count: number) => string;
  };
  message: {
    edited: string;
    deleted: string;
    unavailable: string;
    urgent: string;
    sending: string;
    sent: string;
    read: string;
    readBy: (count: number) => string;
    failed: string;
    retry: string;
    discard: string;
    actions: string;
    reply: string;
    copy: string;
    edit: string;
    delete: string;
    deleteTitle: string;
    deleteBody: string;
    cancel: string;
    quotedUnavailable: string;
    jumpTo: string;
    you: string;
  };
  composer: {
    label: string;
    placeholder: string;
    send: string;
    urgent: string;
    urgentHint: string;
    replyTo: (name: string) => string;
    cancelReply: string;
    editing: string;
    cancelEdit: string;
    save: string;
    counter: (length: string, max: string) => string;
    tooLong: string;
    hint: string;
    blocked: Record<ComposerBlockReason, string>;
  };
  panel: {
    title: string;
    close: string;
    participants: string;
    owner: string;
    pending: string;
    you: string;
    rename: string;
    titleLabel: string;
    save: string;
    members: string;
    addMembers: string;
    add: string;
    remove: (name: string) => string;
    noMoreMembers: string;
    leave: string;
    leaveConfirm: string;
    confirm: string;
    cancel: string;
    mute: string;
    muteOptions: Record<MuteOption, string>;
    unmute: string;
    mutedUntil: (date: string) => string;
    mutedForever: string;
    archive: string;
    unarchive: string;
    archived: string;
    block: (name: string) => string;
    unblock: (name: string) => string;
    blockConfirm: string;
    settings: string;
    discoverable: string;
    discoverableHint: string;
  };
  newConversation: {
    title: string;
    subtitle: string;
    close: string;
    tabs: { peer: string; group: string };
    search: string;
    searchPlaceholder: string;
    speciality: string;
    wilaya: string;
    searching: string;
    noResults: string;
    startHint: string;
    write: string;
    unblock: string;
    sameWorkspace: string;
    otherWorkspace: string;
    blocked: string;
    groupTitle: string;
    groupTitleRequired: string;
    groupTitleTooLong: string;
    members: string;
    membersSearch: string;
    noMembers: string;
    selected: (count: number) => string;
    selectMembers: string;
    create: string;
  };
  errors: {
    generic: string;
    network: string;
    codes: Record<string, string>;
  };
};

const fr: MessagingCopy = {
  workspace: {
    subtitle: "Un espace pour vos échanges professionnels.",
    eyebrow: "Votre réseau professionnel",
    direct: "Échange direct",
    group: "Groupe d’équipe",
    directHint: "Retrouvez un confrère dans l’annuaire.",
    groupHint: "Réunissez les membres de votre espace.",
  },
  composer: {
    blocked: {
      awaitingReply: "En attente de réponse : un seul message est possible avant l’acceptation de votre demande.",
      blockedByMe: "Vous avez bloqué ce contact. Débloquez-le pour lui écrire.",
      closed: "Cette conversation est fermée : votre interlocuteur n’y participe plus.",
      requestReceived: "Acceptez la demande pour répondre.",
    },
    cancelEdit: "Annuler la modification",
    cancelReply: "Annuler la réponse",
    counter: (length, max) => `${length} / ${max} caractères`,
    editing: "Modification du message",
    hint: "Entrée pour envoyer · Maj+Entrée pour un retour à la ligne",
    label: "Votre message",
    placeholder: "Écrire un message…",
    replyTo: (name) => `Réponse à ${name}`,
    save: "Enregistrer",
    send: "Envoyer",
    tooLong: "Le message dépasse 4 000 caractères.",
    urgent: "Urgent",
    urgentHint: "Marquer ce message comme urgent",
  },
  errors: {
    codes: {
      CONTACT_BLOCKED: "Vous avez bloqué ce contact : débloquez-le pour lui écrire.",
      CONVERSATION_CLOSED: "Votre interlocuteur n’est plus dans cette conversation.",
      CONVERSATION_PENDING: "Votre demande attend une réponse : un seul message est possible avant son acceptation.",
      EDIT_WINDOW_CLOSED: "Un message ne peut être modifié que dans les 15 minutes après son envoi.",
      INVALID_GROUP_MEMBERS: "Les membres d’un groupe doivent être des professionnels vérifiés de votre espace.",
      INVALID_MESSAGE_BODY: "Le message doit contenir de 1 à 4 000 caractères.",
      INVALID_TITLE: "Le nom du groupe doit contenir de 1 à 120 caractères.",
      RECIPIENT_NOT_FOUND: "Ce professionnel est introuvable ou ne peut pas être contacté.",
    },
    generic: "L’action n’a pas abouti. Réessayez.",
    network: "Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.",
  },
  list: {
    search: "Rechercher une conversation",
    searchPlaceholder: "Nom, groupe ou spécialité…",
    searchScope: "Recherche dans les conversations chargées de cet onglet.",
    clearSearch: "Effacer la recherche",
    noResults: "Aucune conversation correspondante.",
    results: (count) => `${count} résultat(s) affiché(s)`,
    deletedPreview: "Message supprimé",
    empty: {
      all: "Aucune conversation pour l’instant.",
      archived: "Aucune conversation archivée.",
      requests: "Aucune demande en attente.",
      unread: "Aucun message non lu.",
    },
    emptyHint: "Écrivez à un confrère vérifié ou créez un groupe d’équipe.",
    errorTitle: "Impossible de charger les conversations.",
    filters: { all: "Toutes", archived: "Archivées", requests: "Demandes", unread: "Non lues" },
    filtersLabel: "Filtrer les conversations",
    group: "Groupe",
    label: "Conversations",
    loadMore: "Afficher plus de conversations",
    muted: "En sourdine",
    newConversation: "Nouvelle conversation",
    noMessages: "Aucun message",
    pendingRequests: (count) =>
      count > 1 ? `${count} demandes de contact en attente` : "1 demande de contact en attente",
    request: "Demande",
    retry: "Réessayer",
    unread: (count) => (count > 1 ? `${count} messages non lus` : "1 message non lu"),
    you: "Vous",
  },
  message: {
    actions: "Actions sur le message",
    cancel: "Annuler",
    copy: "Copier",
    delete: "Supprimer",
    deleteBody: "Il apparaîtra comme « Message supprimé » pour tous les participants.",
    deleteTitle: "Supprimer ce message ?",
    deleted: "Message supprimé",
    discard: "Abandonner",
    edit: "Modifier",
    edited: "modifié",
    failed: "Non envoyé",
    jumpTo: "Aller au message cité",
    quotedUnavailable: "Message cité",
    read: "Lu",
    readBy: (count) => `Lu par ${count}`,
    reply: "Répondre",
    retry: "Réessayer",
    sending: "Envoi…",
    sent: "Envoyé",
    unavailable: "Message illisible",
    urgent: "Urgent",
    you: "Vous",
  },
  newConversation: {
    blocked: "Bloqué",
    close: "Fermer",
    create: "Créer le groupe",
    groupTitle: "Nom du groupe",
    groupTitleRequired: "Le nom du groupe est obligatoire.",
    groupTitleTooLong: "Le nom du groupe ne peut pas dépasser 120 caractères.",
    members: "Membres de votre espace",
    membersSearch: "Rechercher un membre",
    noMembers: "Votre espace ne compte pas d’autre professionnel vérifié.",
    noResults: "Aucun professionnel ne correspond à cette recherche.",
    otherWorkspace: "Autre espace · demande de contact",
    sameWorkspace: "Votre espace",
    search: "Rechercher un professionnel",
    searchPlaceholder: "Nom, spécialité ou wilaya",
    searching: "Recherche…",
    selectMembers: "Choisissez au moins un membre.",
    selected: (count) => (count > 1 ? `${count} membres choisis` : `${count} membre choisi`),
    speciality: "Spécialité",
    startHint: "Les professionnels vérifiés qui acceptent d’être joints apparaissent ici.",
    subtitle: "Écrivez à un confrère vérifié, ou réunissez des membres de votre espace.",
    tabs: { group: "Groupe d’équipe", peer: "Confrère" },
    title: "Nouvelle conversation",
    wilaya: "Wilaya",
    write: "Écrire",
    unblock: "Débloquer",
  },
  panel: {
    add: "Ajouter",
    addMembers: "Ajouter des membres",
    archive: "Archiver la conversation",
    archived: "Conversation archivée",
    block: (name) => `Bloquer ${name}`,
    blockConfirm: "Cette personne ne pourra plus vous écrire ni vous envoyer de demande.",
    cancel: "Annuler",
    close: "Fermer les détails",
    confirm: "Confirmer",
    discoverable: "Joignable par des confrères",
    discoverableHint: "Les professionnels vérifiés d’autres espaces peuvent vous trouver dans l’annuaire et vous écrire.",
    leave: "Quitter le groupe",
    leaveConfirm: "Quitter ce groupe ? Vous n’aurez plus accès à ses messages.",
    members: "Membres",
    mute: "Sourdine",
    muteOptions: { "1h": "1 heure", "24h": "24 heures", "8h": "8 heures", forever: "Indéfiniment" },
    mutedForever: "En sourdine",
    mutedUntil: (date) => `En sourdine jusqu’au ${date}`,
    noMoreMembers: "Tous les membres de votre espace sont déjà dans le groupe.",
    owner: "Propriétaire",
    participants: "Participants",
    pending: "Demande en attente",
    remove: (name) => `Retirer ${name} du groupe`,
    rename: "Renommer le groupe",
    save: "Enregistrer",
    settings: "Mes réglages",
    title: "Détails",
    titleLabel: "Nom du groupe",
    unarchive: "Désarchiver",
    unblock: (name) => `Débloquer ${name}`,
    unmute: "Réactiver les notifications",
    you: "vous",
  },
  thread: {
    latest: "Revenir aux derniers messages",
    startTitle: "La conversation commence ici.",
    startHint: "Envoyez votre premier message depuis la zone de rédaction.",
    accept: "Accepter",
    back: "Retour aux conversations",
    block: "Bloquer",
    decline: "Refuser",
    details: "Détails de la conversation",
    errorTitle: "Impossible de charger cette conversation.",
    firstMessageOnly: "Demande de contact : un seul message est possible avant son acceptation.",
    formerMember: "Ancien membre",
    group: (count) => `Groupe · ${count} participants`,
    loadOlder: "Charger les messages précédents",
    logLabel: "Messages de la conversation",
    newMessages: "Nouveaux messages",
    notFound: "Cette conversation n’existe pas ou ne vous est plus accessible.",
    patientNotice: "Évitez d’écrire ici le nom ou les données d’un patient.",
    reconnecting: "Reconnexion…",
    requestReceived: (name) => `${name} vous a écrit.`,
    requestSent: "En attente de réponse ; un seul message possible.",
    selectHint: "Reprenez un échange dans votre boîte de réception ou ouvrez une conversation avec un confrère.",
    selectTitle: "Le bon échange, au bon endroit.",
    today: "Aujourd’hui",
    typing: (names) =>
      names.length === 1 ? `${names[0]} écrit…` : names.length === 2 ? `${names[0]} et ${names[1]} écrivent…` : "Plusieurs personnes écrivent…",
    yesterday: "Hier",
  },
  title: "Messages",
};

const ar: MessagingCopy = {
  workspace: {
    subtitle: "مساحة لتواصلكم المهني.",
    eyebrow: "شبكتكم المهنية",
    direct: "محادثة مباشرة",
    group: "مجموعة الفريق",
    directHint: "ابحثوا عن زميل في الدليل.",
    groupHint: "اجمعوا أعضاء فضائكم في محادثة.",
  },
  composer: {
    blocked: {
      awaitingReply: "في انتظار الرد: يمكن إرسال رسالة واحدة فقط قبل قبول طلبكم.",
      blockedByMe: "لقد حظرتم جهة الاتصال هذه. ألغوا الحظر لمراسلتها.",
      closed: "هذه المحادثة مغلقة: محاوركم لم يعد مشاركًا فيها.",
      requestReceived: "اقبلوا الطلب للرد.",
    },
    cancelEdit: "إلغاء التعديل",
    cancelReply: "إلغاء الرد",
    counter: (length, max) => `${length} / ${max} حرف`,
    editing: "تعديل الرسالة",
    hint: "Enter للإرسال · Shift+Enter لسطر جديد",
    label: "رسالتكم",
    placeholder: "اكتبوا رسالة…",
    replyTo: (name) => `رد على ${name}`,
    save: "حفظ",
    send: "إرسال",
    tooLong: "تتجاوز الرسالة 4000 حرف.",
    urgent: "عاجل",
    urgentHint: "وضع علامة عاجل على هذه الرسالة",
  },
  errors: {
    codes: {
      CONTACT_BLOCKED: "لقد حظرتم جهة الاتصال هذه: ألغوا الحظر لمراسلتها.",
      CONVERSATION_CLOSED: "محاوركم لم يعد في هذه المحادثة.",
      CONVERSATION_PENDING: "طلبكم في انتظار الرد: يمكن إرسال رسالة واحدة فقط قبل قبوله.",
      EDIT_WINDOW_CLOSED: "لا يمكن تعديل الرسالة إلا خلال 15 دقيقة من إرسالها.",
      INVALID_GROUP_MEMBERS: "يجب أن يكون أعضاء المجموعة مهنيين موثقين من فضائكم.",
      INVALID_MESSAGE_BODY: "يجب أن تحتوي الرسالة على 1 إلى 4000 حرف.",
      INVALID_TITLE: "يجب أن يحتوي اسم المجموعة على 1 إلى 120 حرفًا.",
      RECIPIENT_NOT_FOUND: "هذا المهني غير موجود أو لا يمكن التواصل معه.",
    },
    generic: "لم يكتمل الإجراء. أعيدوا المحاولة.",
    network: "الخادم لا يستجيب. تحققوا من الاتصال ثم أعيدوا المحاولة.",
  },
  list: {
    search: "البحث عن محادثة",
    searchPlaceholder: "الاسم أو المجموعة أو التخصص…",
    searchScope: "البحث في المحادثات المحمّلة ضمن هذا التبويب.",
    clearSearch: "مسح البحث",
    noResults: "لا توجد محادثة مطابقة.",
    results: (count) => `${count} من النتائج المعروضة`,
    deletedPreview: "رسالة محذوفة",
    empty: {
      all: "لا توجد محادثات حاليًا.",
      archived: "لا توجد محادثات مؤرشفة.",
      requests: "لا توجد طلبات في الانتظار.",
      unread: "لا توجد رسائل غير مقروءة.",
    },
    emptyHint: "راسلوا زميلًا موثقًا أو أنشئوا مجموعة فريق.",
    errorTitle: "تعذر تحميل المحادثات.",
    filters: { all: "الكل", archived: "المؤرشفة", requests: "الطلبات", unread: "غير المقروءة" },
    filtersLabel: "تصفية المحادثات",
    group: "مجموعة",
    label: "المحادثات",
    loadMore: "عرض المزيد من المحادثات",
    muted: "مكتومة",
    newConversation: "محادثة جديدة",
    noMessages: "لا توجد رسائل",
    pendingRequests: (count) =>
      count === 1 ? "طلب تواصل واحد في الانتظار" : `${count} طلبات تواصل في الانتظار`,
    request: "طلب",
    retry: "إعادة المحاولة",
    unread: (count) => (count === 1 ? "رسالة واحدة غير مقروءة" : `${count} رسائل غير مقروءة`),
    you: "أنتم",
  },
  message: {
    actions: "إجراءات الرسالة",
    cancel: "إلغاء",
    copy: "نسخ",
    delete: "حذف",
    deleteBody: "ستظهر كـ«رسالة محذوفة» لجميع المشاركين.",
    deleteTitle: "حذف هذه الرسالة؟",
    deleted: "رسالة محذوفة",
    discard: "تجاهل",
    edit: "تعديل",
    edited: "معدّلة",
    failed: "لم تُرسل",
    jumpTo: "الانتقال إلى الرسالة المقتبسة",
    quotedUnavailable: "رسالة مقتبسة",
    read: "مقروءة",
    readBy: (count) => `قرأها ${count}`,
    reply: "رد",
    retry: "إعادة المحاولة",
    sending: "جارٍ الإرسال…",
    sent: "أُرسلت",
    unavailable: "رسالة غير مقروءة تقنيًا",
    urgent: "عاجل",
    you: "أنتم",
  },
  newConversation: {
    blocked: "محظور",
    close: "إغلاق",
    create: "إنشاء المجموعة",
    groupTitle: "اسم المجموعة",
    groupTitleRequired: "اسم المجموعة إلزامي.",
    groupTitleTooLong: "لا يمكن أن يتجاوز اسم المجموعة 120 حرفًا.",
    members: "أعضاء فضائكم",
    membersSearch: "البحث عن عضو",
    noMembers: "لا يضم فضاؤكم مهنيًا موثقًا آخر.",
    noResults: "لا يوجد مهني يطابق هذا البحث.",
    otherWorkspace: "فضاء آخر · طلب تواصل",
    sameWorkspace: "فضاؤكم",
    search: "البحث عن مهني",
    searchPlaceholder: "الاسم أو التخصص أو الولاية",
    searching: "جارٍ البحث…",
    selectMembers: "اختاروا عضوًا واحدًا على الأقل.",
    selected: (count) => (count === 1 ? "عضو واحد مختار" : `${count} أعضاء مختارون`),
    speciality: "التخصص",
    startHint: "يظهر هنا المهنيون الموثقون الذين يقبلون التواصل.",
    subtitle: "راسلوا زميلًا موثقًا، أو اجمعوا أعضاء من فضائكم.",
    tabs: { group: "مجموعة فريق", peer: "زميل" },
    title: "محادثة جديدة",
    wilaya: "الولاية",
    write: "مراسلة",
    unblock: "إلغاء الحظر",
  },
  panel: {
    add: "إضافة",
    addMembers: "إضافة أعضاء",
    archive: "أرشفة المحادثة",
    archived: "محادثة مؤرشفة",
    block: (name) => `حظر ${name}`,
    blockConfirm: "لن يتمكن هذا الشخص من مراسلتكم ولا من إرسال طلب إليكم.",
    cancel: "إلغاء",
    close: "إغلاق التفاصيل",
    confirm: "تأكيد",
    discoverable: "قابل للتواصل من الزملاء",
    discoverableHint: "يمكن للمهنيين الموثقين في فضاءات أخرى العثور عليكم في الدليل ومراسلتكم.",
    leave: "مغادرة المجموعة",
    leaveConfirm: "مغادرة هذه المجموعة؟ لن تتمكنوا من الاطلاع على رسائلها بعد الآن.",
    members: "الأعضاء",
    mute: "كتم الإشعارات",
    muteOptions: { "1h": "ساعة واحدة", "24h": "24 ساعة", "8h": "8 ساعات", forever: "إلى أجل غير مسمى" },
    mutedForever: "مكتومة",
    mutedUntil: (date) => `مكتومة حتى ${date}`,
    noMoreMembers: "جميع أعضاء فضائكم موجودون بالفعل في المجموعة.",
    owner: "المالك",
    participants: "المشاركون",
    pending: "طلب في الانتظار",
    remove: (name) => `إزالة ${name} من المجموعة`,
    rename: "إعادة تسمية المجموعة",
    save: "حفظ",
    settings: "إعداداتي",
    title: "التفاصيل",
    titleLabel: "اسم المجموعة",
    unarchive: "إلغاء الأرشفة",
    unblock: (name) => `إلغاء حظر ${name}`,
    unmute: "إعادة تفعيل الإشعارات",
    you: "أنتم",
  },
  thread: {
    latest: "العودة إلى أحدث الرسائل",
    startTitle: "تبدأ المحادثة هنا.",
    startHint: "أرسلوا رسالتكم الأولى من مساحة الكتابة.",
    accept: "قبول",
    back: "العودة إلى المحادثات",
    block: "حظر",
    decline: "رفض",
    details: "تفاصيل المحادثة",
    errorTitle: "تعذر تحميل هذه المحادثة.",
    firstMessageOnly: "طلب تواصل: يمكن إرسال رسالة واحدة فقط قبل قبوله.",
    formerMember: "عضو سابق",
    group: (count) => `مجموعة · ${count} مشاركين`,
    loadOlder: "تحميل الرسائل السابقة",
    logLabel: "رسائل المحادثة",
    newMessages: "رسائل جديدة",
    notFound: "هذه المحادثة غير موجودة أو لم تعد متاحة لكم.",
    patientNotice: "تجنبوا كتابة اسم مريض أو بياناته هنا.",
    reconnecting: "جارٍ إعادة الاتصال…",
    requestReceived: (name) => `راسلكم ${name}.`,
    requestSent: "في انتظار الرد؛ رسالة واحدة فقط ممكنة.",
    selectHint: "تابعوا محادثة من صندوق الوارد أو ابدؤوا تبادلًا جديدًا مع زميل.",
    selectTitle: "المحادثة المناسبة، في المكان المناسب.",
    today: "اليوم",
    typing: (names) =>
      names.length === 1 ? `${names[0]} يكتب…` : names.length === 2 ? `${names[0]} و${names[1]} يكتبان…` : "عدة أشخاص يكتبون…",
    yesterday: "أمس",
  },
  title: "الرسائل",
};

export const messagingCopy: Record<Locale, MessagingCopy> = { ar, fr };
export type { MessagingCopy };
