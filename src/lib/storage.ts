/**
 * `property_images.storage_path` holds a bucket-relative path
 * ("<property_id>/<uuid>.jpg"), not a URL. Anything rendering a photo must run
 * it through here first.
 *
 * Pure and env-only, so it works in Server and Client Components alike.
 */
export function publicImageUrl(storagePath: string): string {
  // Already absolute (e.g. seeded from an external source).
  if (/^https?:\/\//.test(storagePath)) return storagePath;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return storagePath; // demo mode — nothing to resolve against

  return `${base}/storage/v1/object/public/property-images/${storagePath}`;
}
