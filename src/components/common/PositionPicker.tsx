"use client";

import { useState } from "react";
import { buildPath } from "@/lib/path";
import type { KnowledgeNode } from "@/types";
import { Sheet } from "./Sheet";

interface PositionPickerProps {
  open: boolean;
  nodes: KnowledgeNode[];
  /** 当前父节点（用于高亮）。 */
  currentParentId: string | null;
  /** 排除的节点（换位置时不能挂在自己或后代下面）。 */
  excludeId?: string | null;
  onClose: () => void;
  onSelect: (parentId: string | null) => void;
}

/** 选择知识点在图谱中的位置：面包屑 + 搜索 + 顶层选项。 */
export function PositionPicker({
  open,
  nodes,
  currentParentId,
  excludeId,
  onClose,
  onSelect,
}: PositionPickerProps) {
  const [query, setQuery] = useState("");

  const blocked = new Set<string>();
  if (excludeId) {
    blocked.add(excludeId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes) {
        if (node.parentId && blocked.has(node.parentId) && !blocked.has(node.id)) {
          blocked.add(node.id);
          changed = true;
        }
      }
    }
  }

  const text = query.trim();
  const candidates = nodes
    .filter((node) => !blocked.has(node.id))
    .filter((node) => {
      if (!text) return true;
      return (
        node.title.includes(text) ||
        node.aliases.some((alias) => alias.includes(text)) ||
        buildPath(nodes, node.id)
          .map((item) => item.title)
          .join("/")
          .includes(text)
      );
    })
    .slice(0, 200);

  const handleSelect = (parentId: string | null) => {
    onSelect(parentId);
    setQuery("");
    onClose();
  };

  return (
    <Sheet
      open={open}
      title="换个位置"
      description="路径由系统沿父节点拼出，你只需要选一个落点。"
      onClose={onClose}
      size="lg"
    >
      <input
        className="input"
        placeholder="搜索知识点，例如：电阻、欧姆定律"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />

      <div className="mt-3 space-y-1.5">
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
            currentParentId === null
              ? "border-accent/50 bg-accent/10 text-ink"
              : "border-line bg-surface text-muted hover:bg-surface-2"
          }`}
        >
          <span>顶层（学科级）</span>
          <span className="text-[11px]">暂不归入章节</span>
        </button>

        {candidates.map((node) => {
          const path = buildPath(nodes, node.id);
          const parents = path.slice(0, -1);
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => handleSelect(node.id)}
              className={`flex w-full flex-col rounded-xl border px-3 py-2 text-left transition-colors ${
                currentParentId === node.id
                  ? "border-accent/50 bg-accent/10"
                  : "border-line bg-surface hover:bg-surface-2"
              }`}
            >
              <span className="text-sm text-ink">{node.title}</span>
              <span className="mt-0.5 truncate text-[11px] text-muted">
                {parents.length > 0 ? `放在 ${parents.map((item) => item.title).join(" / ")} 下` : "顶层学科"}
              </span>
            </button>
          );
        })}

        {candidates.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">
            没有匹配的知识点，换个关键词试试，或先载入示例图谱。
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
