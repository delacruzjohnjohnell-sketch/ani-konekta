"use client";

import { useEffect, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { sendHaulerMessage } from "@/app/hauler-chat/actions";
import type { HaulerChatRole } from "@/lib/hauler-messaging";

const POLL_INTERVAL_MS = 7_000;

type Message = {
  id: string;
  body: string;
  senderId: string;
  senderRole: string;
  createdAt: string;
};

/**
 * One Hauler<->Buyer or Hauler<->Seller thread, scoped to a single order.
 * A hauler viewing an order renders two of these side by side (one per
 * counterpart); a buyer/seller renders just their own.
 */
export function HaulerChatPanel({
  orderId,
  chatRole,
  viewerId,
  title,
}: {
  orderId: string;
  chatRole: HaulerChatRole;
  viewerId: string;
  title: string;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [canSend, setCanSend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(
          `/api/orders/${orderId}/hauler-messages?chatRole=${chatRole}`
        );
        if (res.status === 403) {
          if (!cancelled) setError("Not authorized for this thread.");
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMessages(data.messages);
          setCanSend(data.canSend);
        }
      } catch {
        // Next poll retries.
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [orderId, chatRole]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-3">
      <p className="mb-2 text-sm font-semibold text-neutral-900">{title}</p>
      <div className="mb-2 max-h-56 space-y-2 overflow-y-auto">
        {messages == null && <p className="text-xs text-neutral-400">Loading…</p>}
        {messages?.length === 0 && (
          <p className="text-xs text-neutral-400">No messages yet — say hello!</p>
        )}
        {messages?.map((m) => {
          const mine = m.senderId === viewerId;
          return (
            <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  mine
                    ? "max-w-[80%] rounded-lg rounded-br-sm bg-brand-green-700 px-3 py-1.5 text-sm text-white"
                    : "max-w-[80%] rounded-lg rounded-bl-sm bg-neutral-100 px-3 py-1.5 text-sm text-neutral-900"
                }
              >
                {/* Plain text only — React escapes this by default, no HTML injection risk. */}
                {m.body}
              </div>
            </div>
          );
        })}
      </div>
      {canSend ? (
        <ActionForm action={sendHaulerMessage} className="flex items-center gap-2">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="chatRole" value={chatRole} />
          <Input name="body" placeholder="Type a message…" maxLength={2000} className="h-9 flex-1" />
          <SubmitButton label="Send" pendingLabel="…" size="sm" />
        </ActionForm>
      ) : (
        <p className="text-xs text-neutral-400">
          {messages != null ? "This thread is read-only right now." : ""}
        </p>
      )}
    </div>
  );
}
