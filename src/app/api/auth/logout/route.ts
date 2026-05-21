import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const s = await getSession();
  s.destroy();
  return Response.json({ ok: true });
}
