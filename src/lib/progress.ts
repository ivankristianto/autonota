export type DownloadProgressEvent =
  | { type: "metadata" }
  | { type: "downloading"; line: string }
  | { type: "done" };

export type TranscribeProgressEvent =
  | { type: "uploading" }
  | { type: "chunk"; index: number; total: number }
  | { type: "rate-limited"; waitSeconds: number; attempt: number; max: number }
  | { type: "rate-limit-tick"; remainingSeconds: number }
  | { type: "done" };
