CREATE TABLE "caregiver_invites" (
	"code" text PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caregiver_links" (
	"customer_id" uuid NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "caregiver_links_customer_id_caregiver_id_pk" PRIMARY KEY("customer_id","caregiver_id")
);
--> statement-breakpoint
ALTER TABLE "caregiver_invites" ADD CONSTRAINT "caregiver_invites_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregiver_links" ADD CONSTRAINT "caregiver_links_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregiver_links" ADD CONSTRAINT "caregiver_links_caregiver_id_users_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "caregiver_links_caregiver_idx" ON "caregiver_links" USING btree ("caregiver_id");