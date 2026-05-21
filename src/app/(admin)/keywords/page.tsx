import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { keywordBlacklist } from "@/lib/db/schema";
import { KeywordsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  let rows;
  let error: string | null = null;
  try {
    rows = await db.select().from(keywordBlacklist).orderBy(desc(keywordBlacklist.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">關鍵字黑名單</h1>
        <p className="text-sm text-zinc-500">
          適用所有群（chat_id 空白）或指定群。type 為 link/mention 時 pattern 欄位可任意（用內建正則）
        </p>
      </div>
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold mb-1">資料載入失敗</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      ) : (
        <KeywordsClient initial={rows ?? []} />
      )}
    </div>
  );
}
