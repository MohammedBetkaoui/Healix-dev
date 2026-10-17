import { renderToStaticMarkup } from "react-dom/server";

import { messagingCopy } from "@/features/messaging/messaging.copy";
import { type ComposerAvailability } from "@/features/messaging/messaging-rules";

import { MessageComposer } from "./MessageComposer";
import { MessageText, RequestBanner, UnreadCountBadge } from "./messaging-ui";

const fr = messagingCopy.fr;

describe("MessageText", () => {
  it("renders http(s) links in a new tab, without access to the opener", () => {
    const html = renderToStaticMarkup(<MessageText text={"Compte rendu : https://healix.dz/cr/12\nMerci"} />);

    expect(html).toContain('<a href="https://healix.dz/cr/12" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">https://healix.dz/cr/12</a>");
    // The line break stays a character, shown by white-space: pre-wrap.
    expect(html).toContain("\nMerci");
  });

  it("never turns the text into HTML", () => {
    const html = renderToStaticMarkup(
      <MessageText text={'<img src=x onerror="alert(1)"><script>alert(2)</script> javascript:alert(3)'} />,
    );

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("href=\"javascript");
  });
});

describe("UnreadCountBadge", () => {
  it("shows 99+ beyond 99, with the count in words", () => {
    const html = renderToStaticMarkup(<UnreadCountBadge count={140} label={fr.list.unread(140)} />);
    expect(html).toContain(">99+</span>");
    expect(html).toContain('aria-label="140 messages non lus"');
    expect(renderToStaticMarkup(<UnreadCountBadge count={1} label={fr.list.unread(1)} />)).toContain('aria-label="1 message non lu"');
  });

  it("shows nothing without unread message", () => {
    expect(renderToStaticMarkup(<UnreadCountBadge count={0} label="" />)).toBe("");
  });
});

describe("RequestBanner", () => {
  it("offers to accept, decline or block a request received", () => {
    const html = renderToStaticMarkup(
      <RequestBanner
        variant="received"
        text={fr.thread.requestReceived("Dr Samir Kaci")}
        labels={{ accept: fr.thread.accept, block: fr.thread.block, decline: fr.thread.decline }}
        onAccept={() => undefined}
        onDecline={() => undefined}
        onBlock={() => undefined}
      />,
    );

    expect(html).toContain("Dr Samir Kaci vous a écrit.");
    for (const label of ["Accepter", "Refuser", "Bloquer"]) expect(html).toContain(label);
  });

  it("says a request sent waits for its answer", () => {
    expect(renderToStaticMarkup(<RequestBanner variant="sent" text={fr.thread.requestSent} />)).toContain(
      "En attente de réponse ; un seul message possible.",
    );
  });
});

describe("MessageComposer", () => {
  const render = (availability: ComposerAvailability) =>
    renderToStaticMarkup(
      <MessageComposer
        conversationId="c-1"
        availability={availability}
        copy={fr}
        locale="fr"
        replyTo={null}
        onCancelReply={() => undefined}
        editing={null}
        onCancelEdit={() => undefined}
        onSend={() => undefined}
        onSaveEdit={() => undefined}
        onTyping={() => undefined}
      />,
    );

  it("is closed, with its reason, while a request waits for an answer", () => {
    const received = render({ canWrite: false, reason: "requestReceived" });
    expect(received).not.toContain("<textarea");
    expect(received).toContain("Acceptez la demande pour répondre.");

    expect(render({ canWrite: false, reason: "awaitingReply" })).toContain("un seul message est possible");
  });

  it("is open otherwise, with the keyboard shortcuts spelled out", () => {
    const html = render({ canWrite: true, notice: "firstMessageOnly" });
    expect(html).toContain("<textarea");
    expect(html).toContain("Entrée pour envoyer · Maj+Entrée pour un retour à la ligne");
    expect(html).toContain(fr.thread.firstMessageOnly);
    expect(html).toContain('aria-pressed="false"');
  });
});
