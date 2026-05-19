"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  UPLOAD_PIPELINE_STEPS,
  getStepStatus,
  type UploadPipelinePhase,
  type UploadStepStatus,
} from "@/lib/upload-pipeline";

interface UploadProgressChecklistProps {
  activePhase: UploadPipelinePhase | null;
  completedPhases: Set<UploadPipelinePhase>;
  errorPhase?: UploadPipelinePhase | null;
  errorMessage?: string | null;
  className?: string;
}

function StepIcon({ status }: { status: UploadStepStatus }) {
  switch (status) {
    case "complete":
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />;
    case "active":
      return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />;
    case "error":
      return <XCircle className="h-5 w-5 shrink-0 text-destructive" />;
    default:
      return <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />;
  }
}

export function UploadProgressChecklist({
  activePhase,
  completedPhases,
  errorPhase = null,
  errorMessage = null,
  className,
}: UploadProgressChecklistProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-6 shadow-sm",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <ul className="space-y-4">
        {UPLOAD_PIPELINE_STEPS.map((step) => {
          const status = getStepStatus(
            step.id,
            activePhase,
            completedPhases,
            errorPhase
          );
          return (
            <li key={step.id} className="flex items-start gap-3">
              <StepIcon status={status} />
              <span
                className={cn(
                  "text-sm leading-5",
                  status === "active" && "font-medium text-foreground",
                  status === "complete" && "text-muted-foreground",
                  status === "pending" && "text-muted-foreground/70",
                  status === "error" && "font-medium text-destructive"
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
      {errorMessage && (
        <p className="mt-4 border-t pt-4 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
