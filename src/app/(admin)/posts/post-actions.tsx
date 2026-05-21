"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, X } from "lucide-react";
import { cancelPost, deletePost } from "@/lib/actions/posts";
import { ErrorBanner } from "@/components/error-banner";

export function PostActions({ postId, status }: { postId: number; status: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function doCancel() {
    if (!confirm("確定取消？已排程但未發送的會被刪掉")) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelPost(postId);
      if (!res.ok) setError(res.error);
      else location.reload();
    });
  }

  function doDelete() {
    if (!confirm("刪除這筆排程？")) return;
    setError(null);
    startTransition(async () => {
      const res = await deletePost(postId);
      if (!res.ok) setError(res.error);
      else location.reload();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ErrorBanner error={error} />
      <div className="flex gap-1">
        {status === "pending" && (
          <>
            <Link href={`/posts/${postId}`}>
              <Button variant="ghost" size="icon">
                <Pencil className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={doCancel} disabled={pending}>
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button variant="ghost" size="icon" onClick={doDelete} disabled={pending}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
