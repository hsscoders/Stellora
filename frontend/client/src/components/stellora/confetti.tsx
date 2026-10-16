"use client";

import { useEffect, useRef } from "react";

type Piece = {
  el: HTMLDivElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
};

const COLORS = ["#8e1f45", "#c2566e", "#d9a547", "#e8c9a0", "#f3e7e9", "#b08a3e"];

/**
 * Dependency-free celebration confetti: ~90 brand-colored pieces burst from
 * the top of the viewport, fall with gravity + drag for ~3.5s, then the whole
 * layer removes itself. Respects prefers-reduced-motion (renders nothing).
 */
export function Confetti({ burstKey }: { burstKey: string | number }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const pieces: Piece[] = [];
    const W = window.innerWidth;
    const originX = W / 2;
    const originY = window.innerHeight * 0.28;
    const count = 90;

    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      const size = 6 + Math.random() * 7;
      el.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${
        size * (Math.random() > 0.5 ? 1 : 0.45)
      }px;background:${COLORS[i % COLORS.length]};opacity:0.95;border-radius:${
        Math.random() > 0.7 ? "50%" : "2px"
      };will-change:transform;`;
      host.appendChild(el);

      // Fan the burst sideways; symmetric-ish with jitter.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = 7 + Math.random() * 9;
      pieces.push({
        el,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
        vy: Math.sin(angle) * speed - 4,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 14,
      });
    }

    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - started) / 1000;
      for (const p of pieces) {
        // Per-frame integration: gravity pulls vy down, drag softens motion.
        p.vy += 0.26;
        p.vx *= 0.985;
        p.vy *= 0.992;
        p.rot += p.vr;
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > window.innerHeight + 60) {
          p.el.style.opacity = "0";
          continue;
        }
        p.el.style.transform = `translate(${originX + p.x}px, ${originY + p.y}px) rotate(${p.rot}deg)`;
      }
      if (t < 4.5) {
        raf = window.requestAnimationFrame(tick);
      } else {
        host.remove();
      }
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      host.remove();
    };
  }, [burstKey]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90] overflow-hidden"
    />
  );
}
