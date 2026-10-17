import { type Conversation } from "./messaging.types";

const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();

// Search only the identity of loaded conversations; message content stays in the thread.
export function matchesConversationSearch(conversation: Conversation, search: string, myUserId: string): boolean {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const patient = conversation.patient;
  const identity = normalize([
    conversation.title,
    // A case discussion: its patient, in both scripts.
    ...(patient ? [patient.firstName, patient.lastName, patient.firstNameAr, patient.lastNameAr] : []),
    ...conversation.participants
      .filter((participant) => participant.userId !== myUserId)
      .flatMap((participant) => [participant.fullName, participant.speciality, participant.establishmentName]),
  ].filter(Boolean).join(" "));
  return terms.every((term) => identity.includes(term));
}
