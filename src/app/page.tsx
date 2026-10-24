"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PositionPicker } from "@/components/common/PositionPicker";
import { Icon } from "@/components/shell/Icon";
import { buildPath, pathLabel } from "@/lib/path";
import { useGraphStore } from "@/store/graphStore";
import { useSessionStore } from "@/store/sessionStore";
import { toast } from "@/store/toastStore";
import { useUIStore } from "@/store/uiStore";
import type { KnowledgeNode } from "@/types";

const QUICK_QUESTIONS = ["电阻并联怎么算？", "浮力怎么理解？", "化学方程式怎么配平？"];

function greetingFor(hour: number): string {
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export default function HomePage() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [greeting] = useState(() =>
    typeof window === "undefined" ? "你好" : greetingFor(new Date().getHours()),
  );
  const [pickerNode, setPickerNode] = useState<KnowledgeNode | null>(null);

  const nodes = useGraphStore((state) => state.nodes);
  const relations = useGraphStore((state) => state.relations);
  const loading = useGraphStore((state) => state.loading);
  const seedExample = useGraphStore((state) => state.seedExample);
  const reparent = useGraphStore((state) => state.reparent);
  const setStatus = useGraphStore((state) => state.setStatus);
  const createPath = useGraphStore((state) => state.createPath);
  const user = useSessionStore((state) => state.user);
  const openSettings = useUIStore((state) => state.openSettings);

  const derived = useMemo(() => {
    const active = nodes.filter((node) => node.status === "active");
    const inbox = nodes.filter((node) => node.status === "inbox");
    const subjects = nodes.filter((node) => !node.parentId && node.status === "active");
    const recent = [...active]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 3);
    return { active, inbox, subjects, recent };
  }, [nodes]);

  const ask = (text: string) => {
    const value = text.trim();
    router.push(value ? `/chat?q=${encodeURIComponent(value)}` : "/chat");
  };

  const handleFile = async (node: KnowledgeNode, parentId: string | null) => {
    try {
      await reparent(node.id, parentId);
      if (node.status === "inbox") await setStatus(node.id, "active");
      toast(`已归位：${pathLabel(useGraphStore.getState().nodes, node.id)}`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "归位失败", "error");
    }
  };

  return (
    <div className="page-scroll">
      <div className="page-wrap">
        <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted" suppressHydrationWarning>
            {greeting}，欢迎回到知脉
          </p>
          <h1 className="page-title mt-1">今天想弄懂什么？</h1>
          <p className="page-subtitle">提问、收编、归位——每个知识点都会在知识地图里有一个位置。</p>
        </div>
        {user ? (
          <button
            type="button"
            onClick={() => openSettings("account")}
            className={`chip ${user.isAnonymous ? "border-warn/40 text-warn" : ""}`}
            title="账号设置"
          >
            <Icon name="user" size={13} />
            {user.isAnonymous ? "游客账号 · 绑定防丢" : (user.email ?? "已绑定")}
          </button>
        ) : null}
      </header>

      <form
        className="card mt-6 flex items-center gap-2 p-2 pl-4"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <Icon name="spark" size={18} className="shrink-0 text-accent" />
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-muted/70"
          placeholder="拍题、追问，或者直接输入一个知识点…"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" className="btn-primary btn-sm shrink-0">
          问 AI
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((item) => (
          <button key={item} type="button" className="chip hover:text-ink" onClick={() => ask(item)}>
            {item}
          </button>
        ))}
      </div>

      <section className="mt-6 grid grid-cols-3 gap-3">
        <StatCard label="待处理" value={derived.inbox.length} hint="收下但还没归位" href="/chat" />
        <StatCard label="知识点" value={derived.active.length} hint="已经收编进图谱" href="/atlas" />
        <StatCard label="学科" value={derived.subjects.length} hint="图谱顶层分支" href="/atlas" />
      </section>

      {nodes.length === 0 && !loading ? (
        <section className="card mt-6 p-6 text-center">
          <p className="text-sm font-medium text-ink">你的知识图谱还是空的</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
            先载入一份示例图谱看看 3D 知识库长什么样，或者直接去对话页问一道题——AI 会帮你把知识点收编进来。
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                void seedExample()
                  .then(() => toast("已载入示例图谱", "success"))
                  .catch((error) => toast(error instanceof Error ? error.message : "载入失败", "error"));
              }}
            >
              载入示例图谱
            </button>
            <Link href="/chat" className="btn-ghost">
              去对话提问
            </Link>
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="card self-start p-4 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="panel-title text-sm">待处理</h2>
            <span className="text-[11px] text-muted">{derived.inbox.length} 个知识点等待归位</span>
          </div>
          {derived.inbox.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">没有待处理的知识点，收编时会自动归位或进入这里。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {derived.inbox.map((node) => {
                const path = buildPath(nodes, node.id).slice(0, -1);
                return (
                  <li
                    key={node.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{node.title}</p>
                      <p className="truncate text-[11px] text-muted">
                        {path.length > 0 ? path.map((item) => item.title).join(" / ") : "尚未选择位置"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" className="btn-subtle btn-sm" onClick={() => setPickerNode(node)}>
                        归位
                      </button>
                      <Link href="/chat" className="btn-ghost btn-sm">
                        去处理
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card self-start p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="panel-title text-sm">最近收编</h2>
            <Link href="/atlas" className="text-[11px] text-muted hover:text-ink">
              打开知识库
            </Link>
          </div>
          {derived.recent.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">还没有收编记录，去对话页试试。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {derived.recent.map((node) => (
                <li key={node.id}>
                  <Link
                    href={`/atlas?node=${node.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 hover:border-accent/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{node.title}</p>
                      <p className="truncate text-[11px] text-muted">{pathLabel(nodes, node.id)}</p>
                    </div>
                    <Icon name="arrow-right" size={14} className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center text-[11px] text-muted">
            <span>节点 {nodes.length}</span>
            <span>关系 {relations.length}</span>
            <span>学科 {derived.subjects.length}</span>
          </div>
        </section>
      </div>

      <section className="mt-6 grid gap-2 sm:grid-cols-3">
        <Link href="/chat" className="btn-ghost justify-start">
          <Icon name="camera" size={16} /> 拍题提问
        </Link>
        <Link href="/atlas" className="btn-ghost justify-start">
          <Icon name="atlas" size={16} /> 打开知识库
        </Link>
        <button
          type="button"
          className="btn-ghost justify-start"
          onClick={() => {
            if (derived.inbox.length === 0) {
              toast("当前没有待处理的知识点", "info");
              return;
            }
            setPickerNode(derived.inbox[0]!);
          }}
        >
          <Icon name="check" size={16} /> 整理待处理
        </button>
      </section>

      <PositionPicker
        open={pickerNode !== null}
        nodes={nodes}
        currentParentId={pickerNode?.parentId ?? null}
        excludeId={pickerNode?.id ?? null}
        onCreatePath={(segments, options) =>
          createPath(segments, options).then((result) => result.leafId)
        }
        onClose={() => setPickerNode(null)}
        onSelect={(parentId) => {
          const node = pickerNode;
          if (!node) return;
          void handleFile(node, parentId);
        }}
      />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="card flex flex-col gap-1 p-4 transition-colors hover:border-accent/40"
    >
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-semibold text-ink">{value}</span>
      <span className="text-[11px] text-muted">{hint}</span>
    </Link>
  );
}
