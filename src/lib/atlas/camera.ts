import type { Vec3 } from "@/lib/math3";
import { cross, dot, length, normalize, scale, sub, vec } from "@/lib/math3";
import {
  BASE_CAMERA_DISTANCE,
  CAMERA_EASE_SPEED,
  FOV,
  PITCH_LIMIT,
  ZOOM_MAX,
  ZOOM_MIN,
} from "@/lib/layout/constants";

export interface CameraState {
  yaw: number;
  pitch: number;
  zoom: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  /** 视图空间深度（越大越远）。 */
  z: number;
}

export function clampPitch(pitch: number): number {
  return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function cameraDistance(camera: CameraState): number {
  return BASE_CAMERA_DISTANCE / camera.zoom;
}

/** 视口焦距：透视投影的 f。 */
export function focalLength(width: number, height: number): number {
  return Math.min(width, height) / (2 * Math.tan(FOV / 2));
}

export function cameraPosition(camera: CameraState): Vec3 {
  const distance = cameraDistance(camera);
  return vec(
    distance * Math.sin(camera.yaw) * Math.cos(camera.pitch),
    distance * Math.sin(camera.pitch),
    distance * Math.cos(camera.yaw) * Math.cos(camera.pitch),
  );
}

/** 透视投影：世界坐标 → 屏幕坐标；相机前方之外的点返回 null。 */
export function projectPoint(
  point: Vec3,
  camera: CameraState,
  width: number,
  height: number,
): ProjectedPoint | null {
  const camPos = cameraPosition(camera);
  const forward = normalize(scale(camPos, -1));
  const right = normalize(cross(forward, vec(0, 1, 0)));
  const up = cross(right, forward);
  const rel = sub(point, camPos);
  const z = dot(rel, forward);
  if (z <= 1) return null;
  const focal = focalLength(width, height);
  const x = width / 2 + (dot(rel, right) * focal) / z;
  const y = height / 2 - (dot(rel, up) * focal) / z;
  return { x, y, z };
}

/** 点击节点后相机需要转到的朝向：让该节点落在屏幕中心。 */
export function focusTargetFor(position: Vec3): { yaw: number; pitch: number } {
  const len = length(position) || 1;
  return {
    yaw: Math.atan2(position.x, position.z),
    pitch: clampPitch(Math.asin(position.y / len)),
  };
}

/** 最短角度差，处理 2π 环绕。 */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** 指数缓动：与帧率无关。 */
export function approach(current: number, target: number, dt: number, speed = CAMERA_EASE_SPEED): number {
  const factor = 1 - Math.exp(-speed * dt);
  return current + (target - current) * factor;
}

export function approachAngle(
  current: number,
  target: number,
  dt: number,
  speed = CAMERA_EASE_SPEED,
): number {
  const factor = 1 - Math.exp(-speed * dt);
  return current + shortestAngleDelta(current, target) * factor;
}

export function cameraReached(camera: CameraState, target: CameraState, epsilon = 0.002): boolean {
  return (
    Math.abs(shortestAngleDelta(camera.yaw, target.yaw)) < epsilon &&
    Math.abs(shortestAngleDelta(camera.pitch, target.pitch)) < epsilon &&
    Math.abs(camera.zoom - target.zoom) < epsilon
  );
}
