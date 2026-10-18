"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
 */

const RealtimeContext = createContext<Socket | null>(null);

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
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Polling-first with websocket upgrade: works through any proxy/hosting,
    // degrades gracefully behind restrictive CDNs.
    const s = io({
      path: "/socket.io",
      withCredentials: true,
      transports: ["polling", "websocket"],
      reconnectionDelayMax: 10_000,
      auth: { chatKey: guestChatKey() },
    });
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, []);

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
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket || !enabled) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event, enabled]);
}
