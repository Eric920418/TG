import { getBot } from "@/lib/bot";
import type { ScheduledPostContent, PostResult } from "@/lib/db/schema";
import { renderButtons } from "@/lib/buttons";
import { errorMessage } from "@/lib/log";

function buildKeyboard(content: ScheduledPostContent) {
  const inline = renderButtons(content.buttons);
  if (inline.length === 0) return undefined;
  return { inline_keyboard: inline };
}

export async function sendPostToChats(
  content: ScheduledPostContent,
  chatIds: number[],
): Promise<PostResult[]> {
  const bot = await getBot();
  const keyboard = buildKeyboard(content);

  const results: PostResult[] = [];
  for (const chatId of chatIds) {
    try {
      // 媒體優先
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
