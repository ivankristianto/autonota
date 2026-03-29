import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertWritable,
  deriveSummaryPath,
  deriveTranscriptPath,
  deriveYoutubeAudioPath,
  readTranscript,
  writeText,
  writeJson,
} from "../../src/lib/fs.js";

describe("filesystem helpers", () => {
  it("derives transcript paths from a base path", () => {
    expect(deriveTranscriptPath("out/demo")).toBe("out/demo.transcript.json");
  });

  it("strips trailing slash from basePath when deriving transcript path", () => {
    expect(deriveTranscriptPath("out/demo/")).toBe("out/demo.transcript.json");
  });

  it("strips trailing slash from basePath when deriving youtube audio path", () => {
    expect(deriveYoutubeAudioPath("out/demo/", "My Video", "abc123")).toBe("out/demo-my-video.mp3");
  });

  it("derives summary paths from a base path", () => {
    expect(deriveSummaryPath("out/demo")).toBe("out/demo.summary.md");
  });

  it("derives summary paths from a transcript artifact path", () => {
    expect(deriveSummaryPath("out/demo.transcript.json")).toBe("out/demo.summary.md");
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
      await expect(writeJson(existingPath, { replacement: true })).rejects.toMatchObject({
        code: "EEXIST",
      });
      await expect(readFile(existingPath, "utf8")).resolves.toBe("{}");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("overwrites an existing file when overwrite is enabled", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-fs-"));
    const existingPath = path.join(tempDir, "existing.json");
    await writeFile(existingPath, '{"old":true}\n', "utf8");

    try {
      await writeJson(existingPath, { replacement: true }, { overwrite: true });
      await expect(readFile(existingPath, "utf8")).resolves.toContain('"replacement": true');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("writes text without clobbering an existing file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-fs-"));
    const existingPath = path.join(tempDir, "existing.md");
    await writeFile(existingPath, "old\n", "utf8");

    try {
      await expect(writeText(existingPath, "replacement\n")).rejects.toMatchObject({
        code: "EEXIST",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("overwrites existing text when overwrite is enabled", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-fs-"));
    const existingPath = path.join(tempDir, "existing.md");
    await writeFile(existingPath, "old\n", "utf8");

    try {
      await writeText(existingPath, "replacement\n", { overwrite: true });
      await expect(readFile(existingPath, "utf8")).resolves.toBe("replacement\n");
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
      await expect(readTranscript(transcriptPath)).rejects.toThrow(/Invalid transcript file/i);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
