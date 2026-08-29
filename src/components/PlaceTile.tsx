import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { TileArt } from "./TileArt";

/**
 * Location / subway tile.
 *
 * With no photograph we draw the place instead — see TileArt, which picks a
 * scene from what the place is known for. Set `image_url` on the row and the
 * photograph takes over with no code change.
 */
export function PlaceTile({
  href,
  slug,
  title,
  subtitle,
  imageUrl,
  kind = "region",
  lines = [],
}: {
  href: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  /** Picks the illustration when there is no photograph. */
  kind?: "region" | "station" | "university";
  /** Subway lines, so a station tile can wear its real line colours. */
  lines?: string[];
}) {
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
          <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105">
            <TileArt kind={kind} slug={slug} lines={lines} />
          </div>
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
