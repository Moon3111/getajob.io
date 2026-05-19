"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadProgressChecklist } from "@/components/UploadProgressChecklist";
import { cn } from "@/lib/utils";
import type { UploadPipelinePhase } from "@/lib/upload-pipeline";
import { MAX_RESUME_FILE_BYTES } from "@/lib/upload-limits";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".doc"];

function isAcceptedFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTENSIONS.includes(ext);
}

interface ParseResumeErrorBody {
  error?: string;
  code?: string;
}

export function ResumeUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [authHint, setAuthHint] = useState(false);

  const [activePhase, setActivePhase] = useState<UploadPipelinePhase | null>(
    null
  );
  const [completedPhases, setCompletedPhases] = useState<
    Set<UploadPipelinePhase>
  >(new Set());
  const [errorPhase, setErrorPhase] = useState<UploadPipelinePhase | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetPipeline = useCallback(() => {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    setActivePhase(null);
    setCompletedPhases(new Set());
    setErrorPhase(null);
    setErrorMessage(null);
  }, []);

  const handleFile = useCallback(
    (incoming: File) => {
      resetPipeline();
      setAuthHint(false);
      if (!isAcceptedFile(incoming)) {
        setErrorMessage("Please upload a PDF, DOCX, or DOC file.");
        return;
      }
      if (incoming.size > MAX_RESUME_FILE_BYTES) {
        setErrorMessage("File must be under 2 MB (Vercel timeout-safe limit).");
        return;
      }
      setFile(incoming);
      setErrorMessage(null);
    },
    [resetPipeline]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const failAtPhase = (phase: UploadPipelinePhase, message: string) => {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    setActivePhase(null);
    setErrorPhase(phase);
    setErrorMessage(message);
    setProcessing(false);
  };

  const onUpload = async () => {
    if (!file) return;

    setProcessing(true);
    resetPipeline();
    setAuthHint(false);
    setActivePhase("parsing");

    phaseTimerRef.current = setTimeout(() => {
      setCompletedPhases((prev) => new Set(prev).add("parsing"));
      setActivePhase("analyzing");
    }, 900);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as ParseResumeErrorBody & {
        saved?: boolean;
      };

      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);

      if (!res.ok) {
        const phase: UploadPipelinePhase =
          res.status === 502 ? "analyzing" : "parsing";
        const msg =
          data.code === "invalid_json"
            ? `${data.error ?? "AI parsing failed"} (invalid_json)`
            : (data.error ?? "Failed to parse resume");
        failAtPhase(phase, msg);
        return;
      }

      setCompletedPhases(new Set(["parsing", "analyzing"]));
      setActivePhase(null);

      if (!data.saved) {
        setAuthHint(true);
      }

      router.push("/dashboard?fromUpload=1");
      router.refresh();
    } catch (err) {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      failAtPhase(
        activePhase ?? "parsing",
        err instanceof Error ? err.message : "Upload failed"
      );
    }
  };

  const showChecklist = processing || errorPhase !== null;

  return (
    <section id="upload" className="container mx-auto max-w-2xl px-4 pb-24">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold">Upload your resume</h2>
        <p className="mt-2 text-muted-foreground">
          PDF, DOCX, or DOC up to 2 MB
        </p>
      </div>

      {!showChecklist ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            file && "border-solid border-primary/30"
          )}
        >
          <input
            type="file"
            accept=".pdf,.docx,.doc"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={processing}
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) handleFile(selected);
            }}
          />

          {file ? (
            <div className="flex flex-col items-center gap-3">
              <FileText className="h-12 w-12 text-primary" />
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  resetPipeline();
                }}
              >
                <X className="mr-1 h-4 w-4" />
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <Upload className="h-12 w-12 text-muted-foreground" />
              <p className="font-medium">Drop your resume here</p>
              <p className="text-sm text-muted-foreground">
                or click to browse files
              </p>
            </div>
          )}
        </div>
      ) : (
        <UploadProgressChecklist
          activePhase={activePhase}
          completedPhases={completedPhases}
          errorPhase={errorPhase}
          errorMessage={errorMessage}
          className="mb-6"
        />
      )}

      {authHint && !processing && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Parsed successfully.{" "}
          <Link href="/auth/signup" className="text-primary hover:underline">
            Sign up
          </Link>{" "}
          to save your profile permanently.
        </p>
      )}

      <div className="mt-6 flex justify-center gap-3">
        {errorPhase && (
          <Button
            variant="outline"
            onClick={() => {
              resetPipeline();
              setProcessing(false);
            }}
          >
            Try again
          </Button>
        )}
        <Button
          size="lg"
          disabled={!file || processing}
          onClick={onUpload}
          className="min-w-[200px]"
        >
          {processing ? "Processing…" : "Parse & find matches"}
        </Button>
      </div>
    </section>
  );
}
