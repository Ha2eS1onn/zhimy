"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { describeAuthError } from "@/lib/authErrors";
import { LLM_PRESETS } from "@/lib/ai/types";
import { testConnection } from "@/lib/ai/llmClient";
import { isEmbeddingConfigured, testEmbedding } from "@/lib/ai/embeddings";
import { backfillEmbeddings, type BackfillProgress } from "@/lib/ai/backfill";
import { EVENTS, track } from "@/lib/analytics";
import { isDemoMode } from "@/lib/env";
import { useChatStore } from "@/store/chatStore";
import { useGraphStore } from "@/store/graphStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import { useUIStore, type SettingsTab } from "@/store/uiStore";
import { Icon } from "../shell/Icon";
import { useMemo } from "react";
import { Sheet } from "@/components/common/Sheet";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "llm", label: "模型" },
  { id: "account", label: "账号" },
  { id: "data", label: "数据" },
];

export function SettingsSheet() {
  const open = useUIStore((state) => state.settingsOpen);
  const tab = useUIStore((state) => state.settingsTab);
  const setTab = useUIStore((state) => state.setSettingsTab);
  const close = useUIStore((state) => state.closeSettings);
  const pathname = usePathname();
  const demo = isDemoMode();

  return (
    <Sheet
      open={open}
      title="设置"
      description="模型 Key 只保存在本机浏览器；知识点与对话保存在你的云端账号。"
      onClose={close}
      size="lg"
      footer={
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>知脉 v0.1.0 · P0 原型</span>
          <span className="truncate">{pathname}</span>
        </div>
      }
    >
      <div
        className="segmented mb-4 w-full"
        data-count={TABS.length}
        data-index={Math.max(0, TABS.findIndex((item) => item.id === tab))}
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={tab === item.id}
            onClick={() => setTab(item.id)}
            className="flex-1"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div key={tab} className="motion-fade">
        {tab === "llm" ? <LlmSection /> : null}
        {tab === "account" ? <AccountSection demo={demo} /> : null}
        {tab === "data" ? <DataSection /> : null}
      </div>
    </Sheet>
  );
}

function LlmSection() {
  const llm = useSettingsStore((state) => state.llm);
  const setLlm = useSettingsStore((state) => state.setLlm);
  const clearApiKey = useSettingsStore((state) => state.clearApiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingResult, setEmbeddingResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const applyPreset = (presetId: string) => {
    const preset = LLM_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setLlm({
      baseUrl: preset.baseUrl,
      model: preset.model,
      visionModel: preset.visionModel ?? "",
      embeddingModel: preset.embeddingModel ?? "",
      mode: "real",
    });
    setTestResult(null);
    setEmbeddingResult(null);
  };

  const handleTest = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await testConnection(llm);
      setTestResult({ ok: true, message: `连接成功：${reply || "模型已响应"}` });
      track(EVENTS.llmConnectionTested, { kind: "chat", ok: true });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "连接失败",
      });
      track(EVENTS.llmConnectionTested, { kind: "chat", ok: false });
    } finally {
      setTesting(false);
    }
  };

  const handleTestEmbedding = async () => {
    if (testingEmbedding) return;
    setTestingEmbedding(true);
    setEmbeddingResult(null);
    try {
      const result = await testEmbedding(llm);
      setEmbeddingResult({
        ok: true,
        message: `向量连接成功：${result.model} · ${result.dimensions} 维`,
      });
      track(EVENTS.llmConnectionTested, { kind: "embedding", ok: true });
    } catch (error) {
      setEmbeddingResult({
        ok: false,
        message: error instanceof Error ? error.message : "向量连接失败",
      });
      track(EVENTS.llmConnectionTested, { kind: "embedding", ok: false });
    } finally {
      setTestingEmbedding(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="label">回答模式</p>
        <div
          className="segmented mt-2 w-full"
          data-count={2}
          data-index={llm.mode === "mock" ? 0 : 1}
        >
          <button
            type="button"
            className="flex-1"
            data-active={llm.mode === "mock"}
            onClick={() => setLlm({ mode: "mock" })}
          >
            演示脚本
          </button>
          <button
            type="button"
            className="flex-1"
            data-active={llm.mode === "real"}
            onClick={() => setLlm({ mode: "real" })}
          >
            我的模型（BYOK）
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          演示脚本不消耗任何额度，适合验证产品交互；接入自己的模型后，回答由你的服务商生成。
        </p>
      </div>

      <div>
        <p className="label">快捷配置</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LLM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="chip hover:border-accent/40 hover:text-ink"
              onClick={() => applyPreset(preset.id)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="label">接口地址 Base URL</span>
          <input
            className="input mt-1 font-mono text-xs"
            value={llm.baseUrl}
            onChange={(event) => setLlm({ baseUrl: event.target.value })}
            placeholder="https://api.deepseek.com/v1"
            spellCheck={false}
          />
        </label>
        <label className="block">
          <span className="label">API Key（只保存在本机）</span>
          <div className="relative mt-1">
            <input
              className="input pr-16 font-mono text-xs"
              type={showKey ? "text" : "password"}
              value={llm.apiKey}
              onChange={(event) => setLlm({ apiKey: event.target.value })}
              placeholder="sk-..."
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((value) => !value)}
              className="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-[11px] text-muted hover:bg-surface-2"
            >
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">文本模型</span>
            <input
              className="input mt-1 font-mono text-xs"
              value={llm.model}
              onChange={(event) => setLlm({ model: event.target.value })}
              placeholder="deepseek-chat"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="label">视觉模型（图片提问用）</span>
            <input
              className="input mt-1 font-mono text-xs"
              value={llm.visionModel}
              onChange={(event) => setLlm({ visionModel: event.target.value })}
              placeholder="gpt-4o-mini / glm-4v-flash"
              spellCheck={false}
            />
          </label>
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          图片提问优先使用视觉模型；留空则沿用文本模型（需要该模型本身支持图片输入，否则服务商会拒绝）。
          视觉模型需与上面的 Base URL / Key 属于同一服务商，例如 glm-4v-flash、gpt-4o-mini、Qwen2.5-VL。
        </p>
        <label className="block">
          <span className="label">向量模型（可选，用于真实命中）</span>
          <input
            className="input mt-1 font-mono text-xs"
            value={llm.embeddingModel}
            onChange={(event) => {
              setLlm({ embeddingModel: event.target.value });
              setEmbeddingResult(null);
            }}
            placeholder="text-embedding-3-small / BAAI/bge-m3 / embedding-3"
            spellCheck={false}
          />
          <span className="mt-1 block text-[11px] leading-relaxed text-muted">
            需要输出 1024 维（OpenAI 会自动传 dimensions=1024）。留空则命中与候选继续用关键词匹配。
            换模型后旧向量不会混用，需在「数据」页重建索引。
          </span>
        </label>
        <details className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
          <summary className="cursor-pointer text-[11px] text-muted">
            向量服务独立配置（可选，默认沿用上面的接口地址与 Key）
          </summary>
          <div className="details-body mt-2 space-y-2">
            <label className="block">
              <span className="label">向量 Base URL</span>
              <input
                className="input mt-1 font-mono text-xs"
                value={llm.embeddingBaseUrl}
                onChange={(event) => setLlm({ embeddingBaseUrl: event.target.value })}
                placeholder="留空沿用上方 Base URL"
                spellCheck={false}
              />
            </label>
            <label className="block">
              <span className="label">向量 API Key（只保存在本机）</span>
              <input
                className="input mt-1 font-mono text-xs"
                type="password"
                value={llm.embeddingApiKey}
                onChange={(event) => setLlm({ embeddingApiKey: event.target.value })}
                placeholder="留空沿用上方 API Key"
                autoComplete="off"
              />
            </label>
          </div>
        </details>
        <div>
          <span className="label">请求方式</span>
          <div
            className="segmented mt-2 w-full"
            data-count={2}
            data-index={llm.transport === "proxy" ? 0 : 1}
          >
            <button
              type="button"
              className="flex-1"
              data-active={llm.transport === "proxy"}
              onClick={() => setLlm({ transport: "proxy" })}
            >
              代理（推荐，避开 CORS）
            </button>
            <button
              type="button"
              className="flex-1"
              data-active={llm.transport === "direct"}
              onClick={() => setLlm({ transport: "direct" })}
            >
              浏览器直连
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            代理模式经本站 /api/llm/chat 转发，Key 不落库、不写日志；直连模式要求服务商允许跨域。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => void handleTest()}
          disabled={testing || llm.mode !== "real"}
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => void handleTestEmbedding()}
          disabled={testingEmbedding || !isEmbeddingConfigured(llm)}
        >
          {testingEmbedding ? "测试中…" : "测试向量"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={clearApiKey}>
          清除 Key
        </button>
      </div>

      {testResult ? (
        <p className={`text-xs ${testResult.ok ? "text-ok" : "text-danger"}`}>{testResult.message}</p>
      ) : null}
      {embeddingResult ? (
        <p
          className={`text-xs ${embeddingResult.ok ? "text-ok" : "text-danger"}`}
        >
          {embeddingResult.message}
        </p>
      ) : null}

      <div className="rounded-xl border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
        <p className="font-medium text-ink">关于 Key 的安全边界</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Key 只写入本机 localStorage，不会同步到云端，也不会出现在导出数据里。</li>
          <li>代理模式下 Key 随请求发给本站服务端转发给模型服务商，不保存、不记录日志。</li>
          <li>公共电脑上用完请点「清除 Key」；勾选演示脚本模式不会发出任何模型请求。</li>
        </ul>
      </div>
    </div>
  );
}

function AccountSection({ demo }: { demo: boolean }) {
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const signOut = useSessionStore((state) => state.signOut);
  const signIn = useSessionStore((state) => state.signIn);
  const bindAccount = useSessionStore((state) => state.bindAccount);
  const closeSettings = useUIStore((state) => state.closeSettings);
  const [mode, setMode] = useState<"bind" | "login">("bind");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
    hint?: string;
  } | null>(null);

  const handleBind = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await bindAccount(email.trim(), password);
      track(EVENTS.authBindRequested, { needsConfirm: true });
      setMessage({
        tone: "ok",
        text: "绑定邮件已发送：点击邮件里的链接完成绑定，之后换设备用邮箱密码登录即可。",
      });
      setEmail("");
      setPassword("");
    } catch (error) {
      const info = describeAuthError(error instanceof Error ? error.message : "绑定失败，请稍后重试");
      setMessage({ tone: "error", text: info.text, hint: info.hint });
      // 邮箱已注册时，直接把用户引导到"登录已有账号"。
      if (info.canLogin) setMode("login");
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await signIn(email.trim(), password);
      track(EVENTS.authLogin, { via: "settings" });
      toast("登录成功，正在同步云端数据…", "success");
      setEmail("");
      setPassword("");
      closeSettings();
    } catch (error) {
      const info = describeAuthError(error instanceof Error ? error.message : "登录失败");
      setMessage({ tone: "error", text: info.text, hint: info.hint });
    } finally {
      setBusy(false);
    }
  };

  if (demo) {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs leading-relaxed text-muted">
        当前是演示模式：没有真实账号，也不会写入云端。配置 Supabase 后即可使用「匿名游客 + 邮箱绑定」。
      </div>
    );
  }

  if (!user) {
    return <p className="text-xs text-muted">账号尚未就绪。</p>;
  }

  if (!user.isAnonymous) {
    return (
      <div className="space-y-4">
        <div className="card p-4">
          <p className="label">已绑定账号</p>
          <p className="mt-1 text-sm text-ink">{user.email}</p>
          <p className="mt-1 text-[11px] text-muted">
            三端登录同一账号即可看到同一份知识图谱与对话记录。
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => {
            void signOut();
            router.push("/");
          }}
        >
          退出登录
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="segmented w-full"
        data-count={2}
        data-index={mode === "bind" ? 0 : 1}
      >
        <button
          type="button"
          className="flex-1"
          data-active={mode === "bind"}
          onClick={() => {
            setMode("bind");
            setMessage(null);
          }}
        >
          绑定游客账号
        </button>
        <button
          type="button"
          className="flex-1"
          data-active={mode === "login"}
          onClick={() => {
            setMode("login");
            setMessage(null);
          }}
        >
          登录已有账号
        </button>
      </div>

      {mode === "bind" ? (
        <div className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-[11px] leading-relaxed text-warn">
          当前是游客账号：数据已经保存在云端，但换设备/清浏览器缓存前请先绑定邮箱，否则会失去访问入口。
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
          用绑定过的邮箱密码登录，会切换到该账号的云端数据；当前游客账号的数据不会合并进来。
        </div>
      )}

      <form className="space-y-3" onSubmit={mode === "bind" ? handleBind : handleLogin}>
        <label className="block">
          <span className="label">{mode === "bind" ? "绑定邮箱" : "邮箱"}</span>
          <input
            className="input mt-1"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="label">{mode === "bind" ? "设置密码" : "密码"}</span>
          <input
            className="input mt-1"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 6 位"
          />
        </label>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "请稍候…" : mode === "bind" ? "绑定并发送确认邮件" : "登录"}
        </button>
      </form>

      {message ? (
        <div className="space-y-1">
          <p className={`text-xs ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>
            {message.text}
          </p>
          {message.hint ? <p className="text-[11px] text-muted">{message.hint}</p> : null}
        </div>
      ) : null}

      <p className="text-[11px] text-muted">
        {mode === "bind" ? (
          <>
            已经有账号了？
            <button type="button" className="text-accent hover:underline" onClick={() => setMode("login")}>
              直接登录
            </button>
          </>
        ) : (
          <>
            没有账号？
            <button type="button" className="text-accent hover:underline" onClick={() => setMode("bind")}>
              以游客身份继续并绑定
            </button>
          </>
        )}
      </p>

      <button type="button" className="btn-ghost w-full" onClick={() => void signOut()}>
        退出登录
      </button>
    </div>
  );
}

function DataSection() {
  const nodes = useGraphStore((state) => state.nodes);
  const relations = useGraphStore((state) => state.relations);
  const sources = useGraphStore((state) => state.sources);
  const messages = useChatStore((state) => state.messages);
  const loading = useGraphStore((state) => state.loading);
  const seedExample = useGraphStore((state) => state.seedExample);
  const clearGraph = useGraphStore((state) => state.clearGraph);
  const refresh = useGraphStore((state) => state.refresh);
  const clearChat = useChatStore((state) => state.clear);
  const exportJson = useGraphStore((state) => state.exportJson);
  const llm = useSettingsStore((state) => state.llm);
  const [busy, setBusy] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);

  const stats = useMemo(() => {
    const inbox = nodes.filter((node) => node.status === "inbox").length;
    const subjects = new Set(nodes.filter((node) => !node.parentId).map((node) => node.id)).size;
    return { total: nodes.length, inbox, subjects, relations: relations.length, sources: sources.length, messages: messages.length };
  }, [nodes, relations, sources, messages]);

  const run = async (action: () => Promise<void>, successText: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast(successText, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zhimy-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("已导出 JSON 备份", "success");
    track(EVENTS.graphExported, { nodes: nodes.length, relations: relations.length });
  };

  const embeddingReady = isEmbeddingConfigured(llm);

  const handleBackfill = async () => {
    if (backfilling) return;
    if (!embeddingReady) {
      toast("先在「模型」页填写向量模型与 Key，再重建索引", "info");
      return;
    }
    const pending = nodes.length;
    if (
      !window.confirm(
        `将为缺少向量的知识点生成 embedding：当前图谱最多 ${pending} 个节点（已是最新向量的会跳过），每个节点会产生一次向量接口调用（少量费用）。继续？`,
      )
    ) {
      return;
    }
    setBackfilling(true);
    setProgress({ done: 0, total: pending, embedded: 0, failed: 0 });
    try {
      const result = await backfillEmbeddings({
        llm,
        onProgress: (next) => setProgress(next),
      });
      if (result.failed > 0) {
        toast(`向量索引已更新：成功 ${result.embedded}，失败 ${result.failed}`, "info");
      } else if (result.embedded === 0) {
        toast("所有知识点已是最新向量，无需重建", "info");
      } else {
        toast(`向量索引已更新：${result.embedded} 个节点`, "success");
      }
      track(EVENTS.embeddingBackfill, {
        embedded: result.embedded,
        skipped: result.skipped,
        failed: result.failed,
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : "重建向量索引失败", "error");
    } finally {
      setBackfilling(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="知识点" value={stats.total} />
        <Stat label="待处理" value={stats.inbox} />
        <Stat label="关系" value={stats.relations} />
      </div>

      <div className="space-y-2">
        <button type="button" className="btn-ghost w-full justify-start" onClick={handleExport}>
          <Icon name="download" size={16} /> 导出 JSON 备份
        </button>
        <button
          type="button"
          className="btn-ghost w-full justify-start"
          onClick={() =>
            void run(async () => {
              await seedExample();
              track(EVENTS.graphSeeded, { source: "settings" });
            }, "已载入示例图谱")
          }
          disabled={busy || loading}
        >
          <Icon name="spark" size={16} /> 载入示例图谱（物理 · 化学）
        </button>
        <button
          type="button"
          className="btn-ghost w-full justify-start"
          onClick={() => void run(refresh, "已从云端刷新")}
          disabled={busy || loading}
        >
          <Icon name="refresh" size={16} /> 从云端刷新
        </button>
        <button
          type="button"
          className="btn-ghost w-full justify-start"
          onClick={() => void handleBackfill()}
          disabled={busy || loading || backfilling || !embeddingReady}
          title={embeddingReady ? undefined : "先在「模型」页配置向量模型"}
        >
          <Icon name="spark" size={16} />
          {backfilling
            ? `生成向量中… ${progress?.done ?? 0}/${progress?.total ?? stats.total}`
            : "重建向量索引"}
        </button>
        <button
          type="button"
          className="btn-danger w-full justify-start"
          onClick={() => {
            if (!window.confirm("确定清空当前账号的全部知识点与关系？此操作不可撤销。")) return;
            void run(async () => {
              await clearGraph();
              track(EVENTS.graphCleared);
            }, "已清空图谱");
          }}
          disabled={busy || loading}
        >
          <Icon name="close" size={16} /> 清空我的图谱
        </button>
        <button
          type="button"
          className="btn-ghost w-full justify-start"
          onClick={() => {
            if (!window.confirm("确定清空全部对话记录？所有会话都会被删除，图谱不受影响。")) return;
            void run(clearChat, "已清空对话");
          }}
          disabled={busy}
        >
          <Icon name="chat" size={16} /> 清空对话记录
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        数据保存在你的 Supabase 账号下（行级权限隔离），清除浏览器缓存或换设备不会丢失；
        建议定期使用「导出 JSON 备份」留一份副本。向量索引用于「同一个知识点换种问法也能命中」；
        未配置向量模型时命中与候选会自动退回关键词匹配。
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3 text-center">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
