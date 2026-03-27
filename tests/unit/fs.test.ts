import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertWritable,
  deriveSummaryPath,
  deriveTranscriptPath,
  readTranscript,
  writeJson,
} from "../../src/lib/fs.js";

describe("filesystem helpers", () => {
  it("derives transcript paths from a base path", () => {
    expect(deriveTranscriptPath("out/demo")).toBe("out/demo.transcript.json");
  });

  it("derives summary paths from a base path", () => {
    expect(deriveSummaryPath("out/demo")).toBe("out/demo.summary.md");
  });

  it("derives summary paths from a transcript artifact path", () => {
    expect(deriveSummaryPath("out/demo.transcript.json")).toBe(
      "out/demo.summary.md",
    );
  });

  it("rejects overwriting an existing file without --force", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-fs-"));
    const existingPath = path.join(tempDir, "existing.json");
    await writeFile(existingPath, "{}", "utf8");

    try {
      expect(() => assertWritable(existingPath, false)).toThrow(/--force/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("writes json without clobbering an existing file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-fs-"));
    const existingPath = path.join(tempDir, "existing.json");
    await writeFile(existingPath, "{}", "utf8");

    try {
      await expect(writeJson(existingPath, { replacement: true })).rejects.toMatchObject(
        { code: "EEXIST" },
      );
      await expect(readFile(existingPath, "utf8")).resolves.toBe("{}");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reads a valid transcript file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-fs-"));
    const transcriptPath = path.join(tempDir, "valid.transcript.json");
    const transcript = {
      source: {
        type: "youtube",
        url: "https://www.youtube.com/watch?v=abc123xyz00",
        videoId: "abc123xyz00",
        title: "Demo",
      },
      transcription: {
        model: "whisper-1",
        language: "auto",
        generatedAt: "2026-03-27T00:00:00.000Z",
      },
      audio: {
        durationSeconds: 123.45,
        chunkCount: 1,
      },
      segments: [{ start: 0, end: 10, text: "hello world" }],
      fullText: "hello world",
    };

    await writeFile(transcriptPath, JSON.stringify(transcript), "utf8");

    try {
      await expect(readTranscript(transcriptPath)).resolves.toEqual(transcript);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects malformed transcript files with a targeted error", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-fs-"));
    const transcriptPath = path.join(tempDir, "broken.transcript.json");
    await writeFile(transcriptPath, JSON.stringify({ source: {} }), "utf8");

    try {
      await expect(readTranscript(transcriptPath)).rejects.toThrow(
        /Invalid transcript file/i,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
