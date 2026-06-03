import type { Bot } from "grammy";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { unmuteUser } from "@/lib/bot/punish";
import { log, errorMessage } from "@/lib/log";

/**
 * 解除禁言指令（admin 限定）：
 *   - 回覆某人的訊息打 /unmute → 解除那個人
 *   - /unmute 123456789 → 用數字 user id 解除
 * （Bot API 無法把 @用戶名 轉成 id，所以用「回覆」最可靠。）
 */
export function registerUnmuteHandler(bot: Bot) {
  bot.command("unmute", async (ctx, next) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return next();
    if (!ctx.from) return next();
    if (!(await isAdmin(ctx, chat.id, ctx.from.id))) return next();

    const group = await getGroupByChatId(chat.id);
    if (!group) return next();

    // 解析目標：優先用「回覆的訊息」，否則吃數字 id 參數
    const replyUserId = ctx.message?.reply_to_message?.from?.id;
    const argId = Number((ctx.match ?? "").trim());
    const targetId =
      replyUserId ?? (Number.isInteger(argId) && argId > 0 ? argId : null);

    if (!targetId) {
      await ctx
        .reply(
          "用法：回覆要解禁者的訊息打 /unmute，或 /unmute <user id>。\n" +
            "（無法用 @用戶名，Telegram 不給 bot 查 username 對應的 id）",
        )
        .catch(() => {});
      return;
    }

    try {
      await unmuteUser(ctx.api, chat.id, targetId);
      const who = ctx.message?.reply_to_message?.from?.username
        ? `@${ctx.message.reply_to_message.from.username}`
        : `<a href="tg://user?id=${targetId}">該用戶</a>`;
      await ctx
        .reply(`✅ 已解除 ${who} 的禁言，警告計數已清空。`, {
          parse_mode: "HTML",
        })
        .catch(() => {});
      await log({
        type: "unmute.done",
        chatId: chat.id,
        userId: targetId,
        payload: { byAdmin: ctx.from.id },
      });
    } catch (err) {
      await ctx
        .reply(`解禁失敗：${errorMessage(err)}`)
        .catch(() => {});
    }
  });
}
