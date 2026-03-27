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
    const parseMock = vi.fn().mockResolvedValueOnce({
      status: "completed",
      output_parsed: {
        title: "Incorrect model title",
        overview: "A concise summary.",
        keyPoints: ["Point one", "Point two"],
        timeline: [{ heading: "Section", bullets: ["Detail"] }],
        notableQuotes: ["Clarity reduces anxiety."],
        actionItems: ["Assign owners to follow ups."],
      },
    });
    const client = {
      responses: {
        parse: parseMock,
      },
    };

    const markdown = await generateSummaryMarkdown(client, sampleTranscript, {
      model: "gpt-4.1-mini",
      summaryLanguage: "en",
    });

    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        text: expect.objectContaining({
          format: expect.objectContaining({
            type: "json_schema",
            strict: true,
            name: "nota_summary",
          }),
        }),
      }),
    );
    expect(markdown).toContain(`# ${sampleTranscript.source.title}`);
    expect(markdown).not.toContain("# Incorrect model title");
    expect(markdown).toContain("## Key Points");
    expect(markdown).toContain("## Notable Quotes");
    expect(markdown).toContain("## Action Items");
  });

  it("fails with a targeted error when the model refuses the summary request", async () => {
    const client = {
      responses: {
        parse: vi.fn().mockResolvedValueOnce({
          status: "completed",
          output_parsed: null,
          output: [
            {
              type: "message",
              content: [{ type: "refusal", refusal: "I can’t help with that." }],
            },
          ],
        }),
      },
    };

    await expect(
      generateSummaryMarkdown(client, sampleTranscript, {
        model: "gpt-4.1-mini",
        summaryLanguage: "en",
      }),
    ).rejects.toThrow("OpenAI summary request was refused: I can’t help with that.");
  });

  it("fails with a targeted error when the summary response is incomplete", async () => {
    const client = {
      responses: {
        parse: vi.fn().mockResolvedValueOnce({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output_parsed: null,
          output: [],
        }),
      },
    };

    await expect(
      generateSummaryMarkdown(client, sampleTranscript, {
        model: "gpt-4.1-mini",
        summaryLanguage: "en",
      }),
    ).rejects.toThrow(
      "OpenAI summary response was incomplete: max_output_tokens.",
    );
  });

  it("fails with a targeted error when structured output is missing", async () => {
    const client = {
      responses: {
        parse: vi.fn().mockResolvedValueOnce({
          status: "completed",
          output_parsed: null,
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "{\"overview\":\"hello\"}", parsed: null }],
            },
          ],
        }),
      },
    };

    await expect(
      generateSummaryMarkdown(client, sampleTranscript, {
        model: "gpt-4.1-mini",
        summaryLanguage: "en",
      }),
    ).rejects.toThrow("OpenAI summary response did not include parsed structured output.");
  });
});
