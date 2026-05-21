import type { InlineKeyboardButton } from "grammy/types";
import type { TgButton, TgButtonRow } from "@/lib/db/schema";

/**
 * 把我們儲存的按鈕結構轉成 Telegram raw API 的 inline_keyboard。
 * URL → { text, url }
 * Copy Text → { text, copy_text: { text } } (Telegram Bot API 7.5+)
 */
export function renderButtons(
  rows: TgButtonRow[] | null | undefined,
): InlineKeyboardButton[][] {
  if (!rows || rows.length === 0) return [];
  return rows
    .map((row) => row.map(toTelegramButton).filter(notEmpty))
    .filter((row) => row.length > 0);
}

function toTelegramButton(btn: TgButton): InlineKeyboardButton | null {
  if (!btn.text) return null;
  if ("url" in btn) {
    if (!btn.url) return null;
    return { text: btn.text, url: btn.url };
  }
  if ("copyText" in btn) {
    if (!btn.copyText) return null;
    return { text: btn.text, copy_text: { text: btn.copyText } };
  }
  return null;
}

function notEmpty<T>(v: T | null | undefined): v is T {
  return v != null;
}

/** 合併兩組按鈕（用於 broadcast：原按鈕 + 群組預設按鈕） */
export function mergeKeyboards(
  ...keyboards: Array<InlineKeyboardButton[][] | null | undefined>
): InlineKeyboardButton[][] {
  const merged: InlineKeyboardButton[][] = [];
  for (const kb of keyboards) {
    if (kb && kb.length > 0) merged.push(...kb);
  }
  return merged;
}
