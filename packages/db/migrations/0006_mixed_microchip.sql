CREATE TABLE "relevance_judgments" (
	"interest_id" uuid NOT NULL,
	"paper_id" uuid NOT NULL,
	"relevant" boolean NOT NULL,
	"reason" text NOT NULL,
	"model" text NOT NULL,
	"judged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relevance_judgments_interest_id_paper_id_pk" PRIMARY KEY("interest_id","paper_id")
);
--> statement-breakpoint
ALTER TABLE "relevance_judgments" ADD CONSTRAINT "relevance_judgments_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relevance_judgments" ADD CONSTRAINT "relevance_judgments_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;