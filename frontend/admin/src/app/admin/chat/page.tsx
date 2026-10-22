"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCheck,
  MessageCircle,
  Send,
  UserRound,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { useRealtime, useRealtimeEvent } from "@/components/stellora/realtime";
import { PageHeader } from "@/components/stellora/advanced/page-header";

/**
 * Stellora Live Chat — the shop owner's realtime customer conversations.
 *
 * Left: every conversation, newest first, unread badges, live reorder.
 * Right: the selected conversation with instant send, typing indicator and
 * read acknowledgements — all over Socket.IO (no polling).
 */

type Thread = {
  id: string;
  customerId: string | null;
  email?: string | null;
  displayName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadForAdmin: number;
  status: "OPEN" | "CLOSED";
};

type Msg = {
  id: string;
  threadId: string;
  senderRole: "CUSTOMER" | "ADMIN";
  senderName: string;
  body: string;
  clientMsgId?: string | null;
  createdAt: string;
};

type StatusFilter = "OPEN" | "CLOSED";

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function timeShort(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export default function AdminChatPage() {
  const socket = useRealtime();
  const [filter, setFilter] = useState<StatusFilter>("OPEN");
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [customerTyping, setCustomerTyping] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentAt = useRef(0);

  const activeThread = useMemo(
    () => threads?.find((t) => t.id === activeId) ?? null,
    [threads, activeId]
  );

  /* ---------------- data loading ---------------- */

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/chat/threads?status=${filter}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setThreads(json.data.threads as Thread[]);
    } catch {
      setThreads((prev) => prev ?? []);
    }
  }, [filter]);

  useEffect(() => {
    // Initial load — the async IIFE keeps every setState provably after an
    // await boundary (React Compiler: no synchronous setState in effects).
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/chat/threads?status=${filter}`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.ok) setThreads(json.data.threads as Thread[]);
      } catch {
        if (!cancelled) setThreads((prev) => prev ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/admin/chat/threads/${threadId}/messages`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setMessages(json.data.messages as Msg[]);
    } catch {
      setMessages([]);
    }
  }, []);

  const openThread = useCallback(
    (t: Thread) => {
      setActiveId(t.id);
      setMobileChatOpen(true);
      setCustomerTyping(false);
      setMessages([]);
      void loadMessages(t.id);
      socket?.emit("chat:watch", { threadId: t.id });
      socket?.emit("chat:mark-read", { threadId: t.id });
      // Optimistically clear the badge; the server state follows.
      setThreads((prev) =>
        prev ? prev.map((x) => (x.id === t.id ? { ...x, unreadForAdmin: 0 } : x)) : prev
      );
    },
    [socket, loadMessages]
  );

  // Re-watch the active thread after reconnects.
  useEffect(() => {
    if (!socket || !activeId) return;
    const onConnect = () => {
      socket.emit("chat:watch", { threadId: activeId });
    };
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [socket, activeId]);

  /* ---------------- realtime wiring ---------------- */

  // Live thread list: reorder + badges as conversations move.
  useRealtimeEvent<{ thread: Thread | null }>("chat:thread-updated", (p) => {
    const t = p?.thread;
    if (!t) return;
    setThreads((prev) => {
      if (!prev) return prev;
      const matchesFilter = t.status === filter;
      const rest = prev.filter((x) => x.id !== t.id);
      if (!matchesFilter) return rest;
      const isActive = t.id === activeId;
      return [
        {
          ...t,
          unreadForAdmin: isActive ? 0 : t.unreadForAdmin,
          email: prev.find((x) => x.id === t.id)?.email ?? null,
        },
        ...rest,
      ];
    });
    if (t.id === activeId) {
      // Admin is looking at it — acknowledge read immediately.
      socket?.emit("chat:mark-read", { threadId: t.id });
    }
  });

  // Live messages for the open conversation (both sides' echoes land here).
  useRealtimeEvent<{ message: Msg }>("chat:new", (p) => {
    const m = p?.message;
    if (!m) return;
    if (activeId && m.threadId !== activeId) return;
    setMessages((prev) => {
      if (m.clientMsgId && prev.some((x) => x.clientMsgId === m.clientMsgId)) {
        return prev.map((x) => (x.clientMsgId === m.clientMsgId ? { ...x, ...m } : x));
      }
      if (m.id && prev.some((x) => x.id === m.id)) return prev;
      return [...prev, m];
    });
    setCustomerTyping(false);
    if (activeId) socket?.emit("chat:mark-read", { threadId: m.threadId });
  });

  useRealtimeEvent<{ threadId: string; who: string; typing: boolean }>("chat:typing", (p) => {
    if (!p || p.who !== "customer") return;
    if (activeId && p.threadId !== activeId) return;
    setCustomerTyping(p.typing);
  });

  /* ---------------- autoscroll ---------------- */
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, customerTyping]);

  /* ---------------- actions ---------------- */

  const notifyTyping = useCallback(() => {
    if (!socket || !activeId) return;
    if (Date.now() - typingSentAt.current > 1200) {
      typingSentAt.current = Date.now();
      socket.emit("chat:typing", { threadId: activeId, typing: true });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit("chat:typing", { threadId: activeId, typing: false });
    }, 1600);
  }, [socket, activeId]);

  const send = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const body = draft.trim();
      if (!body || !socket || !activeId) return;
      const clientMsgId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `pending-${clientMsgId}`,
          threadId: activeId,
          senderRole: "ADMIN",
          senderName: "You",
          body,
          clientMsgId,
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft("");
      socket.emit("chat:reply", { threadId: activeId, body, clientMsgId });
    },
    [draft, socket, activeId]
  );

  const closeThread = useCallback(async () => {
    if (!activeThread) return;
    const res = await fetch(`/api/admin/chat/threads/${activeThread.id}/close`, { method: "POST" });
    const json = await res.json();
    if (json.ok) {
      toast.success("Conversation closed");
      void loadThreads();
    } else {
      toast.error(json.error?.message ?? "Could not close the conversation");
    }
  }, [activeThread, loadThreads]);

  const reopenThread = useCallback(async () => {
    if (!activeThread) return;
    const res = await fetch(`/api/admin/chat/threads/${activeThread.id}/reopen`, { method: "POST" });
    const json = await res.json();
    if (json.ok) {
      toast.success("Conversation reopened");
      void loadThreads();
    } else {
      toast.error(json.error?.message ?? "Could not reopen the conversation");
    }
  }, [activeThread, loadThreads]);

  const totalUnread = (threads ?? []).reduce((n, t) => n + t.unreadForAdmin, 0);

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[520px] flex-col lg:h-[calc(100dvh-9rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <PageHeader
          title="Live Chat"
          subtitle={
            <span>
              Real-time customer conversations — powered by Socket.IO.
              {totalUnread > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {totalUnread} unread
                </span>
              )}
            </span>
          }
        />
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {(["OPEN", "CLOSED"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "OPEN" ? "Open" : "Closed"}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[340px_1fr]">
        {/* Threads pane */}
        <div
          className={cn(
            "min-h-0 flex-col overflow-y-auto stellora-scroll border-b border-border lg:flex lg:border-b-0 lg:border-r",
            mobileChatOpen ? "hidden" : "flex"
          )}
        >
          {threads === null ? (
            <div className="space-y-2 p-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No {filter === "OPEN" ? "open" : "closed"} conversations yet.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Customers can reach you from the chat bubble on the storefront.
              </p>
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openThread(t)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border/60 px-3.5 py-3 text-left transition hover:bg-accent",
                  t.id === activeId && "bg-accent"
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {initials(t.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{t.displayName}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground tnum">
                      {timeShort(t.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{t.lastMessagePreview || "—"}</span>
                    {t.unreadForAdmin > 0 && (
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[9px] font-bold leading-none text-primary-foreground">
                        {t.unreadForAdmin > 9 ? "9+" : t.unreadForAdmin}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        {/* Conversation pane */}
        <div className={cn("min-h-0 flex-col", mobileChatOpen ? "flex" : "hidden lg:flex")}>
          {!activeThread ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                <MessageCircle className="h-6 w-6 text-accent-foreground" aria-hidden />
              </span>
              <p className="font-serif text-lg">Select a conversation</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Pick a chat on the left to read and reply. New messages arrive instantly —
                no refresh needed.
              </p>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button
                  type="button"
                  onClick={() => setMobileChatOpen(false)}
                  aria-label="Back to conversations"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent lg:hidden"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {initials(activeThread.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{activeThread.displayName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {activeThread.email ?? (activeThread.customerId ? "Registered customer" : "Guest visitor")}
                    {" · "}
                    last active {formatDateTime(activeThread.lastMessageAt)}
                  </p>
                </div>
                {customerTyping && (
                  <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                    typing
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground"
                        style={{ animationDelay: `${i * 140}ms` }}
                      />
                    ))}
                  </span>
                )}
                {activeThread.status === "OPEN" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={closeThread}
                    className="shrink-0 gap-1.5 text-destructive hover:text-destructive"
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden />
                    Close
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={reopenThread}
                    className="shrink-0 gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Reopen
                  </Button>
                )}
              </div>

              {/* Messages */}
              <div ref={listRef} className="stellora-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
                {messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No messages yet in this conversation.
                  </p>
                )}
                {messages.map((m) => {
                  const mine = m.senderRole === "ADMIN";
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                          mine
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm bg-muted text-foreground"
                        )}
                      >
                        {!mine && (
                          <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <UserRound className="h-3 w-3" aria-hidden />
                            {m.senderName || activeThread.displayName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={cn("mt-0.5 text-right text-[9px] tnum", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {timeShort(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {customerTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3">
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
              </div>

              {/* Composer */}
              <form onSubmit={send} className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      if (activeThread.status === "OPEN") notifyTyping();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    disabled={activeThread.status === "CLOSED"}
                    placeholder={
                      activeThread.status === "OPEN"
                        ? "Reply to the customer…"
                        : "Conversation is closed — reopen to reply."
                    }
                    aria-label="Reply"
                    className="stellora-scroll max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || activeThread.status === "CLOSED"}
                    aria-label="Send reply"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <CheckCheck className="h-3 w-3" aria-hidden />
                  Replies reach the customer instantly on their storefront chat.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
