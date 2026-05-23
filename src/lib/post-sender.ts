import { eq } from "drizzle-orm";
import { Api } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import type { InlineKeyboardButton } from "grammy/types";
import { getBot } from "@/lib/bot";
import { db } from "@/lib/db";
import { stagingMessages } from "@/lib/db/schema";
import type { ScheduledPostContent, PostResult } from "@/lib/db/schema";
import { renderButtons } from "@/lib/buttons";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { withClient, sleep } from "@/lib/mtproto/client";
import { errorMessage } from "@/lib/log";

const USER_DAILY_LIMIT = 200;
const USER_SEND_DELAY_MS = 3000;

function buildKeyboard(content: ScheduledPostContent) {
  const inline = renderButtons(content.buttons);
  if (inline.length === 0) return undefined;
  return { inline_keyboard: inline };
}

/** grammY 風格按鈕陣列 → GramJS Api.ReplyInlineMarkup */
function toGramjsMarkup(
  kb: InlineKeyboardButton[][] | undefined,
): Api.ReplyInlineMarkup | undefined {
  if (!kb || kb.length === 0) return undefined;
  const rows = kb.map((row) => {
    const buttons: Api.TypeKeyboardButton[] = [];
    for (const btn of row) {
      if ("url" in btn) {
        buttons.push(
          new Api.KeyboardButtonUrl({ text: btn.text, url: btn.url }),
        );
      } else if ("copy_text" in btn && btn.copy_text) {
        buttons.push(
          new Api.KeyboardButtonCopy({
            text: btn.text,
            copyText: btn.copy_text.text,
          }),
        );
      }
    }
    return new Api.KeyboardButtonRow({ buttons });
  });
  return new Api.ReplyInlineMarkup({ rows });
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 把 bot file_id（或 http URL）轉成 GramJS 可直接送的 file。
 *  - http URL：直接回字串，GramJS 內部會 fetch
 *  - bot file_id：呼叫 bot.api.getFile → 從 Telegram CDN 下載 bytes → 包成 CustomFile
 *    （因為 bot file_id 跟 user MTProto namespace 不通，必須重新上傳）
 */
async function mediaToFileLike(
  url: string,
  kind: "photo" | "video" | "animation" | "document",
): Promise<string | CustomFile> {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const bot = await getBot();
  const file = await bot.api.getFile(url);
  if (!file.file_path) {
    throw new Error(`getFile ${url} 沒拿到 file_path`);
  }
  const dlUrl = `https://api.telegram.org/file/bot${env().TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(dlUrl);
  if (!res.ok) {
    throw new Error(`下載 file 失敗：HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext =
    file.file_path.split(".").pop() ||
    (kind === "photo" ? "jpg" : kind === "video" ? "mp4" : kind === "animation" ? "gif" : "bin");
  const name = `${kind}-${Date.now()}.${ext}`;
  return new CustomFile(name, buf.length, "", buf);
}

/**
 * 發送排程貼文到多個 chat。
 * - sendAs='bot' (預設)：grammY Bot API 路徑（既有邏輯）
 * - sendAs='user' + sendAsAdminId：MTProto 路徑，用 owner 本人帳號發送，
 *   custom_emoji 在 channel 也保留。有每日上限、每筆 3 秒間隔防 anti-spam。
 */
export async function sendPostToChats(
  content: ScheduledPostContent,
  chatIds: number[],
  stagingMessageId?: number | null,
  sendAs: "bot" | "user" = "bot",
  sendAsAdminId?: number | null,
): Promise<PostResult[]> {
  if (sendAs === "user") {
    if (!sendAsAdminId) {
      return chatIds.map((chatId) => ({
        chatId,
        error: "sendAs=user 但 sendAsAdminId 缺失",
      }));
    }
    return sendViaUser(
      sendAsAdminId,
      chatIds,
      content,
      stagingMessageId ?? null,
    );
  }
  return sendViaBot(content, chatIds, stagingMessageId ?? null);
}

async function sendViaBot(
  content: ScheduledPostContent,
  chatIds: number[],
  stagingMessageId: number | null,
): Promise<PostResult[]> {
  const bot = await getBot();
  const keyboard = buildKeyboard(content);
  const results: PostResult[] = [];

  if (stagingMessageId != null) {
    const [staging] = await db
      .select()
      .from(stagingMessages)
      .where(eq(stagingMessages.id, stagingMessageId))
      .limit(1);
    if (!staging) {
      for (const chatId of chatIds) {
        results.push({
          chatId,
          error: `staging message #${stagingMessageId} not found`,
        });
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
        if (keyboard) {
          try {
            await bot.api.editMessageReplyMarkup(chatId, sent.message_id, {
              reply_markup: keyboard,
            });
          } catch {
            /* edit fail 不阻塞 */
          }
        }
        results.push({ chatId, messageId: sent.message_id });
      } catch (err) {
        results.push({ chatId, error: errorMessage(err) });
      }
    }
    return results;
  }

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
          if (m.type === "photo")
            sent = await bot.api.sendPhoto(chatId, m.url, opts);
          else if (m.type === "video")
            sent = await bot.api.sendVideo(chatId, m.url, opts);
          else if (m.type === "animation")
            sent = await bot.api.sendAnimation(chatId, m.url, opts);
          else sent = await bot.api.sendDocument(chatId, m.url, opts);
          results.push({ chatId, messageId: sent.message_id });
        } else {
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

async function sendViaUser(
  adminId: number,
  chatIds: number[],
  content: ScheduledPostContent,
  stagingMessageId: number | null,
): Promise<PostResult[]> {
  const results: PostResult[] = [];
  const keyboard = buildKeyboard(content);
  const replyMarkup = toGramjsMarkup(keyboard?.inline_keyboard);

  // 每日上限檢查
  const dailyKey = `mtproto:sent:${adminId}:${todayYMD()}`;
  const sentTodayRaw = await redis().get<number | string>(dailyKey);
  const sentToday = Number(sentTodayRaw ?? 0);
  if (sentToday >= USER_DAILY_LIMIT) {
    return chatIds.map((chatId) => ({
      chatId,
      error: `已達每日 user 帳號發送上限 ${USER_DAILY_LIMIT} 條`,
    }));
  }

  try {
    await withClient(adminId, async (client) => {
      type FileParam =
        | Api.TypeMessageMedia
        | string
        | CustomFile
        | Array<string | CustomFile>;
      let baseMessage: {
        message: string;
        entities?: Api.TypeMessageEntity[];
        file?: FileParam;
      } = { message: content.text ?? "" };

      if (stagingMessageId != null) {
        const [staging] = await db
          .select()
          .from(stagingMessages)
          .where(eq(stagingMessages.id, stagingMessageId))
          .limit(1);
        if (!staging) {
          for (const chatId of chatIds) {
            results.push({
              chatId,
              error: `staging message #${stagingMessageId} not found`,
            });
          }
          return;
        }
        // staging.chatId 是「bot 視角的 chat_id」= 你自己的 user_id；
        // user-mode 拿這個 id 會被 Telegram 誤判為 Saved Messages 找不到訊息。
        // 改用 bot 的 user_id（token 第一段）當 entity = 你跟 bot 的 DM。
        const botUserId = Number(env().TELEGRAM_BOT_TOKEN.split(":")[0]);
        const stagingChatEntity = await client.getInputEntity(botUserId);
        const msgs = await client.getMessages(stagingChatEntity, {
          ids: [Number(staging.messageId)],
        });
        const m = msgs[0];
        if (!m) {
          for (const chatId of chatIds) {
            results.push({
              chatId,
              error: `找不到 staging 訊息（bot DM 內 id=${staging.messageId}），可能已被刪除或 bot 不在你聯絡人。請在 Telegram 重新傳該訊息給 bot 取得新 staging。`,
            });
          }
          return;
        }
        baseMessage = {
          message: m.message ?? "",
          entities: m.entities,
          file: m.media ?? undefined,
        };
      } else if (content.media && content.media.length > 0) {
        // 非 staging 模式：把 bot 上傳的 file_id 轉成 user MTProto 可送的 file
        const files: Array<string | CustomFile> = [];
        for (const m of content.media) {
          try {
            files.push(await mediaToFileLike(m.url, m.type));
          } catch (err) {
            // 個別檔案失敗就跳過、記在 results 裡讓使用者知道
            for (const chatId of chatIds) {
              results.push({
                chatId,
                error: `轉檔失敗 (${m.type})：${errorMessage(err)}`,
              });
            }
            return;
          }
        }
        baseMessage.file = files.length === 1 ? files[0] : files;
      }

      for (const chatId of chatIds) {
        try {
          const sent = await client.sendMessage(chatId, {
            message: baseMessage.message,
            formattingEntities: baseMessage.entities,
            file: baseMessage.file,
            buttons: replyMarkup,
          });
          const msgId =
            "id" in sent && typeof sent.id !== "undefined"
              ? Number(sent.id)
              : undefined;
          results.push({ chatId, messageId: msgId });

          await redis().incr(dailyKey);
          await redis().expire(dailyKey, 90000);
        } catch (err) {
          results.push({ chatId, error: errorMessage(err) });
        }
        await sleep(USER_SEND_DELAY_MS);
      }
    });
  } catch (err) {
    // withClient / 連線層失敗 → 全部目標標記
    const msg = errorMessage(err);
    for (const chatId of chatIds) {
      if (!results.find((r) => r.chatId === chatId)) {
        results.push({ chatId, error: msg });
      }
    }
  }

  return results;
}
