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
  { name: "home-mobile-sm", route: "/", width: 320, height: 568 },
  { name: "chat-mobile-sm", route: "/chat", width: 320, height: 568 },
  { name: "atlas-mobile-sm", route: "/atlas", width: 320, height: 568 },
  {
    name: "atlas-seeded-desktop",
    route: "/atlas",
    width: 1440,
    height: 900,
    seed: true,
    panelNode: "物理",
  },
  {
    name: "atlas-seeded-canvas",
    route: "/atlas",
    width: 1440,
    height: 900,
    seed: true,
  },
  {
    name: "settings-desktop",
    route: "/",
    width: 1440,
    height: 900,
    openSettings: true,
  },
  {
    name: "settings-mobile",
    route: "/",
    width: 390,
    height: 844,
    openSettings: true,
  },
  {
    name: "reduced-motion-desktop",
    route: "/",
    width: 1440,
    height: 900,
    openSettings: true,
    reduceMotion: true,
  },
  {
    name: "node-detail-desktop",
    route: "/atlas",
    width: 1440,
    height: 900,
    seed: true,
    panelNode: "物理",
    openDetail: true,
  },
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

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result?.value;
}

async function waitForValue(cdp, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    await sleep(500);
  }
  return null;
}

async function clickAt(cdp, x, y) {
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
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
  // 可选：SCREENSHOT_THEME=light|dark 强制系统主题。
  const mediaFeatures = [];
  if (process.env.SCREENSHOT_THEME === "light" || process.env.SCREENSHOT_THEME === "dark") {
    mediaFeatures.push({ name: "prefers-color-scheme", value: process.env.SCREENSHOT_THEME });
  }
  if (mediaFeatures.length > 0) {
    await cdp.send("Emulation.setEmulatedMedia", { features: mediaFeatures });
  }
  await cdp.send("Page.navigate", { url: `${baseUrl}${target.route}` });
  await sleep(target.route.includes("atlas") ? 3600 : 2600);

  if (target.seed) {
    const seeded = await waitForValue(
      cdp,
      `(() => {
        const button = [...document.querySelectorAll("button")].find(
          (item) => item.textContent?.trim() === "载入示例",
        );
        if (!button) return false;
        button.click();
        return true;
      })()`,
      20000,
    );
    await sleep(seeded ? 2500 : 500);
  }

  if (target.panelNode) {
    const point = await waitForValue(
      cdp,
      `(() => {
        const projected = window.__zhimyAtlasDebug
          ?.projectedNodes()
          .find((item) => item.title === ${JSON.stringify(target.panelNode)});
        const canvas = document.querySelector("canvas");
        if (!projected || !canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + projected.x, y: rect.top + projected.y };
      })()`,
      20000,
    );
    console.log(`  node probe: ${JSON.stringify(point)}`);
    if (point) {
      await clickAt(cdp, point.x, point.y);
      await sleep(1400);
    }
  }

  if (target.openSettings) {
    const opened = await waitForValue(
      cdp,
      `(() => {
        const button = [...document.querySelectorAll("button")].find(
          (item) =>
            item.offsetParent !== null &&
            (item.getAttribute("aria-label") === "设置" || item.textContent?.trim() === "设置"),
        );
        if (!button) return false;
        button.click();
        return true;
      })()`,
      5000,
    );
    if (opened) await sleep(900);
  }

  if (target.reduceMotion) {
    await evaluate(
      cdp,
      `(() => {
        const row = [...document.querySelectorAll("label")].find(
          (item) => item.textContent?.includes("减少动画"),
        );
        row?.querySelector("input")?.click();
        return Boolean(row);
      })()`,
    );
    await sleep(500);
  }

  if (target.openDetail) {
    await evaluate(
      cdp,
      `(() => {
        const link = [...document.querySelectorAll('a[href^="/node/"]')].find(
          (item) => item.textContent?.includes("完整讲解"),
        );
        link?.click();
        return Boolean(link);
      })()`,
    );
    await sleep(1800);
  }

  const text = await cdp.send("Runtime.evaluate", {
    expression: "document.body.innerText.slice(0, 400)",
    returnByValue: true,
  });
  const audit = await evaluate(
    cdp,
    `(() => {
      const blur = [...document.querySelectorAll("*")].filter(
        (element) => getComputedStyle(element).backdropFilter !== "none",
      ).length;
      const controls = [...document.querySelectorAll("button, a[href], input, textarea")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.height < 44;
        })
        .slice(0, 4)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 18),
          height: Math.round(element.getBoundingClientRect().height),
        }));
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        blur,
        controlsUnder44: controls.length,
        controls,
        themeColor: document.querySelector('meta[name="theme-color"]')?.content,
        reducedMotion: document.documentElement.dataset.reducedMotion ?? "off",
      };
    })()`,
  );
  console.log(`  audit: ${JSON.stringify(audit)}`);
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
  const only = process.env.SCREENSHOT_FILTER?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  for (const target of TARGETS.filter((item) => !only || only.includes(item.name))) {
    await capture(target);
  }
  console.log("\n截图完成 ✅");
} catch (error) {
  console.error("截图失败：", error.message);
  process.exitCode = 1;
} finally {
  browser.kill();
}
