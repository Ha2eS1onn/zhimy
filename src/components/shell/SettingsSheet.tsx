"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LLM_PRESETS } from "@/lib/ai/types";
import { testConnection } from "@/lib/ai/llmClient";
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
      <div className="segmented mb-4 w-full">
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

      {tab === "llm" ? <LlmSection /> : null}
      {tab === "account" ? <AccountSection demo={demo} /> : null}
      {tab === "data" ? <DataSection /> : null}
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

  const applyPreset = (presetId: string) => {
    const preset = LLM_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setLlm({
      baseUrl: preset.baseUrl,
      model: preset.model,
      visionModel: preset.visionModel ?? "",
      mode: "real",
    });
    setTestResult(null);
  };

  const handleTest = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await testConnection(llm);
      setTestResult({ ok: true, message: `连接成功：${reply || "模型已响应"}` });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "连接失败",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="label">回答模式</p>
        <div className="segmented mt-2 w-full">
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
        <div className="grid grid-cols-2 gap-3">
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
            <span className="label">视觉模型（可选）</span>
            <input
              className="input mt-1 font-mono text-xs"
              value={llm.visionModel}
              onChange={(event) => setLlm({ visionModel: event.target.value })}
              placeholder="gpt-4o-mini"
              spellCheck={false}
            />
          </label>
        </div>
        <div>
          <span className="label">请求方式</span>
          <div className="segmented mt-2 w-full">
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
        <button type="button" className="btn-ghost btn-sm" onClick={clearApiKey}>
          清除 Key
        </button>
      </div>

      {testResult ? (
        <p className={`text-xs ${testResult.ok ? "text-ok" : "text-danger"}`}>{testResult.message}</p>
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
  const bindAccount = useSessionStore((state) => state.bindAccount);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const handleBind = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await bindAccount(email.trim(), password);
      setMessage({
        tone: "ok",
        text: "绑定邮件已发送：点击邮件里的链接完成绑定，之后换设备用邮箱密码登录即可。",
      });
      setEmail("");
      setPassword("");
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "绑定失败，请稍后重试",
      });
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
      <div className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-[11px] leading-relaxed text-warn">
        当前是游客账号：数据已经保存在云端，但换设备/清浏览器缓存前请先绑定邮箱，否则会失去访问入口。
      </div>
      <form className="space-y-3" onSubmit={handleBind}>
        <label className="block">
          <span className="label">绑定邮箱</span>
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
          <span className="label">设置密码</span>
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
          {busy ? "提交中…" : "绑定并发送确认邮件"}
        </button>
      </form>
      {message ? (
        <p className={`text-xs ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
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
  const [busy, setBusy] = useState(false);

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
          onClick={() => void run(seedExample, "已载入示例图谱")}
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
          className="btn-danger w-full justify-start"
          onClick={() => {
            if (!window.confirm("确定清空当前账号的全部知识点与关系？此操作不可撤销。")) return;
            void run(clearGraph, "已清空图谱");
          }}
          disabled={busy || loading}
        >
          <Icon name="close" size={16} /> 清空我的图谱
        </button>
        <button
          type="button"
          className="btn-ghost w-full justify-start"
          onClick={() => {
            if (!window.confirm("确定清空对话记录？图谱不受影响。")) return;
            void run(clearChat, "已清空对话");
          }}
          disabled={busy}
        >
          <Icon name="chat" size={16} /> 清空对话记录
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        数据保存在你的 Supabase 账号下（行级权限隔离），清除浏览器缓存或换设备不会丢失；
        建议定期使用「导出 JSON 备份」留一份副本。
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
