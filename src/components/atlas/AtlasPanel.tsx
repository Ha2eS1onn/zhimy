"use client";

import Link from "next/link";
import { buildPath } from "@/lib/path";
import { relationColor, relationDirectionText, relationLabel, relationsOf, otherEnd } from "@/lib/relations";
import type { KnowledgeNode, NodeSource, Relation, Source } from "@/types";
import { Icon } from "../shell/Icon";

interface AtlasPanelProps {
  node: KnowledgeNode;
  nodes: KnowledgeNode[];
  relations: Relation[];
  sources: Source[];
  nodeSources: NodeSource[];
  hiddenChildren: number;
  expanded: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onToggleExpand: () => void;
}

export function AtlasPanel({
  node,
  nodes,
  relations,
  sources,
  nodeSources,
  hiddenChildren,
  expanded,
  onClose,
  onSelect,
  onToggleExpand,
}: AtlasPanelProps) {
  const path = buildPath(nodes, node.id);
  const related = relationsOf(relations, node.id);
  const sourceIds = new Set(nodeSources.filter((link) => link.nodeId === node.id).map((link) => link.sourceId));
  const nodeSourcesList = sources.filter((source) => sourceIds.has(source.id)).slice(-2);

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[62dvh] flex-col overflow-hidden rounded-t-2xl border-t border-line bg-shell/95 backdrop-blur md:max-h-[42vh] xl:inset-y-0 xl:left-auto xl:right-0 xl:max-h-none xl:w-[320px] xl:rounded-none xl:border-l xl:border-t-0">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-[11px] text-muted">知识点详情</span>
        <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="关闭详情">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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

        <h2 className="mt-1.5 text-lg font-semibold text-ink">{node.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{node.summary || "还没有摘要"}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`chip ${node.status === "inbox" ? "border-warn/40 text-warn" : ""}`}>
            {node.status === "inbox" ? "待归位" : "已收编"}
          </span>
          <span className="chip">关系 {related.length}</span>
          {hiddenChildren > 0 ? <span className="chip">折叠 {hiddenChildren}</span> : null}
        </div>

        {hiddenChildren > 0 || expanded ? (
          <button type="button" className="btn-ghost btn-sm mt-3 w-full" onClick={onToggleExpand}>
            <Icon name="chevron-down" size={14} />
            {expanded ? "收起子节点" : `展开 ${hiddenChildren} 个子节点`}
          </button>
        ) : null}

        <section className="mt-4">
          <h3 className="label">关系</h3>
          {related.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted">还没有建立关系，收编时会由 AI 提议。</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {related.map((relation) => {
                const otherId = otherEnd(relation, node.id);
                const other = nodes.find((item) => item.id === otherId);
                if (!other) return null;
                return (
                  <li key={relation.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(other.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left hover:border-accent/40"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: relationColor(relation.type) }}
                        />
                        <span className="truncate text-xs text-ink">{other.title}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted">
                        {relationLabel(relation.type)} · {relationDirectionText(relation, node.id)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-4">
          <h3 className="label">来源</h3>
          {nodeSourcesList.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted">示例数据暂无来源记录。</p>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {nodeSourcesList.map((source) => (
                <li key={source.id} className="rounded-lg border border-line bg-surface px-2.5 py-2">
                  <p className="line-clamp-2 text-xs text-ink">{source.question || "（图片提问）"}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                    {source.answer.slice(0, 80)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-4 pb-2">
          <Link
            href={`/chat?q=${encodeURIComponent(node.title)}`}
            className="btn-ghost btn-sm w-full justify-start"
          >
            <Icon name="chat" size={14} /> 在对话中复习这个知识点
          </Link>
        </div>
      </div>
    </div>
  );
}
