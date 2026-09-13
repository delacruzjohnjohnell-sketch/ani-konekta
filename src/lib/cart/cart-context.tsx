"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = {
  listingId: string;
  sellerId: string;
  sellerName: string;
  cropType: string;
  variety: string | null;
  photoUrl: string | null;
  pricePerKg: number;
  qtyKg: number;
  availableKg: number;
  minOrderQtyKg: number | null;
  municipality: string;
};

type CartContextValue = {
  lines: CartLine[];
  addItem: (line: Omit<CartLine, "qtyKg">, qtyKg: number) => void;
  updateQty: (listingId: string, qtyKg: number) => void;
  removeItem: (listingId: string) => void;
  clear: () => void;
  itemCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "ani_cart_v1";

/**
 * Client-only cart (localStorage) — adding to cart is a pure client
 * mutation with no server round trip, so "Add to Cart" is always a plain
 * onClick, never a <form>. This sidesteps the buyer dashboard's existing
 * non-nested-<form> constraint entirely: the ONLY real <form> on the page
 * is checkout, in the cart drawer, a sibling of the listing grid — never
 * nested inside a listing card's own <form action={placeOrder}> ("Buy Now").
 *
 * The cart is never trusted for money math — checkoutCart re-validates
 * every line (price, stock, minimum) against the live Listing row.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      // Private browsing / storage blocked — cart just starts empty.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Ignore write failures (quota, private mode) — cart still works
      // for the current page load, just won't persist.
    }
  }, [lines, hydrated]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      addItem: (line, qtyKg) => {
        setLines((prev) => {
          const existing = prev.find((l) => l.listingId === line.listingId);
          if (existing) {
            return prev.map((l) =>
              l.listingId === line.listingId
                ? { ...l, qtyKg: Math.min(l.qtyKg + qtyKg, l.availableKg) }
                : l
            );
          }
          return [...prev, { ...line, qtyKg }];
        });
      },
      updateQty: (listingId, qtyKg) => {
        setLines((prev) =>
          prev.map((l) => (l.listingId === listingId ? { ...l, qtyKg } : l))
        );
      },
      removeItem: (listingId) => {
        setLines((prev) => prev.filter((l) => l.listingId !== listingId));
      },
      clear: () => setLines([]),
      itemCount: lines.length,
    }),
    [lines]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider.");
  return ctx;
}
