import { Router } from "express";
import { ChatThread, ChatMessage, User } from "../models";
import { ok, fail, handle, assertSameOrigin } from "../lib/http";
import { requireAdmin, getCurrentUser } from "../lib/auth";
import { newGuestChatKey, threadPayload, unreadAdminChatCount } from "../services/realtime";
import { CART_COOKIE, SESSION_COOKIE } from "../lib/auth";

export const chatRouter = Router();

/* Cookie lives 180 days — a returning guest keeps their old conversation. */
const GUEST_COOKIE = "stellora_chat";
const GUEST_TTL_MS = 1000 * 60 * 60 * 24 * 180;

function setGuestCookie(res: { cookie: (name: string, value: string, opts: unknown) => void }, key: string) {
  res.cookie(GUEST_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires: new Date(Date.now() + GUEST_TTL_MS),
  });
}

/* ================= Customer / guest side ================= */

/**
 * Resolve "my" conversation (one thread per person) and return it with the
 * latest messages. Works for signed-in customers AND guests (cookie identity).
 */
chatRouter.get(
  "/chat/thread",
  handle(async (req, res) => {
    const user = await getCurrentUser(req);

    let thread;
    if (user) {
      thread = await ChatThread.findOne({ customerId: user.id }).sort({ lastMessageAt: -1 }).lean<any>();
      if (!thread) {
        const [created] = await ChatThread.create([
          { customerId: user.id, displayName: user.name },
        ]);
        thread = created.toObject();
      }
    } else {
      // Guest identity: the client's localStorage chat key (x-chat-key header)
      // wins — it exists even before the first cookie is ever set — then the
      // long-lived stellora_chat cookie.
      const headerKey = typeof req.headers["x-chat-key"] === "string" ? req.headers["x-chat-key"].slice(0, 64) : "";
      const existingKey = headerKey || (req.cookies?.[GUEST_COOKIE] as string | undefined) || "";
      if (existingKey) {
        thread = await ChatThread.findOne({ guestKey: existingKey }).sort({ lastMessageAt: -1 }).lean<any>();
      }
      if (!thread) {
        // Reuse the guest's cart cookie when present so we do not multiply
        // identities; otherwise mint a dedicated long-lived chat key.
        const key = existingKey || req.cookies?.[CART_COOKIE] || newGuestChatKey();
        const [created] = await ChatThread.create([
          { guestKey: key, displayName: "Guest visitor" },
        ]);
        thread = created.toObject();
        if (!existingKey && !req.cookies?.[CART_COOKIE]) setGuestCookie(res, key);
      }
    }

    const messages = await ChatMessage.find({ threadId: thread._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean<any[]>();

    return ok(res, {
      thread: {
        ...threadPayload(thread),
        closedByName: thread.closedByName ?? null,
      },
      messages: messages.map((m) => ({
        id: String(m._id),
        threadId: String(m.threadId),
        senderRole: m.senderRole,
        senderName: m.senderName,
        body: m.body,
        clientMsgId: m.clientMsgId ?? null,
        createdAt: m.createdAt,
      })),
    });
  })
);

/* ================= Admin side ================= */

chatRouter.get(
  "/admin/chat/threads",
  handle(async (req, res) => {
    await requireAdmin(req);
    const status = String(req.query.status ?? "OPEN");
    const where = status === "ALL" ? {} : { status: status === "CLOSED" ? "CLOSED" : "OPEN" };
    const threads = await ChatThread.find(where)
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .lean<any[]>();

    // Enrich registered customers with their email for the inbox.
    const customerIds = threads.map((t) => t.customerId).filter(Boolean);
    const customers = customerIds.length
      ? await User.find({ _id: { $in: customerIds } })
          .select("email")
          .lean<{ _id: any; email: string | null }[]>()
      : [];
    const emailMap = new Map(customers.map((c) => [String(c._id), c.email]));

    return ok(res, {
      threads: threads.map((t) => ({
        ...threadPayload(t),
        email: t.customerId ? emailMap.get(String(t.customerId)) ?? null : null,
      })),
      unreadTotal: await unreadAdminChatCount(),
    });
  })
);

chatRouter.get(
  "/admin/chat/threads/:id/messages",
  handle(async (req, res) => {
    await requireAdmin(req);
    const thread = await ChatThread.findById(req.params.id).lean<any>();
    if (!thread) return fail(res, "NOT_FOUND", "Conversation not found.", 404);
    const messages = await ChatMessage.find({ threadId: thread._id })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean<any[]>();
    return ok(res, {
      thread: { ...threadPayload(thread), closedByName: thread.closedByName ?? null },
      messages: messages.map((m) => ({
        id: String(m._id),
        threadId: String(m.threadId),
        senderRole: m.senderRole,
        senderName: m.senderName,
        body: m.body,
        clientMsgId: m.clientMsgId ?? null,
        createdAt: m.createdAt,
      })),
    });
  })
);

chatRouter.post(
  "/admin/chat/threads/:id/close",
  assertSameOrigin,
  handle(async (req, res) => {
    const admin = await requireAdmin(req);
    const thread = await ChatThread.findById(req.params.id);
    if (!thread) return fail(res, "NOT_FOUND", "Conversation not found.", 404);
    thread.status = "CLOSED";
    thread.closedAt = new Date();
    thread.closedByName = admin.name;
    await thread.save();
    return ok(res, { thread: threadPayload(thread.toObject()) });
  })
);

chatRouter.post(
  "/admin/chat/threads/:id/reopen",
  assertSameOrigin,
  handle(async (req, res) => {
    await requireAdmin(req);
    const thread = await ChatThread.findById(req.params.id);
    if (!thread) return fail(res, "NOT_FOUND", "Conversation not found.", 404);
    thread.status = "OPEN";
    thread.closedAt = null;
    thread.closedByName = null;
    await thread.save();
    return ok(res, { thread: threadPayload(thread.toObject()) });
  })
);

/** Bell/nav badge count — cheap standalone endpoint. */
chatRouter.get(
  "/admin/chat/unread",
  handle(async (req, res) => {
    await requireAdmin(req);
    return ok(res, { unread: await unreadAdminChatCount() });
  })
);

// keep SESSION_COOKIE import referenced (documented pairing with GUEST_COOKIE)
void SESSION_COOKIE;
