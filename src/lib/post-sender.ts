import { eq } from "drizzle-orm";
import { Api } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import type { InlineKeyboardButton } from "grammy/types";
import { getBot } from "@/lib/bot";
import { db } from "@/lib/db";
import { stagingMessages } from "@/lib/db/schema";
import type { ScheduledPostContent, PostResult } from "@/lib/db/schema";
import { renderButtons } from "@/lib/buttons";
import { ALBUM_FOLLOWUP_FALLBACK } from "@/lib/album-buttons";
import { getGroupByChatId } from "@/lib/bot/group-cache";
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

/**
 * grammY/Bot API 風格 entities 轉成 MTProto Api.TypeMessageEntity[]。
 * grammY 用 UTF-16 offset/length（跟 MTProto 一樣），可直接 1:1 對應。
 */
function grammyEntitiesToMtproto(
  text: string,
  entities: import("@/lib/db/schema").StoredEntity[] | null | undefined,
): Api.TypeMessageEntity[] | undefined {
  void text; // 預留：未來若要驗證 offset 範圍可用
  if (!entities || entities.length === 0) return undefined;
  const result: Api.TypeMessageEntity[] = [];
  for (const e of entities) {
    const base = { offset: e.offset, length: e.length };
    switch (e.type) {
      case "bold":
        result.push(new Api.MessageEntityBold(base));
        break;
      case "italic":
        result.push(new Api.MessageEntityItalic(base));
        break;
      case "underline":
        result.push(new Api.MessageEntityUnderline(base));
        break;
      case "strikethrough":
        result.push(new Api.MessageEntityStrike(base));
        break;
      case "spoiler":
        result.push(new Api.MessageEntitySpoiler(base));
        break;
      case "code":
        result.push(new Api.MessageEntityCode(base));
        break;
      case "pre":
        result.push(
          new Api.MessageEntityPre({ ...base, language: e.language ?? "" }),
        );
        break;
      case "blockquote":
        result.push(new Api.MessageEntityBlockquote({ ...base, collapsed: false }));
        break;
      case "url":
        result.push(new Api.MessageEntityUrl(base));
        break;
      case "text_link":
        if (e.url)
          result.push(new Api.MessageEntityTextUrl({ ...base, url: e.url }));
        break;
      case "mention":
        result.push(new Api.MessageEntityMention(base));
        break;
      case "hashtag":
        result.push(new Api.MessageEntityHashtag(base));
        break;
      case "cashtag":
        result.push(new Api.MessageEntityCashtag(base));
        break;
      case "bot_command":
        result.push(new Api.MessageEntityBotCommand(base));
        break;
      case "email":
        result.push(new Api.MessageEntityEmail(base));
        break;
      case "phone_number":
        result.push(new Api.MessageEntityPhone(base));
        break;
      case "custom_emoji":
        if (e.custom_emoji_id) {
          result.push(
            new Api.MessageEntityCustomEmoji({
              ...base,
              documentId: BigInt(e.custom_emoji_id) as unknown as bigInt.BigInteger,
            }),
          );
        }
        break;
      default:
        // 未知 entity 類型跳過、不阻塞發送
        break;
    }
  }
  return result;
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
    const extraMedia = content.media ?? [];
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
        // staging + 額外媒體：發第二則訊息
        if (extraMedia.length > 0) {
          try {
            if (extraMedia.length === 1) {
              const m = extraMedia[0];
              if (m.type === "photo") await bot.api.sendPhoto(chatId, m.url);
              else if (m.type === "video") await bot.api.sendVideo(chatId, m.url);
              else if (m.type === "animation")
                await bot.api.sendAnimation(chatId, m.url);
              else await bot.api.sendDocument(chatId, m.url);
            } else {
              const media = extraMedia.map((m) => ({
                type: m.type === "animation" ? "video" : m.type,
                media: m.url,
              })) as Parameters<typeof bot.api.sendMediaGroup>[1];
              await bot.api.sendMediaGroup(chatId, media);
            }
          } catch (err) {
            // 主訊息已成功；附加 album 失敗只記 log，不覆蓋主訊息結果
            results.push({
              chatId,
              error: `主訊息已發送但附加媒體失敗：${errorMessage(err)}`,
            });
            continue;
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
          // 相簿無法掛 inline 按鈕，若有按鈕則在相簿底下補一則按鈕訊息
          // 文字優先用目標群的自訂 album_button_text，否則用極簡符號
          if (keyboard) {
            const g = await getGroupByChatId(chatId);
            const followupText = g?.albumButtonText?.trim() || ALBUM_FOLLOWUP_FALLBACK;
            await bot.api
              .sendMessage(chatId, followupText, { reply_markup: keyboard })
              .catch(() => {});
          }
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
        // 直接從 DB 讀 staging snapshot（避開 MTProto entity / session 同步問題）
        if (!staging.text && !staging.mediaFileId) {
          for (const chatId of chatIds) {
            results.push({
              chatId,
              error: `staging #${stagingMessageId} 缺 snapshot 內容（可能是舊版本捕獲的）。請在 Telegram 重新傳一則訊息給 bot 取得新 staging 再試。`,
            });
          }
          return;
        }
        const entities = grammyEntitiesToMtproto(staging.text ?? "", staging.entities);
        let stagingFile: string | CustomFile | undefined;
        if (staging.mediaFileId && staging.mediaType) {
          try {
            stagingFile = await mediaToFileLike(
              staging.mediaFileId,
              staging.mediaType === "sticker"
                ? "document"
                : (staging.mediaType as "photo" | "video" | "animation" | "document"),
            );
          } catch (err) {
            for (const chatId of chatIds) {
              results.push({
                chatId,
                error: `轉 staging 媒體失敗：${errorMessage(err)}`,
              });
            }
            return;
          }
        }
        baseMessage = {
          message: staging.text ?? "",
          entities,
          file: stagingFile,
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

      // staging + 額外媒體：預先把額外 media 轉成 user 可送的 file array
      const stagingExtraFiles: Array<string | CustomFile> = [];
      if (stagingMessageId != null && content.media && content.media.length > 0) {
        for (const m of content.media) {
          try {
            stagingExtraFiles.push(await mediaToFileLike(m.url, m.type));
          } catch (err) {
            for (const chatId of chatIds) {
              results.push({
                chatId,
                error: `轉附加檔失敗 (${m.type})：${errorMessage(err)}`,
              });
            }
            return;
          }
        }
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

          // staging + 額外 media：發第二則 album
          if (stagingExtraFiles.length > 0) {
            try {
              await client.sendMessage(chatId, {
                message: "",
                file:
                  stagingExtraFiles.length === 1
                    ? stagingExtraFiles[0]
                    : stagingExtraFiles,
              });
            } catch (err) {
              results.push({
                chatId,
                error: `主訊息已發送但附加媒體失敗：${errorMessage(err)}`,
              });
              await sleep(USER_SEND_DELAY_MS);
              continue;
            }
          }

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
