import { Router } from "express";
import { db, newId } from "../lib/db";
import { ok, fail, handle, assertSameOrigin } from "../lib/http";
import { requireUser } from "../lib/auth";
import { profileUpdateSchema, passwordChangeSchema, addressSchema } from "../validation";
import { hashPassword, verifyPassword } from "../lib/password";
import { audit } from "../services/audit";

export const accountRouter = Router();

accountRouter.put(
  "/account/profile",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const data = profileUpdateSchema.parse(req.body);
    const updated = await db.user.update({
      where: { id: user.id },
      data: { name: data.name, phone: data.phone || null },
      select: { id: true, name: true, phone: true, email: true },
    });
    await audit({ actor: user, action: "account.profile_update", entityType: "User", entityId: user.id }, req);
    return ok(res, { id: updated.id, name: updated.name, phone: updated.phone ?? null, email: updated.email ?? null });
  })
);

accountRouter.put(
  "/account/password",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const data = passwordChangeSchema.parse(req.body);

    const record = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!record || !(await verifyPassword(data.currentPassword, record.passwordHash))) {
      return fail(res, "INVALID_CREDENTIALS", "Your current password is incorrect.", 401, {
        currentPassword: "Your current password is incorrect.",
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.newPassword) },
    });
    await audit({ actor: user, action: "account.password_change", entityType: "User", entityId: user.id }, req);
    return ok(res, { message: "Password updated successfully." });
  })
);

/* ---------- Addresses (own table now — was embedded on the user) ---------- */

type AddressRow = {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function serializeAddress(a: AddressRow) {
  return {
    id: a.id,
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? null,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country,
    isDefault: !!a.isDefault,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

accountRouter.get(
  "/account/addresses",
  handle(async (req, res) => {
    const user = await requireUser(req);
    const rows = await db.address.findMany({ where: { userId: user.id } });
    const addresses = [...rows].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return ok(res, addresses.map(serializeAddress));
  })
);

accountRouter.post(
  "/account/addresses",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const data = addressSchema.parse(req.body);
    const created = await db.address.create({
      data: {
        id: newId(),
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
      // Exactly one default — clear the flag on every other address.
      await db.address.updateMany({
        where: { userId: user.id, id: { not: created.id } },
        data: { isDefault: false },
      });
    }
    return ok(res, serializeAddress(created), 201);
  })
);

accountRouter.put(
  "/account/addresses/:addressId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const addressId = String(req.params.addressId);
    const data = addressSchema.parse(req.body);

    const existing = await db.address.findFirst({
      where: { id: addressId, userId: user.id },
    });
    if (!existing) return fail(res, "NOT_FOUND", "Address not found.", 404);

    await db.address.update({
      where: { id: existing.id },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 || null,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        country: data.country || "India",
        ...(data.isDefault ? { isDefault: true } : {}),
      },
    });
    if (data.isDefault) {
      await db.address.updateMany({
        where: { userId: user.id, id: { not: addressId } },
        data: { isDefault: false },
      });
    }
    const updatedAddress = await db.address.findUnique({ where: { id: addressId } });
    return ok(res, updatedAddress ? serializeAddress(updatedAddress) : { id: addressId });
  })
);

accountRouter.delete(
  "/account/addresses/:addressId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const addressId = String(req.params.addressId);

    // Ownership pre-check keeps the exact 404 semantics of the old code.
    const owner = await db.address.findFirst({
      where: { id: addressId, userId: user.id },
      select: { id: true },
    });
    if (!owner) return fail(res, "NOT_FOUND", "Address not found.", 404);

    await db.address.delete({ where: { id: owner.id } });
    return ok(res, { deleted: true });
  })
);
