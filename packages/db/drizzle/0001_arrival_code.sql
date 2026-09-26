ALTER TABLE "jobs" ADD COLUMN "arrival_code" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "arrival_code_attempts" integer DEFAULT 0 NOT NULL;