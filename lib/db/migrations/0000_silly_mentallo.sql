CREATE TYPE "public"."cloud_provider" AS ENUM('aws', 'gcp');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'destroyed');--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "cloud_provider" NOT NULL,
	"label" text DEFAULT 'default' NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"wrapped_dek" "bytea" NOT NULL,
	"kms_key_ref" text NOT NULL,
	"aws_account_id" text,
	"aws_region" text,
	"gcp_project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" "cloud_provider" NOT NULL,
	"region" text NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_message" text,
	"selected_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_estimate" jsonb
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text,
	"codebase" jsonb,
	"analysis" jsonb,
	"recommendations" jsonb,
	"plan" jsonb,
	"plan_id" text,
	"chat_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"architect_mutations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_session_id_sessions_sid_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("sid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_user_provider_label_idx" ON "credentials" USING btree ("user_id","provider","label");--> statement-breakpoint
CREATE INDEX "runs_user_idx" ON "runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "runs_session_idx" ON "runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");