"use client";

import { useState } from "react";
import {
  otherEnd,
  relationColor,
  relationDirectionText,
  relationLabel,
  relationsOf,
} from "@/lib/relations";
import { EVENTS, track } from "@/lib/analytics";
import { useGraphStore } from "@/store/graphStore";
import { toast } from "@/store/toastStore";
import type { KnowledgeNode, Relation, RelationType } from "@/types";

const TYPE_OPTIONS: RelationType[] = ["prerequisite", "related", "contrast", "source"];

interface RelationListProps {
  nodeId: string;
  nodes: KnowledgeNode[];
  relations: Relation[];
  onSelect: (id: string) => void;
  editable?: boolean;
  emptyText?: string;
}

/** 关系列表：展示 1 跳关系；editable 时可直接改类型/删除（详情面板与详情页共用）。 */
export function RelationList({
  nodeId,
  nodes,
  relations,
  onSelect,
  editable = false,
  emptyText = "还没有建立关系，可以在画布上连线或让 AI 推荐。",
}: RelationListProps) {
  const updateRelationType = useGraphStore((state) => state.updateRelationType);
  const deleteRelation = useGraphStore((state) => state.deleteRelation);
  const [busyId, setBusyId] = useState<string | null>(null);

  const related = relationsOf(relations, nodeId);
  if (related.length === 0) {
    return <p className="mt-1.5 text-xs text-muted">{emptyText}</p>;
  }

  const handleTypeChange = async (relation: Relation, type: RelationType) => {
    if (busyId) return;
    setBusyId(relation.id);
    try {
      await updateRelationType(relation.id, type);
      track(EVENTS.relationUpdated, { type });
      toast("关系类型已更新", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "更新失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (relation: Relation, otherTitle: string) => {
    if (busyId) return;
    if (!window.confirm(`删除与「${otherTitle}」的「${relationLabel(relation.type)}」关系？`)) return;
    setBusyId(relation.id);
    try {
      await deleteRelation(relation.id);
      track(EVENTS.relationDeleted);
      toast("关系已删除", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ul className="mt-1.5 space-y-1.5">
      {related.map((relation) => {
        const other = nodes.find((item) => item.id === otherEnd(relation, nodeId));
        if (!other) return null;
        return (
          <li
            key={relation.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => onSelect(other.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-accent"
              title="定位到这个知识点"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: relationColor(relation.type) }}
              />
              <span className="truncate text-xs text-ink">{other.title}</span>
            </button>
            {editable ? (
              <span className="flex shrink-0 items-center gap-1">
                <select
                  className="rounded-md border border-line bg-surface-2 px-1 py-0.5 text-[10px] text-muted outline-none focus:border-accent/60"
                  value={relation.type}
                  disabled={busyId === relation.id}
                  onChange={(event) => void handleTypeChange(relation, event.target.value as RelationType)}
                  aria-label="关系类型"
                >
                  {TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {relationLabel(type)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded px-1 text-[11px] text-muted hover:text-danger"
                  aria-label="删除关系"
                  disabled={busyId === relation.id}
                  onClick={() => void handleDelete(relation, other.title)}
                >
                  ✕
                </button>
              </span>
            ) : (
              <span className="shrink-0 text-[10px] text-muted">
                {relationLabel(relation.type)} · {relationDirectionText(relation, nodeId)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
