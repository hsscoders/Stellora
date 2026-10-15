import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { adminUserSchema } from "@/lib/validation/schemas";
import { hashPassword } from "@/lib/auth/password";
import { audit } from "@/lib/services/audit";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const users = await db.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return ok(users);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const data = adminUserSchema.parse(await req.json());

    const clash = await db.user.findUnique({ where: { email: data.email } });
    if (clash) return fail("EMAIL_TAKEN", "A user with this email already exists.", 409, { email: "Already registered" });

    const user = await db.user.create({
      data: {
        email: data.email,
        passwordHash: await hashPassword(data.password),
        name: data.name,
        role: data.role,
      },
    });
    await audit(
      {
        actor: admin,
        action: "admin.user.create",
        entityType: "User",
        entityId: user.id,
        metadata: { email: user.email, role: user.role },
      },
      req
    );
    return ok({ id: user.id, email: user.email, name: user.name, role: user.role }, 201);
  });
}
