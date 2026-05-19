"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { matchJobsForProfile } from "@/app/actions/match-jobs";
import { JobCard } from "@/components/JobCard";
import { UploadProgressChecklist } from "@/components/UploadProgressChecklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MatchedJob, ParsedResume } from "@/lib/types";
import type { UploadPipelinePhase } from "@/lib/upload-pipeline";

interface DashboardClientProps {
  initialProfile: ParsedResume | null;
  isAuthenticated: boolean;
  profileError?: string;
  fromUpload?: boolean;
  showMatchingPipeline?: boolean;
}

export function DashboardClient({
  initialProfile,
  isAuthenticated,
  profileError,
  fromUpload = false,
  showMatchingPipeline = false,
}: DashboardClientProps) {
  const [profile] = useState<ParsedResume | null>(initialProfile);
  const [jobs, setJobs] = useState<MatchedJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [refining, setRefining] = useState(false);

  const [matchingActive, setMatchingActive] = useState(showMatchingPipeline);
  const [matchingComplete, setMatchingComplete] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);

  const loadMatches = () => {
    setMatchingActive(true);
    setMatchingError(null);

    startTransition(async () => {
      const { jobs: matched, error: matchError } = await matchJobsForProfile();
      if (matchError) {
        setMatchingError(matchError);
        setError(matchError);
        setMatchingActive(false);
        return;
      }
      setJobs(matched);
      setMatchingComplete(true);
      setMatchingActive(false);
      setError(null);
    });
  };

  useEffect(() => {
    if (profile) loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const refineProfile = async () => {
    setRefining(true);
    setError(null);
    try {
      const res = await fetch("/api/refine-profile", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refine failed");
      loadMatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refine failed");
    } finally {
      setRefining(false);
    }
  };

  const completedPhases = new Set<UploadPipelinePhase>(
    matchingComplete ? ["parsing", "analyzing", "matching"] : ["parsing", "analyzing"]
  );

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-bold">Your job matches</h1>

        {!isAuthenticated ? (
          <p className="mt-4 text-muted-foreground">
            {fromUpload ? (
              <>
                Your resume was parsed, but it was not saved because you are not
                signed in. Create an account, then upload again while logged in.
              </>
            ) : (
              <>Sign in first, then upload a resume to see AI-matched roles.</>
            )}
          </p>
        ) : (
          <p className="mt-4 text-muted-foreground">
            You are signed in, but we do not have a saved profile yet. Upload
            your resume from the home page to generate matches.
          </p>
        )}

        {profileError && (
          <p className="mt-3 text-sm text-destructive">{profileError}</p>
        )}

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {!isAuthenticated ? (
            <>
              <Button asChild>
                <Link href="/auth/signup">Sign up</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/auth/login">Sign in</Link>
              </Button>
            </>
          ) : null}
          <Button variant={isAuthenticated ? "default" : "outline"} asChild>
            <Link href="/#upload">Upload resume</Link>
          </Button>
        </div>
      </div>
    );
  }

  const showPipeline =
    showMatchingPipeline && (matchingActive || matchingError || matchingComplete);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your job matches</h1>
          <p className="mt-1 text-muted-foreground">
            Targeting:{" "}
            <span className="font-medium text-foreground">
              {profile.ideal_role}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={refining}
            onClick={refineProfile}
          >
            {refining ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            Refine from saves
          </Button>
          <Button variant="outline" disabled={isPending} onClick={loadMatches}>
            {isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {showPipeline && (
        <UploadProgressChecklist
          activePhase={matchingActive ? "matching" : null}
          completedPhases={completedPhases}
          errorPhase={matchingError ? "matching" : null}
          errorMessage={matchingError}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {profile.years_experience}+ years experience
        </Badge>
        {profile.technical_skills.slice(0, 6).map((skill) => (
          <Badge key={skill} variant="outline">
            {skill}
          </Badge>
        ))}
      </div>

      {error && !showPipeline && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!showPipeline && isPending && jobs.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          Finding your best matches…
        </div>
      ) : jobs.length === 0 && !error && !matchingActive ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <p>No matching jobs yet.</p>
          <p className="mt-2 text-sm">
            Run the Apify cron or ingest sample jobs.
          </p>
        </div>
      ) : (
        !matchingActive && (
          <div className="grid gap-6 md:grid-cols-2">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onDismiss={handleDismiss} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
