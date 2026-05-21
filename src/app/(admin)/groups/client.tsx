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
import type { Group, TgButtonRow } from "@/lib/db/schema";
import { upsertGroup, deleteGroup } from "@/lib/actions/groups";
import { ButtonEditor } from "@/components/button-editor";

type Draft = {
  id?: number;
  chatId: string;
  title: string;
  type: "main" | "sub";
  isActive: boolean;
  simplifiedPolicy: "strict" | "off";
  syncTargetChatId: string; // deprecated 保留
  syncTargetChatIds: number[];
  raidThreshold: string;
  raidWindowSec: string;
  warningLimit: string;
  muteDurationSec: string;
  verifyTimeoutSec: string;
  defaultButtons: TgButtonRow[];
};

function emptyDraft(): Draft {
  return {
    chatId: "",
    title: "",
    type: "sub",
    isActive: true,
    simplifiedPolicy: "strict",
    syncTargetChatId: "",
    syncTargetChatIds: [],
    raidThreshold: "5",
    raidWindowSec: "30",
    warningLimit: "3",
    muteDurationSec: "86400",
    verifyTimeoutSec: "300",
    defaultButtons: [],
  };
}

function toDraft(g: Group): Draft {
  return {
    id: g.id,
    chatId: String(g.chatId),
    title: g.title,
    type: g.type,
    isActive: g.isActive,
    simplifiedPolicy: g.simplifiedPolicy,
    syncTargetChatId: g.syncTargetChatId != null ? String(g.syncTargetChatId) : "",
    syncTargetChatIds: (g.syncTargetChatIds ?? []).map(Number),
    raidThreshold: String(g.raidThreshold),
    raidWindowSec: String(g.raidWindowSec),
    warningLimit: String(g.warningLimit),
    muteDurationSec: String(g.muteDurationSec),
    verifyTimeoutSec: String(g.verifyTimeoutSec),
    defaultButtons: g.defaultButtons ?? [],
  };
}

export function GroupsClient({ initial }: { initial: Group[] }) {
  const router = useRouter();
  // 直接用 prop，避免 useState 凍住舊資料導致 router.refresh 後列表不更新
  const rows = initial;
  const subOptions = rows
    .filter((g) => g.type === "sub" && g.isActive)
    .map((g) => ({ chatId: Number(g.chatId), title: g.title }));
  const existingActiveMain = rows.find((g) => g.type === "main" && g.isActive);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertGroup(draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: number) {
    if (!confirm("確定刪除此群組設定？bot 將不再對該群作用")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteGroup(id);
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
        <p className="text-sm text-zinc-500">{rows.length} 個群組</p>
        {!draft && (
          <Button size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            新增群組
          </Button>
        )}
      </div>

      <ErrorBanner error={error} />

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "編輯群組" : "新增群組"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Chat ID（負數）">
                <Input
                  value={draft.chatId}
                  onChange={(e) => setDraft({ ...draft, chatId: e.target.value })}
                  placeholder="-1001234567890"
                />
              </Field>
              <Field label="群組名稱">
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
              <Field label="類型">
                <select
                  value={draft.type}
                  onChange={(e) =>
                    setDraft({ ...draft, type: e.target.value as "main" | "sub" })
                  }
                  className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="main">main（主群，admin 訊息會同步）</option>
                  <option value="sub">sub（子群，可聊天）</option>
                </select>
                {draft.type === "main" &&
                  existingActiveMain &&
                  existingActiveMain.id !== draft.id && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      ⚠️ 已有啟用中的主群「{existingActiveMain.title}」。系統只允許 1 個 main，儲存時會被拒。請先停用舊主群。
                    </p>
                  )}
              </Field>
              <Field label="簡繁政策">
                <select
                  value={draft.simplifiedPolicy}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      simplifiedPolicy: e.target.value as "strict" | "off",
                    })
                  }
                  className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="strict">strict（撤回+警告）</option>
                  <option value="off">off（不檢查）</option>
                </select>
              </Field>
              <Field
                label="同步目標子群（main 限定，多選）"
                hint="主群發訊息會 fan-out 到此處勾選的所有子群。子群本身不用設這欄。"
              >
                {draft.type === "main" ? (
                  subOptions.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      尚無啟用中的子群可選。建立子群並設為 sub 後會出現在這。
                    </p>
                  ) : (
                    <div className="space-y-1.5 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                      {subOptions.map((s) => {
                        const checked = draft.syncTargetChatIds.includes(s.chatId);
                        return (
                          <label
                            key={s.chatId}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setDraft({
                                  ...draft,
                                  syncTargetChatIds: checked
                                    ? draft.syncTargetChatIds.filter(
                                        (id) => id !== s.chatId,
                                      )
                                    : [...draft.syncTargetChatIds, s.chatId],
                                })
                              }
                            />
                            <span className="text-sm">
                              {s.title}{" "}
                              <span className="text-xs text-zinc-500 font-mono">
                                ({s.chatId})
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <p className="text-xs text-zinc-500">
                    此群為 sub，不需指定同步目標。把上方「類型」改成 main 才會出現選項。
                  </p>
                )}
              </Field>
              <Field label="Raid 閾值（X 秒內 N 人加入）">
                <div className="flex gap-2 items-center">
                  <Input
                    className="w-20"
                    value={draft.raidThreshold}
                    onChange={(e) =>
                      setDraft({ ...draft, raidThreshold: e.target.value })
                    }
                  />
                  <span className="text-xs">人 /</span>
                  <Input
                    className="w-24"
                    value={draft.raidWindowSec}
                    onChange={(e) =>
                      setDraft({ ...draft, raidWindowSec: e.target.value })
                    }
                  />
                  <span className="text-xs">秒</span>
                </div>
              </Field>
              <Field label="警告上限（達到禁言）">
                <Input
                  value={draft.warningLimit}
                  onChange={(e) =>
                    setDraft({ ...draft, warningLimit: e.target.value })
                  }
                />
              </Field>
              <Field label="禁言時長（秒）">
                <Input
                  value={draft.muteDurationSec}
                  onChange={(e) =>
                    setDraft({ ...draft, muteDurationSec: e.target.value })
                  }
                />
              </Field>
              <Field label="驗證超時（秒）">
                <Input
                  value={draft.verifyTimeoutSec}
                  onChange={(e) =>
                    setDraft({ ...draft, verifyTimeoutSec: e.target.value })
                  }
                />
              </Field>
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) =>
                    setDraft({ ...draft, isActive: e.target.checked })
                  }
                  id="g-active"
                />
                <Label htmlFor="g-active">啟用（停用後 bot 將忽略此群）</Label>
              </div>
            </div>
            {draft.type === "main" ? (
              <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <ButtonEditor
                  label="預設按鈕（主群→子群同步時自動附加）"
                  hint="主群 admin 發訊息同步到子群後，子群版本會在尾端附加這些按鈕（例如「聊天室」「客服」）。"
                  value={draft.defaultButtons}
                  onChange={(defaultButtons) =>
                    setDraft({ ...draft, defaultButtons })
                  }
                />
              </div>
            ) : (
              <div className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
                💡 「預設按鈕」（同步附加給子群）只能在主群（main）設定。把上面「類型」改為 main 後會出現編輯欄。
              </div>
            )}
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
                  <p className="font-medium">
                    {row.title}{" "}
                    <Badge variant={row.type === "main" ? "default" : "secondary"}>
                      {row.type}
                    </Badge>
                    {!row.isActive && (
                      <Badge variant="destructive" className="ml-1">
                        停用
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono">{String(row.chatId)}</p>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 grid gap-1 md:grid-cols-2">
                    <span>簡繁政策: {row.simplifiedPolicy}</span>
                    <span>同步目標: {row.syncTargetChatId != null ? String(row.syncTargetChatId) : "—"}</span>
                    <span>Raid: {row.raidThreshold} / {row.raidWindowSec}s</span>
                    <span>警告上限: {row.warningLimit} 次</span>
                    <span>禁言: {row.muteDurationSec}s</span>
                    <span>驗證超時: {row.verifyTimeoutSec}s</span>
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
