import type { Document, Types } from "mongoose";

/** Convert a Mongoose doc/lean object into the API JSON shape (_id -> id). */
export function id(doc: { _id: Types.ObjectId | string } | null | undefined): string {
  return doc ? String(doc._id) : "";
}

type AnyRec = Record<string, unknown>;

/** Recursively map _id -> id and drop __v. Keeps Date objects (JSON.stringify -> ISO). */
export function toAPI<T>(value: T): T extends Document ? AnyRec : T {
  return mapValue(value) as never;
}

function mapValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mapValue);
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: AnyRec = {};
    for (const [k, v] of Object.entries(value as AnyRec)) {
      if (k === "__v") continue;
      if (k === "_id") {
        out["id"] = typeof v === "object" && v !== null && "toString" in (v as object) ? String(v) : v;
        continue;
      }
      if (k.endsWith("Id") && v && typeof v === "object" && "toString" in (v as object)) {
        out[k] = String(v);
        continue;
      }
      out[k] = mapValue(v);
    }
    return out;
  }
  return value;
}
