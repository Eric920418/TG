import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pendingVerifications, questions } from "@/lib/db/schema";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { log, errorMessage } from "@/lib/log";

const CALLBACK_PREFIX = "vfy:";

function buildKeyboard(pendingId: number, options: string[]) {
  const kb = new InlineKeyboard();
  options.forEach((label, i) => {
    if (i > 0 && i % 2 === 0) kb.row();
    kb.text(label, `${CALLBACK_PREFIX}${pendingId}:${i}`);
  });
  return kb;
}

async function pickRandomQuestion() {
  const [q] = await db
    .select()
    .from(questions)
    .where(eq(questions.isActive, true))
    .orderBy(sql`random()`)
    .limit(1);
  return q ?? null;
}

export function registerVerifyHandlers(bot: Bot) {
  // 新成員加入：禁言 + 發題目
  bot.on("chat_member", async (ctx) => {
    const upd = ctx.chatMember;
    if (!upd) return;
    const oldStatus = upd.old_chat_member.status;
    const newStatus = upd.new_chat_member.status;
    const isJoining =
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "restricted");
    if (!isJoining) return;

    const userId = upd.new_chat_member.user.id;
    const chatId = ctx.chat.id;
    // bot 自己加入時不處理
    if (upd.new_chat_member.user.is_bot) return;

    const group = await getGroupByChatId(chatId);
    if (!group || !group.isActive) return;

    // 禁言該用戶
    try {
      await ctx.api.restrictChatMember(chatId, userId, {
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
      });
    } catch (err) {
      await log({
        type: "verify.restrict_failed",
        chatId,
        userId,
        error: errorMessage(err),
      });
      return;
    }

    const question = await pickRandomQuestion();
    if (!question) {
      await log({
        type: "verify.no_question",
        chatId,
        userId,
        error: "題庫為空，請先到後台建立題目",
      });
      return;
    }

    const expiresAt = new Date(Date.now() + group.verifyTimeoutSec * 1000);

    const [pending] = await db
      .insert(pendingVerifications)
      .values({
        chatId,
        userId,
        questionId: question.id,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [pendingVerifications.chatId, pendingVerifications.userId],
        set: {
          questionId: question.id,
          expiresAt,
          messageId: null,
        },
      })
      .returning();

    const user = upd.new_chat_member.user;
    const displayName = user.first_name + (user.last_name ? ` ${user.last_name}` : "");
    const mention =
      user.username != null
        ? `@${user.username}`
        : `<a href="tg://user?id=${user.id}">${escapeHtml(displayName)}</a>`;

    const text =
      `👋 歡迎 ${mention}！\n\n` +
      `請在 ${group.verifyTimeoutSec} 秒內回答下方問題，` +
      `答對才能解禁。答錯或超時將被移出群組。\n\n` +
      `<b>${escapeHtml(question.question)}</b>`;

    try {
      const msg = await ctx.api.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: buildKeyboard(pending.id, question.options),
        link_preview_options: { is_disabled: true },
      });
      await db
        .update(pendingVerifications)
        .set({ messageId: msg.message_id })
        .where(eq(pendingVerifications.id, pending.id));
    } catch (err) {
      await log({
        type: "verify.send_failed",
        chatId,
        userId,
        error: errorMessage(err),
      });
    }
  });

  // 接收答題 callback
  bot.callbackQuery(new RegExp(`^${CALLBACK_PREFIX}\\d+:\\d+$`), async (ctx) => {
    const data = ctx.callbackQuery.data!;
    const [, idPart, idxPart] = data.split(":");
    const pendingId = Number(idPart);
    const answerIdx = Number(idxPart);

    // 先 peek 看是不是自己的題目（不刪除）
    const [peek] = await db
      .select()
      .from(pendingVerifications)
      .where(eq(pendingVerifications.id, pendingId))
      .limit(1);

    if (!peek) {
      await ctx.answerCallbackQuery({ text: "驗證已失效", show_alert: false });
      return;
    }
    if (ctx.from.id !== peek.userId) {
      await ctx.answerCallbackQuery({
        text: "這不是你的題目",
        show_alert: false,
      });
      return;
    }

    // 原子 DELETE RETURNING：搶得到才處理（與 cron 過期清理互斥）
    const [pending] = await db
      .delete(pendingVerifications)
      .where(eq(pendingVerifications.id, pendingId))
      .returning();

    if (!pending) {
      await ctx.answerCallbackQuery({ text: "驗證已失效", show_alert: false });
      return;
    }

    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, pending.questionId))
      .limit(1);

    if (!question) {
      await ctx.answerCallbackQuery({ text: "題目不存在", show_alert: false });
      return;
    }

    const correct = answerIdx === question.correctIndex;
    const chatId = pending.chatId;
    const userId = pending.userId;

    try {
      if (correct) {
        // 解禁
        await ctx.api.restrictChatMember(chatId, userId, {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        });
        if (pending.messageId) {
          await ctx.api.deleteMessage(chatId, Number(pending.messageId)).catch(() => {});
        }
        await ctx.answerCallbackQuery({ text: "✅ 驗證通過，歡迎！" });
      } else {
        // 踢出 (ban + unban 等同 kick)
        try {
          await ctx.api.banChatMember(chatId, userId);
          await ctx.api.unbanChatMember(chatId, userId);
        } catch {
          // 忽略，可能權限不足
        }
        if (pending.messageId) {
          await ctx.api.deleteMessage(chatId, Number(pending.messageId)).catch(() => {});
        }
        await ctx.answerCallbackQuery({ text: "❌ 答錯，已移出群組" });
      }
    } finally {
      // pending 已在前面原子 DELETE，這裡只記 log
      await log({
        type: correct ? "verify.passed" : "verify.failed",
        chatId,
        userId,
        payload: { questionId: question.id, answer: answerIdx },
      });
    }
  });
}

export async function expirePendingVerifications(bot: Bot): Promise<number> {
  const now = new Date();
  const expired = await db
    .select()
    .from(pendingVerifications)
    .where(sql`${pendingVerifications.expiresAt} < ${now}`);

  let kicked = 0;
  for (const row of expired) {
    try {
      await bot.api.banChatMember(Number(row.chatId), Number(row.userId));
      await bot.api.unbanChatMember(Number(row.chatId), Number(row.userId));
      if (row.messageId) {
        await bot.api.deleteMessage(Number(row.chatId), Number(row.messageId)).catch(() => {});
      }
      kicked++;
      await log({
        type: "verify.timeout_kicked",
        chatId: row.chatId,
        userId: row.userId,
      });
    } catch (err) {
      await log({
        type: "verify.timeout_kick_failed",
        chatId: row.chatId,
        userId: row.userId,
        error: errorMessage(err),
      });
    }
    await db
      .delete(pendingVerifications)
      .where(
        and(
          eq(pendingVerifications.chatId, Number(row.chatId)),
          eq(pendingVerifications.userId, Number(row.userId)),
        ),
      );
  }
  return kicked;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 避開 unused warning
void (null as unknown as Context);
