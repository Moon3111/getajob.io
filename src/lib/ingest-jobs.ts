import { createServiceClient } from "@/lib/supabase/server";
import { embedPassage, jobToEmbeddingText } from "@/lib/nvidia";
import { inferSeniorityLevel } from "@/lib/jobs/seniority";
import type { IngestResult, ScraperJobInput } from "@/lib/types";

const DEDUP_THRESHOLD = 0.95;

export async function ingestJobListings(
  jobs: ScraperJobInput[]
): Promise<IngestResult> {
  const supabase = createServiceClient();
  const result: IngestResult = { inserted: 0, duplicates: 0, errors: [] };

  for (const job of jobs) {
    try {
      if (!job.title || !job.company || !job.description) {
        result.errors.push(
          `Skipped job missing required fields: ${job.title ?? "unknown"}`
        );
        continue;
      }

      const seniorityLevel = inferSeniorityLevel(job.title, job.description);
      const embedding = await embedPassage(
        jobToEmbeddingText({
          title: job.title,
          company: job.company,
          description: job.description,
        })
      );

      const { data: similar } = await supabase.rpc("find_similar_jobs", {
        query_embedding: embedding,
        match_threshold: DEDUP_THRESHOLD,
        match_count: 1,
      });

      if (similar && similar.length > 0) {
        result.duplicates++;
        continue;
      }

      const jobRow: Record<string, unknown> = {
        source: job.source ?? "scraper",
        title: job.title,
        company: job.company,
        url: job.url ?? "",
        description: job.description,
        seniority_level: seniorityLevel,
      };

      let insertResult = await supabase
        .from("jobs")
        .insert(jobRow)
        .select("id")
        .single();

      if (insertResult.error?.message?.includes("seniority_level")) {
        const { seniority_level: _s, ...withoutLevel } = jobRow;
        insertResult = await supabase
          .from("jobs")
          .insert(withoutLevel)
          .select("id")
          .single();
      }

      const insertedJob = insertResult.data;
      const jobError = insertResult.error;

      if (jobError || !insertedJob) {
        result.errors.push(
          `Insert failed for ${job.title}: ${jobError?.message}`
        );
        continue;
      }

      const { error: embedError } = await supabase
        .from("job_embeddings")
        .insert({
          job_id: insertedJob.id,
          description_vector: embedding,
        });

      if (embedError) {
        result.errors.push(
          `Embedding insert failed for ${job.title}: ${embedError.message}`
        );
        continue;
      }

      result.inserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`${job.title ?? "job"}: ${msg}`);
    }
  }

  return result;
}
