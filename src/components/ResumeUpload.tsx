"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_RESUME_FILE_BYTES } from "@/lib/upload-limits";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".doc"];

function isAcceptedFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export function ResumeUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState(false);

  const handleFile = useCallback((incoming: File) => {
    setError(null);
    setAuthHint(false);
    if (!isAcceptedFile(incoming)) {
      setError("Please upload a PDF, DOCX, or DOC file.");
      return;
    }
    if (incoming.size > MAX_RESUME_FILE_BYTES) {
      setError("File must be under 2 MB (Vercel timeout-safe limit).");
      return;
    }
    setFile(incoming);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const onUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setAuthHint(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to parse resume");
      }

      if (!data.saved) {
        setAuthHint(true);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="upload" className="container mx-auto max-w-2xl px-4 pb-24">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold">Upload your resume</h2>
        <p className="mt-2 text-muted-foreground">
          PDF, DOCX, or DOC up to 2 MB
        </p>
      </div>

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

      {error && (
        <p className="mt-4 text-center text-sm text-destructive">{error}</p>
      )}

      {authHint && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Parsed successfully.{" "}
          <Link href="/auth/signup" className="text-primary hover:underline">
            Sign up
          </Link>{" "}
          to save your profile permanently.
        </p>
      )}

      <div className="mt-6 flex justify-center">
        <Button
          size="lg"
          disabled={!file || loading}
          onClick={onUpload}
          className="min-w-[200px]"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              Parsing with AI…
            </>
          ) : (
            "Parse & find matches"
          )}
        </Button>
      </div>
    </section>
  );
}
