"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PositionPicker } from "@/components/common/PositionPicker";
import { MintyIllustration } from "@/components/common/MintyIllustration";
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
  const [showMore, setShowMore] = useState(false);

  const nodes = useGraphStore((state) => state.nodes);
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
          <p className="eyebrow" suppressHydrationWarning>
            {greeting} · 继续生长
          </p>
          <h1 className="page-title mt-3">
            今天，想<span className="highlight">弄懂</span>什么？
          </h1>
          <p className="page-subtitle hidden sm:block">把问题留下来，把知识放回原位。</p>
        </div>
        {user ? (
          <button
            type="button"
            onClick={() => openSettings("account")}
            className={`chip hidden sm:inline-flex ${user.isAnonymous ? "text-warn" : ""}`}
            title="账号设置"
          >
            <Icon name="user" size={13} />
            {user.isAnonymous ? "游客 · 去绑定" : (user.email ?? "已绑定")}
          </button>
        ) : null}
      </header>

      <form
        className="ask-box card mt-7 flex items-center gap-3 rounded-[24px] p-2 pl-5"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <Icon name="spark" size={18} className="shrink-0 text-accent" />
        <input
          aria-label="输入问题"
          className="min-h-11 min-w-0 flex-1 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted"
          placeholder="拍题、追问，或输入一个知识点"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" className="btn-primary btn-sm shrink-0">
          问 AI
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((item) => (
          <button key={item} type="button" className="chip" onClick={() => ask(item)}>
            {item}
          </button>
        ))}
      </div>

      <section className="card mt-5 grid grid-cols-3 divide-x divide-line overflow-hidden">
        <StatCard label="待处理" value={derived.inbox.length} href="/chat" />
        <StatCard label="知识点" value={derived.active.length} href="/atlas" />
        <StatCard label="学科" value={derived.subjects.length} href="/atlas" />
      </section>

      {nodes.length === 0 && !loading ? (
        <section className="card mt-4 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <MintyIllustration variant="graph" className="h-16 w-28 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink">图谱还是一张白纸</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">先问一个问题，或载入示例看看知识如何长出来。</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                void seedExample()
                  .then(() => toast("已载入示例图谱", "success"))
                  .catch((error) => toast(error instanceof Error ? error.message : "载入失败", "error"));
              }}
            >
              载入示例
            </button>
            <Link href="/chat" className="btn-ghost btn-sm">
              去提问
            </Link>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="btn-ghost mt-3 w-full justify-between lg:hidden"
        aria-expanded={showMore}
        aria-controls="home-details"
        onClick={() => setShowMore((value) => !value)}
      >
        <span>{showMore ? "收起" : "整理与回顾"}</span>
        <Icon
          name="chevron-down"
          size={16}
          className={`transition-transform duration-200 ease-[var(--ease-standard)] ${showMore ? "rotate-180" : ""}`}
        />
      </button>

      <div id="home-details" className={`${showMore ? "block" : "hidden"} motion-reveal lg:block`}>
      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <section className="card self-start p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-[750] tracking-[-0.02em] text-ink">待处理</h2>
            <span className="text-[11px] text-muted">{derived.inbox.length}</span>
          </div>
          {derived.inbox.length === 0 ? (
            <p className="py-7 text-center text-xs text-muted">暂无待处理</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {derived.inbox.map((node) => {
                const path = buildPath(nodes, node.id).slice(0, -1);
                return (
                  <li
                    key={node.id}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{node.title}</p>
                      <p className="truncate text-[11px] text-muted">
                        {path.length > 0 ? path.map((item) => item.title).join(" / ") : "未归位"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" className="btn-subtle btn-sm" onClick={() => setPickerNode(node)}>
                        归位
                      </button>
                      <Link href="/chat" className="btn-ghost btn-sm">
                        对话
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card self-start p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-[750] tracking-[-0.02em] text-ink">最近收编</h2>
            <Link href="/atlas" className="text-link text-xs">
              全部
            </Link>
          </div>
          {derived.recent.length === 0 ? (
            <p className="py-7 text-center text-xs text-muted">暂无记录</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {derived.recent.map((node) => (
                <li key={node.id}>
                  <Link
                    href={`/atlas?node=${node.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
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
        </section>
      </div>
      </div>

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
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-3 transition-colors hover:bg-surface-2"
    >
      <span className="text-xl font-[750] tabular-nums tracking-[-0.03em] text-ink md:text-2xl">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </Link>
  );
}
