"use client";
import { AlertTriangle } from "lucide-react";

export function ErrorBanner({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <pre className="whitespace-pre-wrap break-words font-mono text-xs">{error}</pre>
    </div>
  );
}
