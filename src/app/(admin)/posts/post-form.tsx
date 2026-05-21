"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/error-banner";
import { ButtonEditor } from "@/components/button-editor";
import { createPost, updatePost } from "@/lib/actions/posts";
import type {
  ButtonTemplate,
  ScheduledPostContent,
  TgButtonRow,
} from "@/lib/db/schema";

export type PostFormInitial = {
  id?: number;
  title: string;
  content: ScheduledPostContent;
  targetChatIds: number[];
  sendAt: Date;
};

export type GroupOption = {
  chatId: number;
  title: string;
  type: "main" | "sub";
};

export type TemplateOption = Pick<ButtonTemplate, "id" | "name" | "buttons">;

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultSendAt(): string {
  const d = new Date(Date.now() + 10 * 60_000);
  d.setSeconds(0, 0);
  return toLocalInputValue(d);
}

export function PostForm({
  groups,
  templates,
  initial,
}: {
  groups: GroupOption[];
  templates: TemplateOption[];
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
  const initialMedia = initial?.content.media?.[0];
  const [mediaType, setMediaType] = useState<
    "" | "photo" | "video" | "document" | "animation"
  >(initialMedia?.type ?? "");
  const [mediaUrl, setMediaUrl] = useState(initialMedia?.url ?? "");
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleTarget(chatId: number) {
    setTargets((t) =>
      t.includes(chatId) ? t.filter((c) => c !== chatId) : [...t, chatId],
    );
  }

  function applyTemplate(id: string) {
    if (!id) return;
    const t = templates.find((x) => String(x.id) === id);
    if (t) setButtons(t.buttons);
  }

  function submit() {
    setError(null);
    const cleanedButtons = buttons.filter((row) => row.length > 0);
    const content: ScheduledPostContent = {
      text: text || undefined,
      parseMode: parseMode || undefined,
      disableWebPagePreview: disablePreview || undefined,
      media:
        mediaType && mediaUrl ? [{ type: mediaType, url: mediaUrl }] : undefined,
      buttons: cleanedButtons.length > 0 ? cleanedButtons : undefined,
    };
    const payload = {
      id: initial?.id,
      title,
      content,
      targetChatIds: targets,
      sendAt: new Date(sendAt),
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

        <div className="space-y-1.5">
          <Label>媒體（選填）</Label>
          <div className="flex gap-2">
            <select
              value={mediaType}
              onChange={(e) =>
                setMediaType(
                  e.target.value as
                    | ""
                    | "photo"
                    | "video"
                    | "document"
                    | "animation",
                )
              }
              className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">無</option>
              <option value="photo">photo</option>
              <option value="video">video</option>
              <option value="animation">animation (gif)</option>
              <option value="document">document</option>
            </select>
            <Input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://..."
              disabled={!mediaType}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <Label>按鈕</Label>
            {templates.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">套用範本：</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    applyTemplate(e.target.value);
                    e.target.value = "";
                  }}
                  className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="">— 選擇 —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
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
