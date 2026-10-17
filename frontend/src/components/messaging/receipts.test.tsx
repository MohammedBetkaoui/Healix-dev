import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { messagingCopy } from "@/features/messaging/messaging.copy";
import { messagingKeys } from "@/features/messaging/messaging-query-keys";
import { type Receipt } from "@/features/messaging/messaging-rules";
import { type MessageReaders, type MessageView } from "@/features/messaging/messaging.types";

import { ConversationList } from "./ConversationList";
import { MessageBubble } from "./MessageBubble";
import { ReadersDialog } from "./receipts";

const fr = messagingCopy.fr;
const ME = "user-me";

// Queries never run here: the data is put in the cache beforehand.
function render(node: ReactNode, cache: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  for (const [key, data] of cache) client.setQueryData(key, data);
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function message(overrides: Partial<MessageView> = {}): MessageView {
  return {
    ackedByMe: false,
    acks: [],
    attachments: [],
    body: "Avis transmis.",
    bodyUnavailable: false,
    clientMessageId: null,
    conversationId: "c-1",
    createdAt: "2026-10-18T13:00:00.000Z",
    deleted: false,
    editedAt: null,
    filedToRecord: false,
    id: "m-1",
    kind: "TEXT",
    pendingAck: [],
    priority: "NORMAL",
    replyToId: null,
    requiresAck: false,
    senderId: ME,
    seq: 1,
    ...overrides,
  };
}

const bubble = (receipt: Receipt, pinned = true, cache: [readonly unknown[], unknown][] = []) =>
  render(
    <MessageBubble
      kind="message"
      message={message()}
      mine
      authorName={null}
      quote={null}
      receipt={{ pinned, receipt }}
      canEdit={false}
      canDelete={false}
      onReply={() => undefined}
      onEdit={() => undefined}
      onDelete={() => undefined}
      onJumpTo={() => undefined}
      copy={fr}
      locale="fr"
    />,
    cache,
  );

const readers: MessageReaders = {
  notSeen: [{ fullName: "Dr Haddad", userId: "u-3" }],
  notShared: [{ fullName: "Dr Saadi", userId: "u-4" }],
  seen: [
    { fullName: "Dr Kaci", seenAt: "2026-10-18T13:32:00.000Z", userId: "u-2" },
    { fullName: "Dr Benali", seenAt: "2026-10-18T13:40:00.000Z", userId: "u-5" },
  ],
};

describe("read status under my messages", () => {
  it("says sent with one check", () => {
    const html = bubble({ kind: "sent" });
    expect(html).toContain("lucide-check");
    expect(html).toContain("Envoyé");
    expect(html).not.toContain("lucide-check-check");
  });

  it("says seen with two checks in the accent colour and in words, with the time it was seen", () => {
    const html = bubble({ kind: "seen" }, true, [[messagingKeys.readers("m-1"), readers]]);
    expect(html).toContain("lucide-check-check");
    expect(html).toContain("text-[var(--medical)]");
    expect(html).toContain(">Vu<");
    // 13:32 UTC is 14:32 in Algiers.
    expect(html).toContain('title="Vu à 14:32"');
    expect(html).toContain("(Vu à 14:32)");
  });

  it("counts the readers of a group message, and opens who they are", () => {
    const html = bubble({ kind: "seenBy", seen: 3, total: 5 });
    expect(html).toContain("Vu par 3 sur 5");
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"/);
  });

  it("is not repeated under every bubble: only pinned ones show it without hover", () => {
    expect(bubble({ kind: "seen" }, false)).not.toContain(">Vu<");
    expect(bubble({ kind: "sent" }, false)).not.toContain("Envoyé");
  });
});

describe("readers of a message", () => {
  it("lists who saw it and when, who has not yet, and whose reading is not shared", () => {
    const html = render(<ReadersDialog open messageId="m-1" onClose={() => undefined} copy={fr} locale="fr" />, [
      [messagingKeys.readers("m-1"), readers],
    ]);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Vu par (2)");
    expect(html).toContain("Dr Kaci");
    expect(html).toContain(">14:32</time>");
    expect(html).toContain("Pas encore vu (1)");
    expect(html).toContain("Non communiqué (1)");
    expect(html).toContain(fr.message.readersNotSharedHint);
  });
});

describe("read receipts setting", () => {
  it("sits next to « Joignable par des confrères », with the reciprocity explained", () => {
    const html = render(
      <ConversationList
        filter="all"
        onFilterChange={() => undefined}
        selectedId={null}
        onSelect={() => undefined}
        onNewConversation={() => undefined}
        myUserId={ME}
        copy={fr}
        locale="fr"
      />,
      [[messagingKeys.settings, { discoverableByPeers: true, shareReadReceipts: false }]],
    );
    expect(html).toContain("Joignable par des confrères");
    expect(html).toContain("Accusés de lecture");
    expect(html).toContain(fr.panel.readReceiptsHint);
    expect(html.match(/role="switch" aria-checked="(true|false)"/g)).toEqual([
      'role="switch" aria-checked="true"',
      'role="switch" aria-checked="false"',
    ]);
  });
});
