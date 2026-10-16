"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clapperboard, Play } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { SectionHeading } from "@/components/stellora/section-heading";

/** One row of GET /api/videos — an active product that carries a video preview. */
export type VideoItem = {
  id: string;
  slug: string;
  name: string;
  videoUrl: string;
  posterUrl: string | null;
  categoryName: string | null;
  price: number | string | null;
  compareAtPrice: number | string | null;
};

/** Extract the video id from the YouTube URL shapes (watch?v=, youtu.be, /shorts/, /embed/). */
function getYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/
  );
  return m?.[1] ?? null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Inline player for mp4/webm URLs and YouTube links.
 * Only mounted AFTER the visitor presses play — nothing is fetched from the
 * video host before that moment, so pages with videos stay fast.
 */
export function VideoPlayer({
  url,
  poster,
  className,
}: {
  url: string;
  poster?: string | null;
  className?: string;
}) {
  const ytId = getYouTubeId(url);
  if (ytId) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
        title="Product video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className={cn("h-full w-full", className)}
      />
    );
  }
  return (
    <video
      src={url}
      poster={poster ?? undefined}
      controls
      autoPlay
      playsInline
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

/** Frosted glass play circle that covers a media surface; stops link propagation. */
function PlayOverlay({
  label,
  onPlay,
  size = "md",
}: {
  label: string;
  onPlay: () => void;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPlay();
      }}
      aria-label={label}
      className="group/play absolute inset-0 z-20 flex items-center justify-center"
    >
      <span
        className={cn(
          "glass flex items-center justify-center rounded-full border border-border/70 text-primary shadow-lg transition-transform duration-300 group-hover/play:scale-110",
          size === "lg" ? "h-16 w-16" : "h-14 w-14"
        )}
      >
        <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
      </span>
    </button>
  );
}

/**
 * Homepage "Watch It In Action" swipeable carousel.
 * Server passes the VideoItem[] payload; the component renders NOTHING when
 * the list is empty or the endpoint is unavailable — no fake content.
 */
export function VideoShowcase({ videos }: { videos: VideoItem[] }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const syncArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      syncArrows();
    });
  }, [syncArrows]);

  useEffect(() => {
    // rAF keeps the initial setState out of the synchronous effect pass (lint rule)
    const id = window.requestAnimationFrame(syncArrows);
    window.addEventListener("resize", syncArrows);
    return () => {
      window.cancelAnimationFrame(id);
      window.cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", syncArrows);
    };
  }, [syncArrows]);

  if (!videos || videos.length === 0) return null;

  const nudge = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-video-card]");
    const step = card ? card.offsetWidth + 20 : 340; // gap-5 = 20px
    el.scrollBy({
      left: dir * step,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  return (
    <section
      className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"
      aria-label="Watch it in action video showcase"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionHeading
            eyebrow="Stellora TV"
            title="Watch It In Action"
            align="left"
            className="[&>div]:mx-0"
          />
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Swipe or drag through real product films — tap play to preview each
            piece without ever leaving the page.
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => nudge(-1)}
            disabled={!canPrev}
            aria-label="Previous videos"
            className="btn-press flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            disabled={!canNext}
            aria-label="More videos"
            className="btn-press flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Edge fades — desktop only */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-14 bg-gradient-to-r from-background to-transparent md:block"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-14 bg-gradient-to-l from-background to-transparent md:block"
          aria-hidden
        />
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              playing={playingId === v.id}
              onPlay={() => setPlayingId(v.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoCard({
  video,
  playing,
  onPlay,
}: {
  video: VideoItem;
  playing: boolean;
  onPlay: () => void;
}) {
  const price = video.price == null ? null : Number(video.price);
  const compareAt =
    video.compareAtPrice == null ? null : Number(video.compareAtPrice);
  const onSale = price != null && compareAt != null && compareAt > price;

  return (
    <article
      data-video-card
      className="group w-[76vw] max-w-[320px] min-w-[272px] shrink-0 snap-start sm:w-[320px]"
    >
      <div className="card-glow zoom-hover relative overflow-hidden rounded-md border border-border/60 bg-card">
        <div className="img-frame relative aspect-[4/5]">
          {video.posterUrl ? (
            <Image
              src={video.posterUrl}
              alt={video.name}
              fill
              loading="lazy"
              sizes="(max-width: 640px) 76vw, 320px"
              className="object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-primary/40"
              aria-hidden
            >
              <Clapperboard className="h-10 w-10" />
            </div>
          )}
        </div>
        <Link
          href={`/product/${video.slug}`}
          aria-label={`View ${video.name}`}
          className="absolute inset-0 z-10"
        />
        {playing ? (
          <div className="absolute inset-0 z-30 bg-black">
            <VideoPlayer url={video.videoUrl} poster={video.posterUrl} />
          </div>
        ) : (
          <PlayOverlay
            label={`Play video preview of ${video.name}`}
            onPlay={onPlay}
          />
        )}
      </div>
      <div className="px-1 pt-3">
        <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="h-px w-4 bg-primary/40" aria-hidden />
          {video.categoryName ?? "Stellora"}
        </p>
        <Link href={`/product/${video.slug}`} className="mt-1.5 block">
          <h3 className="line-clamp-1 font-serif text-[15px] font-medium leading-snug transition-colors hover:text-primary">
            {video.name}
          </h3>
        </Link>
        <div className="mt-1 flex items-baseline gap-2 tnum">
          {price != null && (
            <span className="text-[15px] font-semibold">{formatINR(price)}</span>
          )}
          {onSale && (
            <span className="text-xs text-muted-foreground line-through">
              {formatINR(compareAt!)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Optional "Brand Film" banner (settings key: hero_video_url).
 * Poster-less 16/9 cinema frame with preload="none" — the video host is
 * only contacted once the visitor taps play.
 */
export function BrandFilmBanner({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <section
      className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"
      aria-label="Stellora brand film"
    >
      <div className="text-center">
        <p className="eyebrow-row text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
          The Brand Film
        </p>
      </div>
      <div className="relative mx-auto mt-6 w-full max-w-[854px]">
        <div
          className={cn(
            "relative aspect-video max-h-[480px] overflow-hidden rounded-xl border border-border/60 shadow-xl shadow-primary/10",
            playing ? "bg-black" : "bg-secondary"
          )}
        >
          {!playing ? (
            <>
              <video
                src={url}
                preload="none"
                playsInline
                aria-hidden
                tabIndex={-1}
                className="absolute inset-0 h-full w-full"
              />
              <PlayOverlay
                size="lg"
                label="Play the brand film"
                onPlay={() => setPlaying(true)}
              />
            </>
          ) : (
            <VideoPlayer url={url} className="absolute inset-0" />
          )}
        </div>
      </div>
    </section>
  );
}
