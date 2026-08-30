"use client";

import { Button } from "@/components/ui/button";

/**
 * Wraps the deleteListing server action in a form with a client-side
 * confirm() prompt before submitting — the server action itself is the
 * real authority (it re-checks ownership and active-order status), this is
 * just the "Are you sure?" UX layer the spec asks for. When `disabled` is
 * true (an active/ongoing order exists on this listing) the button is
 * inert and explains why via its title tooltip, matching the inline note
 * already shown next to the listing.
 */
export function DeleteListingButton({
  listingId,
  action,
  disabled,
}: {
  listingId: string;
  action: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Are you sure you want to delete this listing?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="listingId" value={listingId} />
      <Button
        type="submit"
        variant="danger"
        size="sm"
        disabled={disabled}
        title={disabled ? "This listing has an active order and can't be deleted yet." : undefined}
      >
        Delete
      </Button>
    </form>
  );
}
