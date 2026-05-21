CREATE TABLE "button_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"buttons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "default_buttons" jsonb DEFAULT '[]'::jsonb NOT NULL;