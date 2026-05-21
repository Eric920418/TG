CREATE TYPE "public"."admin_role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('main', 'sub');--> statement-breakpoint
CREATE TYPE "public"."keyword_action" AS ENUM('delete', 'warn', 'ban');--> statement-breakpoint
CREATE TYPE "public"."keyword_type" AS ENUM('contains', 'regex', 'link', 'mention');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"chat_id" bigint,
	"user_id" bigint,
	"payload" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"first_name" text,
	"photo_url" text,
	"role" "admin_role" DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_chat_id" bigint NOT NULL,
	"source_message_id" bigint NOT NULL,
	"target_chat_id" bigint NOT NULL,
	"target_message_id" bigint,
	"sender_user_id" bigint,
	"sender_username" text,
	"success" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"title" text NOT NULL,
	"type" "group_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"simplified_policy" text DEFAULT 'strict' NOT NULL,
	"sync_target_chat_id" bigint,
	"raid_threshold" integer DEFAULT 5 NOT NULL,
	"raid_window_sec" integer DEFAULT 30 NOT NULL,
	"warning_limit" integer DEFAULT 3 NOT NULL,
	"mute_duration_sec" integer DEFAULT 86400 NOT NULL,
	"verify_timeout_sec" integer DEFAULT 300 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_blacklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"pattern" text NOT NULL,
	"type" "keyword_type" NOT NULL,
	"action" "keyword_action" DEFAULT 'delete' NOT NULL,
	"chat_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"question_id" integer NOT NULL,
	"message_id" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"target_chat_ids" jsonb NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"status" "post_status" DEFAULT 'pending' NOT NULL,
	"qstash_message_id" text,
	"sent_at" timestamp with time zone,
	"error" text,
	"results" jsonb,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"username" text,
	"reason" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "logs_type_idx" ON "activity_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admins_telegram_id_idx" ON "admins" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "broadcasts_source_idx" ON "broadcasts" USING btree ("source_chat_id","source_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_chat_id_idx" ON "groups" USING btree ("chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_chat_user_idx" ON "pending_verifications" USING btree ("chat_id","user_id");--> statement-breakpoint
CREATE INDEX "pending_expires_idx" ON "pending_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "posts_status_send_at_idx" ON "scheduled_posts" USING btree ("status","send_at");--> statement-breakpoint
CREATE UNIQUE INDEX "warn_chat_user_idx" ON "warnings" USING btree ("chat_id","user_id");