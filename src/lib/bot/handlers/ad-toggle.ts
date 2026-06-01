import type { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { log, errorMessage } from "@/lib/log";

/**
 * 群內指令切換按鈕附加開關：
 *   /ad on   開啟（admin 貼文自動加按鈕 / 相簿補按鈕訊息）
 *   /ad off  關閉（admin 普通發文不再被重發）
 *   /ad      顯示目前狀態
 * 僅限 group/supergroup 的 admin 使用。
 */
export function registerAdToggleHandler(bot: Bot) {
  bot.command("ad", async (ctx, next) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return next();
    if (!ctx.from) return next();
    if (!(await isAdmin(ctx, chat.id, ctx.from.id))) return next();

    const group = await getGroupByChatId(chat.id);
    if (!group) {
      await ctx.reply("此群尚未註冊到後台，無法設定。").catch(() => {});
      return;
    }

    const arg = (ctx.match ?? "").trim().toLowerCase();

    if (arg !== "on" && arg !== "off") {
      const state = group.buttonAttachEnabled ? "開啟 ✅" : "關閉 ⛔";
      const hasButtons = (group.defaultButtons?.length ?? 0) > 0;
      await ctx
        .reply(
          `按鈕附加目前：${state}\n` +
            (hasButtons ? "" : "⚠️ 本群尚未設定按鈕（後台「群組設定」設定）。\n") +
            "用法：/ad on 開啟、/ad off 關閉。",
        )
        .catch(() => {});
      return;
    }

    const enabled = arg === "on";
    try {
      await db
        .update(groups)
        .set({ buttonAttachEnabled: enabled })
        .where(eq(groups.chatId, chat.id));
      // getGroupByChatId 無 cache，更新後下一則訊息即時生效

      const hasButtons = (group.defaultButtons?.length ?? 0) > 0;
      await ctx
        .reply(
          enabled
            ? `✅ 已開啟按鈕附加。${hasButtons ? "之後 admin 貼文會自動加上按鈕。" : "⚠️ 但本群還沒設定按鈕，請先到後台設定。"}`
            : "⛔ 已關閉按鈕附加。admin 普通發文不會再被重發。",
        )
        .catch(() => {});

      await log({
        type: "button.toggle",
        chatId: chat.id,
        userId: ctx.from.id,
        payload: { enabled },
      });
    } catch (err) {
      await ctx
        .reply(`設定失敗：${errorMessage(err)}`)
        .catch(() => {});
    }
  });
}
