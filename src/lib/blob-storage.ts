/**
 * Photo upload storage (Feature: direct file attachment, never a URL field).
 *
 * Backed by Vercel Blob (@vercel/blob) — the simplest option for a
 * Vercel-hosted app, and already anticipated by .env.example's
 * BLOB_READ_WRITE_TOKEN. Server-side only.
 *
 * A photo is stored under a content-addressed Blob URL; we save that URL
 * verbatim as the entity's `photoBlobKey` value. The important property
 * isn't the shape of the string — it's that it is always produced by this
 * upload function (never typed by a user into a form field).
 */
import { put } from "@vercel/blob";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

export class PhotoValidationError extends Error {}

/** Client- and server-shared validation (kept here so both sides agree). */
export function validatePhotoFile(file: { type: string; size: number }) {
  if (!file.type || !file.type.startsWith("image/")) {
    throw new PhotoValidationError("Only image files are allowed.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError(
      `Photo is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max size is 8MB.`
    );
  }
}

/**
 * Uploads a photo File (from a server action's FormData) to Vercel Blob and
 * returns the storage key to persist on the entity (photoBlobKey).
 *
 * `folder` namespaces the blob path, e.g. "listings" or "proof-of-delivery".
 */
export async function uploadPhoto(file: File, folder: string): Promise<string> {
  validatePhotoFile(file);

  // On Vercel, a connected Blob store authenticates automatically via OIDC
  // (process.env.VERCEL is set on every Vercel deployment) -- no explicit
  // token needed there. Locally (npm run dev), there's no OIDC federation,
  // so BLOB_READ_WRITE_TOKEN must be set in .env or uploads will fail.
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL) {
    throw new Error(
      "Photo upload is not configured yet: BLOB_READ_WRITE_TOKEN is not set. " +
        "Copy it from your Vercel Blob store's Settings -> .env.local tab into your local .env file."
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(`${folder}/${Date.now()}-${safeName}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return blob.url;
}

/**
 * Render-time seam: given a stored photoBlobKey, resolve it to a URL the
 * <img> tag can load. Currently a passthrough (Vercel Blob keys already ARE
 * served URLs), but keeping this function means we can switch to signed
 * URLs / a different storage backend later without touching any page.
 */
export function resolvePhotoUrl(photoBlobKey: string | null | undefined): string | null {
  if (!photoBlobKey) return null;
  return photoBlobKey;
}
