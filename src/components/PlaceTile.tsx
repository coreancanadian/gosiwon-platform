import Image from "next/image";
import { Link } from "@/i18n/navigation";

/**
 * Location / subway tile.
 *
 * Real photography is the goal, but licensed photos of every district aren't
 * available yet — so when `imageUrl` is null we render a deterministic duotone
 * gradient derived from the slug. Same slug always gets the same colours, which
 * makes the grid look designed rather than broken. Set `image_url` on the row
 * and the photo takes over with no code change.
 */
function hueFromSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash << 5) - hash + slug.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function PlaceTile({
  href,
  slug,
  title,
  subtitle,
  imageUrl,
}: {
  href: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
}) {
  const hue = hueFromSlug(slug);
  const gradient = `linear-gradient(145deg,
    hsl(${hue} 62% 58%) 0%,
    hsl(${(hue + 38) % 360} 58% 44%) 55%,
    hsl(${(hue + 68) % 360} 54% 34%) 100%)`;

  return (
    <Link
      href={href}
      className="group focus-visible:ring-brand-500 block overflow-hidden rounded-[var(--radius-card)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-card)]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            style={{ background: gradient }}
            className="absolute inset-0 transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="text-[15px] leading-tight font-semibold text-white drop-shadow-sm">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-white/80">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
