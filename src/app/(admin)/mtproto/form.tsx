"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner } from "@/components/error-banner";

type Props = {
  connected: boolean;
  phone: string | null;
  userId: string | null;
  connectedAt: string | null;
};

type Step = "phone" | "code" | "2fa";

export function MtprotoForm({ connected, phone, userId, connectedAt }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loginId, setLoginId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function start() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/mtproto/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phoneInput }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        setLoginId(data.loginId);
        setStep("code");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function verify(withPassword = false) {
    setError(null);
    if (!loginId) {
      setError("loginId 遺失，請重新從手機號開始");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/mtproto/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            loginId,
            code,
            password: withPassword ? password : undefined,
          }),
        });
        const data = await res.json();
        if (data.ok && data.userId) {
          router.refresh();
          return;
        }
        if (data.need2fa) {
          setStep("2fa");
          return;
        }
        setError(data.error ?? `HTTP ${res.status}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function disconnect() {
    if (!confirm("確定中斷 MTProto 綁定？已排程的 user 模式貼文會發送失敗")) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/mtproto/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    });
  }

  if (connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">✅ 已連線</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ErrorBanner error={error} />
          <div className="text-sm space-y-1">
            <p>
              <span className="text-zinc-500">手機尾號：</span>
              <span className="font-mono">…{phone?.slice(-4)}</span>
            </p>
            <p>
              <span className="text-zinc-500">user_id：</span>
              <span className="font-mono">{userId}</span>
            </p>
            <p>
              <span className="text-zinc-500">連線於：</span>
              {connectedAt ? new Date(connectedAt).toLocaleString("zh-TW") : "—"}
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={disconnect}
            disabled={pending}
          >
            {pending ? "處理中…" : "中斷連線"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          綁定 Telegram 帳號
          {step === "phone" && " · 步驟 1/3 手機號"}
          {step === "code" && " · 步驟 2/3 驗證碼"}
          {step === "2fa" && " · 步驟 3/3 2FA 密碼"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBanner error={error} />

        {step === "phone" && (
          <>
            <div className="space-y-1.5">
              <Label>手機號（含國碼，例如 +886911988160）</Label>
              <Input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+886..."
              />
            </div>
            <Button onClick={start} disabled={pending || !phoneInput}>
              {pending ? "送出中…" : "送驗證碼"}
            </Button>
            <p className="text-xs text-zinc-500">
              Telegram 會把 5 位數驗證碼送到你 Telegram App 內的「Telegram」官方對話。
            </p>
          </>
        )}

        {step === "code" && (
          <>
            <div className="space-y-1.5">
              <Label>5 位數驗證碼</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="12345"
                inputMode="numeric"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => verify(false)} disabled={pending || !code}>
                {pending ? "驗證中…" : "驗證"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("phone")}>
                返回上一步
              </Button>
            </div>
          </>
        )}

        {step === "2fa" && (
          <>
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              ⚠️ 你的帳號開了 2FA，請輸入「兩步驟驗證」密碼（不是手機驗證碼）。
            </div>
            <div className="space-y-1.5">
              <Label>2FA 密碼</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button
              onClick={() => verify(true)}
              disabled={pending || !password}
            >
              {pending ? "驗證中…" : "完成綁定"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
