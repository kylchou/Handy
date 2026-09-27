ALTER TABLE "recurring_schedules" ADD COLUMN "tip_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "tip_cents" integer DEFAULT 0 NOT NULL;