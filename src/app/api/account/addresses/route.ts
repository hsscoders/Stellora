import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, assertSameOrigin, requireUser } from "@/lib/http";
import { addressSchema } from "@/lib/validation/auth";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const addresses = await db.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return ok(addresses);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const data = addressSchema.parse(await req.json());
    const address = await db.address.create({
      data: {
        userId: user.id,
        fullName: data.fullName,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 || null,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        country: data.country || "India",
        isDefault: data.isDefault,
      },
    });
    if (data.isDefault) {
      await db.address.updateMany({
        where: { userId: user.id, id: { not: address.id } },
        data: { isDefault: false },
      });
    }
    return ok(address, 201);
  });
}
