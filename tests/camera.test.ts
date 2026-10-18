import { describe, expect, it } from "vitest";
import {
  projectPoint,
  screenDeltaToWorld,
  unproject,
  type CameraState,
} from "@/lib/atlas/camera";
import { DEFAULT_CAMERA } from "@/lib/layout/constants";

const WIDTH = 1200;
const HEIGHT = 800;

describe("投影 / 逆投影（拖动节点位置换算）", () => {
  const camera: CameraState = { ...DEFAULT_CAMERA };

  it("屏幕坐标 + 深度可以还原出原世界坐标", () => {
    const world = { x: 30, y: 12, z: -20 };
    const projected = projectPoint(world, camera, WIDTH, HEIGHT);
    expect(projected).not.toBeNull();
    const restored = unproject(projected!.x, projected!.y, projected!.z, camera, WIDTH, HEIGHT);
    expect(restored.x).toBeCloseTo(world.x, 5);
    expect(restored.y).toBeCloseTo(world.y, 5);
    expect(restored.z).toBeCloseTo(world.z, 5);
  });

  it("屏幕位移换算出的世界位移能正确回投影", () => {
    const z = 600;
    const start = unproject(400, 300, z, camera, WIDTH, HEIGHT);
    const delta = screenDeltaToWorld(120, -60, z, camera, WIDTH, HEIGHT);
    const moved = {
      x: start.x + delta.x,
      y: start.y + delta.y,
      z: start.z + delta.z,
    };
    const projected = projectPoint(moved, camera, WIDTH, HEIGHT);
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeCloseTo(520, 4);
    expect(projected!.y).toBeCloseTo(240, 4);
  });

  it("拖拽屏幕像素越多，世界位移越大", () => {
    const small = screenDeltaToWorld(10, 0, 600, camera, WIDTH, HEIGHT);
    const large = screenDeltaToWorld(20, 0, 600, camera, WIDTH, HEIGHT);
    expect(Math.hypot(large.x, large.y, large.z)).toBeGreaterThan(
      Math.hypot(small.x, small.y, small.z) * 1.5,
    );
  });
});
