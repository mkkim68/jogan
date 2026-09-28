CREATE TABLE "paper_candidates" (
	"user_id" text NOT NULL,
	"paper_id" uuid NOT NULL,
	"interest_id" uuid,
	"relevance" real NOT NULL,
	"collected_for" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_candidates_user_id_paper_id_pk" PRIMARY KEY("user_id","paper_id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paper_candidates" ADD CONSTRAINT "paper_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_candidates" ADD CONSTRAINT "paper_candidates_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_candidates" ADD CONSTRAINT "paper_candidates_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_candidates_user_date" ON "paper_candidates" USING btree ("user_id","collected_for");