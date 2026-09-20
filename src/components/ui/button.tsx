import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success" | "warning";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-brand-green-600 to-brand-green-800 text-white shadow-sm hover:from-brand-green-700 hover:to-brand-green-900 hover:shadow-md active:from-brand-green-800 active:to-brand-green-950 focus-visible:ring-brand-green-600",
  secondary:
    "bg-gradient-to-br from-brand-gold-400 to-brand-gold-600 text-brand-green-950 shadow-sm hover:from-brand-gold-500 hover:to-brand-gold-700 hover:shadow-md active:from-brand-gold-600 active:to-brand-gold-700 focus-visible:ring-brand-gold-500",
  outline:
    "border border-brand-green-700/70 text-brand-green-800 bg-white shadow-sm hover:border-brand-green-700 hover:bg-brand-green-50 active:bg-brand-green-100 focus-visible:ring-brand-green-700",
  ghost: "text-brand-green-800 hover:bg-brand-green-100/70 active:bg-brand-green-100",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md active:bg-red-800 focus-visible:ring-red-600",
  success:
    "bg-brand-green-600 text-white shadow-sm hover:bg-brand-green-700 hover:shadow-md active:bg-brand-green-800 focus-visible:ring-brand-green-600",
  warning:
    "border border-brand-gold-500/60 bg-brand-gold-100 text-brand-gold-900 hover:bg-brand-gold-200 active:bg-brand-gold-200 focus-visible:ring-brand-gold-500",
};

// min-h (not fixed h) so a long label wraps inside the button instead of escaping it.
const sizeClasses: Record<Size, string> = {
  sm: "min-h-9 px-3.5 py-1.5 text-[13px]",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-12 px-6 py-2.5 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-lg text-center font-semibold leading-tight transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&>svg]:size-4 [&>svg]:shrink-0",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
