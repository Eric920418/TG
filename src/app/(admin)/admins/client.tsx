"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/error-banner";
import type { Admin } from "@/lib/db/schema";
import { upsertAdmin, deleteAdmin } from "@/lib/actions/admins";

type Draft = {
  id?: number;
  telegramId: string;
  username: string;
  role: "owner" | "admin";
  isActive: boolean;
};

function emptyDraft(): Draft {
  return { telegramId: "", username: "", role: "admin", isActive: true };
}

export function AdminsClient({
  initial,
  isOwner,
}: {
  initial: Admin[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [rows] = useState<Admin[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertAdmin(draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: number) {
    if (!confirm("確定刪除此管理員？")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAdmin(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-sm text-zinc-500">{rows.length} 個</p>
        {isOwner && !draft && (
          <Button size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            新增管理員
          </Button>
        )}
      </div>

      <ErrorBanner error={error} />

      {draft && isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "編輯管理員" : "新增管理員"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Telegram ID</Label>
                <Input
                  value={draft.telegramId}
                  onChange={(e) =>
                    setDraft({ ...draft, telegramId: e.target.value })
                  }
                  placeholder="123456789"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Username（選填）</Label>
                <Input
                  value={draft.username}
                  onChange={(e) =>
                    setDraft({ ...draft, username: e.target.value })
                  }
                  placeholder="無 @"
                />
              </div>
              <div className="space-y-1.5">
                <Label>角色</Label>
                <select
                  value={draft.role}
                  onChange={(e) =>
                    setDraft({ ...draft, role: e.target.value as "owner" | "admin" })
                  }
                  className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) =>
                    setDraft({ ...draft, isActive: e.target.checked })
                  }
                  id="a-active"
                />
                <Label htmlFor="a-active">啟用</Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={pending}>
                {pending ? "儲存中…" : "儲存"}
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="pt-6 flex justify-between gap-4">
              <div>
                <p className="font-medium">
                  {row.username ? `@${row.username}` : row.firstName ?? "(no name)"}
                  <Badge
                    variant={row.role === "owner" ? "default" : "secondary"}
                    className="ml-2"
                  >
                    {row.role}
                  </Badge>
                  {!row.isActive && (
                    <Badge variant="destructive" className="ml-1">
                      停用
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-zinc-500 font-mono">
                  ID: {String(row.telegramId)}
                </p>
              </div>
              {isOwner && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        telegramId: String(row.telegramId),
                        username: row.username ?? "",
                        role: row.role,
                        isActive: row.isActive,
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(row.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
