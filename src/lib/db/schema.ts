import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// =================== Enums ===================
export const groupTypeEnum = pgEnum("group_type", ["main", "sub"]);
export const postStatusEnum = pgEnum("post_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "canceled",
]);
export const keywordTypeEnum = pgEnum("keyword_type", [
  "contains",
  "regex",
  "link",
  "mention",
]);
export const keywordActionEnum = pgEnum("keyword_action", [
  "delete",
  "warn",
  "ban",
]);
export const adminRoleEnum = pgEnum("admin_role", ["owner", "admin"]);

// =================== Tables ===================

export const admins = pgTable(
  "admins",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    username: text("username"),
    firstName: text("first_name"),
    photoUrl: text("photo_url"),
    role: adminRoleEnum("role").notNull().default("admin"),
    isActive: boolean("is_active").notNull().default(true),
    // MTProto user account (本人 Premium 帳號) 自動發送 — owner-only 進階功能
    mtprotoSessionEnc: text("mtproto_session_enc"),
    mtprotoSessionIv: text("mtproto_session_iv"),
    mtprotoPhone: text("mtproto_phone"),
    mtprotoUserId: bigint("mtproto_user_id", { mode: "number" }),
    mtprotoConnectedAt: timestamp("mtproto_connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("admins_telegram_id_idx").on(t.telegramId)],
);

export const groups = pgTable(
  "groups",
  {
    id: serial("id").primaryKey(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    title: text("title").notNull(),
    type: groupTypeEnum("type").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // 簡繁政策：若 strict，會強制全部繁體；off 則跳過
    simplifiedPolicy: text("simplified_policy", {
      enum: ["strict", "off"],
    })
      .notNull()
      .default("strict"),
    // [DEPRECATED] 舊單一同步目標欄位，保留向後相容；新 code 一律用 syncTargetChatIds
    syncTargetChatId: bigint("sync_target_chat_id", { mode: "number" }),
    // 連結到所有同步目標子群（主群 fan-out）
    syncTargetChatIds: jsonb("sync_target_chat_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    // 防 raid 設定
    raidThreshold: integer("raid_threshold").notNull().default(5),
    raidWindowSec: integer("raid_window_sec").notNull().default(30),
    // 警告 N 次禁言
    warningLimit: integer("warning_limit").notNull().default(3),
    muteDurationSec: integer("mute_duration_sec").notNull().default(86400),
    // 認證題目秒數限制
    verifyTimeoutSec: integer("verify_timeout_sec").notNull().default(300),
    // 主群同步到子群時自動附加的預設按鈕（例如「聊天室」）
    defaultButtons: jsonb("default_buttons")
      .$type<TgButtonRow[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("groups_chat_id_idx").on(t.chatId)],
);

/**
 * Telegram staging messages：客戶把含 custom_emoji / 富格式的訊息私訊 / 轉發給 bot，
 * bot 把那條訊息的座標（chat_id + message_id）記下來，之後排程發送時用
 * copyMessage 從這個 staging 整條搬到目標群，entities 完整保留。
 */
export const stagingMessages = pgTable("staging_messages", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  messageId: bigint("message_id", { mode: "number" }).notNull(),
  label: text("label").notNull(),
  hasMedia: boolean("has_media").notNull().default(false),
  capturedByAdminId: integer("captured_by_admin_id"),
  // bot 抓 staging 時 snapshot 進來（避開後續 MTProto entity cache 限制）
  text: text("text"),
  entities: jsonb("entities").$type<StoredEntity[]>(),
  mediaType: text("media_type"), // photo / video / animation / document / sticker / null
  mediaFileId: text("media_file_id"), // bot file_id
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 來自 grammY ctx.message.entities / .caption_entities 的 snapshot */
export type StoredEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: { id: number };
  language?: string;
  custom_emoji_id?: string;
};

export const buttonTemplates = pgTable("button_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  buttons: jsonb("buttons").$type<TgButtonRow[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pendingVerifications = pgTable(
  "pending_verifications",
  {
    id: serial("id").primaryKey(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    questionId: integer("question_id").notNull(),
    messageId: bigint("message_id", { mode: "number" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("pending_chat_user_idx").on(t.chatId, t.userId),
    index("pending_expires_idx").on(t.expiresAt),
  ],
);

export const warnings = pgTable(
  "warnings",
  {
    id: serial("id").primaryKey(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    username: text("username"),
    reason: text("reason").notNull(),
    count: integer("count").notNull().default(1),
    lastAt: timestamp("last_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("warn_chat_user_idx").on(t.chatId, t.userId)],
);

export const scheduledPosts = pgTable(
  "scheduled_posts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    // 內容可包含: text, parse_mode, media[{type,fileId|url,caption}], buttons[[{text,url}]]
    content: jsonb("content").$type<ScheduledPostContent>().notNull(),
    targetChatIds: jsonb("target_chat_ids").$type<number[]>().notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    status: postStatusEnum("status").notNull().default("pending"),
    qstashMessageId: text("qstash_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    // 發到每個 chat 的結果 [{chatId, messageId, error}]
    results: jsonb("results").$type<PostResult[]>(),
    // 若指定 staging：發送改用 copyMessage 從 staging chat 把那條訊息整條搬過去（保留 custom_emoji 等 entities）
    stagingMessageId: integer("staging_message_id"),
    // 發送身分：'bot' (預設，用 Bot API) | 'user' (用 admin 的 MTProto session 發、custom_emoji 在 channel 也保留)
    sendAs: text("send_as", { enum: ["bot", "user"] }).notNull().default("bot"),
    // 若 sendAs='user'：用哪個 admin 的 session（必須有效綁定 MTProto）
    sendAsAdminId: integer("send_as_admin_id"),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("posts_status_send_at_idx").on(t.status, t.sendAt),
  ],
);

export const broadcasts = pgTable(
  "broadcasts",
  {
    id: serial("id").primaryKey(),
    sourceChatId: bigint("source_chat_id", { mode: "number" }).notNull(),
    sourceMessageId: bigint("source_message_id", { mode: "number" }).notNull(),
    targetChatId: bigint("target_chat_id", { mode: "number" }).notNull(),
    targetMessageId: bigint("target_message_id", { mode: "number" }),
    senderUserId: bigint("sender_user_id", { mode: "number" }),
    senderUsername: text("sender_username"),
    success: boolean("success").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("broadcasts_source_idx").on(t.sourceChatId, t.sourceMessageId)],
);

export const keywordBlacklist = pgTable("keyword_blacklist", {
  id: serial("id").primaryKey(),
  pattern: text("pattern").notNull(),
  type: keywordTypeEnum("type").notNull(),
  action: keywordActionEnum("action").notNull().default("delete"),
  // null = 套用所有群；指定 chatId 只套用某群
  chatId: bigint("chat_id", { mode: "number" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    chatId: bigint("chat_id", { mode: "number" }),
    userId: bigint("user_id", { mode: "number" }),
    payload: jsonb("payload"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("logs_type_idx").on(t.type),
    index("logs_created_at_idx").on(t.createdAt),
  ],
);

// =================== Types ===================

export type ScheduledPostContent = {
  text?: string;
  parseMode?: "HTML" | "MarkdownV2";
  disableWebPagePreview?: boolean;
  media?: Array<{
    type: "photo" | "video" | "document" | "animation";
    url: string;
    caption?: string;
  }>;
  buttons?: TgButtonRow[];
};

/** Telegram inline button — 支援 URL 與 Copy Text 兩種類型 */
export type TgButton =
  | { text: string; url: string }
  | { text: string; copyText: string };

export type TgButtonRow = TgButton[];

export type PostResult = {
  chatId: number;
  messageId?: number;
  error?: string;
};

export type Admin = typeof admins.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type PendingVerification = typeof pendingVerifications.$inferSelect;
export type Warning = typeof warnings.$inferSelect;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type Broadcast = typeof broadcasts.$inferSelect;
export type KeywordRow = typeof keywordBlacklist.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type ButtonTemplate = typeof buttonTemplates.$inferSelect;
export type StagingMessage = typeof stagingMessages.$inferSelect;
