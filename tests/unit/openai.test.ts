import { afterEach, describe, expect, it, vi } from "vitest";

const { openAiConstructorMock } = vi.hoisted(() => ({
  openAiConstructorMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: openAiConstructorMock,
}));

import { createOpenAiClient } from "../../src/lib/openai.js";

afterEach(() => {
  openAiConstructorMock.mockReset();
});

describe("openai client factory", () => {
  it("creates a client from trimmed env api key and env base URL", () => {
    const client = { tag: "openai-client" };
    openAiConstructorMock.mockReturnValueOnce(client);

    const result = createOpenAiClient({
      OPENAI_API_KEY: " test-key ",
      OPENAI_BASE_URL: " https://env.example/v1 ",
    } as NodeJS.ProcessEnv);

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://env.example/v1",
    });
    expect(result).toBe(client);
  });

  it("prefers explicit baseUrl override over OPENAI_BASE_URL", () => {
    openAiConstructorMock.mockReturnValueOnce({ tag: "openai-client" });

    createOpenAiClient(
      {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://env.example/v1",
      } as NodeJS.ProcessEnv,
      " https://override.example/v1 ",
    );

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://override.example/v1",
    });
  });

  it("omits baseURL when no env base URL and no explicit override", () => {
    openAiConstructorMock.mockReturnValueOnce({ tag: "openai-client" });

    createOpenAiClient(
      {
        OPENAI_API_KEY: "test-key",
      } as NodeJS.ProcessEnv,
      "   ",
    );

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-key",
    });
  });

  it("throws when OPENAI_API_KEY is missing", () => {
    expect(() => createOpenAiClient({} as NodeJS.ProcessEnv)).toThrow(/OPENAI_API_KEY/);
    expect(openAiConstructorMock).not.toHaveBeenCalled();
  });
});
