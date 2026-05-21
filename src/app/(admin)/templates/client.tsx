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
import { ButtonEditor } from "@/components/button-editor";
import type { ButtonTemplate, TgButtonRow } from "@/lib/db/schema";
import { upsertTemplate, deleteTemplate } from "@/lib/actions/templates";

type Draft = {
  id?: number;
  name: string;
  buttons: TgButtonRow[];
};

function emptyDraft(): Draft {
  return { name: "", buttons: [[{ text: "", url: "" }]] };
}

export function TemplatesClient({ initial }: { initial: ButtonTemplate[] }) {
  const router = useRouter();
  const rows = initial;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertTemplate(draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: number) {
    if (!confirm("確定刪除此範本？")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTemplate(id);
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
        <p className="text-sm text-zinc-500">{rows.length} 個範本</p>
        {!draft && (
          <Button size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            新增範本
          </Button>
        )}
      </div>

      <ErrorBanner error={error} />

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "編輯範本" : "新增範本"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>範本名稱</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例：聊天室組合"
              />
            </div>
            <ButtonEditor
              label="按鈕"
              value={draft.buttons}
              onChange={(buttons) => setDraft({ ...draft, buttons })}
            />
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
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="font-medium">{row.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {row.buttons.flat().map((btn, i) => (
                      <Badge
                        key={i}
                        variant={"url" in btn ? "default" : "secondary"}
                      >
                        {"url" in btn ? "🔗" : "📋"} {btn.text}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        name: row.name,
                        buttons: row.buttons,
                      })
                    }
                  >
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
