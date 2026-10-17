"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { KnowledgeNode, Relation } from "@/types";
import { computeLayout } from "@/lib/layout/layout";
import {
  approach,
  approachAngle,
  cameraReached,
  clampPitch,
  clampZoom,
  focusTargetFor,
  type CameraState,
} from "@/lib/atlas/camera";
import { hitTest } from "@/lib/atlas/hitTest";
import { projectNodes, renderScene, type ProjectedNode } from "@/lib/atlas/renderer";
import { AUTO_ROTATE_SPEED, DEFAULT_CAMERA } from "@/lib/layout/constants";

export interface AtlasCanvasHandle {
  focusNode: (id: string) => void;
  resetView: () => void;
  zoomBy: (factor: number) => void;
}

interface AtlasCanvasProps {
  nodes: KnowledgeNode[];
  relations: Relation[];
  visibleIds: Set<string>;
  selectedId: string | null;
  neighborIds: Set<string>;
  badges: Map<string, number>;
  autoRotate: boolean;
  onSelect: (id: string | null) => void;
}

export const AtlasCanvas = forwardRef<AtlasCanvasHandle, AtlasCanvasProps>(function AtlasCanvas(
  props,
  ref,
) {
  const { nodes, relations, visibleIds, selectedId, neighborIds, badges, autoRotate, onSelect } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const cameraRef = useRef<CameraState>({ ...DEFAULT_CAMERA });
  const targetRef = useRef<CameraState | null>(null);
  const layout = useMemo(() => computeLayout(nodes), [nodes]);
  const titleMap = useMemo(() => new Map(nodes.map((node) => [node.id, node.title])), [nodes]);
  const projectedRef = useRef<ProjectedNode[]>([]);

  // 渲染循环里读取的“最新值”都放 ref，避免动画闭包拿到旧 props。
  const layoutRef = useRef(layout);
  const titleRef = useRef(titleMap);
  const visibleRef = useRef(visibleIds);
  const relationsRef = useRef(relations);
  const selectedRef = useRef(selectedId);
  const neighborRef = useRef(neighborIds);
  const badgesRef = useRef(badges);
  const autoRotateRef = useRef(autoRotate);
  const onSelectRef = useRef(onSelect);
  layoutRef.current = layout;
  titleRef.current = titleMap;
  visibleRef.current = visibleIds;
  relationsRef.current = relations;
  selectedRef.current = selectedId;
  neighborRef.current = neighborIds;
  badgesRef.current = badges;
  autoRotateRef.current = autoRotate;
  onSelectRef.current = onSelect;

  const hoveredRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const pulseUntilRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const downPosRef = useRef({ x: 0, y: 0 });
  const cameraInitializedRef = useRef(false);

  const draw = useCallback(() => {
    const ctx = ctxRef.current;
    const { width, height, dpr } = sizeRef.current;
    if (!ctx || width <= 0 || height <= 0) return;
    const camera = cameraRef.current;
    const isMobile = width < 768;
    const projected = projectNodes({
      layout: layoutRef.current,
      visibleIds: visibleRef.current,
      camera,
      width,
      height,
      isMobile,
    });
    projectedRef.current = projected;
    renderScene({
      ctx,
      width,
      height,
      dpr,
      camera,
      projected,
      visibleIds: visibleRef.current,
      relations: relationsRef.current,
      selectedId: selectedRef.current,
      hoveredId: hoveredRef.current,
      neighborIds: neighborRef.current,
      badges: badgesRef.current,
      timeMs: performance.now(),
      showLabels: true,
      titleOf: (id) => titleRef.current.get(id),
    });
  }, []);

  const loop = useCallback(
    (time: number) => {
      const dt = lastTimeRef.current === 0 ? 0.016 : Math.min(0.05, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;
      const camera = cameraRef.current;
      let animating = false;

      const target = targetRef.current;
      if (target) {
        camera.yaw = approachAngle(camera.yaw, target.yaw, dt);
        camera.pitch = approach(camera.pitch, target.pitch, dt);
        camera.zoom = approach(camera.zoom, target.zoom, dt);
        if (cameraReached(camera, target)) targetRef.current = null;
        else animating = true;
      }
      if (autoRotateRef.current && !draggingRef.current && !targetRef.current) {
        camera.yaw += AUTO_ROTATE_SPEED * dt;
        animating = true;
      }
      if (time < pulseUntilRef.current) animating = true;

      draw();

      if (animating) {
        frameRef.current = requestAnimationFrame(loop);
      } else {
        runningRef.current = false;
        frameRef.current = null;
      }
    },
    [draw],
  );

  const ensureLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTimeRef.current = 0;
    frameRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const requestDraw = useCallback(() => {
    if (!runningRef.current) draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, rect.width < 768 ? 1.5 : 2);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctxRef.current = ctx;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 手机屏幕窄、可视范围小：初始视图稍微拉远，避免两个学科簇重叠。
      if (!cameraInitializedRef.current) {
        cameraInitializedRef.current = true;
        if (rect.width < 768) cameraRef.current.zoom = 0.95;
      }
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const camera = cameraRef.current;
      camera.zoom = clampZoom(camera.zoom * Math.exp(-event.deltaY * 0.0012));
      targetRef.current = null;
      requestDraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [requestDraw]);

  useEffect(() => {
    pulseUntilRef.current = performance.now() + 1200;
    requestDraw();
    if (selectedId) ensureLoop();
  }, [selectedId, requestDraw, ensureLoop]);

  useEffect(() => {
    requestDraw();
  }, [visibleIds, relations, neighborIds, badges, nodes, autoRotate, requestDraw]);

  useEffect(() => {
    if (autoRotate && !document.hidden) ensureLoop();
  }, [autoRotate, ensureLoop]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        runningRef.current = false;
        return;
      }
      requestDraw();
      if (autoRotateRef.current) ensureLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [ensureLoop, requestDraw]);

  useImperativeHandle(
    ref,
    () => ({
      focusNode: (id: string) => {
        const node = layoutRef.current.byId.get(id);
        if (!node) return;
        const { yaw, pitch } = focusTargetFor(node.position);
        targetRef.current = { yaw, pitch, zoom: cameraRef.current.zoom };
        ensureLoop();
      },
      resetView: () => {
        targetRef.current = { ...DEFAULT_CAMERA };
        ensureLoop();
      },
      zoomBy: (factor: number) => {
        cameraRef.current.zoom = clampZoom(cameraRef.current.zoom * factor);
        targetRef.current = null;
        requestDraw();
      },
    }),
    [ensureLoop, requestDraw],
  );

  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="atlas-canvas"
        aria-label="3D 知识图谱：拖拽旋转，滚轮缩放，点击节点查看详情"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = localPoint(event);
          pointersRef.current.set(event.pointerId, point);
          targetRef.current = null;
          if (pointersRef.current.size === 1) {
            draggingRef.current = true;
            movedRef.current = false;
            downPosRef.current = point;
          } else if (pointersRef.current.size === 2) {
            const points = Array.from(pointersRef.current.values());
            const distance = Math.hypot(
              (points[0]?.x ?? 0) - (points[1]?.x ?? 0),
              (points[0]?.y ?? 0) - (points[1]?.y ?? 0),
            );
            pinchRef.current = { distance, zoom: cameraRef.current.zoom };
            draggingRef.current = false;
          }
        }}
        onPointerMove={(event) => {
          const point = localPoint(event);
          const previous = pointersRef.current.get(event.pointerId);
          pointersRef.current.set(event.pointerId, point);

          if (pointersRef.current.size === 2 && pinchRef.current) {
            const points = Array.from(pointersRef.current.values());
            const distance = Math.hypot(
              (points[0]?.x ?? 0) - (points[1]?.x ?? 0),
              (points[0]?.y ?? 0) - (points[1]?.y ?? 0),
            );
            if (pinchRef.current.distance > 0) {
              cameraRef.current.zoom = clampZoom(
                pinchRef.current.zoom * (distance / pinchRef.current.distance),
              );
              requestDraw();
            }
            return;
          }

          if (draggingRef.current && previous) {
            const dx = point.x - previous.x;
            const dy = point.y - previous.y;
            if (Math.hypot(point.x - downPosRef.current.x, point.y - downPosRef.current.y) > 4) {
              movedRef.current = true;
            }
            const camera = cameraRef.current;
            camera.yaw += dx * 0.006;
            camera.pitch = clampPitch(camera.pitch + dy * 0.006);
            requestDraw();
            return;
          }

          const hit = hitTest(projectedRef.current, point.x, point.y, sizeRef.current.width < 768);
          const hovered = hit?.id ?? null;
          if (hovered !== hoveredRef.current) {
            hoveredRef.current = hovered;
            requestDraw();
          }
        }}
        onPointerUp={(event) => {
          const point = localPoint(event);
          pointersRef.current.delete(event.pointerId);
          if (pointersRef.current.size < 2) pinchRef.current = null;
          const wasDragging = draggingRef.current;
          const moved = movedRef.current;
          if (wasDragging && !moved && pointersRef.current.size === 0) {
            const hit = hitTest(projectedRef.current, point.x, point.y, sizeRef.current.width < 768);
            onSelectRef.current(hit?.id ?? null);
          }
          if (pointersRef.current.size === 0) {
            draggingRef.current = false;
            movedRef.current = false;
          }
          requestDraw();
        }}
        onPointerLeave={() => {
          if (hoveredRef.current) {
            hoveredRef.current = null;
            requestDraw();
          }
        }}
        onPointerCancel={() => {
          pointersRef.current.clear();
          pinchRef.current = null;
          draggingRef.current = false;
          movedRef.current = false;
        }}
        onDoubleClick={() => {
          targetRef.current = { ...DEFAULT_CAMERA };
          ensureLoop();
        }}
      />
    </div>
  );
});
