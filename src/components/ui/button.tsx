import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-brand-green-600 to-brand-green-800 text-white shadow-sm hover:from-brand-green-700 hover:to-brand-green-900 focus-visible:ring-brand-green-600",
  secondary:
    "bg-gradient-to-br from-brand-gold-400 to-brand-gold-600 text-brand-green-950 shadow-sm hover:from-brand-gold-500 hover:to-brand-gold-700 focus-visible:ring-brand-gold-500",
  outline:
    "border border-brand-green-700 text-brand-green-700 bg-white hover:bg-brand-green-50 focus-visible:ring-brand-green-700",
  ghost: "text-brand-green-700 hover:bg-brand-green-50",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
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
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
