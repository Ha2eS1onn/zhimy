"use client";

import Link from "next/link";
import { useState } from "react";
import { LocalThumbnail } from "@/components/common/LocalThumbnail";
import { PositionPicker } from "@/components/common/PositionPicker";
import { formatDateTime, formatRelative } from "@/lib/format";
import { buildPath } from "@/lib/path";
import { relationsOf } from "@/lib/relations";
import { useChatStore } from "@/store/chatStore";
import { useGraphStore } from "@/store/graphStore";
import { toast } from "@/store/toastStore";
import type { KnowledgeNode, NodeSource, Relation, Source } from "@/types";
import { Icon } from "../shell/Icon";
import { RelationEditor } from "./RelationEditor";
import { RelationList } from "./RelationList";
import { RelationSuggestions } from "./RelationSuggestions";

interface AtlasPanelProps {
  node: KnowledgeNode;
  nodes: KnowledgeNode[];
  relations: Relation[];
  sources: Source[];
  nodeSources: NodeSource[];
  hiddenChildren: number;
  expanded: boolean;
  animateEnter: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onToggleExpand: () => void;
}

/** 知识点详情：位置、来源、命中记录、正文入口与可编辑信息。 */
export function AtlasPanel({
  node,
  nodes,
  relations,
  sources,
  nodeSources,
  hiddenChildren,
  expanded,
  animateEnter,
  onClose,
  onSelect,
  onToggleExpand,
}: AtlasPanelProps) {
  const messages = useChatStore((state) => state.messages);
  const updateDetails = useGraphStore((state) => state.updateDetails);
  const reparent = useGraphStore((state) => state.reparent);
  const setStatus = useGraphStore((state) => state.setStatus);
  const clearManualPosition = useGraphStore((state) => state.clearManualPosition);
  const createPath = useGraphStore((state) => state.createPath);

  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(node.title);
  const [summaryDraft, setSummaryDraft] = useState(node.summary);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [relationEditorOpen, setRelationEditorOpen] = useState(false);

  const path = buildPath(nodes, node.id);
  const children = nodes.filter((item) => item.parentId === node.id);
  const relatedCount = relationsOf(relations, node.id).length;
  const sourceIds = new Set(
    nodeSources.filter((link) => link.nodeId === node.id).map((link) => link.sourceId),
  );
  const nodeSourceList = sources
    .filter((source) => sourceIds.has(source.id))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const hitMessages = messages.filter((message) => message.payload.hit?.nodeId === node.id);
  const lastHit = hitMessages[hitMessages.length - 1]?.createdAt ?? null;
  const hitQuestions = hitMessages
    .slice(-3)
    .map((message) => {
      const index = messages.findIndex((item) => item.id === message.id);
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const previous = messages[cursor];
        if (previous?.role === "user") {
          return { id: message.id, question: previous.content, at: message.createdAt };
        }
      }
      return { id: message.id, question: "（历史提问）", at: message.createdAt };
    })
    .reverse();

  const startEditing = () => {
    setTitleDraft(node.title);
    setSummaryDraft(node.summary);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setTitleDraft(node.title);
    setSummaryDraft(node.summary);
  };

  const saveEditing = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateDetails(node.id, { title: titleDraft, summary: summaryDraft });
      setEditing(false);
      toast("已更新知识点名称与摘要", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReparent = async (parentId: string | null) => {
    try {
      await reparent(node.id, parentId);
      if (node.status === "inbox") await setStatus(node.id, "active");
      toast(parentId ? "已调整到新位置" : "已移到顶层", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "调整位置失败", "error");
    }
  };

  const resetPosition = async () => {
    try {
      await clearManualPosition(node.id);
      toast("已恢复自动布局位置", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "恢复失败", "error");
    }
  };

  return (
    <div
      data-enter={animateEnter}
      className="atlas-panel pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[62dvh] flex-col overflow-hidden rounded-t-[24px] bg-shell/95 shadow-[var(--neu-raised)] backdrop-blur md:max-h-[55vh] xl:inset-y-0 xl:left-auto xl:right-0 xl:max-h-none xl:w-[380px] xl:rounded-none xl:rounded-l-[24px]"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[11px] text-muted">
          知识点 · {path.length}
          {node.status === "inbox" ? " · 待归位" : ""}
          {node.manualPosition ? " · 手动定位" : ""}
        </span>
        <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="关闭详情">
          ✕
        </button>
      </div>

      <div className="atlas-panel-body min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
          {path.map((item, index) => (
            <span key={item.id} className="flex items-center gap-1">
              {index > 0 ? <span className="text-line">/</span> : null}
              <button
                type="button"
                className={index === path.length - 1 ? "text-ink" : "hover:text-ink"}
                onClick={() => onSelect(item.id)}
              >
                {item.title}
              </button>
            </span>
          ))}
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="label">知识点名称</span>
              <input
                className="input mt-1"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder="用学科概念命名，例如「电阻的并联」"
              />
            </label>
            <label className="block">
              <span className="label">一句话摘要</span>
              <textarea
                className="textarea mt-1"
                rows={3}
                value={summaryDraft}
                onChange={(event) => setSummaryDraft(event.target.value)}
                placeholder="说明这个知识点讲什么"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => void saveEditing()}
                disabled={saving}
              >
                {saving ? "保存中…" : "保存"}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={cancelEditing}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mt-1.5 text-lg font-semibold text-ink">{node.title}</h2>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink/80">
              {node.summary || "暂无摘要。"}
            </p>
          </>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`chip ${node.status === "inbox" ? "border-warn/40 text-warn" : ""}`}>
            {node.status === "inbox" ? "待归位" : "已收编"}
          </span>
          <span className="chip">关系 {relatedCount}</span>
          <span className="chip">子节点 {children.length}</span>
          <span className="chip">命中 {hitMessages.length}</span>
          {node.detail ? <span className="chip border-accent/40 text-accent">有讲解正文</span> : null}
          {hiddenChildren > 0 ? <span className="chip">折叠 {hiddenChildren}</span> : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/node/${node.id}`}
            className="btn-primary btn-sm"
            onClick={() => onClose()}
          >
            <Icon name="atlas" size={13} /> 完整讲解
          </Link>
          {editing ? null : (
            <button type="button" className="btn-ghost btn-sm" onClick={startEditing}>
              <Icon name="settings" size={13} /> 编辑
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setPickerOpen(true)}>
            调整位置
          </button>
          {node.manualPosition ? (
            <button type="button" className="btn-ghost btn-sm" onClick={() => void resetPosition()}>
              恢复自动位置
            </button>
          ) : null}
          {hiddenChildren > 0 || expanded ? (
            <button type="button" className="btn-ghost btn-sm" onClick={onToggleExpand}>
              <Icon name="chevron-down" size={13} />
              {expanded ? "收起" : `展开 ${hiddenChildren} 个`}
            </button>
          ) : null}
        </div>

        <section className="mt-4">
          <h3 className="label">学习状态</h3>
          <dl className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <dt className="text-muted">收编时间</dt>
              <dd className="mt-0.5 text-ink">{formatDateTime(node.createdAt)}</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <dt className="text-muted">最近命中</dt>
              <dd className="mt-0.5 text-ink">{lastHit ? formatRelative(lastHit) : "暂无"}</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <dt className="text-muted">命中次数</dt>
              <dd className="mt-0.5 text-ink">{hitMessages.length} 次</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <dt className="text-muted">最近更新</dt>
              <dd className="mt-0.5 text-ink">{formatDateTime(node.updatedAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-4">
          <h3 className="label">子知识点（{children.length}）</h3>
          {children.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted">暂无子知识点。</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {children.slice(0, 8).map((child) => (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(child.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left hover:border-accent/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-ink">{child.title}</span>
                      <span className="block truncate text-[10px] text-muted">
                        {child.summary || "暂无摘要"}
                      </span>
                    </span>
                    {child.status === "inbox" ? (
                      <span className="shrink-0 text-[10px] text-warn">待归位</span>
                    ) : null}
                  </button>
                </li>
              ))}
              {children.length > 8 ? (
                <li className="text-[11px] text-muted">还有 {children.length - 8} 个…</li>
              ) : null}
            </ul>
          )}
        </section>

        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="label">关系</h3>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setRelationEditorOpen(true)}
            >
              <Icon name="plus" size={12} /> 添加关系
            </button>
          </div>
          <RelationList
            nodeId={node.id}
            nodes={nodes}
            relations={relations}
            onSelect={onSelect}
            editable
          />
        </section>

        <RelationSuggestions
          node={node}
          nodes={nodes}
          relations={relations}
          nodeSources={nodeSources}
        />

        <section className="mt-4">
          <h3 className="label">来源（{nodeSourceList.length}）</h3>
          {nodeSourceList.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted">暂无来源。</p>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {nodeSourceList.map((source) => (
                <li key={source.id} className="rounded-lg border border-line bg-surface px-2.5 py-2">
                  {source.kind === "image" ? (
                    <LocalThumbnail
                      id={source.id}
                      alt="题目图片"
                      className="mb-1.5 h-20 w-20 rounded-lg border border-line object-cover"
                    />
                  ) : null}
                  <p className="line-clamp-2 text-xs text-ink">{source.question || "（图片提问）"}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {formatDateTime(source.createdAt)} · {source.answer.length} 字解答
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-accent">查看完整解答</summary>
                    <p className="details-body mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
                      {source.answer}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {hitQuestions.length > 0 ? (
          <section className="mt-4">
            <h3 className="label">命中记录（最近 {hitQuestions.length} 次）</h3>
            <ul className="mt-1.5 space-y-1.5">
              {hitQuestions.map((hit) => (
                <li
                  key={hit.id}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px]"
                >
                  <p className="line-clamp-1 text-ink">{hit.question}</p>
                  <p className="text-[10px] text-muted">{formatRelative(hit.at)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {node.aliases.length > 0 ? (
          <section className="mt-4">
            <h3 className="label">别名</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {node.aliases.map((alias) => (
                <span key={alias} className="chip">
                  {alias}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-4 pb-2">
          <Link
            href={`/chat?q=${encodeURIComponent(node.title)}`}
            className="btn-ghost btn-sm w-full justify-start"
          >
            <Icon name="chat" size={14} /> 在对话中复习
          </Link>
        </div>
      </div>

      <PositionPicker
        open={pickerOpen}
        nodes={nodes}
        currentParentId={node.parentId}
        excludeId={node.id}
        onCreatePath={(segments, options) =>
          createPath(segments, options).then((result) => result.leafId)
        }
        onClose={() => setPickerOpen(false)}
        onSelect={(parentId) => void handleReparent(parentId)}
      />

      <RelationEditor
        key={`${relationEditorOpen ? "open" : "closed"}-${node.id}`}
        open={relationEditorOpen}
        fromId={node.id}
        nodes={nodes}
        relations={relations}
        onClose={() => setRelationEditorOpen(false)}
      />
    </div>
  );
}
