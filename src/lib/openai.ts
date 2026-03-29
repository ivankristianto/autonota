import OpenAI from "openai";

import { assertOpenAiConfigured } from "./requirements.js";

export function createOpenAiClient(env: NodeJS.ProcessEnv, baseUrlOverride?: string): OpenAI {
  const apiKey = assertOpenAiConfigured(env);
  const explicitBaseUrl = baseUrlOverride?.trim();
  const baseURL = explicitBaseUrl || env.OPENAI_BASE_URL?.trim() || undefined;

  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}
