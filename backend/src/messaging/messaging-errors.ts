import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

// Errors of the messaging, each with a stable code for the frontend. Nest's
// default exception filter sends the object body as is.

// Not a participant, or no longer one: never 403, so that the existence of
// a conversation is not revealed.
export const conversationNotFound = () =>
  new NotFoundException({
    code: 'CONVERSATION_NOT_FOUND',
    message: 'Conversation introuvable.',
  });

// The same answer for a user who does not exist, cannot be reached, or has
// blocked the caller.
export const recipientNotFound = () =>
  new NotFoundException({
    code: 'RECIPIENT_NOT_FOUND',
    message: 'Ce professionnel est introuvable ou ne peut pas être contacté.',
  });

export const participantNotFound = () =>
  new NotFoundException({
    code: 'PARTICIPANT_NOT_FOUND',
    message: "Ce professionnel n'est pas membre de ce groupe.",
  });

export const messageNotFound = () =>
  new NotFoundException({
    code: 'MESSAGE_NOT_FOUND',
    message: 'Message introuvable.',
  });

export const conversationTypeNotAvailable = () =>
  new BadRequestException({
    code: 'CONVERSATION_TYPE_NOT_AVAILABLE',
    message: "Ce type de conversation n'est pas encore disponible.",
  });

export const cannotMessageSelf = () =>
  new BadRequestException({
    code: 'CANNOT_MESSAGE_SELF',
    message: 'Vous ne pouvez pas ouvrir une conversation avec vous-même.',
  });

export const cannotBlockSelf = () =>
  new BadRequestException({
    code: 'CANNOT_BLOCK_SELF',
    message: 'Vous ne pouvez pas vous bloquer vous-même.',
  });

export const invalidGroupMembers = () =>
  new BadRequestException({
    code: 'INVALID_GROUP_MEMBERS',
    message:
      "Les membres d'un groupe doivent être des professionnels vérifiés de votre espace.",
  });

export const invalidTitle = () =>
  new BadRequestException({
    code: 'INVALID_TITLE',
    message: 'Le titre doit contenir de 1 à 120 caractères.',
  });

export const groupOnly = () =>
  new BadRequestException({
    code: 'GROUP_ONLY',
    message: 'Cette action ne concerne que les groupes.',
  });

export const nothingToUpdate = () =>
  new BadRequestException({
    code: 'NOTHING_TO_UPDATE',
    message: 'Aucune modification demandée.',
  });

export const ownerOnly = () =>
  new ForbiddenException({
    code: 'OWNER_ONLY',
    message: 'Seul le propriétaire du groupe peut faire cette action.',
  });

// The caller blocked this user: they unblock before writing again.
export const contactBlocked = () =>
  new ConflictException({
    code: 'CONTACT_BLOCKED',
    message: 'Vous avez bloqué ce contact : débloquez-le pour lui écrire.',
  });

// A request to a professional of another workspace carries one message
// until it is accepted.
export const conversationPending = () =>
  new ConflictException({
    code: 'CONVERSATION_PENDING',
    message:
      'Votre demande de contact attend une réponse : un seul message est possible avant son acceptation.',
  });

export const conversationClosed = () =>
  new ConflictException({
    code: 'CONVERSATION_CLOSED',
    message: "Votre interlocuteur n'est plus dans cette conversation.",
  });

export const notPending = () =>
  new ConflictException({
    code: 'CONVERSATION_NOT_PENDING',
    message: "Cette conversation n'est pas une demande en attente.",
  });

// Empty is accepted with attachments only.
export const invalidBody = () =>
  new BadRequestException({
    code: 'INVALID_MESSAGE_BODY',
    message: 'Le message doit contenir de 1 à 4 000 caractères.',
  });

// --- Urgent messages with acknowledgement -----------------------------------

export const ackRequiresUrgent = () =>
  new BadRequestException({
    code: 'ACK_REQUIRES_URGENT',
    message: "L'accusé de réception ne se demande que pour un message urgent.",
  });

export const ackNotRequired = () =>
  new ConflictException({
    code: 'ACK_NOT_REQUIRED',
    message: "Ce message ne demande pas d'accusé de réception.",
  });

export const cannotAckOwnMessage = () =>
  new ForbiddenException({
    code: 'CANNOT_ACK_OWN_MESSAGE',
    message: "L'expéditeur n'accuse pas réception de son propre message.",
  });

export const messageDeleted = () =>
  new ConflictException({
    code: 'MESSAGE_DELETED',
    message: 'Ce message a été supprimé.',
  });

// --- Case discussions --------------------------------------------------------

// Unknown, or outside the caller's scope: the same answer.
export const patientNotFound = () =>
  new NotFoundException({
    code: 'PATIENT_NOT_FOUND',
    message: 'Patient introuvable.',
  });

export const caseOnly = () =>
  new BadRequestException({
    code: 'CASE_ONLY',
    message: 'Cette action ne concerne que les discussions de cas.',
  });

export const invalidCaseMembers = () =>
  new BadRequestException({
    code: 'INVALID_CASE_MEMBERS',
    message:
      "Les participants d'une discussion de cas doivent être des professionnels vérifiés de l'espace du patient.",
  });

export const caseAlreadyOpen = () =>
  new ConflictException({
    code: 'CASE_ALREADY_OPEN',
    message: 'Une autre discussion est déjà ouverte pour ce patient.',
  });

export const invalidComment = () =>
  new BadRequestException({
    code: 'INVALID_COMMENT',
    message: 'Le commentaire ne doit pas dépasser 1 000 caractères.',
  });

// A message whose text cannot be read (altered, missing key): nothing to file.
export const messageUnavailable = () =>
  new ConflictException({
    code: 'MESSAGE_UNAVAILABLE',
    message: "Le contenu de ce message n'est pas disponible.",
  });

// --- Attachments ---------------------------------------------------------------

export const attachmentMissing = () =>
  new BadRequestException({
    code: 'ATTACHMENT_MISSING',
    message: 'Fichier manquant.',
  });

export const attachmentTooLarge = () =>
  new PayloadTooLargeException({
    code: 'ATTACHMENT_TOO_LARGE',
    message: 'Une pièce jointe ne doit pas dépasser 10 Mo.',
  });

// Decided on the file's first bytes, never on its name nor on the type the
// browser declared.
export const invalidAttachmentType = () =>
  new UnsupportedMediaTypeException({
    code: 'INVALID_ATTACHMENT_TYPE',
    message: 'Seuls les fichiers PDF, PNG et JPEG sont acceptés.',
  });

export const attachmentNotFound = () =>
  new NotFoundException({
    code: 'ATTACHMENT_NOT_FOUND',
    message: 'Pièce jointe introuvable.',
  });

// Not the sender's, of another conversation, already sent, or too many.
export const invalidAttachments = () =>
  new BadRequestException({
    code: 'INVALID_ATTACHMENTS',
    message:
      'Pièces jointes invalides : 5 au plus, envoyées par vous dans cette conversation et pas encore envoyées.',
  });

export const documentNotFound = () =>
  new NotFoundException({
    code: 'DOCUMENT_NOT_FOUND',
    message: 'Document introuvable dans le dossier de ce patient.',
  });

export const invalidReply = () =>
  new BadRequestException({
    code: 'INVALID_REPLY',
    message: "Le message cité n'appartient pas à cette conversation.",
  });

export const invalidHistoryQuery = () =>
  new BadRequestException({
    code: 'INVALID_HISTORY_QUERY',
    message: 'Indiquez beforeSeq ou afterSeq, pas les deux.',
  });

// The same clientMessageId already sent a message to another conversation.
export const clientMessageIdConflict = () =>
  new ConflictException({
    code: 'CLIENT_MESSAGE_ID_CONFLICT',
    message: 'Cet identifiant de message est déjà utilisé.',
  });

export const notMessageAuthor = () =>
  new ForbiddenException({
    code: 'NOT_MESSAGE_AUTHOR',
    message: "Seul l'auteur d'un message peut le modifier ou le supprimer.",
  });

export const messageNotEditable = () =>
  new ConflictException({
    code: 'MESSAGE_NOT_EDITABLE',
    message: 'Ce message ne peut plus être modifié.',
  });

export const editWindowClosed = () =>
  new ConflictException({
    code: 'EDIT_WINDOW_CLOSED',
    message:
      'Un message ne peut être modifié que dans les 15 minutes après son envoi.',
  });
