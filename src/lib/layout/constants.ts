import type { Density } from "@/types";

/** 3D 知识库的全部可调参数集中在这里，方便按截图反复调参。 */

/** 学科所在球面半径。 */
export const SUBJECT_RADIUS = 70;

/** 层距：学科由球面半径决定，depth 2–5 用下面的数值。 */
export const LAYER_DISTANCE: Record<number, number> = {
  1: SUBJECT_RADIUS,
  2: 46,
  3: 34,
  4: 24,
  5: 18,
};

export const CONE_HALF_ANGLE = (32 * Math.PI) / 180;
export const CONE_HALF_ANGLE_WIDE = (42 * Math.PI) / 180;
export const WIDE_CONE_SIBLING_THRESHOLD = 8;

/** 节点世界半径，按层级递减；渲染时还会套屏幕像素下限。 */
export const NODE_RADIUS_BY_DEPTH: Record<number, number> = {
  0: 0,
  1: 9,
  2: 6.5,
  3: 5.2,
  4: 4,
  5: 3,
};

/** 密度三档：概览看学科骨架（约 10 个），标准日常使用（约 40 个），细节全量。 */
export const DENSITY_MAX_DEPTH: Record<Density, number> = {
  overview: 2,
  standard: 3,
  detail: 5,
};

export const DENSITY_LABEL: Record<Density, string> = {
  overview: "概览",
  standard: "标准",
  detail: "细节",
};

/** 分支配色板（方案 §5.5）。 */
export const NODE_COLORS = [
  "#E040FB",
  "#FFD54F",
  "#4DD0E1",
  "#C6FF00",
  "#FF5252",
  "#B388FF",
  "#448AFF",
  "#FF8A65",
] as const;

/** 相机基线距离与视场角。 */
export const BASE_CAMERA_DISTANCE = 620;
export const FOV = (45 * Math.PI) / 180;

export const PITCH_LIMIT = (55 * Math.PI) / 180;
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.8;

export const DEFAULT_CAMERA = {
  yaw: 0.55,
  pitch: 0.3,
  zoom: 1,
};

export const MIN_SCREEN_RADIUS_DESKTOP = 10;
export const MIN_SCREEN_RADIUS_MOBILE = 8;
export const MAX_SCREEN_RADIUS = 40;

export const CAMERA_EASE_SPEED = 7;
export const AUTO_ROTATE_SPEED = 0.12;

/** 关系线参数（方案 §5.5）。 */
export const RELATION_LINE_WIDTH = 1.6;
export const HIERARCHY_LINE_ALPHA = 0.18;
