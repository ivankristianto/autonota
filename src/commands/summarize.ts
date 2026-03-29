import { assertWritable, deriveSummaryPath, readTranscript, writeText } from "../lib/fs.js";
import { generateSummaryFromCli } from "../lib/llm-cli.js";
import { createOpenAiClient } from "../lib/openai.js";
import { checkSummarizeRequirements } from "../lib/requirements.js";
import {
  getDefaultSummaryModel,
  isCliSummaryProvider,
  resolveSummaryProvider,
} from "../lib/summary-providers.js";
import { generateSummaryMarkdown } from "../lib/summary.js";
import { printArtifactPaths, runTasks } from "../lib/tui.js";

export interface SummarizeCommandOptions {
  output?: string;
  model?: string;
  summaryLang?: string;
  force?: boolean;
  baseUrl?: string;
  claude?: boolean;
  codex?: boolean;
}

export async function runSummarizeCommand(
  transcriptJson: string,
  options: SummarizeCommandOptions,
): Promise<{ summaryPath: string; markdown: string }> {
  const provider = resolveSummaryProvider(options);
  const model = options.model ?? getDefaultSummaryModel(provider);
  const summaryPath = options.output ?? deriveSummaryPath(transcriptJson);
  let markdown: string | undefined;

  assertWritable(summaryPath, options.force ?? false);

  if (!isCliSummaryProvider(provider)) {
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
