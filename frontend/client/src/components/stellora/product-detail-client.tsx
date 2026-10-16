"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/lib/types";
import { VideoPlayer } from "@/components/stellora/video-showcase";
import { SizeGuideTrigger } from "@/components/stellora/size-guide";

type Variant = ProductCardData["variants"][number];

export function ProductGallery({
  images,
  productName,
  videoUrl,
}: {
  images: { url: string; alt: string | null }[];
  productName: string;
  videoUrl?: string | null;
}) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const list = images.length > 0 ? images : [{ url: "/images/placeholder.svg", alt: productName }];
  const hasVideo = !!videoUrl;
  const videoIndex = list.length; // video tile is always LAST
  const isVideoActive = hasVideo && active === videoIndex;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-card",
          !isVideoActive && "cursor-zoom-in"
        )}
        onMouseMove={(e) => {
          if (isVideoActive) return; // hover-zoom is for images only
          const rect = e.currentTarget.getBoundingClientRect();
          setZoom({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
          });
        }}
        onMouseLeave={() => setZoom(null)}
        role={isVideoActive ? undefined : "img"}
        aria-label={isVideoActive ? "Product video preview" : list[active]?.alt ?? productName}
      >
        {isVideoActive ? (
          <VideoPlayer url={videoUrl ?? ""} poster={list[0]?.url ?? null} />
        ) : (
          <Image
            src={list[active]?.url ?? list[0].url}
            alt={list[active]?.alt ?? productName}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover transition-transform duration-300"
            style={
              zoom
                ? {
                    transform: "scale(1.9)",
                    transformOrigin: `${zoom.x}% ${zoom.y}%`,
                  }
                : undefined
            }
          />
        )}
      </div>
      {(list.length > 1 || hasVideo) && (
        <div className="flex gap-2" role="tablist" aria-label="Product media">
          {list.map((img, i) => (
            <button
              key={img.url}
              role="tab"
              aria-selected={i === active}
              aria-label={`View image ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn(
                "relative h-20 w-20 overflow-hidden rounded-md border transition",
                i === active ? "border-primary ring-1 ring-primary" : "border-border opacity-70 hover:opacity-100"
              )}
            >
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
          {hasVideo && (
            <button
              key="product-video"
              role="tab"
              aria-selected={isVideoActive}
              aria-label="Play product video"
              onClick={() => setActive(videoIndex)}
              className={cn(
                "relative h-20 w-20 overflow-hidden rounded-md border transition",
                isVideoActive ? "border-primary ring-1 ring-primary" : "border-border opacity-70 hover:opacity-100"
              )}
            >
              <Image src={list[0].url} alt="" fill sizes="80px" className="object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/30">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" aria-hidden />
                </span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function VariantPicker({
  variants,
  selected,
  onSelect,
}: {
  variants: Variant[];
  selected: Variant | null;
  onSelect: (v: Variant) => void;
}) {
  const showPicker = variants.length > 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        {showPicker ? (
          <p className="text-sm font-medium">
            Option: <span className="text-muted-foreground">{selected?.name}</span>
          </p>
        ) : (
          <span aria-hidden />
        )}
        <div className="flex items-center gap-3">
          {selected && selected.stock > 0 && selected.stock <= 5 && (
            <p className="text-xs font-medium text-primary">Only {selected.stock} left</p>
          )}
          <SizeGuideTrigger />
        </div>
      </div>
      {showPicker && (
        <div className="mt-2.5 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Product options">
          {variants.map((v) => {
            const isActive = selected?.id === v.id;
            return (
              <button
                key={v.id}
                role="radio"
                aria-checked={isActive}
                onClick={() => onSelect(v)}
                disabled={v.stock === 0}
                className={cn(
                  "btn-press group/s relative flex min-w-[4.25rem] items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm transition",
                  isActive
                    ? "border-primary bg-accent font-semibold text-accent-foreground shadow-[0_0_0_1px_var(--primary)]"
                    : "border-border hover:border-primary/60 hover:shadow-sm",
                  v.stock === 0 && "cursor-not-allowed text-muted-foreground line-through opacity-60"
                )}
              >
                {isActive && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                {v.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
