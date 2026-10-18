"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/common/Sheet";
import { buildPath } from "@/lib/path";
import { RELATION_META, relationKey } from "@/lib/relations";
import { searchNodes } from "@/lib/search";
import { useGraphStore } from "@/store/graphStore";
import { toast } from "@/store/toastStore";
import type { KnowledgeNode, Relation, RelationType } from "@/types";

const TYPE_OPTIONS: RelationType[] = ["prerequisite", "related", "contrast", "source"];

interface RelationEditorProps {
  open: boolean;
  fromId: string | null;
  nodes: KnowledgeNode[];
  relations: Relation[];
  initialTargetId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

/** 手动建立关系：选目标知识点 + 选关系类型。 */
export function RelationEditor({
  open,
  fromId,
  nodes,
  relations,
  initialTargetId = null,
  onClose,
  onSaved,
}: RelationEditorProps) {
  const addRelation = useGraphStore((state) => state.addRelation);
  const [targetId, setTargetId] = useState<string | null>(initialTargetId);
  const [type, setType] = useState<RelationType>("related");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const from = nodes.find((node) => node.id === fromId);

  const candidates = useMemo(() => {
    const base = query.trim() ? searchNodes(nodes, query, 20).map((hit) => hit.node) : nodes;
    return base.filter((node) => node.id !== fromId).slice(0, 40);
  }, [nodes, fromId, query]);

  const duplicate = Boolean(
    fromId &&
      targetId &&
      relations.some(
        (relation) =>
          relationKey(relation.type, relation.fromId, relation.toId) ===
          relationKey(type, fromId, targetId),
      ),
  );

  const handleSave = async () => {
    if (!fromId || !targetId || busy || duplicate) return;
    setBusy(true);
    try {
      await addRelation({ fromId, toId: targetId, type, confidence: 0.8, origin: "user" });
      toast("关系已建立", "success");
      onSaved?.();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "建立关系失败", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="建立关系"
      description={from ? `从「${from.title}」出发，连到另一个知识点。` : "请先选择一个知识点。"}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => void handleSave()}
            disabled={!targetId || duplicate || busy}
          >
            {busy ? "保存中…" : "建立关系"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="label">关系类型</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPE_OPTIONS.map((option) => {
              const meta = RELATION_META[option];
              const active = type === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className={`rounded-xl border px-2 py-2 text-left text-xs transition-colors ${
                    active
                      ? "border-accent/60 bg-accent/10 text-ink"
                      : "border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  <span className="flex items-center gap-1 font-medium" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    {option === "prerequisite"
                      ? "当前是对方的基础"
                      : option === "related"
                        ? "同思路/同类"
                        : option === "contrast"
                          ? "容易混淆"
                          : "来自同一段对话"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="label">目标知识点</p>
          <input
            className="input mt-2"
            placeholder="搜索知识点，例如：电阻的串联"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          <div className="mt-2 max-h-[40vh] space-y-1 overflow-y-auto pr-1">
            {candidates.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">没有匹配的知识点</p>
            ) : (
              candidates.map((node) => {
                const active = node.id === targetId;
                const path = buildPath(nodes, node.id)
                  .slice(0, -1)
                  .map((item) => item.title)
                  .join(" / ");
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setTargetId(node.id)}
                    className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-accent/60 bg-accent/10"
                        : "border-line bg-surface hover:bg-surface-2"
                    }`}
                  >
                    <span className="text-sm text-ink">{node.title}</span>
                    <span className="truncate text-[11px] text-muted">{path || "顶层"}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {duplicate ? (
          <p className="text-xs text-warn">这两个知识点之间已经有同类关系，换个类型或目标吧。</p>
        ) : null}
        {targetId ? (
          <p className="text-[11px] text-muted">
            将建立：
            <span className="text-ink">
              {from?.title} —[{RELATION_META[type].label}]→{" "}
              {nodes.find((node) => node.id === targetId)?.title}
            </span>
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
