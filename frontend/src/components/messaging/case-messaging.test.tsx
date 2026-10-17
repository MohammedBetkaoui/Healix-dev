import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { caseMessagingCopy } from "@/features/messaging/case-messaging.copy";
import { messagingCopy } from "@/features/messaging/messaging.copy";
import { type AckState } from "@/features/messaging/messaging-rules";
import { type Conversation, type MessageView } from "@/features/messaging/messaging.types";
import { type DraftAttachment } from "@/features/messaging/use-draft-attachments";

import { DraftAttachmentList } from "./attachments";
import { AckStatus, CaseNotice, FileToRecordDialog } from "./case-ui";
import { ConversationThread } from "./ConversationThread";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";

const fr = messagingCopy.fr;
const caseFr = caseMessagingCopy.fr;
const ME = "user-me";

function withQueries(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function message(overrides: Partial<MessageView> = {}): MessageView {
  return {
    ackedByMe: false,
    acks: [],
    attachments: [],
    body: "Avis : pas de contre-indication.",
    bodyUnavailable: false,
    clientMessageId: null,
    conversationId: "c-1",
    createdAt: "2026-10-17T11:00:00.000Z",
    deleted: false,
    editedAt: null,
    filedToRecord: false,
    id: "m-1",
    kind: "TEXT",
    pendingAck: [],
    priority: "NORMAL",
    replyToId: null,
    requiresAck: false,
    senderId: "user-samir",
    seq: 1,
    ...overrides,
  };
}

type BubbleExtras = {
  message: MessageView;
  ack?: { state: AckState; canAck: boolean; busy: boolean; onAck: () => void };
};

const bubble = (props: BubbleExtras) =>
  withQueries(
    <MessageBubble
      kind="message"
      mine={false}
      authorName={null}
      quote={null}
      receipt={null}
      canEdit={false}
      canDelete={false}
      onReply={() => undefined}
      onEdit={() => undefined}
      onDelete={() => undefined}
      onJumpTo={() => undefined}
      copy={fr}
      locale="fr"
      {...props}
    />,
  );

describe("composer with attachments", () => {
  const render = (patientId: string | null) =>
    withQueries(
      <MessageComposer
        conversationId="c-1"
        availability={{ canWrite: true, notice: null }}
        copy={fr}
        locale="fr"
        replyTo={null}
        onCancelReply={() => undefined}
        editing={null}
        onCancelEdit={() => undefined}
        onSend={() => undefined}
        onSaveEdit={() => undefined}
        onTyping={() => undefined}
        patientId={patientId}
      />,
    );

  it("offers to attach files, and a document of the record in a case discussion only", () => {
    expect(render(null)).toContain("Joindre");
    expect(render(null)).not.toContain(caseFr.composer.attachFromRecord);
    expect(render("p-1")).toContain(caseFr.composer.attachFromRecord);
    expect(render(null)).toContain('accept="application/pdf,image/png,image/jpeg');
  });

  it("asks an acknowledgement only once the message is urgent", () => {
    const html = render(null);
    expect(html).toContain(caseFr.composer.requiresAck);
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
    expect(html).toContain(caseFr.composer.requiresAckHint);
  });

  it("lists the files being sent: progress, failure with retry, size once sent, each removable", () => {
    const draft = (overrides: Partial<DraftAttachment>): DraftAttachment => ({
      errorText: null,
      file: new File(["%PDF"], "ECG.pdf", { type: "application/pdf" }),
      key: "d-1",
      mimeType: "application/pdf",
      name: "ECG.pdf",
      previewUrl: null,
      progress: 0.4,
      sizeBytes: 2_400_000,
      status: "uploading",
      uploaded: null,
      ...overrides,
    });
    const html = renderToStaticMarkup(
      <DraftAttachmentList
        drafts={[
          draft({}),
          draft({ errorText: "Seuls les fichiers PDF, PNG et JPEG sont acceptés.", key: "d-2", name: "radio.png", status: "failed" }),
          draft({ key: "d-3", name: "Bilan.pdf", progress: 1, status: "ready" }),
        ]}
        onRemove={() => undefined}
        onRetry={() => undefined}
        copy={caseFr}
        locale="fr"
      />,
    );

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain("Envoi : 40 %");
    expect(html).toContain("Échec de l’envoi : Seuls les fichiers PDF, PNG et JPEG sont acceptés.");
    expect(html).toContain('aria-label="Réessayer"');
    expect(html).toMatch(/2,3\s?Mo/);
    for (const name of ["ECG.pdf", "radio.png", "Bilan.pdf"]) expect(html).toContain(`aria-label="Retirer ${name}"`);
  });
});

describe("urgent message acknowledgement", () => {
  it("tells the sender how many acknowledgements are still expected, in words", () => {
    const html = renderToStaticMarkup(
      <AckStatus state={{ count: 2, kind: "pending", names: [] }} canAck={false} busy={false} onAck={() => undefined} copy={caseFr} locale="fr" />,
    );
    expect(html).toContain("En attente d’accusé (2)");
    expect(html).not.toContain("<button");
  });

  it("says who acknowledged and when", () => {
    const html = renderToStaticMarkup(
      <AckStatus
        state={{ kind: "acked", lastAckedAt: "2026-10-17T11:41:00.000Z", names: ["Dr Kaci"] }}
        canAck={false}
        busy={false}
        onAck={() => undefined}
        copy={caseFr}
        locale="fr"
      />,
    );
    // 11:41 UTC is 12:41 in Algiers.
    expect(html).toContain("Accusé par Dr Kaci à 12:41");
  });

  it("gives the recipient its button, under the URGENT badge", () => {
    const html = bubble({
      ack: { busy: false, canAck: true, onAck: () => undefined, state: { count: 1, kind: "pending", names: [] } },
      message: message({ pendingAck: [{ fullName: "Dr Me", userId: ME }], priority: "URGENT", requiresAck: true }),
    });
    expect(html).toContain(`>${fr.message.urgent}</span>`);
    expect(html).toContain(caseFr.message.ackRequested);
    expect(html).toContain(">Accuser réception</button>");
  });
});

describe("filing to the record", () => {
  it("shows exactly the text that will be filed, with its author and date, before confirming", () => {
    const html = renderToStaticMarkup(
      <FileToRecordDialog
        open
        content={"Avis : pas de contre-indication.\n[Pièce jointe : ECG.pdf]"}
        authorName="Dr Samir Kaci"
        sentAt="2026-10-17T11:41:00.000Z"
        busy={false}
        error={null}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        copy={caseFr}
        locale="fr"
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Avis : pas de contre-indication.\n[Pièce jointe : ECG.pdf]");
    expect(html).toContain("Avis de Dr Samir Kaci · ");
    expect(html).toContain(caseFr.fileDialog.comment);
    expect(html).toContain(`>${caseFr.fileDialog.confirm}</button>`);
  });

  it("marks a filed message", () => {
    expect(bubble({ message: message({ filedToRecord: true }) })).toContain("Versé au dossier");
    expect(bubble({ message: message() })).not.toContain("Versé au dossier");
  });
});

describe("case discussion banner", () => {
  const conversation = (type: Conversation["type"]): Conversation => ({
    archivedAt: null,
    createdAt: "2026-10-17T08:00:00.000Z",
    createdById: ME,
    id: "c-1",
    lastMessage: null,
    lastMessageAt: null,
    lastSeq: 0,
    me: { lastReadSeq: 0, mutedUntil: null, role: "OWNER", status: "ACTIVE" },
    participants: [
      { establishmentName: "Clinique Ibn Sina", fullName: "Dr Me", role: "OWNER", speciality: null, status: "ACTIVE", userId: ME },
      { establishmentName: "Clinique Ibn Sina", fullName: "Dr Kaci", role: "MEMBER", speciality: null, status: "ACTIVE", userId: "user-samir" },
    ],
    patient:
      type === "CASE"
        ? {
            birthDate: "1980-05-01T00:00:00.000Z",
            firstName: "Amina",
            firstNameAr: "أمينة",
            id: "p-1",
            lastName: "Benali",
            lastNameAr: "بن علي",
          }
        : null,
    title: type === "CASE" ? "Cas — BENALI Amina" : "Équipe",
    type,
    unreadCount: 0,
    workspaceId: "w-1",
  });
  const thread = (type: Conversation["type"]) =>
    withQueries(
      <ConversationThread
        conversation={conversation(type)}
        myUserId={ME}
        blockedUserIds={new Set()}
        copy={fr}
        locale="fr"
        panelOpen={false}
        onTogglePanel={() => undefined}
        onBack={() => undefined}
        onClosed={() => undefined}
        errorText={() => ""}
      />,
    );

  it("replaces the patient data notice with the trace notice in a case discussion", () => {
    const html = thread("CASE");
    expect(html).toContain("Discussion de cas — chaque accès est tracé dans le dossier du patient.");
    expect(html).not.toContain(fr.thread.patientNotice);
    expect(html).toContain("BENALI Amina");
  });

  it("keeps the patient data notice elsewhere", () => {
    const html = thread("GROUP");
    expect(html).toContain(fr.thread.patientNotice);
    expect(html).not.toContain(caseFr.thread.caseNotice);
  });

  it("has a notice that does not rely on colour alone", () => {
    expect(renderToStaticMarkup(<CaseNotice text={caseFr.thread.caseNotice} />)).toContain(caseFr.thread.caseNotice);
  });
});
