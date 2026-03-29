export type SummaryProvider = "openai" | "claude" | "codex";
export type CliSummaryProvider = Exclude<SummaryProvider, "openai">;

export interface SummaryProviderFlags {
  claude?: boolean;
  codex?: boolean;
}

interface SummaryProviderConfig {
  defaultModel: string;
  installHint?: string;
  buildCliArgs?: (model: string) => string[];
}

const SUMMARY_PROVIDER_CONFIG: Record<SummaryProvider, SummaryProviderConfig> = {
  openai: {
    defaultModel: "gpt-5-mini",
  },
  claude: {
    defaultModel: "claude-sonnet-4-6",
    installHint: "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code",
    buildCliArgs: (model) => ["-p", "-", "--model", model, "--output-format", "json"],
  },
  codex: {
    defaultModel: "gpt-5.4-mini",
    installHint: "Install Codex CLI: https://github.com/openai/codex",
    buildCliArgs: (model) => ["exec", "-", "--model", model, "--skip-git-repo-check"],
  },
};

export function resolveSummaryProvider(options: SummaryProviderFlags): SummaryProvider {
  if (options.claude && options.codex) {
    throw new Error("Cannot use --claude and --codex together. Choose one.");
  }

  if (options.claude) {
    return "claude";
  }

  if (options.codex) {
    return "codex";
  }

  return "openai";
}

export function getDefaultSummaryModel(provider: SummaryProvider): string {
  return SUMMARY_PROVIDER_CONFIG[provider].defaultModel;
}

export function isCliSummaryProvider(provider: string): provider is CliSummaryProvider {
  return provider === "claude" || provider === "codex";
}

export function getSummaryCliInstallHint(provider: CliSummaryProvider): string {
  const hint = SUMMARY_PROVIDER_CONFIG[provider].installHint;
  if (!hint) {
    throw new Error(`No install hint configured for provider "${provider}".`);
  }

  return hint;
}

export function buildSummaryCliArgs(provider: CliSummaryProvider, model: string): string[] {
  const buildArgs = SUMMARY_PROVIDER_CONFIG[provider].buildCliArgs;
  if (!buildArgs) {
    throw new Error(`No CLI args configured for provider "${provider}".`);
  }

  return buildArgs(model);
}
