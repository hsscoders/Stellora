import { handle, ok } from "@/lib/http";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  return handle(async () => {
    const user = await getCurrentUser();
    return ok({ user });
  });
}
