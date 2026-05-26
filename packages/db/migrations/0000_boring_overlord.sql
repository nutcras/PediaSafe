CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MODERATE', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'assessor');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"hn" text NOT NULL,
	"patient_name" text NOT NULL,
	"dob" text NOT NULL,
	"assessment_date" text NOT NULL,
	"assessor_name" text NOT NULL,
	"assessor_id" uuid,
	"caregiver_phone" text NOT NULL,
	"clinical_severity" integer NOT NULL,
	"host_factors" integer NOT NULL,
	"caregiver_competency" integer NOT NULL,
	"environment" integer NOT NULL,
	"teaching_completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_score" integer NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'assessor' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_assessor_id_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;