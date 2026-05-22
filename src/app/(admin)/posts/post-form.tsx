"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/error-banner";
import { ButtonEditor } from "@/components/button-editor";
import { createPost, updatePost } from "@/lib/actions/posts";
import type { ScheduledPostContent, TgButtonRow } from "@/lib/db/schema";

export type PostFormInitial = {
  id?: number;
  title: string;
  content: ScheduledPostContent;
  targetChatIds: number[];
  sendAt: Date;
  stagingMessageId?: number | null;
};

export type GroupOption = {
  chatId: number;
  title: string;
  type: "main" | "sub";
};

export type StagingOption = {
  id: number;
  label: string;
  hasMedia: boolean;
  createdAt: Date | string;
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultSendAt(): string {
  const d = new Date(Date.now() + 10 * 60_000);
  d.setSeconds(0, 0);
  return toLocalInputValue(d);
}

type MediaKind = "photo" | "video" | "animation" | "document";
type MediaItem = { type: MediaKind; url: string; caption?: string };

const TELEGRAM_ALBUM_MAX = 10;

export function PostForm({
  groups,
  stagings,
  initial,
}: {
  groups: GroupOption[];
  stagings: StagingOption[];
  initial?: PostFormInitial;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [text, setText] = useState(initial?.content.text ?? "");
  const [parseMode, setParseMode] = useState<"" | "HTML" | "MarkdownV2">(
    initial?.content.parseMode ?? "",
  );
  const [disablePreview, setDisablePreview] = useState(
    initial?.content.disableWebPagePreview ?? false,
  );
  const [mediaList, setMediaList] = useState<MediaItem[]>(
    initial?.content.media?.map((m) => ({
      type: m.type,
      url: m.url,
      caption: m.caption,
    })) ?? [],
  );
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [buttons, setButtons] = useState<TgButtonRow[]>(
    initial?.content.buttons ?? [],
  );
  const [targets, setTargets] = useState<number[]>(
    initial?.targetChatIds ?? [],
  );
  const [sendAt, setSendAt] = useState<string>(
    initial?.sendAt
      ? toLocalInputValue(new Date(initial.sendAt))
      : defaultSendAt(),
  );
  const [stagingMessageId, setStagingMessageId] = useState<number | null>(
    initial?.stagingMessageId ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const useStaging = stagingMessageId != null;

  function toggleTarget(chatId: number) {
    setTargets((t) =>
      t.includes(chatId) ? t.filter((c) => c !== chatId) : [...t, chatId],
    );
  }

  async function uploadFile(idx: number, file: File, fallbackKind?: MediaKind) {
    setError(null);
    setUploadingIdx(idx);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (fallbackKind) fd.append("kind", fallbackKind);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json()) as
        | { ok: true; fileId: string; kind: MediaKind }
        | { ok: false; error: string };
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setMediaList((list) =>
        list.map((m, i) =>
          i === idx ? { ...m, type: data.kind, url: data.fileId } : m,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingIdx(null);
    }
  }

  function addMedia() {
    if (mediaList.length >= TELEGRAM_ALBUM_MAX) return;
    setMediaList((list) => [...list, { type: "photo", url: "" }]);
  }

  function removeMedia(idx: number) {
    setMediaList((list) => list.filter((_, i) => i !== idx));
  }

  function updateMedia(idx: number, patch: Partial<MediaItem>) {
    setMediaList((list) =>
      list.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    );
  }

  function submit() {
    setError(null);
    const cleanedButtons = buttons.filter((row) => row.length > 0);
    const cleanedMedia = mediaList.filter((m) => m.url.trim() !== "");
    const content: ScheduledPostContent = {
      text: text || undefined,
      parseMode: parseMode || undefined,
      disableWebPagePreview: disablePreview || undefined,
      media: cleanedMedia.length > 0 ? cleanedMedia : undefined,
      buttons: cleanedButtons.length > 0 ? cleanedButtons : undefined,
    };
    const payload = {
      id: initial?.id,
      title,
      content,
      targetChatIds: targets,
      sendAt: new Date(sendAt),
      stagingMessageId,
    };
    startTransition(async () => {
      const res = initial?.id
        ? await updatePost(payload)
        : await createPost(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/posts");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <ErrorBanner error={error} />

        <div className="space-y-1.5">
          <Label>標題（後台識別用）</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900/30 dark:bg-amber-950/10">
          <Label>貼文內容來源</Label>
          <div className="flex gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="source"
                checked={!useStaging}
                onChange={() => setStagingMessageId(null)}
              />
              <span className="text-sm">自行填寫（下方文字 / 媒體 / 按鈕）</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="source"
                checked={useStaging}
                onChange={() => {
                  if (stagings.length > 0) setStagingMessageId(stagings[0].id);
                }}
                disabled={stagings.length === 0}
              />
              <span className="text-sm">
                從 bot 收到的訊息匯入（保留動態貼紙 / 富格式）
              </span>
            </label>
          </div>
          {useStaging && (
            <div className="mt-2 space-y-1.5">
              <select
                value={stagingMessageId ?? ""}
                onChange={(e) =>
                  setStagingMessageId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {stagings.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} · {s.hasMedia ? "📎 " : ""}
                    {s.label} · {new Date(s.createdAt).toLocaleString("zh-TW")}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500">
                提示：把含動態貼紙 / 富格式的訊息私訊或轉發給 @Kkk696kkk_admin_bot，會自動出現在這個下拉。
              </p>
            </div>
          )}
          {stagings.length === 0 && (
            <p className="text-xs text-zinc-500">
              （尚無 bot DM 素材。把要排程的訊息私訊或轉發給 bot 即可自動產生）
            </p>
          )}
        </div>

        {!useStaging && (
        <>
        <div className="space-y-1.5">
          <Label>文字內容</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Telegram 訊息文字，可使用 HTML/Markdown"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Parse Mode</Label>
            <select
              value={parseMode}
              onChange={(e) =>
                setParseMode(e.target.value as "" | "HTML" | "MarkdownV2")
              }
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">純文字</option>
              <option value="HTML">HTML</option>
              <option value="MarkdownV2">MarkdownV2</option>
            </select>
          </div>
          <div className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              id="dpreview"
              checked={disablePreview}
              onChange={(e) => setDisablePreview(e.target.checked)}
            />
            <Label htmlFor="dpreview">關閉連結預覽</Label>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <Label>媒體（選填，最多 {TELEGRAM_ALBUM_MAX} 張，多張會以相簿發送）</Label>
            <span className="text-xs text-zinc-500">
              {mediaList.length} / {TELEGRAM_ALBUM_MAX}
            </span>
          </div>
          {mediaList.length === 0 && (
            <p className="text-xs text-zinc-400">尚未加入媒體</p>
          )}
          <div className="space-y-2">
            {mediaList.map((m, i) => (
              <div
                key={i}
                className="flex gap-2 items-start"
              >
                <select
                  value={m.type}
                  onChange={(e) =>
                    updateMedia(i, { type: e.target.value as MediaKind })
                  }
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs w-28 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="photo">圖片</option>
                  <option value="video">影片</option>
                  <option value="animation">GIF</option>
                  <option value="document">檔案</option>
                </select>
                <Input
                  value={m.url}
                  onChange={(e) => updateMedia(i, { url: e.target.value })}
                  placeholder="https:// 或上傳後自動填 file_id"
                  className="flex-1 font-mono text-xs"
                />
                <label className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-zinc-300 bg-white text-xs cursor-pointer hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900 whitespace-nowrap">
                  {uploadingIdx === i ? "上傳中…" : "📤 上傳"}
                  <input
                    type="file"
                    className="hidden"
                    accept={
                      m.type === "photo"
                        ? "image/*"
                        : m.type === "video"
                          ? "video/*"
                          : m.type === "animation"
                            ? "image/gif,video/mp4"
                            : "*/*"
                    }
                    disabled={uploadingIdx !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        uploadFile(i, file, m.type);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => removeMedia(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {mediaList.length < TELEGRAM_ALBUM_MAX && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={addMedia}
              disabled={uploadingIdx !== null}
            >
              <Plus className="h-4 w-4" />
              新增媒體
            </Button>
          )}
          <p className="text-xs text-zinc-500">
            支援格式：圖片 ≤ 10 MB；影片 / GIF / 檔案 ≤ 50 MB（Telegram bot 上傳上限）
          </p>
        </div>
        </>
        )}

        <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <Label>按鈕{useStaging ? "（套用會覆蓋 staging 原訊息的按鈕；留空則保留原狀）" : ""}</Label>
          <ButtonEditor
            value={buttons}
            onChange={setButtons}
            hint="支援 URL 按鈕（外開連結）與 Copy Text（點擊複製文字到剪貼簿，如合約地址）"
          />
        </div>

        <div className="space-y-1.5">
          <Label>目標群</Label>
          {groups.length === 0 ? (
            <p className="text-sm text-zinc-500">
              尚未建立群組，請先到「群組設定」加入。
            </p>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => (
                <label
                  key={g.chatId}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={targets.includes(g.chatId)}
                    onChange={() => toggleTarget(g.chatId)}
                  />
                  <span className="text-sm">
                    {g.title}{" "}
                    <span className="text-xs text-zinc-500 font-mono">
                      ({g.type} · {g.chatId})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>發送時間（本地時區）</Label>
          <Input
            type="datetime-local"
            value={sendAt}
            onChange={(e) => setSendAt(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={submit} disabled={pending}>
            {pending ? "儲存中…" : initial?.id ? "更新排程" : "建立排程"}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            返回
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
