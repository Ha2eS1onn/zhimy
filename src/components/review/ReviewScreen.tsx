"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MintyIllustration } from "@/components/common/MintyIllustration";
import { MarkdownLite } from "@/components/node/MarkdownLite";
import { Icon } from "@/components/shell/Icon";
import { EVENTS, track } from "@/lib/analytics";
import { formatDateTime } from "@/lib/format";
import { buildPath } from "@/lib/path";
import { buildReviewQueue } from "@/lib/review/schedule";
import { useGraphStore } from "@/store/graphStore";
import { useReviewStore } from "@/store/reviewStore";
import { toast } from "@/store/toastStore";
import type { ReviewGrade } from "@/types";

const GRADES: Array<{ grade: ReviewGrade; label: string; hint: string; className: string }> = [
  { grade: "again", label: "忘记", hint: "10 分钟后", className: "btn-ghost btn-sm" },
  { grade: "hard", label: "困难", hint: "至少 1 天", className: "btn-ghost btn-sm" },
  { grade: "good", label: "一般", hint: "按掌握度", className: "btn-primary btn-sm" },
  { grade: "easy", label: "简单", hint: "更久一些", className: "btn-ghost btn-sm" },
];

function currentTime(): number {
  return Date.now();
}

export function ReviewScreen() {
  const nodes = useGraphStore((state) => state.nodes);
  const graphLoading = useGraphStore((state) => state.loading);
  const states = useReviewStore((state) => state.states);
  const loading = useReviewStore((state) => state.loading);
  const loadedFor = useReviewStore((state) => state.loadedFor);
  const error = useReviewStore((state) => state.error);
  const grade = useReviewStore((state) => state.grade);
  const enqueueMany = useReviewStore((state) => state.enqueueMany);

  const [now, setNow] = useState(() => currentTime());
  const [showAnswer, setShowAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [againCount, setAgainCount] = useState(0);
  const shownRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(currentTime()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const queue = useMemo(
    () => buildReviewQueue(nodes, Object.values(states), new Date(now)),
    [nodes, states, now],
  );
  const current = queue[0] ?? null;
  const total = Object.keys(states).length;
  const pathText = current ? buildPath(nodes, current.node.id).map((item) => item.title).join(" / ") : "";

  useEffect(() => {
    if (queue.length === 0 || shownRef.current) return;
    shownRef.current = true;
    track(EVENTS.reviewDueShown, { count: queue.length });
  }, [queue.length]);

  const nextDue = useMemo(() => {
    const due = Object.values(states)
      .map((state) => new Date(state.dueAt).getTime())
      .filter((time) => time > now)
      .sort((a, b) => a - b)[0];
    return due ? formatDateTime(new Date(due).toISOString()) : null;
  }, [states, now]);

  const handleGrade = async (value: ReviewGrade) => {
    if (!current || busy) return;
    const isLast = queue.length === 1;
    setBusy(true);
    try {
      const next = await grade(current.node.id, value);
      const nextReviewed = reviewed + 1;
      const nextAgain = againCount + (value === "again" ? 1 : 0);
      setReviewed(nextReviewed);
      setAgainCount(nextAgain);
      track(EVENTS.reviewGraded, {
        grade: value,
        interval_days: Number(next.intervalDays.toFixed(3)),
      });
      if (isLast) {
        track(EVENTS.reviewCompleted, { reviewed: nextReviewed, again: nextAgain });
      }
      setShowAnswer(false);
      setNow(currentTime());
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存复习记录失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleEnqueueRecent = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ids = [...nodes]
        .filter((node) => node.status === "active")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 10)
        .map((node) => node.id);
      const added = await enqueueMany(ids);
      track(EVENTS.reviewEnqueued, { count: added, source: "bulk" });
      if (added > 0) {
        toast(`已加入 ${added} 个知识点`, "success");
      } else {
        toast("这些知识点已经在复习里了", "info");
      }
      setNow(currentTime());
    } catch (error) {
      toast(error instanceof Error ? error.message : "加入复习失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const booting =
    loading ||
    (loadedFor === null && error === null) ||
    (graphLoading && nodes.length === 0);

  return (
    <div className="page-scroll">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">复习 · 间隔重复</p>
            <h1 className="page-title mt-3">
              今天，<span className="highlight">巩固</span>一下
            </h1>
            <p className="page-subtitle mt-2">到期的知识点会出现在这里，评完就排下一次。</p>
          </div>
          <span className="chip">待复习 {queue.length}</span>
        </header>

        {error ? (
          <section className="card mt-6 p-6 text-center">
            <MintyIllustration variant="error" className="mx-auto h-20 w-36" />
            <p className="mt-3 text-sm font-[750] text-ink">复习状态加载失败</p>
            <p className="mt-1 text-xs text-muted">{error}</p>
            <button
              type="button"
              className="btn-primary btn-sm mt-4"
              onClick={() => window.location.reload()}
            >
              重试
            </button>
          </section>
        ) : booting ? (
          <section className="card mt-6 p-8 text-center text-sm text-muted">
            正在准备复习队列…
          </section>
        ) : current ? (
          <section className="card mt-6 p-5 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted">{pathText || "未归位"}</p>
                <h2 className="mt-1 text-2xl font-[750] leading-[1.24] tracking-[-0.03em] text-ink">
                  {current.node.title}
                </h2>
              </div>
              <span className="chip shrink-0">
                掌握度 {Math.round(current.state.mastery * 100)}%
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-muted">
              {current.node.summary || "暂无摘要。"}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setShowAnswer((value) => !value)}
              >
                {showAnswer ? "收起讲解" : "显示讲解"}
              </button>
              <Link href={`/node/${current.node.id}`} className="btn-ghost btn-sm">
                打开详情 <Icon name="arrow-right" size={13} />
              </Link>
            </div>

            {showAnswer ? (
              current.node.detail.trim() ? (
                <div className="mt-4 rounded-[18px] border border-line bg-shell p-4">
                  <MarkdownLite markdown={current.node.detail} />
                </div>
              ) : (
                <p className="mt-4 rounded-[18px] border border-dashed border-line bg-shell px-4 py-6 text-center text-xs text-muted">
                  这个知识点还没有讲解，去详情页生成或补一段。
                </p>
              )
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((item) => (
                <button
                  key={item.grade}
                  type="button"
                  className={`${item.className} min-h-14 flex-col gap-0.5`}
                  disabled={busy}
                  onClick={() => void handleGrade(item.grade)}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] font-normal opacity-70">{item.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">
              评级后按间隔安排下一次复习
            </p>
          </section>
        ) : (
          <section className="card mt-6 px-5 py-10 text-center">
            <MintyIllustration variant="graph" className="mx-auto h-24 w-44" />
            <p className="mt-4 text-sm font-[750] text-ink">
              {total === 0 ? "还没有加入复习的知识点" : "今天没有到期的卡片"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {total === 0
                ? "把最近收编的知识点加入复习，开始第一轮间隔重复。"
                : nextDue
                  ? `下一张将在 ${nextDue} 到期。`
                  : "去知识库补充几个知识点吧。"}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {total === 0 ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => void handleEnqueueRecent()}
                  disabled={busy || nodes.length === 0}
                >
                  加入最近 10 个
                </button>
              ) : null}
              <Link href="/atlas" className="btn-ghost btn-sm">
                去知识库
              </Link>
              <Link href="/chat" className="btn-ghost btn-sm">
                去提问
              </Link>
            </div>
          </section>
        )}

        {reviewed > 0 ? (
          <p className="mt-4 text-center text-xs text-muted">
            本次已复习 {reviewed} 张
            {againCount > 0 ? `，其中 ${againCount} 张需要再来一次` : ""}。
          </p>
        ) : null}
      </div>
    </div>
  );
}
