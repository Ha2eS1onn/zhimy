"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AtlasCanvas, type AtlasCanvasHandle, type NodeMovePayload } from "./CanvasAtlas";
import { AtlasPanel } from "./AtlasPanel";
import { RelationEditor } from "./RelationEditor";
import { Icon } from "../shell/Icon";
import { useResolvedTheme } from "../shell/Theme";
import { EVENTS, track } from "@/lib/analytics";
import { buildPath } from "@/lib/path";
import { searchNodes } from "@/lib/search";
import { neighborIds, relationColor } from "@/lib/relations";
import { computeLayout } from "@/lib/layout/layout";
import { computeVisibility } from "@/lib/atlas/visibility";
import { DENSITY_LABEL, DENSITY_MAX_DEPTH } from "@/lib/layout/constants";
import { useGraphStore } from "@/store/graphStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import type { Density } from "@/types";

const DENSITIES: Density[] = ["overview", "standard", "detail"];

export function AtlasScreen() {
  const searchParams = useSearchParams();
  const nodes = useGraphStore((state) => state.nodes);
  const relations = useGraphStore((state) => state.relations);
  const sources = useGraphStore((state) => state.sources);
  const nodeSources = useGraphStore((state) => state.nodeSources);
  const loading = useGraphStore((state) => state.loading);
  const seedExample = useGraphStore((state) => state.seedExample);
  const moveNode = useGraphStore((state) => state.moveNode);
  const clearAllManualPositions = useGraphStore((state) => state.clearAllManualPositions);

  const density = useSettingsStore((state) => state.density);
  const setDensity = useSettingsStore((state) => state.setDensity);
  const autoRotate = useSettingsStore((state) => state.autoRotate);
  const setAutoRotate = useSettingsStore((state) => state.setAutoRotate);
  const theme = useResolvedTheme();

  const canvasRef = useRef<AtlasCanvasHandle | null>(null);
  const appliedParamRef = useRef<string | null>(null);
  // 连续选中同一个节点只在第一次记 node_opened，避免面包屑/重复点击刷量。
  const lastOpenedRef = useRef<string | null>(null);
  const selectedPanelRef = useRef<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelAnimateEnter, setPanelAnimateEnter] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAllRelations, setShowAllRelations] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [relationDraft, setRelationDraft] = useState<{ fromId: string; targetId: string } | null>(
    null,
  );

  const layout = useMemo(() => computeLayout(nodes), [nodes]);
  const maxDepth = DENSITY_MAX_DEPTH[density];
  const { visibleIds, badges } = useMemo(
    () => computeVisibility(layout, maxDepth, expanded),
    [layout, maxDepth, expanded],
  );
  const neighborSet = useMemo(
    () => new Set(selectedId ? neighborIds(relations, selectedId) : []),
    [relations, selectedId],
  );
  const selectedNode = selectedId ? nodes.find((node) => node.id === selectedId) : undefined;
  const searchHits = useMemo(
    () => (query.trim() ? searchNodes(nodes, query.trim(), 8) : []),
    [nodes, query],
  );

  // 手机屏幕窄，自动旋转容易造成眩晕；桌面端保持动效开启。
  useEffect(() => {
    if (window.innerWidth < 768) setAutoRotate(false);
  }, [setAutoRotate]);

  // 手机屏幕窄：默认用「概览」密度，避免 40+ 节点挤在一起。
  useEffect(() => {
    if (window.innerWidth < 768 && density === "standard") setDensity("overview");
    // 只在首次挂载时按屏幕宽度调整默认密度
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reveal = useCallback(
    (nodeId: string) => {
      const descendants = new Set<string>();
      const byId = layout.byId;
      let current = byId.get(nodeId);
      while (current?.parentId) {
        const parent = byId.get(current.parentId);
        if (!parent) break;
        if (parent.depth >= maxDepth) descendants.add(parent.id);
        current = parent;
      }
      if (descendants.size === 0) return;
      setExpanded((previous) => {
        const next = new Set(previous);
        for (const id of descendants) next.add(id);
        return next;
      });
    },
    [layout, maxDepth],
  );

  const select = useCallback(
    (nodeId: string | null, options: { focus?: boolean; syncUrl?: boolean } = {}) => {
      const { focus = true, syncUrl = true } = options;
      const entering = nodeId !== null && selectedPanelRef.current === null;
      selectedPanelRef.current = nodeId;
      setPanelAnimateEnter(entering);
      setSelectedId(nodeId);
      if (nodeId) {
        if (lastOpenedRef.current !== nodeId) {
          lastOpenedRef.current = nodeId;
          track(EVENTS.nodeOpened, { from: "atlas" });
        }
      } else {
        lastOpenedRef.current = null;
      }
      setSearchOpen(false);
      setQuery("");
      if (nodeId) {
        reveal(nodeId);
        if (focus) canvasRef.current?.focusNode(nodeId);
      }
      if (syncUrl && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (nodeId) url.searchParams.set("node", nodeId);
        else url.searchParams.delete("node");
        window.history.replaceState(null, "", url.toString());
      }
    },
    [reveal],
  );

  // 深链：/atlas?node=xxx（URL 属于外部系统，读取后同步到本地选中态）
  const paramNode = searchParams.get("node");
  useEffect(() => {
    if (!paramNode || appliedParamRef.current === paramNode) return;
    if (!nodes.some((node) => node.id === paramNode)) return;
    appliedParamRef.current = paramNode;
    select(paramNode, { syncUrl: false });
  }, [paramNode, nodes, select]);

  const handleSelect = useCallback(
    (nodeId: string | null) => {
      // 连线模式：第一次点击定起点，第二次点击选终点并打开关系编辑器。
      if (connectMode) {
        if (!nodeId) {
          setConnectSourceId(null);
          return;
        }
        if (!connectSourceId) {
          setConnectSourceId(nodeId);
          setSelectedId(nodeId);
          toast("已选起点，再点一个知识点连线", "info");
          return;
        }
        if (nodeId === connectSourceId) {
          setConnectSourceId(null);
          return;
        }
        setRelationDraft({ fromId: connectSourceId, targetId: nodeId });
        setConnectSourceId(null);
        return;
      }
      select(nodeId);
    },
    [connectMode, connectSourceId, select],
  );

  const handleMoveNode = useCallback(
    async (nodeId: string, payload: NodeMovePayload) => {
      const currentNodes = useGraphStore.getState().nodes;
      const node = currentNodes.find((item) => item.id === nodeId);
      if (!node) return;
      const target = payload.dropTargetId
        ? currentNodes.find((item) => item.id === payload.dropTargetId)
        : null;
      try {
        await moveNode(nodeId, {
          manualPosition: payload.position,
          ...(target ? { parentId: target.id } : {}),
        });
        track(EVENTS.nodeMoved, { parentChanged: Boolean(target), manual: true });
        toast(
          target ? `已挂到「${target.title}」下，并保存位置` : "位置已保存到云端",
          "success",
        );
      } catch (error) {
        toast(error instanceof Error ? error.message : "保存位置失败", "error");
      }
    },
    [moveNode],
  );

  const resetAllPositions = async () => {
    if (!window.confirm("把所有手动拖动过的知识点恢复到自动布局？")) return;
    try {
      await clearAllManualPositions();
      track(EVENTS.positionsReset);
      toast("已恢复全部自动布局", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "恢复失败", "error");
    }
  };

  const selectedHiddenChildren = selectedId ? (badges.get(selectedId) ?? 0) : 0;
  const selectedExpanded = selectedId ? expanded.has(selectedId) : false;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-canvas">
      {/* 顶栏 */}
      <header className="z-20 flex shrink-0 flex-col gap-1.5 border-b border-line bg-shell/90 px-3 py-1.5 backdrop-blur md:gap-2 md:px-4 md:py-2">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto text-xs text-muted">
            {selectedNode ? (
              buildPath(nodes, selectedNode.id).map((node, index, list) => (
                <span key={node.id} className="flex shrink-0 items-center gap-1.5">
                  {index > 0 ? <span className="text-line">/</span> : null}
                  <button
                    type="button"
                    className={index === list.length - 1 ? "text-ink" : "hover:text-ink"}
                    onClick={() => handleSelect(node.id)}
                  >
                    {node.title}
                  </button>
                </span>
              ))
            ) : (
              <span>知识库 · {nodes.length}</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="icon-btn size-8"
              aria-label="搜索知识点"
              onClick={() => setSearchOpen((value) => !value)}
            >
              <Icon name="search" size={17} />
            </button>
            <button
              type="button"
              className={`icon-btn hidden size-9 md:grid ${
                autoRotate ? "text-accent" : "text-muted"
              }`}
              aria-label={autoRotate ? "关闭自动旋转" : "开启自动旋转"}
              aria-pressed={autoRotate}
              onClick={() => setAutoRotate(!autoRotate)}
            >
              <Icon name="rotate" size={17} />
            </button>
            <button
              type="button"
              className="icon-btn hidden size-8 md:grid"
              aria-label="放大"
              onClick={() => canvasRef.current?.zoomBy(1.2)}
            >
              <Icon name="zoom-in" size={17} />
            </button>
            <button
              type="button"
              className="icon-btn hidden size-8 md:grid"
              aria-label="缩小"
              onClick={() => canvasRef.current?.zoomBy(1 / 1.2)}
            >
              <Icon name="zoom-out" size={17} />
            </button>
            <button
              type="button"
              className="icon-btn hidden size-9 md:grid"
              aria-label="复位视角"
              onClick={() => canvasRef.current?.resetView()}
            >
              <Icon name="refresh" size={16} />
            </button>
            <button
              type="button"
              className={`icon-btn grid size-9 md:hidden ${
                toolsOpen || connectMode || showAllRelations ? "text-accent" : "text-muted"
              }`}
              aria-label="图谱工具"
              aria-expanded={toolsOpen}
              aria-controls="atlas-tools"
              onClick={() => setToolsOpen((value) => !value)}
            >
              <Icon name="more" size={19} />
            </button>
          </div>
        </div>

        <div
          id="atlas-tools"
          className={`${toolsOpen ? "flex" : "hidden"} motion-reveal flex-wrap items-center gap-2 md:flex`}
        >
          <div
            className="segmented"
            data-count={DENSITIES.length}
            data-index={Math.max(0, DENSITIES.indexOf(density))}
          >
            {DENSITIES.map((item) => (
              <button
                key={item}
                type="button"
                data-active={density === item}
                onClick={() => {
                  setDensity(item);
                  if (selectedId) reveal(selectedId);
                }}
              >
                {DENSITY_LABEL[item]}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted">
            可见 {visibleIds.size} / {nodes.length}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className={`btn-ghost btn-sm ${showAllRelations ? "border-accent/50 text-accent" : ""}`}
              aria-pressed={showAllRelations}
              onClick={() => setShowAllRelations((value) => !value)}
              title="显示全部关系线"
            >
              关系线 {showAllRelations ? "全" : "聚焦"}
            </button>
            <button
              type="button"
              className={`btn-ghost btn-sm ${connectMode ? "border-warn/50 text-warn" : ""}`}
              aria-pressed={connectMode}
              onClick={() => {
                setConnectMode((value) => !value);
                setConnectSourceId(null);
              }}
              title="点击两个知识点建立关系"
            >
              连线
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => void resetAllPositions()}
              title="清除所有手动拖动的位置"
            >
              重置位置
            </button>
          </div>
        </div>

        {connectMode ? (
          <div className="motion-reveal rounded-lg bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
            {connectSourceId
              ? "已选起点：再点击另一个知识点建立关系，点空白处取消。"
              : "连线模式：先点起点知识点，再点终点知识点。"}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                setConnectMode(false);
                setConnectSourceId(null);
              }}
            >
              退出连线
            </button>
          </div>
        ) : null}

        {searchOpen ? (
          <div className="atlas-search motion-reveal rounded-xl bg-surface p-2 shadow-[var(--neu-soft)]">
            <input
              className="w-full bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted"
              placeholder="搜索知识点，Enter 定位"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const top = searchHits[0];
                  if (top) handleSelect(top.node.id);
                }
                if (event.key === "Escape") setSearchOpen(false);
              }}
            />
            {query.trim() ? (
              <ul className="mt-1 max-h-56 overflow-y-auto">
                {searchHits.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-muted">没有匹配的知识点</li>
                ) : (
                  searchHits.map((hit) => (
                    <li key={hit.node.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                        onClick={() => handleSelect(hit.node.id)}
                      >
                        <span className="text-sm text-ink">{hit.node.title}</span>
                        <span className="truncate text-[11px] text-muted">
                          {buildPath(nodes, hit.node.id)
                            .map((node) => node.title)
                            .join(" / ")}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* 画布 */}
      <div className="relative min-h-0 flex-1">
        <AtlasCanvas
          ref={canvasRef}
          nodes={nodes}
          relations={relations}
          visibleIds={visibleIds}
          selectedId={selectedId}
          neighborIds={neighborSet}
          badges={badges}
          autoRotate={autoRotate}
          showAllRelations={showAllRelations}
          connectMode={connectMode}
          connectSourceId={connectSourceId}
          theme={theme}
          onSelect={handleSelect}
          onMoveNode={(nodeId, payload) => void handleMoveNode(nodeId, payload)}
        />

        <div className="atlas-vignette pointer-events-none absolute inset-0 z-[1]" />

        {/* 图例与操作提示 */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 space-y-1.5 text-[10px] text-muted">
          <div className="flex items-center gap-3 rounded-lg bg-shell/70 px-2 py-1 backdrop-blur">
            <LegendItem color={relationColor("prerequisite", theme)} label="先修" />
            <LegendItem color={relationColor("related", theme)} label="相关" />
            <LegendItem color={relationColor("contrast", theme)} label="易混" />
          </div>
          <p className="hidden rounded-lg px-2 py-1 text-muted/90 backdrop-blur md:block">
            拖动旋转 · 滚轮缩放 · 双击复位
          </p>
        </div>

        {nodes.length === 0 && !loading ? (
          <div className="absolute inset-0 z-10 grid place-items-center px-4">
            <div className="card max-w-sm px-5 py-6 text-center">
              <p className="text-sm font-medium text-ink">还没有知识点</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                载入示例，或从一次提问开始。
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  className="btn-primary btn-sm"
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
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
            <span className="mt-3 rounded-full bg-shell/80 px-3 py-1 text-[11px] text-muted backdrop-blur">
              正在同步云端数据…
            </span>
          </div>
        ) : null}

        {/* 详情面板 */}
        {selectedNode ? (
          <AtlasPanel
            key={selectedNode.id}
            node={selectedNode}
            nodes={nodes}
            relations={relations}
            sources={sources}
            nodeSources={nodeSources}
            hiddenChildren={selectedHiddenChildren}
            expanded={selectedExpanded}
            animateEnter={panelAnimateEnter}
            onClose={() => handleSelect(null)}
            onSelect={(id) => handleSelect(id)}
            onToggleExpand={() => {
              if (!selectedId) return;
              setExpanded((previous) => {
                const next = new Set(previous);
                if (next.has(selectedId)) next.delete(selectedId);
                else next.add(selectedId);
                return next;
              });
            }}
          />
        ) : null}
      </div>

      <RelationEditor
        open={relationDraft !== null}
        fromId={relationDraft?.fromId ?? null}
        initialTargetId={relationDraft?.targetId ?? null}
        nodes={nodes}
        relations={relations}
        onClose={() => setRelationDraft(null)}
        onSaved={() => {
          if (relationDraft?.targetId) setSelectedId(relationDraft.targetId);
        }}
      />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-px w-3" style={{ background: color }} />
      {label}
    </span>
  );
}
