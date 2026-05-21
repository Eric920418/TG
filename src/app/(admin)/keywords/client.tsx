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
import type { KeywordRow } from "@/lib/db/schema";
import { upsertKeyword, deleteKeyword } from "@/lib/actions/keywords";

type Draft = {
  id?: number;
  pattern: string;
  type: "contains" | "regex" | "link" | "mention";
  action: "delete" | "warn" | "ban";
  chatId: string;
  isActive: boolean;
};

function emptyDraft(): Draft {
  return { pattern: "", type: "contains", action: "delete", chatId: "", isActive: true };
}

function toDraft(r: KeywordRow): Draft {
  return {
    id: r.id,
    pattern: r.pattern,
    type: r.type,
    action: r.action,
    chatId: r.chatId != null ? String(r.chatId) : "",
    isActive: r.isActive,
  };
}

export function KeywordsClient({ initial }: { initial: KeywordRow[] }) {
  const router = useRouter();
  const [rows] = useState<KeywordRow[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertKeyword(draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: number) {
    if (!confirm("確定刪除？")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteKeyword(id);
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
        <p className="text-sm text-zinc-500">{rows.length} 條規則</p>
        {!draft && (
          <Button size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            新增規則
          </Button>
        )}
      </div>

      <ErrorBanner error={error} />

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "編輯規則" : "新增規則"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Pattern</Label>
                <Input
                  value={draft.pattern}
                  onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                  placeholder="如：USDT、(?i)免費、t.me/abc"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select
                  value={draft.type}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      type: e.target.value as Draft["type"],
                    })
                  }
                  className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="contains">contains（包含字串）</option>
                  <option value="regex">regex（正則）</option>
                  <option value="link">link（任何連結）</option>
                  <option value="mention">mention（@提及）</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Action</Label>
                <select
                  value={draft.action}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      action: e.target.value as Draft["action"],
                    })
                  }
                  className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="delete">delete（撤回）</option>
                  <option value="warn">warn（撤回+警告）</option>
                  <option value="ban">ban（撤回+封禁）</option>
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Chat ID（空 = 所有群）</Label>
                <Input
                  value={draft.chatId}
                  onChange={(e) => setDraft({ ...draft, chatId: e.target.value })}
                  placeholder=""
                />
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) =>
                    setDraft({ ...draft, isActive: e.target.checked })
                  }
                  id="kw-active"
                />
                <Label htmlFor="kw-active">啟用</Label>
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
            <CardContent className="pt-6">
              <div className="flex justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm mb-1">{row.pattern}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">{row.type}</Badge>
                    <Badge variant={row.action === "ban" ? "destructive" : "secondary"}>
                      {row.action}
                    </Badge>
                    {row.chatId != null && (
                      <Badge variant="outline">chat {String(row.chatId)}</Badge>
                    )}
                    {!row.isActive && <Badge variant="destructive">停用</Badge>}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setDraft(toDraft(row))}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(row.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
