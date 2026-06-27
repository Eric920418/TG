ALTER TABLE "groups" ADD COLUMN "buttons_per_row" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "album_button_text" text DEFAULT '' NOT NULL;