#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath as fileURLToPathUtil } from "node:url";

import { Command } from "commander";

import { runSummarizeCommand } from "./commands/summarize.js";
import { runTranscribeCommand } from "./commands/transcribe.js";

function getPackageVersion(): string {
  const packagePath = fileURLToPathUtil(new URL("../package.json", import.meta.url));
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { version: string };
  return pkg.version;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("autonota")
    .description("Download YouTube audio, transcribe it, and summarize transcripts")
    .version(getPackageVersion());

  program
    .command("transcribe")
    .argument("<youtube-url>")
    .requiredOption("--output <basePath>")
    .option("--model <name>")
    .option("--lang <code>")
    .option("--browser <name>")
    .option("--force")
    .option("--base-url <url>")
    .action(
      async (
        youtubeUrl: string,
        options: {
          output: string;
          model?: string;
          lang?: string;
          browser?: string;
          force?: boolean;
          baseUrl?: string;
        },
      ) => {
        await runTranscribeCommand(youtubeUrl, options);
      },
    );

  program
    .command("summarize")
    .alias("summarise")
    .argument("<transcriptJson>")
    .option("--output <summaryPath>")
    .option("--model <name>")
    .option("--summary-lang <code>")
    .option("--force")
    .option("--base-url <url>")
    .option("--claude")
    .option("--codex")
    .action(
      async (
        transcriptJson: string,
        options: {
          output: string;
          model?: string;
          summaryLang?: string;
          force?: boolean;
          baseUrl?: string;
          claude?: boolean;
          codex?: boolean;
        },
      ) => {
        await runSummarizeCommand(transcriptJson, options);
      },
    );

  return program;
}

async function main(): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function isDirectExecution(
  argv1: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (!argv1) {
    return false;
  }

  const entryPath = pathToFileURL(realpathSync(path.resolve(argv1))).href;

  return moduleUrl === entryPath;
}

if (isDirectExecution()) {
  void main();
}
