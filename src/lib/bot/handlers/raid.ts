import type { Bot } from "grammy";
import { redis } from "@/lib/redis";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { log, errorMessage } from "@/lib/log";

function joinKey(chatId: number, bucket: number): string {
  return `raid:join:${chatId}:${bucket}`;
}

function lockKey(chatId: number): string {
  return `raid:lock:${chatId}`;
}

export function registerRaidHandler(bot: Bot) {
  bot.on("chat_member", async (ctx, next) => {
    const upd = ctx.chatMember;
    if (!upd) return next();
    const oldStatus = upd.old_chat_member.status;
    const newStatus = upd.new_chat_member.status;
    const isJoin =
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "restricted");
    if (!isJoin) return next();

    const chatId = ctx.chat.id;
    const group = await getGroupByChatId(chatId);
    if (!group || !group.isActive) return next();

    const window = group.raidWindowSec;
    const threshold = group.raidThreshold;

    const bucket = Math.floor(Date.now() / 1000 / window);
    const key = joinKey(chatId, bucket);
    const r = redis();

    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, window * 2);
    }

    if (count >= threshold) {
      const lock = await r.set(lockKey(chatId), "1", {
        nx: true,
        ex: window * 4,
      });
      if (lock === "OK") {
        try {
          await ctx.api.setChatPermissions(chatId, {
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
            can_invite_users: false,
          });
          await ctx.api
            .sendMessage(
              chatId,
              `🚨 偵測到 ${window} 秒內 ${count} 人加入，已自動全群禁言。請 admin 排查。`,
            )
            .catch(() => {});
        } catch (err) {
          await log({
            type: "raid.lock_failed",
            chatId,
            error: errorMessage(err),
          });
        }
        await log({
          type: "raid.triggered",
          chatId,
          payload: { count, window, threshold },
        });
      }
    }

    return next();
  });
}
