"use client";

import * as React from "react";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB — keep in sync with src/lib/blob-storage.ts

export interface PhotoUploadProps {
  /** form field name the File will be submitted under */
  name: string;
  id?: string;
  label?: string;
  required?: boolean;
  className?: string;
}

/**
 * Real file input for direct device camera/gallery attachment — replaces
 * any pasted-URL text field. Validates type/size client-side and shows a
 * live preview before submit. The file itself travels as part of the
 * <form>'s FormData to a server action, which re-validates and uploads it
 * (see src/lib/blob-storage.ts) — no separate /api/upload round trip.
 */
export function PhotoUpload({ name, id, label = "Photo", required, className }: PhotoUploadProps) {
  const inputId = id ?? name;
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFileName(null);

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max size is 8MB.`);
      e.target.value = "";
      return;
    }

    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
  }

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={inputId}>
        {label}
        {required ? " (required)" : " (optional)"}
      </Label>
      <input
        id={inputId}
        name={name}
        type="file"
        accept="image/*"
        capture="environment"
        required={required}
        onChange={handleChange}
        className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-green-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-green-800"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {previewUrl && (
        <div className="flex items-center gap-3 rounded-lg border border-black/10 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Preview" className="h-16 w-16 rounded-md object-cover" />
          <p className="truncate text-sm text-neutral-600">{fileName}</p>
        </div>
      )}
    </div>
  );
}
