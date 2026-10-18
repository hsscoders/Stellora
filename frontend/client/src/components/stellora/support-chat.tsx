"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Headset } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { useRealtime, useRealtimeEvent } from "@/components/stellora/realtime";
import { cn } from "@/lib/utils";

/**
 * Stellora Live Support — floating chat widget (Socket.IO powered).
 *
 * - Guests and signed-in customers both get a persistent conversation.
 * - Messages travel over the realtime socket; typing indicators and admin
 *   presence are live. History is loaded from /api/chat/thread on open.
 * - The widget sits bottom-left; the WhatsApp button owns the bottom-right.
 */

type ChatMessage = {
  id?: string;
  threadId?: string;
  clientMsgId?: string | null;
  senderRole: "CUSTOMER" | "ADMIN";
  senderName?: string;
  body: string;
  createdAt?: string;
  pending?: boolean;
};

type ThreadPayload = {
  id: string;
  displayName: string;
  status: "OPEN" | "CLOSED";
  unreadForCustomer: number;
  closedByName?: string | null;
} | null;

const NEW_CHAT_HINT =
  "Hi! Welcome to Stellora ✦ Ask us anything about products, orders or delivery — we usually reply within a few minutes.";

function nowIso(): string {
  return new Date().toISOString();
}

function makeClientMsgId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function timeLabel(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function SupportChat() {
  const socket = useRealtime();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [thread, setThread] = useState<ThreadPayload>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [adminTyping, setAdminTyping] = useState(false);
  const [adminsOnline, setAdminsOnline] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentAt = useRef(0);

  /* ---------- history load (first open) ---------- */
  const loadThread = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/thread", {
        cache: "no-store",
        headers: { "x-chat-key": localStorage.getItem("stellora_chat_key") ?? "" },
      });
      const json = await res.json();
      if (json.ok) {
        setThread(json.data.thread ?? null);
        setMessages((json.data.messages ?? []) as ChatMessage[]);
        setUnread(0);
      }
    } catch {
      // panel still opens — the empty state invites typing
    } finally {
      setLoaded(true);
    }
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    setUnread(0);
    if (!loaded) void loadThread();
  }, [loaded, loadThread]);

  /* ---------- socket wiring ---------- */

  // Attach to the thread room + mark read whenever the panel opens with a thread.
  useEffect(() => {
    if (!socket || !open || !thread?.id) return;
    socket.emit("chat:attach", { threadId: thread.id });
    socket.emit("chat:mark-read", { threadId: thread.id });
  }, [socket, open, thread?.id]);

  // Re-attach after reconnects so live events never go dark.
  useEffect(() => {
    if (!socket || !thread?.id) return;
    const onConnect = () => {
      if (open) {
        socket.emit("chat:attach", { threadId: thread.id });
        socket.emit("chat:mark-read", { threadId: thread.id });
      }
    };
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [socket, thread?.id, open]);

  useRealtimeEvent<{ message: ChatMessage; thread: ThreadPayload }>(
    "chat:new",
    (p) => {
      if (!p?.message) return;
      if (thread?.id && p.message.threadId && p.message.threadId !== thread.id) return;
      const msg = { ...p.message, pending: false };
      setMessages((prev) => {
        // Reconcile the optimistic bubble by clientMsgId; drop server echoes.
        if (msg.clientMsgId && prev.some((m) => m.clientMsgId === msg.clientMsgId)) {
          return prev.map((m) => (m.clientMsgId === msg.clientMsgId ? msg : m));
        }
        if (msg.id && prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (p.thread) setThread(p.thread);
      setAdminTyping(false);
      if (p.message.senderRole === "CUSTOMER") return;
      if (!open) setUnread((u) => u + 1);
    },
    true
  );

  useRealtimeEvent<{ thread: ThreadPayload }>("chat:thread-updated", (p) => {
    if (!p?.thread) return;
    if (thread?.id && p.thread.id !== thread.id) return;
    setThread(p.thread);
  });

  useRealtimeEvent<{ threadId: string; who: string; typing: boolean }>(
    "chat:typing",
    (p) => {
      if (p?.who !== "admin") return;
      if (thread?.id && p.threadId !== thread.id) return;
      setAdminTyping(!!p.typing);
    }
  );

  useRealtimeEvent<{ admins: number }>("presence:store", (p) => {
    if (p && typeof p.admins === "number") setAdminsOnline(p.admins);
  });

  /* ---------- autoscroll ---------- */
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, adminTyping, open]);

  /* ---------- typing indicator ---------- */
  const notifyTyping = useCallback(() => {
    if (!socket || !thread?.id) return;
    const atLeast = 1200; // ms between typing beacons
    if (Date.now() - typingSentAt.current > atLeast) {
      typingSentAt.current = Date.now();
      socket.emit("chat:typing", { threadId: thread.id, typing: true });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit("chat:typing", { threadId: thread.id, typing: false });
    }, 1600);
  }, [socket, thread?.id]);

  /* ---------- send ---------- */
  const send = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const body = draft.trim();
      if (!body || !socket || sending) return;
      if (body.length > 2000) {
        toast.error("Message is too long (max 2000 characters).");
        return;
      }
      const clientMsgId = makeClientMsgId();
      setMessages((prev) => [
        ...prev,
        { clientMsgId, senderRole: "CUSTOMER", body, createdAt: nowIso(), pending: true },
      ]);
      setDraft("");
      setSending(true);
      socket.emit("chat:send", { body, clientMsgId });
      if (thread?.id) socket.emit("chat:typing", { threadId: thread.id, typing: false });
      // Safety net: if no echo within 6s, mark as failed locally.
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMsgId === clientMsgId && m.pending
              ? { ...m, pending: false, body: m.body }
              : m
          )
        );
        setSending(false);
      }, 6000);
    },
    [draft, socket, sending, thread?.id]
  );

  const startNewConversation = useCallback(() => {
    setThread(null);
    setMessages([{ senderRole: "ADMIN", senderName: "Stellora", body: NEW_CHAT_HINT, createdAt: nowIso() }]);
  }, []);

  const closed = thread?.status === "CLOSED";
  const online = (adminsOnline ?? 0) > 0;

  return (
    <>
      {/* Bubble */}
      {!open && (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Open live support chat"
          className="fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-300 hover:scale-105"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Live support chat"
          className="fixed bottom-5 left-5 z-50 flex h-[460px] max-h-[calc(100dvh-3rem)] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/20 [animation:stellora-fade-in_.18s_ease-out_both]"
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
              <Headset className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Stellora Support</p>
              <p className="flex items-center gap-1.5 text-[11px] leading-tight text-primary-foreground/80">
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    online ? "bg-emerald-300" : "bg-amber-300"
                  )}
                  aria-hidden
                />
                {online ? "We're online right now" : "We'll reply as soon as we can"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-md p-1.5 transition hover:bg-primary-foreground/15"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* Messages */}
          <div ref={listRef} className="stellora-scroll flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {!loaded ? (
              <div className="space-y-2">
                {[70, 45, 60].map((w, i) => (
                  <div
                    key={i}
                    className="h-9 animate-pulse rounded-lg bg-muted"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            ) : (
              <>
                {messages.length === 0 && (
                  <div className="rounded-lg bg-muted/60 px-3.5 py-2.5">
                    <p className="text-sm leading-relaxed text-foreground/85">{NEW_CHAT_HINT}</p>
                  </div>
                )}
                {messages.map((m, i) => {
                  const mine = m.senderRole === "CUSTOMER";
                  return (
                    <div key={m.id ?? m.clientMsgId ?? `m-${i}`} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                          mine
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm bg-muted text-foreground",
                          m.pending && "opacity-60"
                        )}
                      >
                        {!mine && m.senderName && (
                          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {m.senderName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={cn("mt-0.5 text-right text-[9px] tnum", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {m.pending ? "sending…" : timeLabel(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {adminTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5" aria-label="Support is typing">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70"
                          style={{ animationDelay: `${i * 140}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {closed && (
                  <div className="rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-center">
                    <p className="text-xs text-muted-foreground">
                      This conversation was closed{thread?.closedByName ? ` by ${thread.closedByName}` : ""}.
                    </p>
                    <button
                      type="button"
                      onClick={startNewConversation}
                      className="mt-1.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Start a new conversation
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={send} className="border-t border-border p-2.5">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (!closed) notifyTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={2000}
                disabled={closed}
                placeholder={closed ? "Conversation closed" : "Type your message…"}
                aria-label="Chat message"
                className="stellora-scroll max-h-24 min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!draft.trim() || closed || sending}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              Replies are instant when we&apos;re online · otherwise check{" "}
              <a href="/track-order" className="underline underline-offset-2">Track Order</a>
            </p>
          </form>
        </div>
      )}
    </>
  );
}
