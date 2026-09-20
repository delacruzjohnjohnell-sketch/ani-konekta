import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] transition placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-green-600 focus:outline-none focus:ring-2 focus:ring-brand-green-600/25 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 file:-ml-3 file:mr-3 file:h-full file:cursor-pointer file:border-0 file:border-r file:border-neutral-300 file:bg-brand-green-50 file:px-3 file:text-sm file:font-medium file:text-brand-green-800 hover:file:bg-brand-green-100",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 transition placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-green-600 focus:outline-none focus:ring-2 focus:ring-brand-green-600/25 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full min-w-0 rounded-lg border border-neutral-300 bg-white pl-3 pr-9 text-sm text-neutral-900 transition hover:border-neutral-400 focus:border-brand-green-600 focus:outline-none focus:ring-2 focus:ring-brand-green-600/25 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium leading-snug text-brand-green-900", className)}
      {...props}
    />
  );
}
