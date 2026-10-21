"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * Stellora Realtime (storefront) — one shared Socket.IO connection per tab.
 *
 * Connects same-origin to /socket.io (proxied to the Express backend), so the
 * httpOnly session cookie rides the handshake and the server automatically
 * knows who is connected — customers land in their own `user:<id>` room.
 *
 * Usage:
 *   const socket = useRealtime();
 *   useRealtimeEvent("order:status", (p) => { ... });
 *
 * Implementation note: the connection is a module-level singleton exposed
 * through useSyncExternalStore (the React-blessed way to subscribe to an
 * external system). This avoids setState-in-effect cascades entirely: the
 * snapshot flips exactly once (null → socket) and consumers re-render once.
 */

const RealtimeContext = createContext<Socket | null>(null);

let sharedSocket: Socket | null = null;
const snapshotListeners = new Set<() => void>();

function notifySnapshotListeners() {
  for (const listener of snapshotListeners) listener();
}

/** Idempotent, lazily-created shared connection (client only). */
function ensureSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  if (!sharedSocket) {
    // Polling-first with websocket upgrade: works through any proxy/hosting,
    // degrades gracefully behind restrictive CDNs.
    sharedSocket = io({
      path: "/socket.io",
      withCredentials: true,
      transports: ["polling", "websocket"],
      reconnectionDelayMax: 10_000,
      auth: { chatKey: guestChatKey() },
    });
    // The socket reference itself is already a valid snapshot the moment it
    // exists; the microtask just covers consumers mounted before creation.
    queueMicrotask(notifySnapshotListeners);
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

/** Stable per-browser chat identity for guests (survives first visits). */
function guestChatKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    let key = window.localStorage.getItem("stellora_chat_key");
    if (!key) {
      key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem("stellora_chat_key", key);
    }
    return key;
  } catch {
    return undefined;
  }
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  // Lazily connects on the client; SSR/hydration snapshots stay null.
  const socket = useSyncExternalStore(subscribeSnapshot, ensureSocket, getServerSnapshot);
  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): Socket | null {
  return useContext(RealtimeContext);
}

/**
 * Subscribe to a realtime event with a stable handler. Re-subscribes only when
 * the event name changes — the latest handler is always called (no stale
 * closures), and cleanup is automatic.
 */
export function useRealtimeEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
  enabled = true
): void {
  const socket = useRealtime();
  const handlerRef = useRef(handler);

  // Keep the latest handler without re-subscribing (latest-ref pattern — the
  // write happens in an effect, never during render).
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
