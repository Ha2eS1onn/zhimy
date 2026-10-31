import type { Relation } from "@/types";
import { clamp } from "@/lib/math3";
import type { LayoutResult } from "@/lib/layout/layout";
import {
  BASE_CAMERA_DISTANCE,
  HIERARCHY_LINE_ALPHA,
  MAX_SCREEN_RADIUS,
  MIN_SCREEN_RADIUS_DESKTOP,
  MIN_SCREEN_RADIUS_MOBILE,
  RELATION_LINE_WIDTH,
} from "@/lib/layout/constants";
import { focalLength, projectPoint, type CameraState } from "./camera";
import { getNodeSprite, spriteDrawSize } from "./sprites";
import { relationColor } from "@/lib/relations";

export interface ProjectedNode {
  id: string;
  parentId: string | null;
  depth: number;
  color: string;
  x: number;
  y: number;
  z: number;
  screenRadius: number;
}

export interface ProjectInput {
  layout: LayoutResult;
  visibleIds: Set<string>;
  camera: CameraState;
  width: number;
  height: number;
  isMobile: boolean;
}

/** 把可见节点投到屏幕并按「远 → 近」排序（painter's algorithm）。 */
export function projectNodes(input: ProjectInput): ProjectedNode[] {
  const { layout, visibleIds, camera, width, height, isMobile } = input;
  const focal = focalLength(width, height);
  const minRadius = isMobile ? MIN_SCREEN_RADIUS_MOBILE : MIN_SCREEN_RADIUS_DESKTOP;
  const out: ProjectedNode[] = [];
  for (const node of layout.nodes) {
    if (!visibleIds.has(node.id)) continue;
    const projected = projectPoint(node.position, camera, width, height);
    if (!projected) continue;
    const screenRadius = clamp((node.radius * focal) / projected.z, minRadius, MAX_SCREEN_RADIUS);
    out.push({
      id: node.id,
      parentId: node.parentId,
      depth: node.depth,
      color: node.color,
      x: projected.x,
      y: projected.y,
      z: projected.z,
      screenRadius,
    });
  }
  out.sort((a, b) => b.z - a.z);
  return out;
}

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  camera: CameraState;
  projected: ProjectedNode[];
  visibleIds: Set<string>;
  relations: Relation[];
  selectedId: string | null;
  hoveredId: string | null;
  neighborIds: Set<string>;
  badges: Map<string, number>;
  timeMs: number;
  showLabels: boolean;
  /** 显示全量关系线（编辑关系时用），默认只显示选中节点的 1 跳关系。 */
  showAllRelations?: boolean;
  /** 正在拖动的节点。 */
  dragNodeId?: string | null;
  /** 拖动时的落点目标节点（松手会挂到它下面）。 */
  dropTargetId?: string | null;
  /** 连线模式的源节点。 */
  connectSourceId?: string | null;
  /** 布局 id → 标题（标签渲染用，避免渲染器依赖数据仓库）。 */
  titleOf: (id: string) => string | undefined;
  theme?: "light" | "dark";
  reducedMotion?: boolean;
}

interface ScenePalette {
  canvas: string;
  hierarchy: string;
  selectedRing: string;
  hoverRing: string;
  dragRing: string;
  dropRing: string;
  sourceRing: string;
  badgeFill: string;
  badgeBorder: string;
  badgeText: string;
  labelHalo: string;
  labelText: string;
}

function scenePalette(theme: "light" | "dark"): ScenePalette {
  if (theme === "light") {
    return {
      canvas: "#e9f2ee",
      hierarchy: "34, 48, 62",
      selectedRing: "rgba(228, 87, 46, 0.95)",
      hoverRing: "rgba(34, 48, 62, 0.48)",
      dragRing: "rgba(37, 107, 71, 0.9)",
      dropRing: "rgba(37, 107, 71, 0.95)",
      sourceRing: "rgba(228, 87, 46, 0.95)",
      badgeFill: "#fafaf3",
      badgeBorder: "#c6d6cc",
      badgeText: "#22303e",
      labelHalo: "rgba(233, 242, 238, 0.94)",
      labelText: "rgba(34, 48, 62, 0.96)",
    };
  }
  return {
    canvas: "#14232b",
    hierarchy: "238, 244, 235",
    selectedRing: "rgba(242, 141, 102, 0.98)",
    hoverRing: "rgba(238, 244, 235, 0.5)",
    dragRing: "rgba(155, 219, 178, 0.92)",
    dropRing: "rgba(155, 219, 178, 0.98)",
    sourceRing: "rgba(242, 141, 102, 0.98)",
    badgeFill: "#1b2d34",
    badgeBorder: "#3b5155",
    badgeText: "#eef4eb",
    labelHalo: "rgba(20, 35, 43, 0.94)",
    labelText: "rgba(238, 244, 235, 0.96)",
  };
}

function depthFade(z: number, camera: CameraState, min = 0.22, max = 1): number {
  const distance = BASE_CAMERA_DISTANCE / camera.zoom;
  return clamp(1.35 - z / (distance * 1.2), min, max);
}

/** 绘制一帧：层级线 → 关系线 → 节点 → 标签 → 折叠徽标。 */
export function renderScene(input: RenderInput): void {
  const {
    ctx,
    width,
    height,
    dpr,
    camera,
    projected,
    selectedId,
    hoveredId,
    neighborIds,
    relations,
    badges,
    showAllRelations,
    dragNodeId,
    dropTargetId,
    connectSourceId,
  } = input;
  const palette = scenePalette(input.theme ?? "dark");

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0, 0, width, height);

  const byId = new Map(projected.map((node) => [node.id, node]));
  const focusLineAlpha = selectedId ? 0.32 : HIERARCHY_LINE_ALPHA;
  const isMobile = width < 768;

  // 1. 层级线：细、低对比，远处更淡。
  ctx.lineWidth = 1;
  for (const node of projected) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;
    const fade = depthFade((node.z + parent.z) / 2, camera, 0.18, 1);
    ctx.strokeStyle = `rgba(${palette.hierarchy}, ${(focusLineAlpha * fade).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(parent.x, parent.y);
    ctx.lineTo(node.x, node.y);
    ctx.stroke();
  }

  const pulse = input.reducedMotion ? 1 : 1 + 0.06 * Math.sin(input.timeMs / 260);

  // 2a. 全量关系线（编辑模式）：只画两端都可见的关系，整体压暗。
  if (showAllRelations) {
    for (const relation of relations) {
      const from = byId.get(relation.fromId);
      const to = byId.get(relation.toId);
      if (!from || !to) continue;
      ctx.strokeStyle = relationColor(relation.type, input.theme ?? "dark");
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // 2. 关系线：只在聚焦时画 1 跳邻域，最多 6 条。
  if (selectedId) {
    const selected = byId.get(selectedId);
    if (selected) {
      const visibleRelations = relations
        .filter((relation) => relation.fromId === selectedId || relation.toId === selectedId)
        .slice(0, 6);
      for (const relation of visibleRelations) {
        const otherId = relation.fromId === selectedId ? relation.toId : relation.fromId;
        const other = byId.get(otherId);
        if (!other) continue;
        const color = relationColor(relation.type, input.theme ?? "dark");
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = RELATION_LINE_WIDTH;
        ctx.beginPath();
        ctx.moveTo(selected.x, selected.y);
        ctx.lineTo(other.x, other.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  // 3. 节点（远 → 近）。
  for (const node of projected) {
    const isSelected = node.id === selectedId;
    const isNeighbor = neighborIds.has(node.id);
    const dimmed = Boolean(selectedId) && !isSelected && !isNeighbor;
    const fade = depthFade(node.z, camera, dimmed ? 0.12 : 0.32, 1);
    const alpha = (dimmed ? 0.32 : 1) * fade;
    const radius = isSelected ? node.screenRadius * pulse : node.screenRadius;
    const sprite = getNodeSprite(node.color, radius, dpr, input.theme ?? "dark");
    if (sprite) {
      const drawSize = spriteDrawSize(radius);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, node.x - drawSize / 2, node.y - drawSize / 2, drawSize, drawSize);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (isSelected) {
      ctx.strokeStyle = palette.selectedRing;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (node.id === hoveredId) {
      ctx.strokeStyle = palette.hoverRing;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 拖动中的节点：实线环；落点目标：绿色实线环。
    if (node.id === dragNodeId) {
      ctx.strokeStyle = palette.dragRing;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (node.id === dropTargetId) {
      ctx.strokeStyle = palette.dropRing;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 连线模式的源节点：橙色环。
    if (node.id === connectSourceId) {
      ctx.strokeStyle = palette.sourceRing;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 4. 折叠徽标 +N：学科/章常显，其余节点只在聚焦时显示，避免画面噪声。
  ctx.font =
    "10px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const node of projected) {
    const hidden = badges.get(node.id) ?? 0;
    if (hidden <= 0) continue;
    const focused = node.id === selectedId || node.id === hoveredId;
    if (node.depth > 2 && !focused) continue;
    // 小屏空间有限：折叠徽标只在聚焦时显示。
    if (isMobile && !focused) continue;
    const x = node.x + node.screenRadius + 8;
    const y = node.y - node.screenRadius - 7;
    ctx.globalAlpha = focused ? 1 : 0.72;
    ctx.fillStyle = palette.badgeFill;
    ctx.strokeStyle = palette.badgeBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.badgeText;
    ctx.fillText(`+${hidden}`, x, y + 0.5);
    ctx.globalAlpha = 1;
  }

  // 5. 标签：学科 / 章常显，其余在 hover / 选中 / 邻域时显示。
  if (input.showLabels) {
    const drawnRects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const labelNodes = projected.filter(
      (node) =>
        node.depth <= (isMobile ? 1 : 2) ||
        node.id === selectedId ||
        node.id === hoveredId ||
        neighborIds.has(node.id),
    );
    // 近的优先
    labelNodes.sort((a, b) => a.z - b.z);
    ctx.font =
      "11px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const node of labelNodes) {
      const title = input.titleOf(node.id);
      if (!title) continue;
      const offsetX = node.screenRadius + 6;
      const width = ctx.measureText(title).width;
      const x = node.x + offsetX;
      const y = node.y;
      const rect = { x, y: y - 7, w: width + 2, h: 14 };
      if (drawnRects.some((r) => intersects(r, rect))) continue;
      drawnRects.push(rect);
      const fade = depthFade(node.z, camera, 0.35, 1);
      ctx.globalAlpha = fade;
      ctx.fillStyle = palette.labelHalo;
      ctx.fillRect(x - 3, y - 8, width + 6, 16);
      ctx.fillStyle = palette.labelText;
      ctx.fillText(title, x, y);
      ctx.globalAlpha = 1;
    }
  }
}

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
