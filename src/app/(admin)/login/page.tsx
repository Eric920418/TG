import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TelegramLoginButton } from "./telegram-login-button";

export default function LoginPage() {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>TG Bot 管理後台</CardTitle>
          <CardDescription>請使用授權的 Telegram 帳號登入</CardDescription>
        </CardHeader>
        <CardContent>
          {!botUsername ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">設定錯誤</p>
              <p>環境變數 <code>TELEGRAM_BOT_USERNAME</code> 未設定。</p>
            </div>
          ) : (
            <TelegramLoginButton botUsername={botUsername} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
