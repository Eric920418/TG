import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TelegramLoginButton } from "./telegram-login-button";

export default function LoginPage() {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>TG Bot 管理後台</CardTitle>
          <CardDescription>使用授權的 Telegram 帳號登入</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 方式 A: Bot DM 登入（推薦，最可靠） */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">A. 推薦：跟 bot 私訊取得登入連結</p>
            <ol className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-decimal pl-5">
              <li>
                打開 Telegram → 點此{" "}
                {botUsername ? (
                  <Link
                    href={`https://t.me/${botUsername}?start=login`}
                    target="_blank"
                    className="text-blue-600 dark:text-blue-400 underline"
                  >
                    開啟 @{botUsername}
                  </Link>
                ) : (
                  "（bot 未設定）"
                )}
              </li>
              <li>按 <b>Start</b> 或輸入 <code>/login</code></li>
              <li>bot 會回你一條 5 分鐘有效的登入連結，點下去自動進後台</li>
            </ol>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-zinc-950 px-2 text-zinc-500">或</span>
            </div>
          </div>

          {/* 方式 B: Telegram Login Widget（備用） */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              B. 備用：Telegram Login Widget
            </p>
            <p className="text-xs text-zinc-500">
              若 Telegram 在你的裝置上沒送 in-app 確認可改用 A 方法
            </p>
            {!botUsername ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                <p className="font-semibold">設定錯誤</p>
                <p>環境變數 <code>TELEGRAM_BOT_USERNAME</code> 未設定。</p>
              </div>
            ) : (
              <TelegramLoginButton botUsername={botUsername} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
