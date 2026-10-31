"use client";

import { useState } from "react";
import {
  blockedSubtree,
  buildPath,
  parsePathInput,
  validatePathSegments,
} from "@/lib/path";
import type { KnowledgeNode } from "@/types";
import { Sheet } from "./Sheet";

interface PositionPickerProps {
  open: boolean;
  nodes: KnowledgeNode[];
  /** 当前父节点（用于高亮）。 */
  currentParentId: string | null;
  /** 排除的节点（换位置时不能挂在自己或后代下面）。 */
  excludeId?: string | null;
  /**
   * 新建父级路径（可选）。传入后展示「新建父级路径」输入区。
   * blockedIds 为不能作为父级的节点（自己 + 后代），由 store 兜底校验。
   */
  onCreatePath?: (segments: string[], options: { blockedIds: string[] }) => Promise<string>;
  onClose: () => void;
  onSelect: (parentId: string | null) => void;
}

/** 选择知识点在图谱中的位置：新建父级路径 + 搜索 + 顶层选项。 */
export function PositionPicker({
  open,
  nodes,
  currentParentId,
  excludeId,
  onCreatePath,
  onClose,
  onSelect,
}: PositionPickerProps) {
  const [query, setQuery] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const blocked = blockedSubtree(nodes, excludeId);

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

  const segments = parsePathInput(pathInput);
  const pathValidation = segments.length > 0 ? validatePathSegments(segments) : null;

  const resetPathForm = () => {
    setPathInput("");
    setPathError(null);
  };

  const handleSelect = (parentId: string | null) => {
    onSelect(parentId);
    setQuery("");
    resetPathForm();
    onClose();
  };

  const handleClose = () => {
    setQuery("");
    resetPathForm();
    onClose();
  };

  const handleCreatePath = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!onCreatePath || creating || segments.length === 0) return;
    const invalid = validatePathSegments(segments);
    if (invalid) {
      setPathError(invalid);
      return;
    }
    setCreating(true);
    setPathError(null);
    try {
      const leafId = await onCreatePath(segments, { blockedIds: Array.from(blocked) });
      handleSelect(leafId);
    } catch (error) {
      setPathError(error instanceof Error ? error.message : "创建父级路径失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="换个位置"
      description="路径由系统沿父节点拼出；可以选一个已有落点，也可以新建一条父级路径。"
      onClose={handleClose}
      size="lg"
    >
      <input
        className="input"
        placeholder="搜索知识点，例如：电阻、欧姆定律"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />

      {onCreatePath ? (
        <form
          className="mt-3 rounded-xl border border-line bg-shell p-3"
          onSubmit={(event) => void handleCreatePath(event)}
        >
          <label className="label" htmlFor="zhimy-new-path">
            新建父级路径（可选）
          </label>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            用 / 分隔层级，例如 物理 / 电学；已有同名节点会复用，缺失的自动创建。
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="zhimy-new-path"
              className="input min-w-0 flex-1"
              value={pathInput}
              onChange={(event) => {
                setPathInput(event.target.value);
                setPathError(null);
              }}
              placeholder="物理 / 电学"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="submit"
              className="btn-primary btn-sm shrink-0"
              disabled={segments.length === 0 || Boolean(pathValidation) || creating}
            >
              {creating ? "创建中…" : "创建并使用"}
            </button>
          </div>
          {segments.length > 0 ? (
            <p className="mt-1.5 break-all text-[11px] text-muted">
              将使用路径：{segments.join(" / ")}
            </p>
          ) : null}
          {pathError ?? (segments.length > 0 ? pathValidation : null) ? (
            <p className="mt-1 text-[11px] text-danger">
              {pathError ?? pathValidation}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="mt-3 space-y-1.5">
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
            currentParentId === null
              ? "border-accent bg-accent/10 text-ink"
              : "border-line bg-surface text-muted hover:border-accent hover:text-ink"
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
              className={`flex min-h-11 w-full flex-col rounded-xl border px-3 py-2 text-left transition-colors ${
                currentParentId === node.id
                  ? "border-accent bg-accent/10"
                  : "border-line bg-surface hover:border-accent"
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
          <p className="py-6 text-center text-xs leading-relaxed text-muted">
            {nodes.length === 0
              ? "图谱还是空的：先在上方新建一级学科（如 物理 / 电学），即可把知识点挂进去。"
              : "没有匹配的知识点，换个关键词试试，或在上方新建父级路径。"}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
