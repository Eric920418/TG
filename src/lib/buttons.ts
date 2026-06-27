import type { InlineKeyboardButton } from "grammy/types";
import type { TgButton, TgButtonRow } from "@/lib/db/schema";

/**
 * 每列按鈕數的預設值。文字長的按鈕在多欄會被截斷（例：「泰花町預約」→「泰花…」），
 * 因此預設 1（整行最寬、不截斷）；各群可在後台用 buttons_per_row 自行調 1~3。
 */
export const MAX_BUTTONS_PER_ROW = 1;

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
  // clamp 1~8：避免傳入 0/負數造成無限迴圈，上限對齊 Telegram 每列上限
  const per = Math.min(8, Math.max(1, Math.floor(maxPerRow) || 1));
  const out: InlineKeyboardButton[][] = [];
  for (const row of rows) {
    const btns = row.map(toTelegramButton).filter(notEmpty);
    for (let i = 0; i < btns.length; i += per) {
      out.push(btns.slice(i, i + per));
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
