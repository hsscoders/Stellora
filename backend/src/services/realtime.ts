import { Server as SocketServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { env } from "../env";
import { db, newId } from "../lib/db";
import { sha256, randomToken } from "../lib/password";

/**
 * Stellora Realtime — Socket.IO engine for the whole platform.
 *
 * Transport: Socket.IO attaches to the same HTTP server as the Express API,
 * so it reuses the port/proxy setup. Browsers reach it through the Next.js
 * rewrite proxy (/socket.io → backend), which keeps everything same-origin:
 * httpOnly session cookies flow on the handshake without any CORS pain.
 *
 * Identity: the DB-backed session cookie (`stellora_session`) is read from
 * the Socket.IO handshake headers and resolved exactly like HTTP requests,
 * so a signed-in customer/admin is automatically authenticated.
 *
 * Rooms:
 *   site            — every connected browser (public broadcasts, e.g. stock ticks)
 *   user:<id>       — one customer, all their tabs
 *   admins          — every signed-in admin tab (ops notifications)
 *   chat:<threadId> — one support conversation (customer side + watching admins)
 *
 * Everything is fire-and-forget: emit helpers are no-ops until initRealtime()
 * has run, so route code never has to guard.
 */

type RealtimeUser = {
  id: string;
  name: string;
  role: "CUSTOMER" | "ADMIN";
};

let io: SocketServer | null = null;
const counters = { admins: 0, customers: 0, guests: 0 };

/* ---------------- Origin allowlist (mirrors lib/http.ts) ---------------- */

function originAllowed(origin: string): boolean {
  try {
    const host = new URL(origin).host.toLowerCase();
    if (!host) return false;
    const candidates = new Set<string>([host]);
    const appHost = (() => {
      try {
        return new URL(env.APP_URL).host.toLowerCase();
      } catch {
        return null;
      }
    })();
    if (appHost) candidates.add(appHost);
    // Loopback dev origins (any port) are trusted outside production.
    if (env.NODE_ENV !== "production") {
      const hostname = new URL(origin).hostname;
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname === "::1"
      ) {
        return true;
      }
    }
    if (candidates.has(host)) return true;
    const suffixes = env.ORIGIN_SUFFIXES.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return suffixes.some((suffix) => {
      const dotted = suffix.startsWith(".") ? suffix : `.${suffix}`;
      return host.endsWith(dotted);
    });
  } catch {
    return false;
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/* ---------------- Session resolution (shared with HTTP) ---------------- */

async function resolveSessionUser(token: string | null): Promise<RealtimeUser | null> {
  if (!token) return null;
  try {
    const session = await db.session.findUnique({
      where: { tokenHash: sha256(token) },
      select: { userId: true, expiresAt: true },
    });
    if (!session || session.expiresAt < new Date()) return null;
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) return null;
    return { id: user.id, name: user.name, role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER" };
  } catch {
    return null;
  }
}

/* ---------------- Init ---------------- */

export function initRealtime(server: HttpServer): void {
  io = new SocketServer(server, {
    path: "/socket.io",
    // Accept BOTH /socket.io and /socket.io/ — Next.js rewrites normalize the
    // trailing slash away when proxying, and engine.io's default expects
    // "/socket.io/" byte-for-byte. Without this the proxied handshake 404s.
    addTrailingSlash: false,
    serveClient: false,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 256 * 1024,
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true); // same-origin / server-side clients
        if (originAllowed(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, "stellora_session");
      const user = await resolveSessionUser(token);
      if (user) {
        socket.data.user = user;
      } else {
        // Guests keep a stable chat identity: the client passes its
        // localStorage chat key in the handshake auth (survives the very first
        // visit, before any cookie exists) and falls back to the cookie.
        const auth = (socket.handshake.auth ?? {}) as { chatKey?: unknown };
        socket.data.guestKey =
          (typeof auth.chatKey === "string" && auth.chatKey.slice(0, 64)) ||
          readCookie(socket.handshake.headers.cookie, "stellora_chat");
      }
      next();
    } catch {
      next(); // never block the connection on identity failures
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as RealtimeUser | undefined;
    if (user) {
      socket.join(`user:${user.id}`);
      socket.join("site");
      if (user.role === "ADMIN") {
        socket.join("admins");
        counters.admins++;
      } else {
        counters.customers++;
      }
    } else {
      socket.join("site");
      counters.guests++;
    }

    // Presence for the storefront chat header ("We're online").
    broadcastPresence();

    /* ---------------- Support chat: customer side ---------------- */

    socket.on("chat:attach", ({ threadId }: { threadId?: string }) => {
      const room = validThreadRoom(threadId);
      if (!room) return;
      void canAccessThread(socket, room).then((ok) => {
        if (ok) socket.join(room);
      });
    });

    socket.on("chat:send", ({ body, clientMsgId }: { body?: unknown; clientMsgId?: unknown }) => {
      void handleCustomerSend(socket, String(body ?? "").trim(), String(clientMsgId ?? ""));
    });

    socket.on("chat:typing", ({ threadId, typing }: { threadId?: unknown; typing?: unknown }) => {
      const room = validThreadRoom(threadId);
      if (!room) return;
      const who = user ? (user.role === "ADMIN" ? "admin" : "customer") : "customer";
      socket.to(room).emit("chat:typing", { threadId: room.slice(5), who, typing: !!typing });
    });

    socket.on("chat:mark-read", ({ threadId }: { threadId?: unknown }) => {
      const room = validThreadRoom(threadId);
      if (!room) return;
      void handleMarkRead(socket, room);
    });

    /* ---------------- Support chat: admin side ---------------- */

    socket.on("chat:watch", ({ threadId }: { threadId?: unknown }) => {
      if (user?.role !== "ADMIN") return;
      const room = validThreadRoom(threadId);
      if (room) socket.join(room);
    });

    socket.on("chat:unwatch", ({ threadId }: { threadId?: unknown }) => {
      const room = validThreadRoom(threadId);
      if (room) socket.leave(room);
    });

    socket.on("chat:reply", ({ threadId, body, clientMsgId }: { threadId?: unknown; body?: unknown; clientMsgId?: unknown }) => {
      if (user?.role !== "ADMIN") return;
      void handleAdminReply(socket, user, validThreadRoom(threadId), String(body ?? "").trim(), String(clientMsgId ?? ""));
    });

    socket.on("chat:close", ({ threadId }: { threadId?: unknown }) => {
      if (user?.role !== "ADMIN") return;
      void handleCloseThread(validThreadRoom(threadId), user);
    });

    socket.on("disconnect", () => {
      if (user?.role === "ADMIN") counters.admins = Math.max(0, counters.admins - 1);
      else if (user) counters.customers = Math.max(0, counters.customers - 1);
      else counters.guests = Math.max(0, counters.guests - 1);
      broadcastPresence();
    });
  });

  console.log("[realtime] Socket.IO attached — path /socket.io, session-cookie auth enabled");
}

function broadcastPresence(): void {
  emitToAdmins("presence:admins", { count: counters.admins });
  emitAll("presence:store", { admins: counters.admins, customers: counters.customers, guests: counters.guests });
}

/* ---------------- Emit helpers (safe before/after init) ---------------- */

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToAdmins(event: string, payload: unknown): void {
  if (!io) return;
  io.to("admins").emit(event, payload);
}

export function emitAll(event: string, payload: unknown): void {
  if (!io) return;
  io.to("site").emit(event, payload);
}

/* ---------------- Business events (called from routes/services) ---------------- */

export type NewOrderPayload = {
  orderNumber: string;
  orderId: string;
  grandTotal: number;
  itemCount: number;
  items: { productName: string; variantName: string; quantity: number }[];
  customerName: string | null;
  customerEmail: string | null;
  paymentMethod: string;
  city: string | null;
  at: string;
};

export function notifyNewOrder(p: NewOrderPayload): void {
  emitToAdmins("order:new", p);
  emitToAdmins("stats:bump", { kind: "order", at: p.at });
}

export function notifyOrderStatus(p: {
  orderNumber: string;
  userId: string | null;
  status: string;
  note?: string | null;
}): void {
  const payload = { ...p, at: new Date().toISOString() };
  if (p.userId) emitToUser(p.userId, "order:status", payload);
  emitToAdmins("order:updated", payload);
}

export function notifyPaymentStatus(p: {
  orderNumber: string;
  userId: string | null;
  paymentStatus: string;
}): void {
  const payload = { ...p, at: new Date().toISOString() };
  if (p.userId) emitToUser(p.userId, "payment:status", payload);
  emitToAdmins("order:updated", payload);
}

export function notifyLowStock(
  items: { productName: string; variantName: string; sku: string; stock: number; threshold: number; slug: string }[]
): void {
  if (items.length === 0) return;
  emitToAdmins("stock:low", { items, at: new Date().toISOString() });
}

/** Public stock tick so open product pages never show a stale count. */
export function notifyStockUpdate(
  variants: { productId: string; variantId: string; stock: number }[]
): void {
  if (variants.length === 0) return;
  emitAll("stock:update", { variants, at: new Date().toISOString() });
}

export function notifyStatsBump(kind: "user" | "review" | "contact" | "question" | "return" | "chat"): void {
  emitToAdmins("stats:bump", { kind, at: new Date().toISOString() });
}

export function notifyNewUser(p: { name: string; email: string | null; at: string }): void {
  emitToAdmins("user:new", p);
  emitToAdmins("stats:bump", { kind: "user", at: p.at });
}

export function emitContactCreated(name: string, subject: string): void {
  emitToAdmins("contact:new", { name, subject, at: new Date().toISOString() });
}

/* ---------------- Chat internals ---------------- */

const MAX_CHAT_BODY = 2000;

function validThreadRoom(threadId: unknown): string | null {
  const id = typeof threadId === "string" ? threadId : "";
  return /^[a-f\d]{24}$/i.test(id) ? `chat:${id}` : null;
}

async function canAccessThread(socket: Socket, room: string): Promise<boolean> {
  const user = socket.data.user as RealtimeUser | undefined;
  if (user?.role === "ADMIN") return true;
  const thread = await db.chatThread.findUnique({
    where: { id: room.slice(5) },
    select: { customerId: true, guestKey: true },
  });
  if (!thread) return false;
  if (user && thread.customerId && thread.customerId === user.id) return true;
  const guestKey = socket.data.guestKey as string | undefined;
  if (!user && guestKey && thread.guestKey && thread.guestKey === guestKey) return true;
  return false;
}

/** Customer (logged-in or guest) sends a chat message. */
async function handleCustomerSend(socket: Socket, body: string, clientMsgId: string): Promise<void> {
  if (!io || !body || body.length > MAX_CHAT_BODY) return;
  const user = socket.data.user as RealtimeUser | undefined;

  let threadId: string | null = null;

  if (user) {
    const thread = await db.chatThread.findFirst({
      where: { customerId: user.id },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, status: true },
    });
    if (thread && thread.status === "OPEN") threadId = thread.id;
    if (!threadId) {
      const created = await db.chatThread.create({
        data: {
          id: newId(),
          customerId: user.id,
          displayName: user.name,
          lastMessagePreview: body.slice(0, 120),
          lastMessageAt: new Date(),
        },
      });
      threadId = created.id;
    }
  } else {
    const guestKey = (socket.data.guestKey as string | undefined) || null;
    if (!guestKey) return; // guest without a chat cookie — ask REST /api/chat/thread first
    const thread = await db.chatThread.findFirst({
      where: { guestKey },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, status: true },
    });
    if (thread && thread.status === "OPEN") threadId = thread.id;
    if (!threadId) {
      const created = await db.chatThread.create({
        data: {
          id: newId(),
          guestKey,
          displayName: "Guest visitor",
          lastMessagePreview: body.slice(0, 120),
          lastMessageAt: new Date(),
        },
      });
      threadId = created.id;
    }
  }

  if (!threadId) return;
  const room = `chat:${threadId}`;
  socket.join(room);

  const message = await db.chatMessage.create({
    data: {
      id: newId(),
      threadId,
      senderRole: "CUSTOMER",
      senderId: user?.id ?? null,
      senderName: user?.name ?? "Guest",
      body,
      clientMsgId: clientMsgId || null,
    },
  });

  const threadDoc = await db.chatThread.update({
    where: { id: threadId },
    data: {
      lastMessagePreview: body.slice(0, 120),
      lastMessageAt: new Date(),
      status: "OPEN",
      unreadForAdmin: { increment: 1 },
    },
  });

  const messagePayload = {
    id: message.id,
    threadId,
    senderRole: "CUSTOMER" as const,
    senderName: message.senderName,
    body: message.body,
    clientMsgId: clientMsgId || null,
    createdAt: message.createdAt,
  };
  io.to(room).emit("chat:new", { message: messagePayload, thread: threadPayload(threadDoc) });
  // Every admin tab hears the message (global toast + inbox reorder) even if
  // it is not watching this conversation yet.
  io.to("admins").emit("chat:new", { message: messagePayload, thread: threadPayload(threadDoc) });
  io.to("admins").emit("chat:thread-updated", { thread: threadPayload(threadDoc) });
  emitToAdmins("stats:bump", { kind: "chat", at: new Date().toISOString() });
}

/** Admin replies to a conversation. */
async function handleAdminReply(
  socket: Socket,
  admin: RealtimeUser,
  room: string | null,
  body: string,
  clientMsgId: string
): Promise<void> {
  if (!io || !room || !body || body.length > MAX_CHAT_BODY) return;
  const threadId = room.slice(5);

  const message = await db.chatMessage.create({
    data: {
      id: newId(),
      threadId,
      senderRole: "ADMIN",
      senderId: admin.id,
      senderName: admin.name,
      body,
      clientMsgId: clientMsgId || null,
    },
  });

  const threadDoc = await db.chatThread.update({
    where: { id: threadId },
    data: {
      lastMessagePreview: body.slice(0, 120),
      lastMessageAt: new Date(),
      unreadForAdmin: 0,
      unreadForCustomer: { increment: 1 },
    },
  });

  const messagePayload = {
    id: message.id,
    threadId,
    senderRole: "ADMIN" as const,
    senderName: admin.name,
    body: message.body,
    clientMsgId: clientMsgId || null,
    createdAt: message.createdAt,
  };
  io.to(room).emit("chat:new", { message: messagePayload, thread: threadPayload(threadDoc) });
  // Other admin tabs keep their inbox in sync too.
  io.to("admins").emit("chat:new", { message: messagePayload, thread: threadPayload(threadDoc) });
  io.to("admins").emit("chat:thread-updated", { thread: threadPayload(threadDoc) });

  // If the thread belongs to a registered customer, also reach their user room
  // (covers tabs that never ran chat:attach).
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    select: { customerId: true },
  });
  if (thread?.customerId) {
    emitToUser(thread.customerId, "chat:new", { message: messagePayload, thread: threadPayload(threadDoc) });
  }
}

async function handleMarkRead(socket: Socket, room: string): Promise<void> {
  const user = socket.data.user as RealtimeUser | undefined;
  const threadId = room.slice(5);
  const isAdmin = user?.role === "ADMIN";
  const okAccess = await canAccessThread(socket, room);
  if (!okAccess) return;

  const threadDoc = await db.chatThread.update({
    where: { id: threadId },
    data: isAdmin ? { unreadForAdmin: 0 } : { unreadForCustomer: 0 },
  }).catch(() => null);
  if (!threadDoc) return;
  emitToAdmins("chat:thread-updated", { thread: threadPayload(threadDoc) });
}

async function handleCloseThread(room: string | null, admin: RealtimeUser): Promise<void> {
  if (!io || !room) return;
  const threadDoc = await db.chatThread.update({
    where: { id: room.slice(5) },
    data: { status: "CLOSED", closedAt: new Date(), closedByName: admin.name },
  }).catch(() => null);
  if (!threadDoc) return;
  io.to(room).emit("chat:thread-updated", { thread: threadPayload(threadDoc) });
  emitToAdmins("chat:thread-updated", { thread: threadPayload(threadDoc) });
  if (threadDoc.customerId) {
    emitToUser(threadDoc.customerId, "chat:thread-updated", { thread: threadPayload(threadDoc) });
  }
}

type ThreadPayload = {
  id: string;
  customerId: string | null;
  displayName: string;
  lastMessagePreview: string;
  lastMessageAt: Date | string;
  unreadForAdmin: number;
  unreadForCustomer: number;
  status: string;
  updatedAt: Date | string;
} | null;

function threadPayload(t: {
  id?: string;
  _id?: unknown;
  customerId?: string | null;
  displayName: string;
  lastMessagePreview: string;
  lastMessageAt: Date | string;
  unreadForAdmin: number;
  unreadForCustomer: number;
  status: string;
  updatedAt: Date | string;
} | null): ThreadPayload {
  if (!t) return null;
  const id = t.id ?? (t._id !== undefined && t._id !== null ? String(t._id) : "");
  return {
    id,
    customerId: t.customerId ?? null,
    displayName: t.displayName,
    lastMessagePreview: t.lastMessagePreview,
    lastMessageAt: t.lastMessageAt,
    unreadForAdmin: t.unreadForAdmin,
    unreadForCustomer: t.unreadForCustomer,
    status: t.status,
    updatedAt: t.updatedAt,
  };
}

export { threadPayload };

/** Fresh guest identity — used by the REST chat thread endpoint. */
export function newGuestChatKey(): string {
  return randomToken(24);
}

/** Total unread admin-side chat messages (for the bell + nav badge). */
export async function unreadAdminChatCount(): Promise<number> {
  try {
    const agg = await db.chatThread.aggregate({
      where: { status: "OPEN" },
      _sum: { unreadForAdmin: true },
    });
    return Number(agg._sum.unreadForAdmin ?? 0);
  } catch {
    return 0;
  }
}
