import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { questions } from "@/lib/db/schema";
import { QuestionsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  let rows: Awaited<ReturnType<typeof loadRows>> | null = null;
  let error: string | null = null;
  try {
    rows = await loadRows();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">認證題庫</h1>
        <p className="text-sm text-zinc-500">用於入群驗證，會隨機抽一題</p>
      </div>
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold mb-1">資料載入失敗</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      ) : (
        <QuestionsClient initial={rows ?? []} />
      )}
    </div>
  );
}

async function loadRows() {
  return db.select().from(questions).orderBy(desc(questions.id));
}
