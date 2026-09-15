"use client";

import { sendMessage } from "@/app/messages/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const t = useT();
  return (
    <ActionForm action={sendMessage} className="flex gap-2 border-t border-black/10 p-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <Input name="body" placeholder={t("messages.composer.placeholder")} className="flex-1" autoComplete="off" />
      <SubmitButton label={t("messages.composer.send")} pendingLabel={t("messages.composer.sending")} />
    </ActionForm>
  );
}
