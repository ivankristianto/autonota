export interface TranscriptSource {
  type: "youtube";
  url: string;
  videoId: string;
  title: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptAudio {
  durationSeconds: number;
  chunkCount: number;
}

export interface TranscriptMetadata {
  model: string;
  language: string;
  generatedAt: string;
}

export interface TranscriptDocument {
  source: TranscriptSource;
  transcription: TranscriptMetadata;
  audio: TranscriptAudio;
  segments: TranscriptSegment[];
  fullText: string;
}
