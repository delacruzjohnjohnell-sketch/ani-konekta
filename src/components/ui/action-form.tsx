"use client";

import { useActionState, useEffect, useRef } from "react";

export type ActionState = { error?: string; success?: boolean } | null;

export type BoundAction = (
  prevState: ActionState,
  formData: FormData
) => Promise<ActionState>;

/**
 * Shared wrapper for every mutating form in the app. Fixes the app-wide bug
 * where an uncaught Error thrown from a plain `<form action={fn}>` server
 * action crashes the whole page to Next's generic error screen (see
 * seller "Post Listing", but the same plain-form pattern is used by every
 * mutating form here). Server actions used with this wrapper must return
 * `{ error: string }` instead of throwing, and must call redirect() (if any)
 * OUTSIDE/AFTER any try/catch, since Next's redirect() throws internally and
 * must never be swallowed into `{ error }`.
 *
 * `children` is a plain ReactNode (NOT a render-prop function) — a Server
 * Component parent can only pass serializable JSX across the Server/Client
 * boundary into a Client Component like this one; a function child throws
 * "Functions are not valid as a child of Client Components". For a
 * pending/disabled submit button, use <SubmitButton> (submit-button.tsx)
 * inside children — it reads pending state itself via useFormStatus(),
 * which works because it's a Client Component nested in this <form>, not a
 * function passed down as a prop.
 *
 * - Shows an inline red error banner instead of crashing.
 * - Resets the form only after a successful submit (state.success === true).
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
}: {
  action: BoundAction;
  children: React.ReactNode;
  className?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    action,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {state?.error && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}
      {children}
    </form>
  );
}
