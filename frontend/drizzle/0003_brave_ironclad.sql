CREATE TABLE "credential" (
	"id" text PRIMARY KEY NOT NULL,
	"test_scenario_id" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credential_test_scenario_id_unique" UNIQUE("test_scenario_id")
);
--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_test_scenario_id_test_scenario_id_fk" FOREIGN KEY ("test_scenario_id") REFERENCES "public"."test_scenario"("id") ON DELETE cascade ON UPDATE no action;