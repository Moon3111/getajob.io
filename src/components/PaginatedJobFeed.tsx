"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getHybridMatchedJobs } from "@/app/actions/hybrid-match-jobs";
import { JobCard } from "@/components/JobCard";
import { JobPagination } from "@/components/JobPagination";
import { JobListSkeleton } from "@/components/JobListSkeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { MatchedJob, PaginatedJobsResponse } from "@/lib/types";

const JOBS_PER_PAGE = 10;

interface PaginatedJobFeedProps {
  initialPage?: number;
  onJobDismiss?: (jobId: string) => void;
  onJobSave?: (jobId: string) => void;
  onJobApply?: (jobId: string) => void;
}

export function PaginatedJobFeed({
  initialPage = 1,
  onJobDismiss,
  onJobSave,
  onJobApply,
}: PaginatedJobFeedProps) {
  const [jobs, setJobs] = useState<MatchedJob[]>([]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (page: number) => {
    setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await getHybridMatchedJobs(
      page,
      JOBS_PER_PAGE
    );

    if (fetchError) {
      setError(fetchError);
      setJobs([]);
      setTotalPages(0);
      setTotalResults(0);
      setIsLoading(false);
      return;
    }

    if (!data) {
      setError("No data returned from server");
      setJobs([]);
      setIsLoading(false);
      return;
    }

    setJobs(data.jobs);
    setTotalPages(data.pagination.totalPages);
    setTotalResults(data.pagination.totalResults);
    setCurrentPage(page);
    setIsLoading(false);

    // Scroll to top of feed
    const feedElement = document.getElementById("job-feed-container");
    if (feedElement) {
      feedElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Load initial page
  useEffect(() => {
    loadPage(initialPage);
  }, [initialPage, loadPage]);

  const handlePageChange = (page: number) => {
    loadPage(page);
  };

  const handleDismiss = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    onJobDismiss?.(jobId);
  };

  // Error state
  if (error && jobs.length === 0) {
    return (
      <div id="job-feed-container">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load jobs: {error}
            <button
              onClick={() => loadPage(currentPage)}
              className="ml-4 underline hover:no-underline"
            >
              Retry
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Empty state
  if (!isLoading && jobs.length === 0) {
    return (
      <div id="job-feed-container" className="text-center py-12">
        <p className="text-muted-foreground">
          {totalResults === 0
            ? "No matching jobs found. Try uploading a resume or adjusting your keywords."
            : "No jobs to display on this page."}
        </p>
      </div>
    );
  }

  return (
    <div id="job-feed-container" className="space-y-6">
      {/* Loading state */}
      {isLoading && jobs.length === 0 ? (
        <JobListSkeleton count={JOBS_PER_PAGE} />
      ) : (
        <>
          {/* Job Cards */}
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onDismiss={() => handleDismiss(job.id)}
                onStatusChange={() => {
                  onJobSave?.(job.id);
                  onJobApply?.(job.id);
                }}
              />
            ))}
          </div>

          {/* Error banner if some jobs failed to load but we have some data */}
          {error && jobs.length > 0 && (
            <Alert variant="default" className="bg-yellow-50 border-yellow-200">
              <AlertDescription className="text-yellow-800">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Results info */}
          {totalResults > 0 && (
            <div className="text-center text-sm text-muted-foreground">
              Showing {(currentPage - 1) * JOBS_PER_PAGE + 1}-
              {Math.min(currentPage * JOBS_PER_PAGE, totalResults)} of{" "}
              {totalResults} results
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <JobPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              isLoading={isLoading}
            />
          )}
        </>
      )}
    </div>
  );
}
