CREATE TABLE "recurring_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"frequency" text NOT NULL,
	"service_category_id" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"urgency" text DEFAULT 'NORMAL' NOT NULL,
	"special_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_worker_id" uuid,
	"next_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_service_category_id_service_categories_id_fk" FOREIGN KEY ("service_category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_preferred_worker_id_users_id_fk" FOREIGN KEY ("preferred_worker_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_schedules_customer_idx" ON "recurring_schedules" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "recurring_schedules_next_idx" ON "recurring_schedules" USING btree ("active","next_date");--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_schedule_id_recurring_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."recurring_schedules"("id") ON DELETE set null ON UPDATE no action;