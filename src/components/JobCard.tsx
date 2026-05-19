"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Building2, ThumbsDown, ThumbsUp } from "lucide-react";
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

interface JobCardProps {
  job: MatchedJob;
  onDismiss?: (jobId: string) => void;
}

export function JobCard({ job, onDismiss }: JobCardProps) {
  const [hidden, setHidden] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDismiss = () => {
    setHidden(true);
    startTransition(async () => {
      const { ok, error } = await setMatchStatus(job.id, "dismissed", job.similarity);
      if (!ok) {
        setHidden(false);
        console.error(error);
        return;
      }
      onDismiss?.(job.id);
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const { ok, error } = await setMatchStatus(job.id, "saved", job.similarity);
      if (ok) setSaved(true);
      else console.error(error);
    });
  };

  return (
    <Card
      className={cn(
        "flex flex-col transition-all duration-300",
        hidden && "pointer-events-none scale-95 opacity-0",
        saved && "ring-1 ring-primary/30"
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
          <Badge variant="success">{job.match_percent}% Match</Badge>
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
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending || saved}
            onClick={handleSave}
            aria-label="Save job"
          >
            <ThumbsUp
              className={cn("h-4 w-4", saved && "fill-primary text-primary")}
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
