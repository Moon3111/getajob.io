export type UploadPipelinePhase =
  | "parsing"
  | "analyzing"
  | "scraping"
  | "matching";

export type UploadStepStatus = "pending" | "active" | "complete" | "error";

export interface UploadPipelineStep {
  id: UploadPipelinePhase;
  label: string;
}

export const UPLOAD_PIPELINE_STEPS: UploadPipelineStep[] = [
  {
    id: "parsing",
    label: "Extracting text from your resume…",
  },
  {
    id: "analyzing",
    label: "Building your profile with NVIDIA AI…",
  },
  {
    id: "scraping",
    label: "Scraping Hong Kong job boards for your keywords…",
  },
  {
    id: "matching",
    label: "Matching jobs to your profile (vector search)…",
  },
];

export function getStepStatus(
  stepId: UploadPipelinePhase,
  activePhase: UploadPipelinePhase | null,
  completedPhases: Set<UploadPipelinePhase>,
  errorPhase: UploadPipelinePhase | null
): UploadStepStatus {
  if (errorPhase === stepId) return "error";
  if (completedPhases.has(stepId)) return "complete";
  if (activePhase === stepId) return "active";
  return "pending";
}
