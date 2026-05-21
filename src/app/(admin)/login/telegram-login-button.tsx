"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorBanner } from "@/components/error-banner";

type TelegramAuth = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuth) => void;
  }
}

export function TelegramLoginButton({ botUsername }: { botUsername: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.onTelegramAuth = async (user) => {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        router.push("/");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    const node = containerRef.current;
    node?.appendChild(script);
    return () => {
      node?.removeChild(script);
    };
  }, [botUsername, router]);

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="flex justify-center" />
      {loading && (
        <p className="text-center text-sm text-zinc-500">驗證中…</p>
      )}
      <ErrorBanner error={error} />
    </div>
  );
}
