import { Router } from "express";
import { User } from "../models";
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
    const updated = await User.findByIdAndUpdate(
      user.id,
      { name: data.name, phone: data.phone || null },
      { new: true }
    ).lean<{ _id: any; name: string; phone: string | null; email: string }>();
    await audit({ actor: user, action: "account.profile_update", entityType: "User", entityId: user.id }, req);
    return ok(res, { id: String(updated!._id), name: updated!.name, phone: updated!.phone ?? null, email: updated!.email });
  })
);

accountRouter.put(
  "/account/password",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const data = passwordChangeSchema.parse(req.body);

    const record = await User.findById(user.id).select("passwordHash").lean<{ passwordHash: string } | null>();
    if (!record || !(await verifyPassword(data.currentPassword, record.passwordHash))) {
      return fail(res, "INVALID_CREDENTIALS", "Your current password is incorrect.", 401, {
        currentPassword: "Your current password is incorrect.",
      });
    }

    await User.updateOne({ _id: user.id }, { passwordHash: await hashPassword(data.newPassword) });
    await audit({ actor: user, action: "account.password_change", entityType: "User", entityId: user.id }, req);
    return ok(res, { message: "Password updated successfully." });
  })
);

/* ---------- Addresses (embedded on user) ---------- */

type AddressSub = {
  _id: any;
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

function serializeAddress(a: AddressSub) {
  return {
    id: String(a._id),
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
    const doc = await User.findById(user.id).select("addresses").lean<{ addresses: AddressSub[] } | null>();
    const addresses = [...(doc?.addresses ?? [])].sort((a, b) => {
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
    const address = {
      fullName: data.fullName,
      phone: data.phone,
      line1: data.line1,
      line2: data.line2 || null,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      country: data.country || "India",
      isDefault: data.isDefault,
    };
    const updated = await User.findByIdAndUpdate(
      user.id,
      { $push: { addresses: address } },
      { new: true, select: "addresses" }
    ).lean<{ addresses: AddressSub[] } | null>();
    const created = updated?.addresses?.[updated.addresses.length - 1];
    if (data.isDefault && created) {
      await User.updateOne(
        { _id: user.id },
        { $set: { "addresses.$[a].isDefault": false } },
        { arrayFilters: [{ "a._id": { $ne: created._id } }] }
      );
    }
    return ok(res, serializeAddress(created!), 201);
  })
);

accountRouter.put(
  "/account/addresses/:addressId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const addressId = String(req.params.addressId);
    const data = addressSchema.parse(req.body);

    const doc = await User.findOne(
      { _id: user.id, "addresses._id": addressId },
      { select: "addresses" }
    ).lean<{ addresses: AddressSub[] } | null>();
    const existing = doc?.addresses?.find((a) => String(a._id) === addressId);
    if (!existing) return fail(res, "NOT_FOUND", "Address not found.", 404);

    const fields = {
      "addresses.$[a].fullName": data.fullName,
      "addresses.$[a].phone": data.phone,
      "addresses.$[a].line1": data.line1,
      "addresses.$[a].line2": data.line2 || null,
      "addresses.$[a].city": data.city,
      "addresses.$[a].state": data.state,
      "addresses.$[a].pincode": data.pincode,
      "addresses.$[a].country": data.country || "India",
      ...(data.isDefault ? { "addresses.$[a].isDefault": true } : {}),
      "addresses.$[a].updatedAt": new Date(),
    };
    await User.updateOne(
      { _id: user.id, "addresses._id": addressId },
      { $set: fields },
      { arrayFilters: [{ "a._id": addressId }] }
    );
    if (data.isDefault) {
      await User.updateOne(
        { _id: user.id },
        { $set: { "addresses.$[a].isDefault": false } },
        { arrayFilters: [{ "a._id": { $ne: addressId } }] }
      );
    }
    const refreshed = await User.findById(user.id).select("addresses").lean<{ addresses: AddressSub[] } | null>();
    const updatedAddress = refreshed?.addresses?.find((a) => String(a._id) === addressId);
    return ok(res, updatedAddress ? serializeAddress(updatedAddress) : { id: addressId });
  })
);

accountRouter.delete(
  "/account/addresses/:addressId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const addressId = String(req.params.addressId);
    const updated = await User.updateOne(
      { _id: user.id },
      { $pull: { addresses: { _id: addressId } } }
    );
    if (updated.modifiedCount === 0) return fail(res, "NOT_FOUND", "Address not found.", 404);
    return ok(res, { deleted: true });
  })
);
