import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { AdminsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const session = await getSession();
  const isOwner = session.role === "owner";

  let rows;
  let error: string | null = null;
  try {
    rows = await db.select().from(admins).orderBy(desc(admins.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">管理員</h1>
        <p className="text-sm text-zinc-500">
          只有 owner 可以新增/刪除管理員。新增後該 Telegram 帳號才能登入後台。
        </p>
      </div>
      {!isOwner && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          你的角色是 <b>admin</b>，僅 owner 可修改本頁。
        </div>
      )}
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold mb-1">資料載入失敗</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      ) : (
        <AdminsClient initial={rows ?? []} isOwner={isOwner} />
      )}
    </div>
  );
}
