"use client";

/**
 * Stellora premium toast system.
 *
 * A brand-consistent layer over sonner: every notification renders a
 * `PremiumToast` card (kind-tinted icon chip, gold progress bar, optional
 * action pill, hover-pause, swipe-to-dismiss via sonner) instead of the
 * bare default toast. Import `toast` from here everywhere — the call
 * signature matches sonner's (`toast.success(msg, { description, action })`)
 * so existing call sites upgrade automatically.
 */
import * as React from "react";
import { toast as sonner } from "sonner";
import { Check, Info, TriangleAlert, X } from "lucide-react";

type ToastAction = { label: string; onClick: () => void };

export type NotifyOptions = {
  description?: React.ReactNode;
  action?: ToastAction;
  /** Auto-dismiss in ms. Errors linger longer by default. */
  duration?: number;
};

type Kind = "success" | "error" | "info" | "warning";

const KIND_ICON: Record<Kind, React.ReactNode> = {
  success: <Check size={16} strokeWidth={3.2} />,
  error: <X size={16} strokeWidth={3.2} />,
  info: <Info size={16} strokeWidth={2.6} />,
  warning: <TriangleAlert size={16} strokeWidth={2.6} />,
};

function PremiumToast({
  id,
  kind,
  title,
  description,
  action,
  duration,
  media,
}: {
  id: string | number;
  kind: Kind;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastAction;
  duration: number;
  media?: string | null;
}) {
  return (
    <div className="toast-card" data-kind={kind} role="status">
      {media ? (
        <span className="toast-media" aria-hidden="true">
          <img src={media} alt="" />
          <span className="toast-media-dot">{KIND_ICON.success}</span>
        </span>
      ) : (
        <span className="toast-icon" aria-hidden="true">
          {KIND_ICON[kind]}
        </span>
      )}
      <div className="toast-body">
        <p className="toast-title">{title}</p>
        {description ? <div className="toast-desc">{description}</div> : null}
        {action ? (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              sonner.dismiss(id);
              action.onClick();
            }}
          >
            {action.label}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss notification"
        onClick={() => sonner.dismiss(id)}
      >
        <X size={14} strokeWidth={2.4} />
      </button>
      <span
        className="toast-progress"
        style={{ animationDuration: `${duration}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}

function emit(kind: Kind, message: React.ReactNode, opts: NotifyOptions = {}, media?: string | null) {
  const duration = opts.duration ?? (kind === "error" ? 5600 : 4200);
  return sonner.custom(
    (id) => (
      <PremiumToast
        id={id}
        kind={kind}
        title={message}
        description={opts.description}
        action={opts.action}
        duration={duration}
        media={media}
      />
    ),
    { duration, classNames: { toast: "toast-slot" } }
  );
}

export type CartToastInput = {
  name: string;
  /** Optional secondary line, e.g. the chosen variant. */
  subtitle?: string;
  image?: string | null;
  qty?: number;
  price?: number | string | null;
  href?: string;
  actionLabel?: string;
  onView?: () => void;
};

const inr = (value: number | string | null | undefined) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export const toast = {
  success: (message: React.ReactNode, opts?: NotifyOptions) => emit("success", message, opts),
  error: (message: React.ReactNode, opts?: NotifyOptions) => emit("error", message, opts),
  info: (message: React.ReactNode, opts?: NotifyOptions) => emit("info", message, opts),
  warning: (message: React.ReactNode, opts?: NotifyOptions) => emit("warning", message, opts),
  /** Product-added confirmation with thumbnail, qty/price line and a bag action. */
  cart: (input: CartToastInput) =>
    emit(
      "success",
      input.name,
      {
        description: [
          input.subtitle,
          input.qty && input.qty > 1 ? `Qty ${input.qty}` : null,
          input.price != null ? inr(input.price) : null,
        ]
          .filter(Boolean)
          .join("  ·  ") || "Added to your bag",
        action: {
          label: input.actionLabel ?? "View bag",
          onClick: () => (input.onView ? input.onView() : window.location.assign(input.href ?? "/cart")),
        },
      },
      input.image ?? null
    ),
};
