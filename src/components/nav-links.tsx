"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type IconKey = "home" | "sms";

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  /** Show on small screens (icon only). Others appear from the sm breakpoint. */
  mobile?: boolean;
}

function Icon({ name }: { name: IconKey }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "sms") {
    return (
      <svg {...common}>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

/** Top-nav links with an on-brand active-page highlight (presentation only; same destinations as before). */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "items-center gap-1.5 rounded-full text-sm font-medium transition-colors",
              item.mobile ? "flex h-9 w-9 justify-center sm:h-auto sm:w-auto sm:px-3 sm:py-1.5" : "hidden px-3 py-1.5 sm:flex",
              active
                ? "bg-brand-green-100 text-brand-green-800"
                : "text-neutral-700 hover:bg-brand-green-50 hover:text-brand-green-800"
            )}
          >
            <Icon name={item.icon} />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
