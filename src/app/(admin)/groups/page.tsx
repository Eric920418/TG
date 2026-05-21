import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { GroupsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  let rows;
  let error: string | null = null;
  try {
    rows = await db.select().from(groups).orderBy(desc(groups.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">群組設定</h1>
        <p className="text-sm text-zinc-500">
          chat_id 可從 bot 收到的訊息或 @raw_data_bot 取得（主群通常為負數）
        </p>
      </div>
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold mb-1">資料載入失敗</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      ) : (
        <GroupsClient initial={rows ?? []} />
      )}
    </div>
  );
}
