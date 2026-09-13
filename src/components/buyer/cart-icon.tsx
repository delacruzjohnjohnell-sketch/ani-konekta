"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart/cart-context";
import { CartDrawer } from "@/components/buyer/cart-drawer";
import { useT } from "@/lib/i18n/client";

/**
 * Small client leaf embedded in the otherwise-server Navbar — only this
 * component (and the drawer it opens) needs useCart(), so the rest of the
 * nav stays a server component.
 */
export function CartIcon() {
  const { itemCount } = useCart();
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("nav.cart")}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-brand-green-50 hover:text-brand-green-700"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {itemCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-gold-500 px-1 text-[10px] font-bold text-white">
            {itemCount}
          </span>
        )}
      </button>
      {open && <CartDrawer onClose={() => setOpen(false)} />}
    </>
  );
}
