"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { formatINR } from "@/lib/utils";
import { toast } from "@/components/ui/notify";
import { playPosSound } from "@/lib/pos-sound";

/**
 * Stellora Realtime (admin console) — one shared Socket.IO connection per tab.
 *
 * The admin session cookie rides the same-origin /socket.io proxy handshake,
 * so the server drops this socket into the `admins` room automatically.
 *
 * Global side effects live here (order chime + toasts); pages subscribe to the
 * window event bus ("stellora:rt") for their own refreshes.
 *
 * Implementation note: the connection is a module-level singleton exposed via
 * useSyncExternalStore (the React-blessed external-store subscription), so no
 * setState-in-effect cascades are needed; the snapshot flips exactly once.
 */

const RealtimeContext = createContext<Socket | null>(null);

export type RtEvent = {
  type:
    | "order:new"
    | "order:updated"
    | "stock:low"
    | "user:new"
    | "contact:new"
    | "stats:bump"
    | "chat:new"
    | "chat:thread-updated"
    | "presence:admins";
  payload: unknown;
};

export function dispatchRt(type: RtEvent["type"], payload: unknown): void {
  window.dispatchEvent(new CustomEvent<RtEvent>("stellora:rt", { detail: { type, payload } }));
}

let sharedSocket: Socket | null = null;
const snapshotListeners = new Set<() => void>();

function ensureSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  if (!sharedSocket) {
    sharedSocket = io({
      path: "/socket.io",
      withCredentials: true,
      transports: ["polling", "websocket"],
      reconnectionDelayMax: 10_000,
    });
    queueMicrotask(() => {
      for (const listener of snapshotListeners) listener();
    });
  }
  return sharedSocket;
}

function subscribeSnapshot(callback: () => void): () => void {
  snapshotListeners.add(callback);
  return () => snapshotListeners.delete(callback);
}

function getSnapshot(): Socket | null {
  return sharedSocket;
}

function getServerSnapshot(): Socket | null {
  return null;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const socket = useSyncExternalStore(subscribeSnapshot, ensureSocket, getServerSnapshot);

  return (
    <RealtimeContext.Provider value={socket}>
      <RealtimeEffects socket={socket} />
      {children}
    </RealtimeContext.Provider>
  );
}

function RealtimeEffects({ socket }: { socket: Socket | null }) {
  const handlerRef = useRef<((p: { type: string; payload: unknown }) => void) | null>(null);

  // Latest-ref pattern: the ref is written in an effect (never during render).
  useEffect(() => {
    handlerRef.current = (p) => {
    dispatchRt(p.type as RtEvent["type"], p.payload);
    switch (p.type) {
      case "order:new": {
        const o = p.payload as {
          orderNumber: string;
          grandTotal: number;
          itemCount: number;
          customerName: string | null;
          paymentMethod: string;
        };
        if (!o) return;
        playPosSound("success");
        toast.success(
          `New order ${o.orderNumber} · ${formatINR(o.grandTotal)}`,
          {
            description: `${o.itemCount} item${o.itemCount === 1 ? "" : "s"} · ${
              o.customerName ?? "Guest"
            } · ${o.paymentMethod}`,
          }
        );
        break;
      }
      case "stock:low": {
        const s = p.payload as {
          items?: { productName: string; variantName: string; stock: number }[];
        };
        const item = s?.items?.[0];
        if (item) {
          toast.warning(
            `Low stock: ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}`,
            { description: `Only ${item.stock} left — restock soon.` }
          );
        }
        break;
      }
      case "user:new": {
        const u = p.payload as { name: string } | null;
        if (u?.name) toast.info(`New customer joined — ${u.name}`);
        break;
      }
      case "contact:new": {
        const c = p.payload as { name: string; subject: string } | null;
        if (c?.name) toast.info(`New message from ${c.name}`, { description: c.subject });
        break;
      }
      case "chat:new": {
        const m = p.payload as { message?: { senderRole: string; senderName?: string; body: string } };
        const msg = m?.message;
        // Only surface customer messages here — the chat page shows everything.
        if (msg && msg.senderRole === "CUSTOMER" && !window.location.pathname.includes("/admin/chat")) {
          toast.info(`Chat from ${msg.senderName || "a customer"}`, {
            description: msg.body.slice(0, 90),
          });
        }
        break;
      }
      default:
        break;
    }
  };
  });

  // Bind every business event once; the ref keeps handlers fresh.
  useEffect(() => {
    if (!socket) return;
    const events = [
      "order:new",
      "order:updated",
      "stock:low",
      "user:new",
      "contact:new",
      "stats:bump",
      "chat:new",
      "chat:thread-updated",
      "presence:admins",
    ] as const;
    const handlers = new Map<string, (payload: unknown) => void>();
    for (const ev of events) {
      const h = (payload: unknown) => handlerRef.current?.({ type: ev, payload });
      handlers.set(ev, h);
      socket.on(ev, h);
    }
    return () => {
      for (const [ev, h] of handlers) socket.off(ev, h);
    };
  }, [socket]);

  return null;
}

export function useRealtime(): Socket | null {
  return useContext(RealtimeContext);
}

/** Subscribe to a socket event with a stable handler (no stale closures). */
export function useRealtimeEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
  enabled = true
): void {
  const socket = useRealtime();
  const handlerRef = useRef(handler);

  // Latest-ref: write happens in an effect, never during render.
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!socket || !enabled) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event, enabled]);
}

/** Listen to the internal realtime event bus (works even without a socket). */
export function useRtBus(handler: (e: RtEvent) => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    const listener = (e: Event) => handlerRef.current((e as CustomEvent<RtEvent>).detail);
    window.addEventListener("stellora:rt", listener);
    return () => window.removeEventListener("stellora:rt", listener);
  }, []);
}

/**
 * LiveRefresher — mounted once by the admin shell. Data-driven pages refresh
 * themselves when the events that matter to them land:
 *   dashboard / orders / reports ← order events, stats bumps
 *   inventory / products         ← low-stock alerts
 */
export function LiveRefresher({ pathname }: { pathname: string }) {
  const router = useRouter();
  const pending = useRef(false);

  const maybeRefresh = (kind: RtEvent["type"]) => {
    const on = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
    const relevant =
      (["order:new", "order:updated", "stats:bump"].includes(kind) &&
        (on("/admin") || on("/admin/orders") || on("/admin/reports"))) ||
      (kind === "stock:low" && (on("/admin/inventory") || on("/admin/products")));
    if (!relevant) return;
    if (pending.current) return;
    pending.current = true;
    setTimeout(() => {
      pending.current = false;
      router.refresh();
    }, 600);
  };

  useRtBus((e) => maybeRefresh(e.type));
  return null;
}
