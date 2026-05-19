"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, MapPin, RefreshCw, Search, Sparkles } from "lucide-react";
import {
  getJobsByMatchStatus,
  matchJobsForProfile,
} from "@/app/actions/match-jobs";
import { scrapeAndMatchWithKeywords } from "@/app/actions/scrape-match";
import { seedHongKongJobs } from "@/app/actions/seed-jobs";
import { Input } from "@/components/ui/input";
import { JobCard } from "@/components/JobCard";
import { UploadProgressChecklist } from "@/components/UploadProgressChecklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_REGION } from "@/lib/matching-config";
import type { MatchedJob, ParsedResume } from "@/lib/types";
import type { UploadPipelinePhase } from "@/lib/upload-pipeline";
import { cn } from "@/lib/utils";

type DashboardTab = "matches" | "saved" | "applied";

interface DashboardClientProps {
  initialProfile: ParsedResume | null;
  isAuthenticated: boolean;
  profileError?: string;
  initialKeywords?: string | null;
  scrapeNotice?: string;
  fromUpload?: boolean;
  showMatchingPipeline?: boolean;
}

export function DashboardClient({
  initialProfile,
  isAuthenticated,
  profileError,
  initialKeywords = null,
  scrapeNotice,
  fromUpload = false,
  showMatchingPipeline = false,
}: DashboardClientProps) {
  const [profile] = useState<ParsedResume | null>(initialProfile);
  const [tab, setTab] = useState<DashboardTab>("matches");
  const [jobs, setJobs] = useState<MatchedJob[]>([]);
  const [savedJobs, setSavedJobs] = useState<MatchedJob[]>([]);
  const [appliedJobs, setAppliedJobs] = useState<MatchedJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [refining, setRefining] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [searchKeywords, setSearchKeywords] = useState(
    initialKeywords ?? initialProfile?.ideal_role ?? ""
  );
  const [scraping, setScraping] = useState(false);
  const [scrapeFeedback, setScrapeFeedback] = useState<string | null>(
    scrapeNotice ?? null
  );

  const [matchingActive, setMatchingActive] = useState(showMatchingPipeline);
  const [matchingComplete, setMatchingComplete] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);

  const loadSavedAndApplied = useCallback(() => {
    startTransition(async () => {
      const [saved, applied] = await Promise.all([
        getJobsByMatchStatus("saved"),
        getJobsByMatchStatus("applied"),
      ]);
      if (!saved.error) setSavedJobs(saved.jobs);
      if (!applied.error) setAppliedJobs(applied.jobs);
    });
  }, []);

  const loadMatches = useCallback(() => {
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
      loadSavedAndApplied();
    });
  }, [loadSavedAndApplied]);

  const loadTabData = useCallback(() => {
    if (tab === "matches") {
      loadMatches();
      return;
    }
    startTransition(async () => {
      const status = tab === "saved" ? "saved" : "applied";
      const { jobs: listed, error: listError } =
        await getJobsByMatchStatus(status);
      if (listError) {
        setError(listError);
        return;
      }
      if (tab === "saved") setSavedJobs(listed);
      else setAppliedJobs(listed);
      setError(null);
    });
  }, [tab, loadMatches]);

  useEffect(() => {
    if (profile) {
      loadMatches();
    }
  }, [profile, loadMatches]);

  useEffect(() => {
    if (!profile || tab === "matches") return;
    loadTabData();
  }, [tab, profile, loadTabData]);

  const handleDismiss = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const handleSeedJobs = async () => {
    setSeeding(true);
    setSeedMessage(null);
    setError(null);
    try {
      const result = await seedHongKongJobs();
      if (result.errors?.length) {
        setError(result.errors.join("; "));
      } else {
        setSeedMessage(
          result.message ??
            `Inserted ${result.inserted}, skipped ${result.duplicates} duplicates.`
        );
        loadMatches();
        setTab("matches");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const runScrapeAndMatch = async () => {
    const kw = searchKeywords.trim();
    if (!kw) {
      setError("Enter keywords to scrape new jobs.");
      return;
    }
    setScraping(true);
    setError(null);
    setScrapeFeedback(null);
    try {
      const result = await scrapeAndMatchWithKeywords(kw);
      if (!result.ok) {
        setError(result.error ?? "Scrape failed");
        return;
      }
      setScrapeFeedback(
        `Scraped ${result.inserted ?? 0} new jobs · ${result.matchCount ?? 0} matches`
      );
      loadMatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      setScraping(false);
    }
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
    matchingComplete
      ? ["parsing", "analyzing", "scraping", "matching"]
      : fromUpload
        ? ["parsing", "analyzing", "scraping"]
        : ["parsing", "analyzing"]
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

  const activeJobs =
    tab === "matches" ? jobs : tab === "saved" ? savedJobs : appliedJobs;

  const tabLabels: { id: DashboardTab; label: string; count: number }[] = [
    { id: "matches", label: "Matches", count: jobs.length },
    { id: "saved", label: "Saved", count: savedJobs.length },
    { id: "applied", label: "Applied", count: appliedJobs.length },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your job matches</h1>
          <p className="mt-1 flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {DEFAULT_REGION} ·{" "}
            <span className="font-medium text-foreground">
              {profile.ideal_role}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button variant="outline" disabled={isPending} onClick={loadTabData}>
            {isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label
            htmlFor="dash-keywords"
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Search className="h-4 w-4" />
            Job search keywords
          </label>
          <Input
            id="dash-keywords"
            value={searchKeywords}
            onChange={(e) => setSearchKeywords(e.target.value)}
            placeholder="e.g. software engineer, banking, UX"
            disabled={scraping}
          />
        </div>
        <Button
          disabled={scraping || !searchKeywords.trim()}
          onClick={runScrapeAndMatch}
        >
          {scraping ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Search />
          )}
          Scrape & match
        </Button>
      </div>

      {scrapeFeedback && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          {scrapeFeedback}
        </div>
      )}

      <div className="flex gap-2 border-b">
        {tabLabels.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {count > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {showPipeline && tab === "matches" && (
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

      {seedMessage && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300">
          {seedMessage}
        </div>
      )}

      {tab === "matches" &&
      !showPipeline &&
      isPending &&
      jobs.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          Finding your best matches…
        </div>
      ) : activeJobs.length === 0 && !error && !matchingActive ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          {tab === "matches" ? (
            <>
              <p>No matching jobs in the database yet.</p>
              <p className="mt-2 text-sm">
                Load sample Hong Kong listings, run the Python scraper
                (Indeed, JobsDB, jobs.gov.hk, agencies), or connect Apify.
              </p>
              {isAuthenticated && (
                <Button
                  className="mt-6"
                  disabled={seeding}
                  onClick={handleSeedJobs}
                >
                  {seeding ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    "Load Hong Kong sample jobs"
                  )}
                </Button>
              )}
            </>
          ) : tab === "saved" ? (
            <p>Save jobs from Matches with the thumbs-up button.</p>
          ) : (
            <p>Mark saved jobs as applied to track your applications.</p>
          )}
        </div>
      ) : (
        !matchingActive && (
          <div className="grid gap-6 md:grid-cols-2">
            {activeJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                mode={tab === "matches" ? "feed" : tab}
                onDismiss={tab === "matches" ? handleDismiss : undefined}
                onStatusChange={() => loadSavedAndApplied()}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
