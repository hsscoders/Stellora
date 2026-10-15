import { NextRequest } from "next/server";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { env } from "@/lib/env";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function sniffMime(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Admin image upload: type/size/content validated, randomized name. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    await requireAdmin();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail("VALIDATION_ERROR", "No file provided.", 422);
    }

    const maxBytes = env.UPLOAD_MAX_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return fail("FILE_TOO_LARGE", `Image must be under ${env.UPLOAD_MAX_MB} MB.`, 422);
    }
    if (file.size < 100) {
      return fail("VALIDATION_ERROR", "File appears to be empty or invalid.", 422);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMime(buffer);
    const declared = file.type;
    if (!sniffed || !ALLOWED_TYPES[sniffed] || (declared && declared !== sniffed)) {
      return fail(
        "INVALID_TYPE",
        "Only JPEG, PNG or WebP images are accepted (verified by content, not just extension).",
        422
      );
    }

    const ext = ALLOWED_TYPES[sniffed];
    const name = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buffer);

    return ok({ url: `/uploads/${name}` }, 201);
  });
}
