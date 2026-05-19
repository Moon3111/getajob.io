"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, MapPin, RefreshCw, Search, Sparkles } from "lucide-react";
import { getJobsByMatchStatus } from "@/app/actions/match-jobs";
import { scrapeAndMatchWithKeywords } from "@/app/actions/scrape-match";
import { seedHongKongJobs } from "@/app/actions/seed-jobs";
import { saveManualKeywords } from "@/app/actions/save-manual-keywords";
import { Input } from "@/components/ui/input";
import { JobCard } from "@/components/JobCard";
import { UploadProgressChecklist } from "@/components/UploadProgressChecklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaginatedJobFeed } from "@/components/PaginatedJobFeed";
import { ManualKeywordsInput } from "@/components/ManualKeywordsInput";
import { DEFAULT_REGION } from "@/lib/matching-config";
import { careerLevelLabel } from "@/lib/jobs/seniority";
import type { MatchedJob, ParsedResume } from "@/lib/types";
import type { UploadPipelinePhase } from "@/lib/upload-pipeline";
import { cn } from "@/lib/utils";

type DashboardTab = "matches" | "saved" | "applied";

interface DashboardClientProps {
  initialProfile: ParsedResume | null;
  isAuthenticated: boolean;
  profileError?: string;
  initialKeywords?: string | null;
  initialManualKeywords?: string[];
  scrapeNotice?: string;
  fromUpload?: boolean;
  autoScrape?: boolean;
  showMatchingPipeline?: boolean;
}

export function DashboardClient({
  initialProfile,
  isAuthenticated,
  profileError,
  initialKeywords = null,
  initialManualKeywords = [],
  scrapeNotice,
  fromUpload = false,
  autoScrape = false,
  showMatchingPipeline = false,
}: DashboardClientProps) {
  const [profile] = useState<ParsedResume | null>(initialProfile);
  const [tab, setTab] = useState<DashboardTab>("matches");
  const [matchFeedTotal, setMatchFeedTotal] = useState(0);
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

  const [matchingActive, setMatchingActive] = useState(
    showMatchingPipeline || autoScrape
  );
  const [matchingComplete, setMatchingComplete] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const [autoScrapeStarted, setAutoScrapeStarted] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState<UploadPipelinePhase | null>(
    autoScrape ? "scraping" : null
  );

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

  const refreshMatchFeed = useCallback(() => {
    window.dispatchEvent(new CustomEvent("job-feed-refresh"));
    setMatchingComplete(true);
    setMatchingActive(false);
  }, []);

  const loadTabData = useCallback(() => {
    if (tab === "matches") {
      refreshMatchFeed();
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
  }, [tab, refreshMatchFeed]);

  useEffect(() => {
    if (profile) {
      loadSavedAndApplied();
    }
  }, [profile, loadSavedAndApplied]);

  useEffect(() => {
    if (!profile || !autoScrape || autoScrapeStarted) return;

    const kw = (initialKeywords ?? searchKeywords).trim();
    if (!kw) return;

    setAutoScrapeStarted(true);
    setScraping(true);
    setMatchingActive(true);
    setPipelinePhase("scraping");
    setScrapeFeedback("Loading government jobs and matching your profile…");

    (async () => {
      try {
        const result = await scrapeAndMatchWithKeywords(kw, { quick: true });
        setPipelinePhase("matching");
        if (!result.ok) {
          setMatchingError(result.error ?? "Scrape failed");
          setError(result.error ?? "Scrape failed");
          setScrapeFeedback(null);
        } else {
          setScrapeFeedback(
            `Added ${result.inserted ?? 0} jobs · ${result.matchCount ?? 0} matches. Use Scrape & match for Indeed/JobsDB.`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Scrape failed";
        setMatchingError(msg);
        setError(
          msg.toLowerCase().includes("fetch")
            ? "Scrape timed out. Click Scrape & match below to retry with full sources."
            : msg
        );
      } finally {
        setScraping(false);
        setMatchingActive(false);
        setMatchingComplete(true);
        window.dispatchEvent(new CustomEvent("job-feed-refresh"));
      }
    })();
  }, [
    profile,
    autoScrape,
    autoScrapeStarted,
    initialKeywords,
    searchKeywords,
  ]);

  useEffect(() => {
    if (!profile || tab === "matches") return;
    loadTabData();
  }, [tab, profile, loadTabData]);

  const handleDismiss = (_jobId: string) => {
    setMatchFeedTotal((n) => Math.max(0, n - 1));
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
        refreshMatchFeed();
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
      const result = await scrapeAndMatchWithKeywords(kw, { quick: false });
      if (!result.ok) {
        setError(result.error ?? "Scrape failed");
        return;
      }
      setScrapeFeedback(
        `Scraped ${result.inserted ?? 0} new jobs · ${result.matchCount ?? 0} matches`
      );
      refreshMatchFeed();
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
      refreshMatchFeed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refine failed");
    } finally {
      setRefining(false);
    }
  };

  const completedPhases = new Set<UploadPipelinePhase>([
    "parsing",
    "analyzing",
  ]);
  if (
    (fromUpload || autoScrape) &&
    (pipelinePhase === "matching" || matchingComplete)
  ) {
    completedPhases.add("scraping");
  }
  if (matchingComplete) {
    completedPhases.add("matching");
  }

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

  const activeJobs = tab === "saved" ? savedJobs : appliedJobs;

  const tabLabels: { id: DashboardTab; label: string; count: number }[] = [
    { id: "matches", label: "Matches", count: matchFeedTotal },
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
          activePhase={
            pipelinePhase ?? (matchingActive ? "matching" : null)
          }
          completedPhases={completedPhases}
          errorPhase={matchingError ? "matching" : null}
          errorMessage={matchingError}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {careerLevelLabel(profile.career_level)}
        </Badge>
        <Badge variant="outline">
          {profile.years_experience} yrs · targeting{" "}
          {careerLevelLabel(profile.target_seniority)}
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

      {tab !== "matches" &&
      activeJobs.length === 0 &&
      !error &&
      !matchingActive ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          {tab === "saved" ? (
            <p>Save jobs from Matches with the thumbs-up button.</p>
          ) : (
            <p>Mark saved jobs as applied to track your applications.</p>
          )}
        </div>
      ) : (
        !matchingActive && (
          <>
            {/* Manual Keywords Input - only show on matches tab */}
            {tab === "matches" && (
              <div className="mt-6">
                <ManualKeywordsInput
                  initialKeywords={initialManualKeywords}
                  onSave={async (keywords: string[]) => {
                    const result = await saveManualKeywords(keywords);
                    if (!result.ok) {
                      throw new Error(result.error || "Failed to save keywords");
                    }
                    refreshMatchFeed();
                  }}
                />
              </div>
            )}

            {/* Jobs Display */}
            {tab === "matches" ? (
              <PaginatedJobFeed
                initialPage={1}
                onJobDismiss={handleDismiss}
                onJobSave={() => loadSavedAndApplied()}
                onJobApply={() => loadSavedAndApplied()}
                onResultsChange={setMatchFeedTotal}
              />
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {activeJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    mode={tab}
                    onDismiss={undefined}
                    onStatusChange={() => loadSavedAndApplied()}
                  />
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
