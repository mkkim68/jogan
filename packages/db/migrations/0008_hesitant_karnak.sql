CREATE TABLE "summary_rejections" (
	"paper_id" uuid PRIMARY KEY NOT NULL,
	"field" text NOT NULL,
	"sentence" text NOT NULL,
	"problems" jsonb NOT NULL,
	"source_kind" text NOT NULL,
	"model" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"rejected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "summary_rejections" ADD CONSTRAINT "summary_rejections_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;