"use client";
import { Plus, Trash2 } from "lucide-react";
import type { TgButton, TgButtonRow } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TELEGRAM_ROW_MAX = 8;
const TELEGRAM_MAX_ROWS = 8;

type ButtonKind = "url" | "copyText";

function kindOf(btn: TgButton): ButtonKind {
  return "url" in btn ? "url" : "copyText";
}

function emptyButton(kind: ButtonKind): TgButton {
  return kind === "url"
    ? { text: "", url: "" }
    : { text: "", copyText: "" };
}

function setKind(btn: TgButton, kind: ButtonKind): TgButton {
  if (kindOf(btn) === kind) return btn;
  return kind === "url"
    ? { text: btn.text, url: "" }
    : { text: btn.text, copyText: "" };
}

function setField(btn: TgButton, field: "text" | "url" | "copyText", value: string): TgButton {
  if (field === "text") return { ...btn, text: value } as TgButton;
  if (field === "url" && "url" in btn) return { ...btn, url: value };
  if (field === "copyText" && "copyText" in btn) return { ...btn, copyText: value };
  return btn;
}

export function ButtonEditor({
  value,
  onChange,
  label,
  hint,
}: {
  value: TgButtonRow[];
  onChange: (next: TgButtonRow[]) => void;
  label?: string;
  hint?: string;
}) {
  function updateButton(rowIdx: number, btnIdx: number, next: TgButton) {
    const rows = value.map((row, i) =>
      i === rowIdx ? row.map((b, j) => (j === btnIdx ? next : b)) : row,
    );
    onChange(rows);
  }

  function removeButton(rowIdx: number, btnIdx: number) {
    const rows = value
      .map((row, i) =>
        i === rowIdx ? row.filter((_, j) => j !== btnIdx) : row,
      )
      .filter((row) => row.length > 0);
    onChange(rows);
  }

  function addButton(rowIdx: number) {
    if (value[rowIdx].length >= TELEGRAM_ROW_MAX) return;
    const rows = value.map((row, i) =>
      i === rowIdx ? [...row, emptyButton("url")] : row,
    );
    onChange(rows);
  }

  function addRow() {
    if (value.length >= TELEGRAM_MAX_ROWS) return;
    onChange([...value, [emptyButton("url")]]);
  }

  function removeRow(rowIdx: number) {
    onChange(value.filter((_, i) => i !== rowIdx));
  }

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {value.length === 0 && (
        <p className="text-xs text-zinc-400">尚無按鈕</p>
      )}
      <div className="space-y-3">
        {value.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="rounded-md border border-zinc-200 p-3 space-y-2 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">第 {rowIdx + 1} 行</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeRow(rowIdx)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                刪除整行
              </Button>
            </div>
            {row.map((btn, btnIdx) => {
              const kind = kindOf(btn);
              return (
                <div key={btnIdx} className="flex gap-2 items-start">
                  <select
                    value={kind}
                    onChange={(e) =>
                      updateButton(
                        rowIdx,
                        btnIdx,
                        setKind(btn, e.target.value as ButtonKind),
                      )
                    }
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs w-24 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="url">URL</option>
                    <option value="copyText">複製</option>
                  </select>
                  <Input
                    value={btn.text}
                    onChange={(e) =>
                      updateButton(
                        rowIdx,
                        btnIdx,
                        setField(btn, "text", e.target.value),
                      )
                    }
                    placeholder="按鈕文字"
                    className="flex-1"
                  />
                  {kind === "url" ? (
                    <Input
                      value={"url" in btn ? btn.url : ""}
                      onChange={(e) =>
                        updateButton(
                          rowIdx,
                          btnIdx,
                          setField(btn, "url", e.target.value),
                        )
                      }
                      placeholder="https://..."
                      className="flex-[2]"
                    />
                  ) : (
                    <Input
                      value={"copyText" in btn ? btn.copyText : ""}
                      onChange={(e) =>
                        updateButton(
                          rowIdx,
                          btnIdx,
                          setField(btn, "copyText", e.target.value),
                        )
                      }
                      placeholder="要複製的文字（如合約地址）"
                      className="flex-[2]"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeButton(rowIdx, btnIdx)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {row.length < TELEGRAM_ROW_MAX && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => addButton(rowIdx)}
                type="button"
              >
                <Plus className="h-4 w-4" />
                這行加按鈕
              </Button>
            )}
          </div>
        ))}
      </div>
      {value.length < TELEGRAM_MAX_ROWS && (
        <Button
          variant="outline"
          size="sm"
          onClick={addRow}
          type="button"
        >
          <Plus className="h-4 w-4" />
          新增一行
        </Button>
      )}
    </div>
  );
}
