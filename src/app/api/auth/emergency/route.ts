import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decode(token: string): { telegramId: number; exp: number; sig: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const [tidStr, expStr, sig] = decoded.split("|");
    if (!tidStr || !expStr || !sig) return null;
    return { telegramId: Number(tidStr), exp: Number(expStr), sig };
  } catch {
    return null;
  }
}

function expectedSig(telegramId: number, exp: number): string {
  return createHmac("sha256", env().SESSION_PASSWORD)
    .update(`${telegramId}|${exp}`)
    .digest("hex");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("missing token", { status: 400 });
  }

  const parsed = decode(token);
  if (!parsed) {
    return new Response("invalid token format", { status: 400 });
  }

  if (Date.now() / 1000 > parsed.exp) {
    return new Response("token expired", { status: 401 });
  }

  const expected = expectedSig(parsed.telegramId, parsed.exp);
  const a = Buffer.from(parsed.sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("signature mismatch", { status: 401 });
  }

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.telegramId, parsed.telegramId))
    .limit(1);

  if (!admin || !admin.isActive) {
    return new Response("admin not found or inactive", { status: 403 });
  }

  const session = await getSession();
  session.adminId = admin.id;
  session.telegramId = admin.telegramId;
  session.username = admin.username;
  session.firstName = admin.firstName;
  session.photoUrl = admin.photoUrl;
  session.role = admin.role;
  await session.save();

  return NextResponse.redirect(new URL("/", req.url));
}
