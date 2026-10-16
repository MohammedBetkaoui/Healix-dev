import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
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

export const invalidBody = () =>
  new BadRequestException({
    code: 'INVALID_MESSAGE_BODY',
    message: 'Le message doit contenir de 1 à 4 000 caractères.',
  });

// Lot 4 (urgent messages with acknowledgement).
export const ackNotAvailable = () =>
  new BadRequestException({
    code: 'ACK_NOT_AVAILABLE',
    message: "L'accusé de lecture n'est pas encore disponible.",
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
