"use client";

import { useMemo, useState } from "react";
import { RELATION_META } from "@/lib/relations";
import {
  sharedSourceSuggestions,
  suggestRelationsWithLlm,
  type RelationSuggestion,
} from "@/lib/ai/relationSuggest";
import { useGraphStore } from "@/store/graphStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import type { KnowledgeNode, NodeSource, Relation } from "@/types";
import { Icon } from "../shell/Icon";

interface RelationSuggestionsProps {
  node: KnowledgeNode;
  nodes: KnowledgeNode[];
  relations: Relation[];
  nodeSources: NodeSource[];
}

/** 自动关系建议：同源启发式 + AI 推荐；采纳后才写入云端。 */
export function RelationSuggestions({
  node,
  nodes,
  relations,
  nodeSources,
}: RelationSuggestionsProps) {
  const llm = useSettingsStore((state) => state.llm);
  const addRelation = useGraphStore((state) => state.addRelation);
  const [aiSuggestions, setAiSuggestions] = useState<RelationSuggestion[]>([]);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const shared = useMemo(
    () => sharedSourceSuggestions(node, nodes, relations, nodeSources),
    [node, nodes, relations, nodeSources],
  );

  const suggestions = [...shared, ...aiSuggestions].filter(
    (suggestion) => !ignored.has(suggestion.id),
  );

  const requestAi = async () => {
    if (llm.mode !== "real") {
      toast("先在设置里接入自己的模型，才能让 AI 推荐关系", "info");
      return;
    }
    setLoading(true);
    try {
      const list = await suggestRelationsWithLlm({ settings: llm, node, nodes, relations });
      const fresh = list.filter(
        (item) =>
          !aiSuggestions.some(
            (existing) => existing.targetId === item.targetId && existing.type === item.type,
          ),
      );
      if (fresh.length === 0) toast("AI 没有找到合适的新关系", "info");
      setAiSuggestions((previous) => [...previous, ...fresh]);
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI 推荐失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const adopt = async (suggestion: RelationSuggestion) => {
    if (busyId) return;
    setBusyId(suggestion.id);
    try {
      await addRelation({
        fromId: node.id,
        toId: suggestion.targetId,
        type: suggestion.type,
        confidence: suggestion.confidence,
        origin: "ai",
      });
      toast("已建立关系", "success");
      setIgnored((previous) => new Set(previous).add(suggestion.id));
    } catch (error) {
      toast(error instanceof Error ? error.message : "建立关系失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const ignore = (suggestion: RelationSuggestion) => {
    setIgnored((previous) => new Set(previous).add(suggestion.id));
  };

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <h3 className="label">自动建议（{suggestions.length}）</h3>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => void requestAi()}
          disabled={loading}
        >
          {loading ? "推荐中…" : "AI 推荐"}
        </button>
      </div>

      {suggestions.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted">
          暂时没有新的关系建议。AI 推荐会从候选知识点里挑出最相关的几个。
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              className="rounded-lg border border-line bg-surface px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs">
                  <span
                    style={{ color: RELATION_META[suggestion.type].color }}
                    className="shrink-0"
                  >
                    {RELATION_META[suggestion.type].label}
                  </span>
                  <span className="truncate text-ink">{suggestion.targetTitle}</span>
                  <span className="shrink-0 text-[10px] text-muted">
                    {Math.round(suggestion.confidence * 100)}%
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={busyId === suggestion.id}
                    onClick={() => void adopt(suggestion)}
                  >
                    采纳
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => ignore(suggestion)}
                  >
                    忽略
                  </button>
                </span>
              </div>
              {suggestion.reason ? (
                <p className="mt-1 text-[11px] text-muted">
                  <Icon name="spark" size={11} className="mr-1 inline text-accent" />
                  {suggestion.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
