import type { TranscriptDocument } from "../types.js";

interface SummaryOptions {
  model: string;
  summaryLanguage: string;
}

interface SummarySection {
  heading: string;
  bullets: string[];
}

interface SummaryMarkdownInput {
  title: string;
  source: {
    url: string;
    videoId: string;
    durationSeconds: number;
    generatedAt: string;
    language: string;
  };
  overview?: string;
  keyPoints?: string[];
  timeline?: SummarySection[];
  notableQuotes?: string[];
  actionItems?: string[];
}

interface SummaryResponseShape {
  title?: unknown;
  overview?: unknown;
  keyPoints?: unknown;
  timeline?: unknown;
  notableQuotes?: unknown;
  actionItems?: unknown;
}

interface SummaryResponseOutputItem {
  type?: string;
  content?: Array<{
    type?: string;
    refusal?: string;
  }>;
}

interface SummaryParseResponse {
  status?: string;
  incomplete_details?: {
    reason?: string | null;
  } | null;
  output?: SummaryResponseOutputItem[];
  output_parsed?: SummaryResponseShape | null;
}

interface SummaryClient {
  responses: {
    parse(input: {
      model: string;
      input: string;
      text: {
        format: {
          type: "json_schema";
          name: string;
          strict: true;
          schema: Record<string, unknown>;
          description: string;
        };
      };
    }): Promise<SummaryParseResponse>;
  };
}

const SUMMARY_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "overview", "keyPoints", "timeline", "notableQuotes", "actionItems"],
  properties: {
    title: { type: "string" },
    overview: { type: "string" },
    keyPoints: {
      type: "array",
      items: { type: "string" },
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "bullets"],
        properties: {
          heading: { type: "string" },
          bullets: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    notableQuotes: {
      type: "array",
      items: { type: "string" },
    },
    actionItems: {
      type: "array",
      items: { type: "string" },
    },
  },
} satisfies Record<string, unknown>;

export function buildSummaryPrompt(
  transcript: TranscriptDocument,
  options: SummaryOptions,
): string {
  return [
    "You summarize transcript JSON into structured Markdown input.",
    `Return only valid JSON.`,
    "Required JSON shape:",
    JSON.stringify(
      {
        title: transcript.source.title,
        overview: "string",
        keyPoints: ["string"],
        timeline: [{ heading: "string", bullets: ["string"] }],
        notableQuotes: ["string"],
        actionItems: ["string"],
      },
      null,
      2,
    ),
    "Rules:",
    "- Use the transcript source title for title.",
    "- Include concise overview, Key Points, Timeline or sections, and Notable Quotes.",
    "- Include Action Items only when supported by the transcript.",
    `- Write the summary in ${options.summaryLanguage}.`,
    "Summary request metadata:",
    JSON.stringify(
      {
        model: options.model,
        summaryLanguage: options.summaryLanguage,
      },
      null,
      2,
    ),
    "Transcript JSON:",
    JSON.stringify(transcript, null, 2),
  ].join("\n");
}

export async function generateSummaryMarkdown(
  client: SummaryClient,
  transcript: TranscriptDocument,
  options: SummaryOptions,
): Promise<string> {
  const response = await client.responses.parse({
    model: options.model,
    input: buildSummaryPrompt(transcript, options),
    text: {
      format: {
        type: "json_schema",
        name: "autonota_summary",
        strict: true,
        description: "Structured Markdown summary content for a transcript artifact.",
        schema: SUMMARY_RESPONSE_SCHEMA,
      },
    },
  });

  const content = parseSummaryResponse(response);

  return formatSummaryMarkdown({
    title: transcript.source.title,
    source: {
      url: transcript.source.url,
      videoId: transcript.source.videoId,
      durationSeconds: transcript.audio.durationSeconds,
      generatedAt: transcript.transcription.generatedAt,
      language: transcript.transcription.language,
    },
    overview: pickString(content.overview) ?? undefined,
    keyPoints: pickStringArray(content.keyPoints),
    timeline: pickSections(content.timeline),
    notableQuotes: pickStringArray(content.notableQuotes),
    actionItems: pickStringArray(content.actionItems),
  });
}

export function formatSummaryMarkdown(input: SummaryMarkdownInput): string {
  const lines = [
    `# ${input.title}`,
    "",
    "## Source",
    `- URL: ${input.source.url}`,
    `- Video ID: ${input.source.videoId}`,
    `- Duration: ${formatDuration(input.source.durationSeconds)}`,
    `- Transcript Language: ${input.source.language}`,
    `- Transcript Generated: ${input.source.generatedAt}`,
  ];

  if (input.overview?.trim()) {
    lines.push("", "## Overview", input.overview.trim());
  }

  if (input.keyPoints && input.keyPoints.length > 0) {
    lines.push("", "## Key Points", ...input.keyPoints.map((item) => `- ${item}`));
  }

  if (input.timeline && input.timeline.length > 0) {
    lines.push("", "## Timeline");

    for (const section of input.timeline) {
      lines.push(`### ${section.heading}`);
      lines.push(...section.bullets.map((item) => `- ${item}`));
      lines.push("");
    }

    if (lines.at(-1) === "") {
      lines.pop();
    }
  }

  if (input.notableQuotes && input.notableQuotes.length > 0) {
    lines.push("", "## Notable Quotes", ...input.notableQuotes.map((item) => `> ${item}`));
  }

  if (input.actionItems && input.actionItems.length > 0) {
    lines.push("", "## Action Items", ...input.actionItems.map((item) => `- ${item}`));
  }

  return `${lines.join("\n").trim()}\n`;
}

function parseSummaryResponse(response: SummaryParseResponse): SummaryResponseShape {
  if (response.status === "incomplete") {
    throw new Error(
      `OpenAI summary response was incomplete: ${response.incomplete_details?.reason ?? "unknown"}.`,
    );
  }

  const refusal = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "refusal" && typeof content.refusal === "string")?.refusal;
  if (refusal) {
    throw new Error(`OpenAI summary request was refused: ${refusal}`);
  }

  if (!response.output_parsed) {
    throw new Error("OpenAI summary response did not include parsed structured output.");
  }

  return response.output_parsed;
}

export function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function pickSections(value: unknown): SummarySection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const heading = pickString((item as { heading?: unknown }).heading);
    const bullets = pickStringArray((item as { bullets?: unknown }).bullets);

    if (!heading || bullets.length === 0) {
      return [];
    }

    return [{ heading, bullets }];
  });
}

function formatDuration(durationSeconds: number): string {
  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
