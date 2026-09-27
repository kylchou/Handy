CREATE TABLE "job_message_audio" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_messages" ADD COLUMN "voice_seconds" integer;--> statement-breakpoint
ALTER TABLE "job_message_audio" ADD CONSTRAINT "job_message_audio_message_id_job_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."job_messages"("id") ON DELETE cascade ON UPDATE no action;