"use client";

import { useState, useTransition } from "react";
import {
  ExternalLink,
  Building2,
  ThumbsDown,
  ThumbsUp,
  CheckCircle2,
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
import type { MatchedJob } from "@/lib/types";

export type JobCardMode = "feed" | "saved" | "applied";

interface JobCardProps {
  job: MatchedJob;
  mode?: JobCardMode;
  onDismiss?: (jobId: string) => void;
  onStatusChange?: (jobId: string) => void;
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
  const [isPending, startTransition] = useTransition();

  const handleDismiss = () => {
    setHidden(true);
    startTransition(async () => {
      const { ok, error } = await setMatchStatus(
        job.id,
        "dismissed",
        job.similarity
      );
      if (!ok) {
        setHidden(false);
        console.error(error);
        return;
      }
      onDismiss?.(job.id);
      onStatusChange?.(job.id);
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const { ok, error } = await setMatchStatus(job.id, "saved", job.similarity);
      if (ok) {
        setSaved(true);
        onStatusChange?.(job.id);
      } else console.error(error);
    });
  };

  const handleApplied = () => {
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
      } else console.error(error);
    });
  };

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
          <div>
            <CardTitle className="text-lg">{job.title}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              {job.company}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            {job.match_percent > 0 && (
              <Badge variant="success">{job.match_percent}% Match</Badge>
            )}
            {applied && <Badge variant="secondary">Applied</Badge>}
          </div>
        </div>
      </CardHeader>
      {job.description && (
        <CardContent>
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {job.description}
          </p>
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
