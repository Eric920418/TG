import { eq } from "drizzle-orm";
import { getBot } from "@/lib/bot";
import { db } from "@/lib/db";
import { stagingMessages } from "@/lib/db/schema";
import type { ScheduledPostContent, PostResult } from "@/lib/db/schema";
import { renderButtons } from "@/lib/buttons";
import { errorMessage } from "@/lib/log";

function buildKeyboard(content: ScheduledPostContent) {
  const inline = renderButtons(content.buttons);
  if (inline.length === 0) return undefined;
  return { inline_keyboard: inline };
}

/**
 * 發送排程貼文到多個 chat。
 * 若 stagingMessageId 有值：用 copyMessage 從 staging chat 把原訊息 1:1 搬過去（保留 custom_emoji
 * 等 entities）；發送後再 editMessageReplyMarkup 套用 content.buttons（若有）。
 * 否則：用 content 內容（text + media + buttons）compose 新訊息發送。
 */
export async function sendPostToChats(
  content: ScheduledPostContent,
  chatIds: number[],
  stagingMessageId?: number | null,
): Promise<PostResult[]> {
  const bot = await getBot();
  const keyboard = buildKeyboard(content);
  const results: PostResult[] = [];

  // ---- staging 模式：copyMessage ----
  if (stagingMessageId != null) {
    const [staging] = await db
      .select()
      .from(stagingMessages)
      .where(eq(stagingMessages.id, stagingMessageId))
      .limit(1);
    if (!staging) {
      for (const chatId of chatIds) {
        results.push({ chatId, error: `staging message #${stagingMessageId} not found` });
      }
      return results;
    }
    for (const chatId of chatIds) {
      try {
        const sent = await bot.api.copyMessage(
          chatId,
          Number(staging.chatId),
          Number(staging.messageId),
        );
        // 套用排程設定的按鈕（若有）— 覆蓋原訊息可能帶的按鈕
        if (keyboard) {
          try {
            await bot.api.editMessageReplyMarkup(chatId, sent.message_id, {
              reply_markup: keyboard,
            });
          } catch {
            // 編輯失敗不阻塞
          }
        }
        results.push({ chatId, messageId: sent.message_id });
      } catch (err) {
        results.push({ chatId, error: errorMessage(err) });
      }
    }
    return results;
  }

  // ---- 一般模式：compose 新訊息 ----
  for (const chatId of chatIds) {
    try {
      if (content.media && content.media.length > 0) {
        if (content.media.length === 1) {
          const m = content.media[0];
          const caption = m.caption ?? content.text;
          const opts = {
            caption,
            parse_mode: content.parseMode,
            reply_markup: keyboard,
          } as const;
          let sent;
          if (m.type === "photo") sent = await bot.api.sendPhoto(chatId, m.url, opts);
          else if (m.type === "video") sent = await bot.api.sendVideo(chatId, m.url, opts);
          else if (m.type === "animation") sent = await bot.api.sendAnimation(chatId, m.url, opts);
          else sent = await bot.api.sendDocument(chatId, m.url, opts);
          results.push({ chatId, messageId: sent.message_id });
        } else {
          // 多媒體 album，不支援 keyboard
          const media = content.media.map((m, i) => ({
            type: m.type === "animation" ? "video" : m.type,
            media: m.url,
            caption: i === 0 ? content.text ?? m.caption : m.caption,
            parse_mode: content.parseMode,
          })) as Parameters<typeof bot.api.sendMediaGroup>[1];
          const sent = await bot.api.sendMediaGroup(chatId, media);
          results.push({ chatId, messageId: sent[0]?.message_id });
        }
      } else if (content.text) {
        const sent = await bot.api.sendMessage(chatId, content.text, {
          parse_mode: content.parseMode,
          reply_markup: keyboard,
          link_preview_options: {
            is_disabled: content.disableWebPagePreview ?? false,
          },
        });
        results.push({ chatId, messageId: sent.message_id });
      } else {
        results.push({ chatId, error: "no content" });
      }
    } catch (err) {
      results.push({ chatId, error: errorMessage(err) });
    }
  }
  return results;
}
