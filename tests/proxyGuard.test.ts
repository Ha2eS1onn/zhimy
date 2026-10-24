import { describe, expect, it } from "vitest";
import { PROXY_ENDPOINTS, buildUpstreamUrl } from "@/lib/ai/proxyGuard";

describe("buildUpstreamUrl 拼接", () => {
  it("白名单端点直接接在 Base URL 后", () => {
    expect(buildUpstreamUrl("https://api.openai.com/v1", "/embeddings")).toBe(
      "https://api.openai.com/v1/embeddings",
    );
    expect(buildUpstreamUrl("https://api.deepseek.com", "/chat/completions")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("去掉 Base URL 的尾部斜杠与首尾空白", () => {
    expect(buildUpstreamUrl("https://api.example.com/v1///", "/embeddings")).toBe(
      "https://api.example.com/v1/embeddings",
    );
    expect(buildUpstreamUrl("  https://api.example.com/v1/  ", "/chat/completions")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(buildUpstreamUrl("https://api.example.com/", "/embeddings")).toBe(
      "https://api.example.com/embeddings",
    );
  });

  it("只暴露 chat/completions 与 embeddings 两个端点", () => {
    expect([...PROXY_ENDPOINTS]).toEqual(["/chat/completions", "/embeddings"]);
  });
});

describe("buildUpstreamUrl 端点白名单", () => {
  it("绝对 URL、路径穿越、空串、/models 等一律抛错", () => {
    const invalidEndpoints = [
      "https://evil.example.com/chat/completions",
      "//evil.example.com/embeddings",
      "../chat/completions",
      "/../../etc/passwd",
      "",
      "   ",
      "/models",
      "/chat/completions/",
      "chat/completions",
      "/embeddings?x=1",
      "/embeddings#hash",
    ];
    for (const endpoint of invalidEndpoints) {
      expect(() => buildUpstreamUrl("https://api.example.com/v1", endpoint), endpoint).toThrow(
        /不支持的代理接口/,
      );
    }
  });

  it("Base URL 为空时抛错", () => {
    expect(() => buildUpstreamUrl("   ", "/embeddings")).toThrow(/接口地址格式不正确/);
  });
});
