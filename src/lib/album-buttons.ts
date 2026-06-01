import type { Api } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { redis } from "@/lib/redis";
import { log, errorMessage } from "@/lib/log";

/** 相簿補按鈕訊息的文字（Telegram 不接受空字串，需給一個非空字元） */
export const ALBUM_FOLLOWUP_TEXT = "🔗";

/**
 * 相簿（media group）無法掛 inline 按鈕（Telegram 限制），改在相簿底下補一則「只有按鈕」的訊息。
 *
 * serverless 下相簿每張照片是獨立的 webhook 呼叫，記憶體留不住，因此用 Redis SET NX 去重：
 * 同一個 media_group_id 只補一次。
 */
export async function sendAlbumButtonFollowup(
  api: Api,
  chatId: number,
  mediaGroupId: string,
  inlineKeyboard: InlineKeyboardButton[][],
): Promise<void> {
  if (inlineKeyboard.length === 0) return;

  // 去重鎖：首次回傳 "OK"，重複回傳 null
  const key = `btnalbum:${chatId}:${mediaGroupId}`;
  try {
    const acquired = await redis().set(key, "1", { nx: true, ex: 60 });
    if (acquired !== "OK") return;
  } catch (err) {
    // Redis 掛了不該擋住補按鈕；記 log 後仍嘗試送出（最壞情況：相簿下方多一則按鈕訊息）
    await log({
      type: "button.album_dedup_failed",
      chatId,
      error: errorMessage(err),
      payload: { mediaGroupId },
    });
  }

  try {
    await api.sendMessage(chatId, ALBUM_FOLLOWUP_TEXT, {
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (err) {
    await log({
      type: "button.album_followup_failed",
      chatId,
      error: errorMessage(err),
      payload: { mediaGroupId },
    });
  }
}
