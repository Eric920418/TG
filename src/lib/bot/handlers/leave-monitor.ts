import type { Bot } from "grammy";
import { redis } from "@/lib/redis";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { log, errorMessage } from "@/lib/log";

function leaveKey(chatId: number, bucket: number): string {
  return `leave:${chatId}:${bucket}`;
}

function notifyKey(chatId: number, bucket: number): string {
  return `leave:notified:${chatId}:${bucket}`;
}

export function registerLeaveMonitor(bot: Bot) {
  bot.on("chat_member", async (ctx, next) => {
    const upd = ctx.chatMember;
    if (!upd) return next();
    const oldStatus = upd.old_chat_member.status;
    const newStatus = upd.new_chat_member.status;
    const isLeave =
      (oldStatus === "member" ||
        oldStatus === "restricted" ||
        oldStatus === "administrator") &&
      (newStatus === "left" || newStatus === "kicked");
    if (!isLeave) return next();

    const chatId = ctx.chat.id;
    const group = await getGroupByChatId(chatId);
    if (!group || !group.isActive) return next();

    const window = group.raidWindowSec;
    const threshold = group.raidThreshold;

    const bucket = Math.floor(Date.now() / 1000 / window);
    const r = redis();
    const count = await r.incr(leaveKey(chatId, bucket));
    if (count === 1) await r.expire(leaveKey(chatId, bucket), window * 2);

    if (count >= threshold) {
      const notified = await r.set(notifyKey(chatId, bucket), "1", {
        nx: true,
        ex: window * 2,
      });
      if (notified === "OK") {
        await log({
          type: "leave.avalanche",
          chatId,
          payload: { count, window, threshold },
        });
        await ctx.api
          .sendMessage(
            chatId,
            `⚠️ 偵測到 ${window} 秒內 ${count} 人離開群組，請 admin 留意。`,
          )
          .catch((err) =>
            log({
              type: "leave.notify_failed",
              chatId,
              error: errorMessage(err),
            }),
          );
      }
    }

    return next();
  });
}
