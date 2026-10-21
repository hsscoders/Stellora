import { Router } from "express";
import { Prisma } from "@prisma/client";
import { db, newId } from "../lib/db";
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
      thread = await db.chatThread.findFirst({
        where: { customerId: user.id },
        orderBy: { lastMessageAt: "desc" },
      });
      if (!thread) {
        thread = await db.chatThread.create({
          data: { id: newId(), customerId: user.id, displayName: user.name },
        });
      }
    } else {
      // Guest identity: the client's localStorage chat key (x-chat-key header)
      // wins — it exists even before the first cookie is ever set — then the
      // long-lived stellora_chat cookie.
      const headerKey = typeof req.headers["x-chat-key"] === "string" ? req.headers["x-chat-key"].slice(0, 64) : "";
      const existingKey = headerKey || (req.cookies?.[GUEST_COOKIE] as string | undefined) || "";
      if (existingKey) {
        thread = await db.chatThread.findFirst({
          where: { guestKey: existingKey },
          orderBy: { lastMessageAt: "desc" },
        });
      }
      if (!thread) {
        // Reuse the guest's cart cookie when present so we do not multiply
        // identities; otherwise mint a dedicated long-lived chat key.
        const key = existingKey || req.cookies?.[CART_COOKIE] || newGuestChatKey();
        thread = await db.chatThread.create({
          data: { id: newId(), guestKey: key, displayName: "Guest visitor" },
        });
        if (!existingKey && !req.cookies?.[CART_COOKIE]) setGuestCookie(res, key);
      }
    }

    const messages = await db.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    // threadPayload still reads the legacy `_id` field — bridge the Prisma row.
    const legacyThread = { ...thread, _id: thread.id };

    return ok(res, {
      thread: {
        ...threadPayload(legacyThread),
        closedByName: thread.closedByName ?? null,
      },
      messages: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
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
    const where: Prisma.ChatThreadWhereInput =
      status === "ALL" ? {} : { status: status === "CLOSED" ? "CLOSED" : "OPEN" };
    const threads = await db.chatThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    });

    // Enrich registered customers with their email for the inbox.
    const customerIds = threads.map((t) => t.customerId).filter((id): id is string => !!id);
    const customers = customerIds.length
      ? await db.user.findMany({ where: { id: { in: customerIds } }, select: { id: true, email: true } })
      : [];
    const emailMap = new Map(customers.map((c) => [c.id, c.email]));

    return ok(res, {
      threads: threads.map((t) => ({
        ...threadPayload({ ...t, _id: t.id }),
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
    const thread = await db.chatThread.findUnique({ where: { id: String(req.params.id) } });
    if (!thread) return fail(res, "NOT_FOUND", "Conversation not found.", 404);
    const messages = await db.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return ok(res, {
      thread: { ...threadPayload({ ...thread, _id: thread.id }), closedByName: thread.closedByName ?? null },
      messages: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
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
    const thread = await db.chatThread.findUnique({ where: { id: String(req.params.id) } });
    if (!thread) return fail(res, "NOT_FOUND", "Conversation not found.", 404);
    const updated = await db.chatThread.update({
      where: { id: thread.id },
      data: { status: "CLOSED", closedAt: new Date(), closedByName: admin.name },
    });
    return ok(res, { thread: threadPayload({ ...updated, _id: updated.id }) });
  })
);

chatRouter.post(
  "/admin/chat/threads/:id/reopen",
  assertSameOrigin,
  handle(async (req, res) => {
    await requireAdmin(req);
    const thread = await db.chatThread.findUnique({ where: { id: String(req.params.id) } });
    if (!thread) return fail(res, "NOT_FOUND", "Conversation not found.", 404);
    const updated = await db.chatThread.update({
      where: { id: thread.id },
      data: { status: "OPEN", closedAt: null, closedByName: null },
    });
    return ok(res, { thread: threadPayload({ ...updated, _id: updated.id }) });
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
