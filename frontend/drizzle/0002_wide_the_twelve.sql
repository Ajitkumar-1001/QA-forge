CREATE TYPE "public"."evidence_type" AS ENUM('CONSOLE', 'NETWORK', 'DOM', 'CODE', 'HTTP');--> statement-breakpoint
CREATE TYPE "public"."hypothesis_evidence_role" AS ENUM('SUPPORTING', 'CONTRADICTING');--> statement-breakpoint
CREATE TYPE "public"."hypothesis_status" AS ENUM('PROPOSED', 'VALIDATING', 'SUPPORTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."report_result" AS ENUM('PASS', 'FAIL', 'INCONCLUSIVE');--> statement-breakpoint
CREATE TYPE "public"."test_run_error_reason" AS ENUM('LIMIT_EXCEEDED', 'APP_UNREACHABLE', 'OBJECTIVE_NOT_PLANNABLE', 'REPO_ACCESS_DENIED', 'LLM_PROVIDER_ERROR');--> statement-breakpoint
CREATE TYPE "public"."test_run_status" AS ENUM('PLANNING', 'RUNNING', 'INVESTIGATING', 'PASSED', 'FAILED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."test_step_status" AS ENUM('PENDING', 'RUNNING', 'PASSED', 'FAILED');--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"step_id" text,
	"type" "evidence_type" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypothesis" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"description" text NOT NULL,
	"confidence" real NOT NULL,
	"status" "hypothesis_status" NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypothesis_evidence" (
	"hypothesis_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"role" "hypothesis_evidence_role" NOT NULL,
	CONSTRAINT "hypothesis_evidence_hypothesis_id_evidence_id_pk" PRIMARY KEY("hypothesis_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"application_url" text NOT NULL,
	"repository" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"winning_hypothesis_id" text,
	"result" "report_result" NOT NULL,
	"confidence" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "report_hypothesis" (
	"report_id" text NOT NULL,
	"hypothesis_id" text NOT NULL,
	CONSTRAINT "report_hypothesis_report_id_hypothesis_id_pk" PRIMARY KEY("report_id","hypothesis_id")
);
--> statement-breakpoint
CREATE TABLE "test_run" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "test_run_status" DEFAULT 'PLANNING' NOT NULL,
	"error_reason" "test_run_error_reason",
	"model_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "test_run_scenarioId_idempotencyKey_unique" UNIQUE("scenario_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "test_scenario" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"objective" text NOT NULL,
	"credentials_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_step" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"position" integer NOT NULL,
	"action" text NOT NULL,
	"expected_outcome" text NOT NULL,
	"success_criteria" jsonb NOT NULL,
	"failure_criteria" jsonb NOT NULL,
	"observed" text,
	"status" "test_step_status" NOT NULL,
	CONSTRAINT "test_step_runId_position_unique" UNIQUE("run_id","position")
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_run_id_test_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_step_id_test_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."test_step"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypothesis" ADD CONSTRAINT "hypothesis_run_id_test_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypothesis_evidence" ADD CONSTRAINT "hypothesis_evidence_hypothesis_id_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypothesis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypothesis_evidence" ADD CONSTRAINT "hypothesis_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_run_id_test_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_winning_hypothesis_id_hypothesis_id_fk" FOREIGN KEY ("winning_hypothesis_id") REFERENCES "public"."hypothesis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_hypothesis" ADD CONSTRAINT "report_hypothesis_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_hypothesis" ADD CONSTRAINT "report_hypothesis_hypothesis_id_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypothesis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run" ADD CONSTRAINT "test_run_scenario_id_test_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."test_scenario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_scenario" ADD CONSTRAINT "test_scenario_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_step" ADD CONSTRAINT "test_step_run_id_test_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_runId_idx" ON "evidence" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "hypothesis_runId_idx" ON "hypothesis" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "project_userId_idx" ON "project" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "test_scenario_projectId_idx" ON "test_scenario" USING btree ("project_id");