import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { MtprotoForm } from "./form";

export const dynamic = "force-dynamic";

export default async function MtprotoPage() {
  const session = await getSession();
  if (!session.adminId) redirect("/login");

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.id, session.adminId))
    .limit(1);
  if (!admin || admin.role !== "owner") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">MTProto 本人帳號自動發送</h1>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          僅 owner 可綁定 MTProto 帳號。
        </div>
      </div>
    );
  }

  const e = env();
  const apiConfigured = !!(e.MTPROTO_API_ID && e.MTPROTO_API_HASH);
  const isConnected = !!(admin.mtprotoSessionEnc && admin.mtprotoUserId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">MTProto 本人帳號自動發送</h1>
        <p className="mt-1 text-sm text-zinc-500">
          綁定本人 Telegram 帳號（須 Premium）以排程含動態貼紙的訊息到 Channel。
        </p>
      </div>

      {!apiConfigured && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
          <p className="font-semibold mb-1">❌ 未設定 API credentials</p>
          <p>環境變數 <code>MTPROTO_API_ID</code> / <code>MTPROTO_API_HASH</code> 未設定。請：</p>
          <ol className="list-decimal pl-5 mt-2 space-y-1 text-xs">
            <li>到 <a href="https://my.telegram.org/apps" target="_blank" rel="noreferrer" className="underline">my.telegram.org/apps</a> 申請新 App（任意名稱）</li>
            <li>把 api_id (整數) 跟 api_hash (字串) 加入 Vercel project env</li>
            <li>重新部署</li>
            <li>回到此頁繼續綁定</li>
          </ol>
        </div>
      )}

      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
        ⚠️ Telegram 對「user account 自動化」有風控偵測。建議：
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li>每筆發送間隔 ≥ 3 秒（系統已自動控制）</li>
          <li>每日 ≤ 200 條（系統已自動上限）</li>
          <li>內容自然、避免重複大量短時間發送</li>
          <li>濫用可能導致 Telegram 帳號被暫時凍結，自負風險</li>
        </ul>
      </div>

      {apiConfigured && (
        <MtprotoForm
          connected={isConnected}
          phone={admin.mtprotoPhone}
          userId={admin.mtprotoUserId ? String(admin.mtprotoUserId) : null}
          connectedAt={
            admin.mtprotoConnectedAt
              ? new Date(admin.mtprotoConnectedAt).toISOString()
              : null
          }
        />
      )}
    </div>
  );
}
