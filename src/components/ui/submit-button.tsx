"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button that knows its own form's pending state via useFormStatus()
 * — must be rendered as a descendant of a <form> (e.g. inside <ActionForm>).
 * This exists instead of threading `pending` down as a render-prop because
 * a Server Component can't pass a function as a child into a Client
 * Component (see action-form.tsx) — but a Client Component like this one,
 * passed down as ordinary JSX, works fine and reads live form state itself.
 */
export function SubmitButton({
  label,
  pendingLabel,
  ...props
}: { label: string; pendingLabel?: string } & Omit<ButtonProps, "children">) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (pendingLabel ?? label) : label}
    </Button>
  );
}
