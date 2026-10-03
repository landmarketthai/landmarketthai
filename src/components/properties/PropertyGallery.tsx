"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { uniqueGalleryImages } from "@/lib/public-seo";
import type { PropertyDetailImage } from "@/lib/property-detail-data";

interface Props {
  images: PropertyDetailImage[];
  title: string;
}

interface LightboxProps {
  images: PropertyDetailImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

function PropertyLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: LightboxProps) {
  const touchStartX = useRef<number | null>(null);
  const hasMultiple = images.length > 1;
  const currentImage = images[index];

  const goToPrevious = useCallback(() => {
    onIndexChange((index - 1 + images.length) % images.length);
  }, [images.length, index, onIndexChange]);

  const goToNext = useCallback(() => {
    onIndexChange((index + 1) % images.length);
  }, [images.length, index, onIndexChange]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft" && hasMultiple) {
        goToPrevious();
      } else if (event.key === "ArrowRight" && hasMultiple) {
        goToNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goToNext, goToPrevious, hasMultiple, onClose]);

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null || !hasMultiple) {
      return;
    }

    const touchEndX = event.changedTouches[0]?.clientX;
    if (touchEndX === undefined) {
      return;
    }

    const delta = touchEndX - touchStartX.current;
    if (Math.abs(delta) >= 50) {
      if (delta > 0) {
        goToPrevious();
      } else {
        goToNext();
      }
    }

    touchStartX.current = null;
  };

  if (!currentImage || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="ดูรูปภาพขนาดใหญ่"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute top-3 right-3 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:top-5 sm:right-5"
      >
        <X className="h-6 w-6" aria-hidden="true" />
      </button>

      {hasMultiple && (
        <p className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white sm:top-5">
          {index + 1} / {images.length}
        </p>
      )}

      {hasMultiple && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goToPrevious();
          }}
          aria-label="รูปก่อนหน้า"
          className="absolute top-1/2 left-2 z-10 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-5 sm:min-h-12 sm:min-w-12"
        >
          <ChevronLeft className="h-7 w-7" aria-hidden="true" />
        </button>
      )}

      <div
        className="relative h-full w-full max-h-[calc(100dvh-2rem)] max-w-6xl touch-pan-y"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          src={currentImage.src}
          alt={currentImage.alt}
          fill
          sizes="100vw"
          quality={95}
          className="object-contain"
          priority
        />
      </div>

      {hasMultiple && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goToNext();
          }}
          aria-label="รูปถัดไป"
          className="absolute top-1/2 right-2 z-10 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-5 sm:min-h-12 sm:min-w-12"
        >
          <ChevronRight className="h-7 w-7" aria-hidden="true" />
        </button>
      )}
    </div>,
    document.body,
  );
}

export default function PropertyGallery({ images: sourceImages, title }: Props) {
  const images = uniqueGalleryImages(sourceImages);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const selectedImage = images[selectedIndex];

  const openLightbox = (index: number) => {
    setSelectedIndex(index);
    setIsLightboxOpen(true);
  };

  return (
    <>
      <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-2.5 shadow-[0_2px_8px_rgba(13,30,70,0.06)] sm:p-4">
        <button
          type="button"
          onClick={() => openLightbox(selectedIndex)}
          disabled={!selectedImage}
          aria-label={
            selectedImage
              ? `ขยายรูป: ${selectedImage.alt}`
              : `ไม่มีรูปภาพสำหรับ ${title}`
          }
          className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a8f] focus-visible:ring-offset-2 disabled:cursor-default"
        >
          {selectedImage ? (
            <Image
              src={selectedImage.src}
              alt={selectedImage.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 66vw"
              className="object-cover"
              priority={selectedIndex === 0}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
              {title}
            </div>
          )}
        </button>

        {images.length > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
            {images.map((image, index) => ({ image, index }))
              .filter(({ index }) => index !== selectedIndex)
              .map(({ image, index }) => (
                <button
                  key={`${image.src}-${index}`}
                  type="button"
                  onClick={() => openLightbox(index)}
                  aria-label={`ดูรูปที่ ${index + 1}: ${image.alt}`}
                  className="relative aspect-4/3 overflow-hidden rounded-lg bg-slate-100 opacity-80 transition ring-offset-2 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a8f]"
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                  />
                </button>
              ))}
          </div>
        )}
      </section>

      {isLightboxOpen && (
        <PropertyLightbox
          images={images}
          index={selectedIndex}
          onClose={() => setIsLightboxOpen(false)}
          onIndexChange={setSelectedIndex}
        />
      )}
    </>
  );
}
