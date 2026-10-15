import { db } from "@/lib/db";
import { handle, ok, requireAdmin } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const messages = await db.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return ok(messages);
  });
}
