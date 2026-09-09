CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "approval" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"draft_title" text NOT NULL,
	"draft_body" text NOT NULL,
	"github_issue_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	CONSTRAINT "approval_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_run_id_test_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;