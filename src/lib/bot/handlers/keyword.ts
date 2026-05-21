import type { Bot } from "grammy";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { keywordBlacklist, warnings, type KeywordRow } from "@/lib/db/schema";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { log, errorMessage } from "@/lib/log";

const TTL_MS = 30_000;
const cache = new Map<number, { rows: KeywordRow[]; expires: number }>();

async function loadKeywords(chatId: number): Promise<KeywordRow[]> {
  const now = Date.now();
  const cached = cache.get(chatId);
  if (cached && cached.expires > now) return cached.rows;

  const rows = await db
    .select()
    .from(keywordBlacklist)
    .where(
      and(
        eq(keywordBlacklist.isActive, true),
        or(
          isNull(keywordBlacklist.chatId),
          eq(keywordBlacklist.chatId, chatId),
        ),
      ),
    );

  cache.set(chatId, { rows, expires: now + TTL_MS });
  return rows;
}

export function clearKeywordCache(chatId?: number) {
  if (chatId == null) cache.clear();
  else cache.delete(chatId);
}

function matches(text: string, row: KeywordRow): boolean {
  switch (row.type) {
    case "contains":
      return text.toLowerCase().includes(row.pattern.toLowerCase());
    case "regex":
      try {
        return new RegExp(row.pattern, "i").test(text);
      } catch {
        return false;
      }
    case "link":
      return /(https?:\/\/|t\.me\/|@[a-zA-Z0-9_]{3,})/i.test(text);
    case "mention":
      return /@[a-zA-Z0-9_]{3,}/.test(text);
    default:
      return false;
  }
}

export function registerKeywordHandler(bot: Bot) {
  bot.on("message", async (ctx, next) => {
    const text = ctx.message.text ?? ctx.message.caption;
    if (!text || !ctx.from) return next();

    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return next();
    if (await isAdmin(ctx, chat.id, ctx.from.id)) return next();

    const group = await getGroupByChatId(chat.id);
    if (!group || !group.isActive) return next();

    const rows = await loadKeywords(chat.id);
    if (rows.length === 0) return next();

    const hit = rows.find((r) => matches(text, r));
    if (!hit) return next();

    const userId = ctx.from.id;
    const username = ctx.from.username ?? null;

    if (hit.action === "delete" || hit.action === "warn" || hit.action === "ban") {
      try {
        await ctx.api.deleteMessage(chat.id, ctx.message.message_id);
      } catch (err) {
        await log({
          type: "keyword.delete_failed",
          chatId: chat.id,
          userId,
          error: errorMessage(err),
        });
      }
    }

    if (hit.action === "warn") {
      const [row] = await db
        .insert(warnings)
        .values({
          chatId: chat.id,
          userId,
          username,
          reason: `keyword:${hit.type}`,
          count: 1,
        })
        .onConflictDoUpdate({
          target: [warnings.chatId, warnings.userId],
          set: {
            count: sql`${warnings.count} + 1`,
            lastAt: new Date(),
            username,
            reason: `keyword:${hit.type}`,
          },
        })
        .returning();

      if (row.count >= group.warningLimit) {
        const muteUntil = Math.floor(Date.now() / 1000) + group.muteDurationSec;
        await ctx.api
          .restrictChatMember(
            chat.id,
            userId,
            {
              can_send_messages: false,
              can_send_audios: false,
              can_send_documents: false,
              can_send_photos: false,
              can_send_videos: false,
              can_send_video_notes: false,
              can_send_voice_notes: false,
              can_send_polls: false,
              can_send_other_messages: false,
              can_add_web_page_previews: false,
            },
            { until_date: muteUntil },
          )
          .catch(() => {});
        await db
          .delete(warnings)
          .where(
            and(eq(warnings.chatId, chat.id), eq(warnings.userId, userId)),
          );
      }
    }

    if (hit.action === "ban") {
      try {
        await ctx.api.banChatMember(chat.id, userId);
      } catch (err) {
        await log({
          type: "keyword.ban_failed",
          chatId: chat.id,
          userId,
          error: errorMessage(err),
        });
      }
    }

    await log({
      type: "keyword.hit",
      chatId: chat.id,
      userId,
      payload: {
        pattern: hit.pattern,
        type: hit.type,
        action: hit.action,
      },
    });
  });
}
