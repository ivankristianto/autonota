import { afterEach, describe, expect, it, vi } from "vitest";

import sampleTranscript from "../fixtures/sample-transcript.json" with { type: "json" };

const {
  checkSummarizeRequirementsMock,
  readTranscriptMock,
  assertWritableMock,
  generateSummaryMarkdownMock,
  printArtifactPathsMock,
  createOpenAiClientMock,
  writeTextMock,
} = vi.hoisted(() => ({
  checkSummarizeRequirementsMock: vi.fn(),
  readTranscriptMock: vi.fn(),
  assertWritableMock: vi.fn(),
  generateSummaryMarkdownMock: vi.fn(),
  printArtifactPathsMock: vi.fn(),
  createOpenAiClientMock: vi.fn(),
  writeTextMock: vi.fn(),
}));

vi.mock("../../src/lib/openai.js", () => ({
  createOpenAiClient: createOpenAiClientMock,
}));

vi.mock("../../src/lib/requirements.js", () => ({
  checkSummarizeRequirements: checkSummarizeRequirementsMock,
}));

vi.mock("../../src/lib/fs.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/fs.js")>("../../src/lib/fs.js");
  return {
    ...actual,
    readTranscript: readTranscriptMock,
    assertWritable: assertWritableMock,
    writeText: writeTextMock,
  };
});

vi.mock("../../src/lib/summary.js", () => ({
  generateSummaryMarkdown: generateSummaryMarkdownMock,
}));

vi.mock("../../src/lib/tui.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/lib/tui.js")>("../../src/lib/tui.js");
  return {
    ...actual,
    printArtifactPaths: printArtifactPathsMock,
  };
});

import { createProgram } from "../../src/cli.js";
import { runSummarizeCommand } from "../../src/commands/summarize.js";

afterEach(() => {
  checkSummarizeRequirementsMock.mockReset();
  readTranscriptMock.mockReset();
  assertWritableMock.mockReset();
  generateSummaryMarkdownMock.mockReset();
  printArtifactPathsMock.mockReset();
  createOpenAiClientMock.mockReset();
  writeTextMock.mockReset();
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
});

describe("summarize command", () => {
  it("loads transcript json, generates markdown with OpenAI, and writes to the explicit output path", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const client = { tag: "openai-client" };
    const markdown = [
      "# How to Run Better 1:1 Meetings",
      "",
      "## Key Points",
      "- Point one",
      "",
      "## Notable Quotes",
      "> Clarity reduces anxiety.",
    ].join("\n");

    readTranscriptMock.mockResolvedValueOnce(sampleTranscript);
    createOpenAiClientMock.mockReturnValueOnce(client);
    generateSummaryMarkdownMock.mockResolvedValueOnce(markdown);

    const result = await runSummarizeCommand("/work/out/demo.transcript.json", {
      output: "/work/out/demo.summary.md",
      model: "gpt-4.1-mini",
      summaryLang: "id",
      force: true,
      baseUrl: "https://openrouter.example/v1",
    });

    expect(checkSummarizeRequirementsMock).toHaveBeenCalledWith(process.env);
    expect(assertWritableMock).toHaveBeenCalledWith("/work/out/demo.summary.md", true);
    expect(readTranscriptMock).toHaveBeenCalledWith("/work/out/demo.transcript.json");
    expect(createOpenAiClientMock).toHaveBeenCalledWith(
      process.env,
      "https://openrouter.example/v1",
    );
    expect(generateSummaryMarkdownMock).toHaveBeenCalledWith(client, sampleTranscript, {
      model: "gpt-4.1-mini",
      summaryLanguage: "id",
    });
    expect(writeTextMock).toHaveBeenCalledWith("/work/out/demo.summary.md", `${markdown}\n`, {
      overwrite: true,
    });
    expect(printArtifactPathsMock).toHaveBeenCalledWith({
      summaryPath: "/work/out/demo.summary.md",
    });
    expect(result).toEqual({
      summaryPath: "/work/out/demo.summary.md",
      markdown,
    });
  });

  it("stops before summarizing when the output already exists and --force is not set", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    assertWritableMock.mockImplementationOnce(() => {
      throw new Error(
        "Refusing to overwrite /work/out/demo.summary.md. Use --force to replace it.",
      );
    });

    await expect(
      runSummarizeCommand("/work/out/demo.transcript.json", {
        output: "/work/out/demo.summary.md",
      }),
    ).rejects.toThrow(/--force/);

    expect(readTranscriptMock).not.toHaveBeenCalled();
    expect(generateSummaryMarkdownMock).not.toHaveBeenCalled();
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it("derives the output path from the transcript path when --output is omitted", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const markdown = "# Demo\n";

    readTranscriptMock.mockResolvedValueOnce(sampleTranscript);
    createOpenAiClientMock.mockReturnValueOnce({ tag: "client" });
    generateSummaryMarkdownMock.mockResolvedValueOnce(markdown);

    const result = await runSummarizeCommand("/work/out/demo.transcript.json", {});

    expect(writeTextMock).toHaveBeenCalledWith("/work/out/demo.summary.md", markdown, {
      overwrite: false,
    });
    expect(result.summaryPath).toBe("/work/out/demo.summary.md");
  });

  it("does not create an OpenAI client when requirements validation fails", async () => {
    checkSummarizeRequirementsMock.mockImplementationOnce(() => {
      throw new Error("missing OPENAI_API_KEY");
    });

    await expect(
      runSummarizeCommand("/work/out/demo.transcript.json", {
        output: "/work/out/demo.summary.md",
      }),
    ).rejects.toThrow("missing OPENAI_API_KEY");

    expect(createOpenAiClientMock).not.toHaveBeenCalled();
    expect(readTranscriptMock).not.toHaveBeenCalled();
    expect(generateSummaryMarkdownMock).not.toHaveBeenCalled();
  });

  it("registers the summarize command with the required options", () => {
    const program = createProgram();

    const summarizeCommand = program.commands.find((command) => command.name() === "summarize");

    expect(summarizeCommand).toBeDefined();
    expect(summarizeCommand?.registeredArguments.map((argument) => argument.name())).toEqual([
      "transcriptJson",
    ]);
    expect(summarizeCommand?.options.find((option) => option.long === "--output")?.mandatory).toBe(
      false,
    );
    expect(summarizeCommand?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(["--output", "--model", "--summary-lang", "--force", "--base-url"]),
    );
  });

  it("registers --claude and --codex flags on the summarize command", () => {
    const program = createProgram();

    const summarizeCommand = program.commands.find((command) => command.name() === "summarize");

    expect(summarizeCommand?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(["--claude", "--codex"]),
    );
  });
});
