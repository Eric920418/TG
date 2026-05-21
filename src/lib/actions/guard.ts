import { getSession } from "@/lib/auth/session";

export async function requireAdmin(): Promise<{ adminId: number; role: "owner" | "admin" }> {
  const s = await getSession();
  if (!s.adminId) throw new Error("未登入");
  return { adminId: s.adminId, role: s.role ?? "admin" };
}

export async function requireOwner(): Promise<{ adminId: number }> {
  const s = await getSession();
  if (!s.adminId) throw new Error("未登入");
  if (s.role !== "owner") throw new Error("僅 owner 可執行此操作");
  return { adminId: s.adminId };
}

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function toError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
