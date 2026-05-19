"use client";

import { useState, useTransition } from "react";
import {
  ExternalLink,
  Building2,
  ThumbsDown,
  ThumbsUp,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setMatchStatus } from "@/app/actions/match-feedback";
import { cn } from "@/lib/utils";
import type { MatchedJob, AIAnalysis } from "@/lib/types";

export type JobCardMode = "feed" | "saved" | "applied";

interface JobCardProps {
  job: MatchedJob;
  mode?: JobCardMode;
  onDismiss?: (jobId: string) => void;
  onStatusChange?: (jobId: string) => void;
}

/**
 * Get color styling for relevance rating badge
 */
function getRelevanceColor(
  rating: AIAnalysis["relevance_rating"]
): {
  badge: string;
  bg: string;
} {
  switch (rating) {
    case "EXCELLENT":
      return {
        badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
        bg: "bg-emerald-50",
      };
    case "GOOD":
      return {
        badge: "bg-blue-100 text-blue-800 border-blue-300",
        bg: "bg-blue-50",
      };
    case "FAIR":
      return {
        badge: "bg-amber-100 text-amber-800 border-amber-300",
        bg: "bg-amber-50",
      };
    case "MISMATCH":
      return {
        badge: "bg-gray-100 text-gray-800 border-gray-300",
        bg: "bg-gray-50",
      };
    default:
      return {
        badge: "bg-gray-100 text-gray-800 border-gray-300",
        bg: "bg-gray-50",
      };
  }
}

export function JobCard({
  job,
  mode = "feed",
  onDismiss,
  onStatusChange,
}: JobCardProps) {
  const [hidden, setHidden] = useState(false);
  const [saved, setSaved] = useState(mode === "saved" || mode === "applied");
  const [applied, setApplied] = useState(mode === "applied");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDismiss = () => {
    setActionError(null);
    setHidden(true);
    startTransition(async () => {
      const { ok, error } = await setMatchStatus(
        job.id,
        "dismissed",
        job.similarity
      );
      if (!ok) {
        setHidden(false);
        setActionError(error ?? "Could not dismiss job");
        return;
      }
      onDismiss?.(job.id);
      onStatusChange?.(job.id);
    });
  };

  const handleSave = () => {
    setActionError(null);
    startTransition(async () => {
      const { ok, error } = await setMatchStatus(job.id, "saved", job.similarity);
      if (ok) {
        setSaved(true);
        onStatusChange?.(job.id);
      } else {
        setActionError(error ?? "Could not save job");
      }
    });
  };

  const handleApplied = () => {
    setActionError(null);
    startTransition(async () => {
      const { ok, error } = await setMatchStatus(
        job.id,
        "applied",
        job.similarity
      );
      if (ok) {
        setApplied(true);
        setSaved(true);
        onStatusChange?.(job.id);
      } else {
        setActionError(error ?? "Could not update status");
      }
    });
  };

  const analysis = job.ai_analysis;
  const relevanceColors = analysis ? getRelevanceColor(analysis.relevance_rating) : null;

  return (
    <Card
      className={cn(
        "flex flex-col transition-all duration-300",
        hidden && "pointer-events-none scale-95 opacity-0",
        saved && "ring-1 ring-primary/30",
        applied && "ring-1 ring-emerald-500/40"
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-lg">{job.title}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              {job.company}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-col items-end gap-1">
              {job.match_percent > 0 && (
                <Badge variant="success">{job.match_percent}% Vector</Badge>
              )}
              {analysis && relevanceColors && (
                <Badge className={cn("border", relevanceColors.badge)}>
                  {analysis.fit_percentage}% AI Fit
                </Badge>
              )}
              {applied && <Badge variant="secondary">Applied</Badge>}
            </div>

            {/* Relevance Rating */}
            {analysis && (
              <Badge
                variant="outline"
                className={cn(
                  "font-semibold border-2",
                  analysis.relevance_rating === "EXCELLENT"
                    ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                    : analysis.relevance_rating === "GOOD"
                      ? "border-blue-400 text-blue-700 bg-blue-50"
                      : analysis.relevance_rating === "FAIR"
                        ? "border-amber-400 text-amber-700 bg-amber-50"
                        : "border-gray-400 text-gray-700 bg-gray-50"
                )}
              >
                {analysis.relevance_rating}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      {actionError && (
        <CardContent className="py-2">
          <p className="text-sm text-destructive">{actionError}</p>
        </CardContent>
      )}

      {job.description && (
        <CardContent>
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {job.description}
          </p>
        </CardContent>
      )}

      {/* AI Analysis Insights */}
      {analysis && relevanceColors && (
        <CardContent className="space-y-3 border-t pt-3">
          {/* Analysis Summary */}
          <div className={cn("rounded-lg p-3 space-y-1", relevanceColors.bg)}>
            <div className="flex gap-2 items-start">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  AI Insight
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                  {analysis.analysis_summary}
                </p>
              </div>
            </div>
          </div>

          {/* Missing Keywords (Skills Gap) */}
          {analysis.missing_keywords.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Skills Gap:
              </p>
              <div className="flex flex-wrap gap-1">
                {analysis.missing_keywords.map((keyword) => (
                  <Badge
                    key={keyword}
                    variant="outline"
                    className="text-xs bg-orange-50 border-orange-200 text-orange-700"
                  >
                    Missing: {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}

      <CardFooter className="mt-auto flex-wrap gap-2">
        <Badge variant="secondary" className="text-xs">
          {job.source}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          {mode === "feed" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                disabled={isPending || saved}
                onClick={handleSave}
                aria-label="Save job"
              >
                <ThumbsUp
                  className={cn(
                    "h-4 w-4",
                    saved && "fill-primary text-primary"
                  )}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={isPending}
                onClick={handleDismiss}
                aria-label="Dismiss job"
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
            </>
          )}
          {mode === "saved" && !applied && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleApplied}
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark applied
            </Button>
          )}
          {job.url && (
            <Button variant="outline" size="sm" asChild>
              <a href={job.url} target="_blank" rel="noopener noreferrer">
                View
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
