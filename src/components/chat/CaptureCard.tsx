"use client";

import { useMemo, useState } from "react";
import { PositionPicker } from "@/components/common/PositionPicker";
import { buildPath } from "@/lib/path";
import { RELATION_META } from "@/lib/relations";
import { useChatStore } from "@/store/chatStore";
import { useGraphStore } from "@/store/graphStore";
import { toast } from "@/store/toastStore";
import type { Suggestion, SuggestionRelation } from "@/types";
import { Icon } from "../shell/Icon";

interface CaptureCardProps {
  suggestion: Suggestion;
  messageId: string;
}

/** 收编卡片（方案 §3.6）：名称、摘要、建议路径、建议关联、来源与三个操作。 */
export function CaptureCard({ suggestion, messageId }: CaptureCardProps) {
  const nodes = useGraphStore((state) => state.nodes);
  const adopt = useGraphStore((state) => state.adopt);
  const updateSuggestion = useChatStore((state) => state.updateSuggestion);

  const [title, setTitle] = useState(suggestion.title);
  const [summary, setSummary] = useState(suggestion.summary);
  const [parentId, setParentId] = useState<string | null>(suggestion.suggestedParentId);
  const [relations, setRelations] = useState<SuggestionRelation[]>(suggestion.relations);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confidence = Math.round(suggestion.confidence * 100);
  const lowConfidence = suggestion.confidence < 0.75;

  const pathPreview = useMemo(() => {
    const parentPath = parentId ? buildPath(nodes, parentId).map((node) => node.title) : [];
    return [...parentPath, title || "未命名知识点"].join(" / ");
  }, [nodes, parentId, title]);

  if (suggestion.status === "dismissed") {
    return (
      <div className="rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-xs text-muted">
        这次不收：{suggestion.title}
      </div>
    );
  }

  if (suggestion.status === "adopted") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-ink">
          <Icon name="check" size={14} className="text-accent" />
          已收编：{title}
          {lowConfidence ? <span className="text-warn">· 待归位</span> : null}
        </span>
        <a
          href={`/atlas?node=${suggestion.adoptedNodeId ?? parentId ?? ""}`}
          className="btn-subtle btn-sm"
        >
          在知识库中查看
        </a>
      </div>
    );
  }

  const handleAdopt = async () => {
    if (busy) return;
    if (!title.trim()) {
      toast("知识点名称不能为空", "error");
      return;
    }
    setBusy(true);
    try {
      const keptRelations = relations.filter((relation) => Boolean(relation.targetNodeId));
      const { nodeId, status } = await adopt({
        suggestion: { ...suggestion, relations: keptRelations },
        parentId,
        title,
        summary,
      });
      await updateSuggestion(messageId, suggestion.id, {
        status: "adopted",
        adoptedNodeId: nodeId,
        title: title.trim(),
        summary: summary.trim(),
        suggestedParentId: parentId,
        relations: keptRelations,
      });
      toast(
        status === "inbox" ? "已收下，但还差一步归位" : "已收编进知识图谱",
        status === "inbox" ? "info" : "success",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "收编失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateSuggestion(messageId, suggestion.id, { status: "dismissed" });
      toast("这次不收，已忽略", "info");
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor={`title-${suggestion.id}`}>
            知识点名称
          </label>
          <input
            id={`title-${suggestion.id}`}
            className="mt-1 w-full rounded-lg border border-transparent bg-transparent py-1 text-sm font-medium text-ink outline-none hover:border-line focus:border-accent/60 focus:bg-surface-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <span
          className={`chip shrink-0 ${
            lowConfidence ? "border-warn/40 text-warn" : "border-accent/40 text-accent"
          }`}
          title="AI 对这次归位的置信度"
        >
          {confidence}%
        </span>
      </div>

      <label className="mt-2 block">
        <span className="label">一句话摘要</span>
        <textarea
          className="mt-1 w-full resize-none rounded-lg border border-transparent bg-transparent py-1 text-xs leading-relaxed text-muted outline-none hover:border-line focus:border-accent/60 focus:bg-surface-2"
          rows={2}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>

      <div className="mt-2 rounded-lg bg-surface-2/70 px-2.5 py-2">
        <p className="flex items-center gap-1 text-[11px] text-muted">
          <Icon name="atlas" size={12} /> 建议路径
        </p>
        <p className="mt-0.5 break-all text-xs text-ink">{pathPreview}</p>
      </div>

      {relations.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {relations.map((relation, index) => {
            const meta = RELATION_META[relation.type];
            return (
              <button
                key={`${relation.type}-${relation.targetTitle}-${index}`}
                type="button"
                onClick={() => setRelations((items) => items.filter((_, idx) => idx !== index))}
                className="chip hover:text-danger"
                title="点击取消这条建议关联"
              >
                <span style={{ color: meta.color }}>{meta.label}</span>
                {relation.targetTitle}
                <span className="text-muted">✕</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="mt-2 text-[11px] text-muted">
        {lowConfidence
          ? "置信度较低：收下后会先进入待处理，稍后可以再归位。"
          : "来源：本次对话 · 可编辑名称与摘要后再收编。"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={() => void handleAdopt()} disabled={busy}>
          收编
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setPickerOpen(true)} disabled={busy}>
          换个位置
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void handleDismiss()} disabled={busy}>
          这次不收
        </button>
      </div>

      <PositionPicker
        open={pickerOpen}
        nodes={nodes}
        currentParentId={parentId}
        onClose={() => setPickerOpen(false)}
        onSelect={(nextParentId) => setParentId(nextParentId)}
      />
    </div>
  );
}
