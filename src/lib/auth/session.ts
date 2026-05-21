import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { env } from "@/lib/env";

export type Session = {
  adminId?: number;
  telegramId?: number;
  username?: string | null;
  firstName?: string | null;
  photoUrl?: string | null;
  role?: "owner" | "admin";
};

let cachedOptions: SessionOptions | null = null;

function sessionOptions(): SessionOptions {
  if (cachedOptions) return cachedOptions;
  cachedOptions = {
    password: env().SESSION_PASSWORD,
    cookieName: "tg_admin_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    },
  };
  return cachedOptions;
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<Session>(cookieStore, sessionOptions());
}

export async function requireSession(): Promise<Session & { adminId: number }> {
  const s = await getSession();
  if (!s.adminId) {
    throw new Error("未登入");
  }
  return s as Session & { adminId: number };
}
