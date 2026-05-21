"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/error-banner";
import type { Question } from "@/lib/db/schema";
import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
} from "@/lib/actions/questions";

type Draft = {
  id?: number;
  question: string;
  options: string[];
  correctIndex: number;
  isActive: boolean;
};

function emptyDraft(): Draft {
  return { question: "", options: ["", "", "", ""], correctIndex: 0, isActive: true };
}

export function QuestionsClient({ initial }: { initial: Question[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Question[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startCreate() {
    setError(null);
    setDraft(emptyDraft());
  }

  function startEdit(row: Question) {
    setError(null);
    setDraft({
      id: row.id,
      question: row.question,
      options: row.options,
      correctIndex: row.correctIndex,
      isActive: row.isActive,
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const fn = draft.id ? updateQuestion : createQuestion;
      const res = await fn(draft);
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
      const res = await deleteQuestion(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 只在成功後才更新 UI（C6 樂觀刪除修正）
      setRows((r) => r.filter((row) => row.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-sm text-zinc-500">{rows.length} 題</p>
        {!draft && (
          <Button size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4" />
            新增題目
          </Button>
        )}
      </div>

      <ErrorBanner error={error} />

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "編輯題目" : "新增題目"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>題目</Label>
              <Textarea
                value={draft.question}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                placeholder="例：本群是哪國語言的群組？"
              />
            </div>
            <div className="space-y-2">
              <Label>選項（勾選正確答案）</Label>
              <div className="space-y-2">
                {draft.options.map((opt, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="radio"
                      name="correct"
                      checked={draft.correctIndex === i}
                      onChange={() => setDraft({ ...draft, correctIndex: i })}
                      className="flex-shrink-0"
                    />
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const next = [...draft.options];
                        next[i] = e.target.value;
                        setDraft({ ...draft, options: next });
                      }}
                      placeholder={`選項 ${i + 1}`}
                    />
                    {draft.options.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const next = draft.options.filter((_, j) => j !== i);
                          const nextIdx =
                            draft.correctIndex >= next.length
                              ? next.length - 1
                              : draft.correctIndex;
                          setDraft({
                            ...draft,
                            options: next,
                            correctIndex: nextIdx,
                          });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {draft.options.length < 8 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft({ ...draft, options: [...draft.options, ""] })
                    }
                  >
                    新增選項
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) =>
                  setDraft({ ...draft, isActive: e.target.checked })
                }
                id="active"
              />
              <Label htmlFor="active">啟用（停用後不會被抽中）</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={pending}>
                <Check className="h-4 w-4" />
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
                  <p className="font-medium mb-2">
                    {row.question}
                    {!row.isActive && (
                      <Badge variant="secondary" className="ml-2">
                        停用
                      </Badge>
                    )}
                  </p>
                  <ul className="space-y-1 text-sm">
                    {row.options.map((opt, i) => (
                      <li
                        key={i}
                        className={
                          i === row.correctIndex
                            ? "text-emerald-700 dark:text-emerald-400 font-medium"
                            : "text-zinc-600 dark:text-zinc-400"
                        }
                      >
                        {i === row.correctIndex ? "✓" : "○"} {opt}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(row)}>
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
