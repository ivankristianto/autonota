import { describe, expect, it, vi } from "vitest";

import sampleTranscript from "../fixtures/sample-transcript.json" with { type: "json" };

import {
  buildSummaryPrompt,
  formatSummaryMarkdown,
  generateSummaryMarkdown,
} from "../../src/lib/summary.js";

describe("summary helpers", () => {
  it("builds a prompt from the transcript contract and summary options", () => {
    const prompt = buildSummaryPrompt(sampleTranscript, {
      model: "gpt-4.1-mini",
      summaryLanguage: "en",
    });

    expect(prompt).toContain("How to Run Better 1:1 Meetings");
    expect(prompt).toContain('"summaryLanguage": "en"');
    expect(prompt).toContain('"segments"');
    expect(prompt).toContain("Notable Quotes");
    expect(prompt).toContain("Action Items only when supported");
  });

  it("formats markdown with title, source metadata, and supported sections only", () => {
    const markdown = formatSummaryMarkdown({
      title: sampleTranscript.source.title,
      source: {
        url: sampleTranscript.source.url,
        videoId: sampleTranscript.source.videoId,
        durationSeconds: sampleTranscript.audio.durationSeconds,
        generatedAt: sampleTranscript.transcription.generatedAt,
        language: sampleTranscript.transcription.language,
      },
      overview: "A practical walkthrough for making one on one meetings clearer and more actionable.",
      keyPoints: [
        "Set a clear structure before the meeting starts.",
        "Reserve time for blockers, decisions, and follow ups.",
      ],
      timeline: [
        {
          heading: "Opening structure",
          bullets: ["Start with context and the meeting goal."],
        },
      ],
      notableQuotes: ["Clarity reduces anxiety."],
      actionItems: [],
    });

    expect(markdown).toContain("# How to Run Better 1:1 Meetings");
    expect(markdown).toContain("## Key Points");
    expect(markdown).toContain("## Notable Quotes");
    expect(markdown).not.toContain("## Action Items");
  });

  it("renders durations longer than one hour with an hour-aware format", () => {
    const markdown = formatSummaryMarkdown({
      title: sampleTranscript.source.title,
      source: {
        url: sampleTranscript.source.url,
        videoId: sampleTranscript.source.videoId,
        durationSeconds: 7500,
        generatedAt: sampleTranscript.transcription.generatedAt,
        language: sampleTranscript.transcription.language,
      },
      overview: "A practical walkthrough for making one on one meetings clearer and more actionable.",
    });

    expect(markdown).toContain("- Duration: 2:05:00");
    expect(markdown).not.toContain("- Duration: 125:00");
  });

  it("generates markdown from an OpenAI response and preserves the source title", async () => {
    const client = {
      responses: {
        create: vi.fn().mockResolvedValueOnce({
          output_text: JSON.stringify({
            title: "Incorrect model title",
            overview: "A concise summary.",
            keyPoints: ["Point one", "Point two"],
            timeline: [{ heading: "Section", bullets: ["Detail"] }],
            notableQuotes: ["Clarity reduces anxiety."],
            actionItems: ["Assign owners to follow ups."],
          }),
        }),
      },
    };

    const markdown = await generateSummaryMarkdown(client, sampleTranscript, {
      model: "gpt-4.1-mini",
      summaryLanguage: "en",
    });

    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
      }),
    );
    expect(markdown).toContain(`# ${sampleTranscript.source.title}`);
    expect(markdown).not.toContain("# Incorrect model title");
    expect(markdown).toContain("## Key Points");
    expect(markdown).toContain("## Notable Quotes");
    expect(markdown).toContain("## Action Items");
  });
});
