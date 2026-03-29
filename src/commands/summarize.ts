import { assertWritable, deriveSummaryPath, readTranscript, writeText } from "../lib/fs.js";
import { generateSummaryFromCli } from "../lib/llm-cli.js";
import { createOpenAiClient } from "../lib/openai.js";
import { checkSummarizeRequirements } from "../lib/requirements.js";
import { generateSummaryMarkdown } from "../lib/summary.js";
import { printArtifactPaths, runTasks } from "../lib/tui.js";

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-5-mini",
  claude: "claude-sonnet-4-6",
  codex: "gpt-5.4-mini",
};

type Provider = "openai" | "claude" | "codex";

export interface SummarizeCommandOptions {
  output?: string;
  model?: string;
  summaryLang?: string;
  force?: boolean;
  baseUrl?: string;
  claude?: boolean;
  codex?: boolean;
}

function resolveProvider(options: SummarizeCommandOptions): Provider {
  if (options.claude && options.codex) {
    throw new Error("Cannot use --claude and --codex together. Choose one.");
  }
  if (options.claude) return "claude";
  if (options.codex) return "codex";
  return "openai";
}

export async function runSummarizeCommand(
  transcriptJson: string,
  options: SummarizeCommandOptions,
): Promise<{ summaryPath: string; markdown: string }> {
  const provider = resolveProvider(options);
  const model = options.model ?? DEFAULT_MODELS[provider];
  const summaryPath = options.output ?? deriveSummaryPath(transcriptJson);
  let markdown: string | undefined;

  assertWritable(summaryPath, options.force ?? false);

  if (provider === "openai") {
    let client: ReturnType<typeof createOpenAiClient> | undefined;

    await runTasks([
      {
        title: "checking requirements",
        task: async (_setOutput) => {
          checkSummarizeRequirements(process.env, provider);
          client = createOpenAiClient(process.env, options.baseUrl);
        },
      },
      {
        title: "summarizing transcript",
        task: async (_setOutput) => {
          if (!client) {
            throw new Error("OpenAI client was not initialized");
          }

          const transcript = await readTranscript(transcriptJson);
          markdown = await generateSummaryMarkdown(client, transcript, {
            model,
            summaryLanguage: options.summaryLang ?? "en",
          });
        },
      },
      {
        title: "writing markdown summary",
        task: async (_setOutput) => {
          if (!markdown) {
            throw new Error("Summary markdown was not created");
          }

          await writeText(summaryPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, {
            overwrite: options.force ?? false,
          });
        },
      },
    ]);
  } else {
    await runTasks([
      {
        title: "checking requirements",
        task: async (_setOutput) => {
          checkSummarizeRequirements(process.env, provider);
        },
      },
      {
        title: "summarizing transcript",
        task: async (_setOutput) => {
          const transcript = await readTranscript(transcriptJson);
          markdown = await generateSummaryFromCli(provider, transcript, {
            model,
            summaryLanguage: options.summaryLang ?? "en",
          });
        },
      },
      {
        title: "writing markdown summary",
        task: async (_setOutput) => {
          if (!markdown) {
            throw new Error("Summary markdown was not created");
          }

          await writeText(summaryPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, {
            overwrite: options.force ?? false,
          });
        },
      },
    ]);
  }

  if (!markdown) {
    throw new Error("Summary markdown was not created");
  }

  printArtifactPaths({ summaryPath });

  return {
    summaryPath,
    markdown,
  };
}
