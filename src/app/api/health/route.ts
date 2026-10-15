import { db } from "@/lib/db";
import { ok } from "@/lib/http";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      data: { status: "healthy", database: "connected", timestamp: new Date().toISOString() },
    });
  } catch (err) {
    console.error("[health] database check failed", err);
    return NextResponse.json(
      { ok: false, error: { code: "DB_UNAVAILABLE", message: "Database unreachable" } },
      { status: 503 }
    );
  }
}
