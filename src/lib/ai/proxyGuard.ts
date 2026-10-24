import { lookup } from "node:dns/promises";
import { isPrivateIp } from "./ipGuard";

/** 允许通过本站代理转发的模型服务商域名。可用 LLM_PROXY_ALLOWED_HOSTS 覆盖/扩展。 */
const DEFAULT_ALLOWED_HOSTS = [
  "api.openai.com",
  "api.deepseek.com",
  "api.moonshot.cn",
  "open.bigmodel.cn",
  "dashscope.aliyuncs.com",
  "api.siliconflow.cn",
  "openrouter.ai",
  "api.groq.com",
  "api.mistral.ai",
  "generativelanguage.googleapis.com",
];

/** 允许通过代理转发的上游接口路径（精确匹配，防止把本站当任意代理）。 */
export const PROXY_ENDPOINTS = ["/chat/completions", "/embeddings"] as const;

export type ProxyEndpoint = (typeof PROXY_ENDPOINTS)[number];

export function allowedHosts(): Set<string> {
  const extra = process.env.LLM_PROXY_ALLOWED_HOSTS?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...(extra ?? [])]);
}

export interface ProxyTarget {
  url: string;
  hostname: string;
}

/** 校验 endpoint 是否在白名单内；不在则直接抛错。 */
function assertProxyEndpoint(endpoint: string): asserts endpoint is ProxyEndpoint {
  if (!(PROXY_ENDPOINTS as readonly string[]).includes(endpoint)) {
    throw new Error(`不支持的代理接口：${endpoint || "(空)"}`);
  }
}

/**
 * 拼接上游地址（纯函数，便于单测）：Base URL 去尾部斜杠后接上 endpoint。
 * endpoint 必须与 PROXY_ENDPOINTS 完全匹配，否则抛错。
 */
export function buildUpstreamUrl(baseUrl: string, endpoint: string): string {
  assertProxyEndpoint(endpoint);
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("接口地址格式不正确");
  }
  return `${normalized}${endpoint}`;
}

/**
 * 校验并归一化代理目标：
 * - 只允许 https；
 * - 域名必须在白名单内（防止把本站当任意代理）；
 * - DNS 解析后拒绝私网地址（防止 SSRF 访问内网）。
 * endpoint 默认 /chat/completions，保持既有 chat 路由行为不变。
 */
export async function resolveProxyTarget(
  rawBaseUrl: string,
  endpoint = "/chat/completions",
): Promise<ProxyTarget> {
  assertProxyEndpoint(endpoint);

  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error("接口地址格式不正确");
  }
  if (url.protocol !== "https:") {
    throw new Error("代理模式只支持 https 接口地址");
  }
  if (url.username || url.password) {
    throw new Error("接口地址中不应包含账号密码");
  }
  const allow = allowedHosts();
  if (!allow.has(url.hostname.toLowerCase())) {
    throw new Error(
      `接口域名 ${url.hostname} 不在代理白名单中：可切换到「浏览器直连」，或在部署环境用 LLM_PROXY_ALLOWED_HOSTS 配置白名单。`,
    );
  }

  if (process.env.LLM_PROXY_ALLOW_PRIVATE !== "1") {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.some((item) => isPrivateIp(item.address))) {
      throw new Error("接口地址解析到内网地址，已拒绝转发");
    }
  }

  const normalized = url.toString().replace(/\/+$/, "");
  return { url: buildUpstreamUrl(normalized, endpoint), hostname: url.hostname };
}
