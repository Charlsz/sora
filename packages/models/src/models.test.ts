import { describe, expect, test } from "bun:test";
import {
  MockProvider,
  parseModelReference,
  createDefaultProviderRegistry,
} from "../src/index.ts";

describe("parseModelReference", () => {
  test("parses provider and model", () => {
    expect(parseModelReference("openai:gpt-4o-mini")).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
      raw: "openai:gpt-4o-mini",
    });
    expect(parseModelReference("openrouter:anthropic/claude-sonnet-4").model).toBe(
      "anthropic/claude-sonnet-4",
    );
  });

  test("rejects invalid refs", () => {
    expect(() => parseModelReference("gpt-4o")).toThrow();
    expect(() => parseModelReference(":model")).toThrow();
  });
});

describe("MockProvider", () => {
  test("greets and echoes", async () => {
    const provider = new MockProvider();
    const hello = await provider.chat({
      model: "echo",
      messages: [
        { role: "system", content: "You are Klaus." },
        { role: "user", content: "hello" },
      ],
    });
    expect(hello.message.content).toContain("Klaus");
    expect(hello.finishReason).toBe("stop");
  });
});

describe("ProviderRegistry", () => {
  test("resolves mock and lists providers", () => {
    const registry = createDefaultProviderRegistry();
    expect(registry.list()).toContain("mock");
    expect(registry.list()).toContain("openai");
    const resolved = registry.resolve("mock:echo");
    expect(resolved.provider.id).toBe("mock");
    expect(resolved.model).toBe("echo");
  });
});
