"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Grid3x3, ImageOff, X, ChevronLeft, ChevronRight } from "lucide-react";

export interface GalleryImage {
  url: string;
  alt: string;
}

/**
 * Airbnb-style hero mosaic: one large image plus a 2x2 grid, collapsing to a
 * single image on small screens. "View all photos" opens a keyboard-navigable
 * lightbox.
 */
export function PhotoGallery({ images }: { images: GalleryImage[] }) {
  const t = useTranslations("Property");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isOpen = lightboxIndex !== null;

  useEffect(() => {
    if (!isOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i === null ? i : (i + 1) % images.length));
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) =>
          i === null ? i : (i - 1 + images.length) % images.length,
        );
    }

    window.addEventListener("keydown", onKey);
    // Stop the page scrolling behind the lightbox.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, images.length]);

  if (images.length === 0) {
    return (
      <div className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-ink-50 sm:h-64">
        <ImageOff className="h-8 w-8 text-ink-400" aria-hidden />
        <p className="text-sm text-ink-500">{t("photoCount", { count: 0 })}</p>
      </div>
    );
  }

  const [hero, ...rest] = images;
  const thumbs = rest.slice(0, 4);

  return (
    <>
      <div className="relative">
        <div className="grid gap-2 overflow-hidden rounded-[var(--radius-card)] sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            className="relative aspect-[4/3] w-full sm:aspect-auto sm:h-full lg:col-span-2 lg:row-span-2"
          >
            <Image
              src={hero.url}
              alt={hero.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover transition hover:brightness-95"
            />
          </button>

          {thumbs.map((image, i) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setLightboxIndex(i + 1)}
              className="relative hidden aspect-[4/3] w-full lg:block"
            >
              <Image
                src={image.url}
                alt={image.alt}
                fill
                sizes="25vw"
                className="object-cover transition hover:brightness-95"
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setLightboxIndex(0)}
          className="absolute right-4 bottom-4 flex items-center gap-2 rounded-lg border border-ink-800 bg-white px-3.5 py-2 text-sm font-medium text-ink-900 shadow-sm transition hover:bg-ink-50"
        >
          <Grid3x3 className="h-4 w-4" aria-hidden />
          {t("viewAllPhotos")}
        </button>
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("viewAllPhotos")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92"
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label={t("viewAllPhotos")}
            className="absolute top-4 right-4 rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>

          <p className="absolute top-6 left-6 text-sm text-white/70">
            {lightboxIndex + 1} / {images.length}
          </p>

          {images.length > 1 ? (
            <button
              type="button"
              onClick={() =>
                setLightboxIndex((i) =>
                  i === null ? i : (i - 1 + images.length) % images.length,
                )
              }
              className="absolute left-4 rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="h-7 w-7" aria-hidden />
            </button>
          ) : null}

          <div className="relative h-[80vh] w-[90vw] max-w-5xl">
            <Image
              src={images[lightboxIndex].url}
              alt={images[lightboxIndex].alt}
              fill
              sizes="90vw"
              className="object-contain"
            />
          </div>

          {images.length > 1 ? (
            <button
              type="button"
              onClick={() =>
                setLightboxIndex((i) =>
                  i === null ? i : (i + 1) % images.length,
                )
              }
              className="absolute right-4 rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="h-7 w-7" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
