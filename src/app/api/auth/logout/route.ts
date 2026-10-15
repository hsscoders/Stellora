import { NextRequest } from "next/server";
import { handle, ok, assertSameOrigin } from "@/lib/http";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/services/audit";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    await destroySession();
    if (user) {
      await audit(
        { actor: user, action: "auth.logout", entityType: "User", entityId: user.id },
        req
      );
    }
    return ok({ signedOut: true });
  });
}
