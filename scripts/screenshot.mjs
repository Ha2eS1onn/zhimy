#!/usr/bin/env node
/**
 * 开发用无头截图：驱动本机 Edge 的 CDP，按三端尺寸截取页面并收集控制台错误。
 * 用法：node scripts/screenshot.mjs [baseUrl] [outDir]
 * 需要环境变量 EDGE_PATH（默认 Windows Edge 安装路径）。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const EDGE_PATH =
  process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.argv[2] || "http://127.0.0.1:3100";
const outDir = path.resolve(process.argv[3] || "_verify");
const debugPort = Number(process.env.EDGE_DEBUG_PORT || 9333);

const TARGETS = [
  { name: "home-desktop", route: "/", width: 1440, height: 900 },
  { name: "chat-desktop", route: "/chat", width: 1440, height: 900 },
  { name: "atlas-desktop", route: "/atlas", width: 1440, height: 900 },
  { name: "home-tablet", route: "/", width: 1024, height: 768 },
  { name: "chat-tablet", route: "/chat", width: 1024, height: 768 },
  { name: "atlas-tablet", route: "/atlas", width: 1024, height: 768 },
  { name: "home-mobile", route: "/", width: 390, height: 844 },
  { name: "chat-mobile", route: "/chat", width: 390, height: 844 },
  { name: "atlas-mobile", route: "/atlas", width: 390, height: 844 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Windows 上偶尔会被杀毒/索引服务短暂占用，写入失败时重试几次。 */
async function writeFileWithRetry(file, buffer) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      writeFileSync(file, buffer);
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(500);
    }
  }
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error("CDP WebSocket 连接失败"));
    });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  onEvent(listener) {
    this.listeners.push(listener);
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

async function createTarget() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`无法创建新标签页：${response.status}`);
  return response.json();
}

async function capture(target) {
  const page = await createTarget();
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  const errors = [];
  cdp.onEvent((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails?.exception?.description ?? "未知异常");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    }
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: target.width,
    height: target.height,
    deviceScaleFactor: 1,
    mobile: target.width < 768,
  });
  await cdp.send("Page.navigate", { url: `${baseUrl}${target.route}` });
  await sleep(target.route.includes("atlas") ? 3600 : 2600);

  const text = await cdp.send("Runtime.evaluate", {
    expression: "document.body.innerText.slice(0, 400)",
    returnByValue: true,
  });
  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const file = path.join(outDir, `${target.name}.png`);
  await writeFileWithRetry(file, Buffer.from(shot.data, "base64"));

  console.log(`✓ ${target.name} (${target.width}x${target.height}) → ${file}`);
  console.log(`  text: ${JSON.stringify((text.result?.value ?? "").replace(/\s+/g, " ").slice(0, 160))}`);
  if (errors.length > 0) {
    console.log(`  ⚠ console errors:`);
    for (const error of errors.slice(0, 6)) console.log(`    - ${error.slice(0, 300)}`);
  }

  cdp.close();
  await fetch(`http://127.0.0.1:${debugPort}/json/close/${page.id}`).catch(() => {});
}

mkdirSync(outDir, { recursive: true });
const browser = spawn(
  EDGE_PATH,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-crash-reporter",
    "--disable-breakpad",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--user-data-dir=${path.join(outDir, "edge-profile")}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) break;
    } catch {
      // 等待 Edge 启动
    }
    await sleep(250);
  }
  for (const target of TARGETS) {
    await capture(target);
  }
  console.log("\n截图完成 ✅");
} catch (error) {
  console.error("截图失败：", error.message);
  process.exitCode = 1;
} finally {
  browser.kill();
}
