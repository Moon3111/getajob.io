export type UploadPipelinePhase = "parsing" | "analyzing" | "matching";

export type UploadStepStatus = "pending" | "active" | "complete" | "error";

export interface UploadPipelineStep {
  id: UploadPipelinePhase;
  label: string;
}

export const UPLOAD_PIPELINE_STEPS: UploadPipelineStep[] = [
  {
    id: "parsing",
    label: "Extracting text from file…",
  },
  {
    id: "analyzing",
    label: "Processing profile with NVIDIA AI…",
  },
  {
    id: "matching",
    label: "Evaluating local job market alignment (HNSW Match)…",
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
