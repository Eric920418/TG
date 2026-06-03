import type { InlineKeyboardButton } from "grammy/types";
import type { TgButton, TgButtonRow } from "@/lib/db/schema";

/**
 * 每列最多顯示幾個按鈕。Telegram 手機版按鈕過多會擠成一排、文字被截斷，
 * 因此把每一列限制在這個數量；超過的會自動換到下一列（例如 5 個 → 2+2+1）。
 */
export const MAX_BUTTONS_PER_ROW = 2;

/**
 * 把我們儲存的按鈕結構轉成 Telegram raw API 的 inline_keyboard。
 * URL → { text, url }
 * Copy Text → { text, copy_text: { text } } (Telegram Bot API 7.5+)
 *
 * 會保留使用者在編輯器排的分行，只把「超過 maxPerRow 的列」再自動拆成多列，
 * 避免按鈕擠成一排。
 */
export function renderButtons(
  rows: TgButtonRow[] | null | undefined,
  maxPerRow: number = MAX_BUTTONS_PER_ROW,
): InlineKeyboardButton[][] {
  if (!rows || rows.length === 0) return [];
  const out: InlineKeyboardButton[][] = [];
  for (const row of rows) {
    const btns = row.map(toTelegramButton).filter(notEmpty);
    for (let i = 0; i < btns.length; i += maxPerRow) {
      out.push(btns.slice(i, i + maxPerRow));
    }
  }
  return out;
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
