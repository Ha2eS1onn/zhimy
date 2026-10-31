"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * 把模型返回的 chunk 平滑成“逐字上屏”。
 *
 * SSE 的 chunk 往往一次好几个字；这里把收到的内容放进目标队列，
 * 每 24ms 取 1–12 个字符渲染，网络结束时 flush() 一次性补齐。
 * 使用码点数组切分，避免 emoji / 代理对在打字过程中被截断。
 */

const TICK_MS = 24;
const MIN_STEP = 1;
const MAX_STEP = 12;

export interface Typewriter {
  /** 当前可见文本。 */
  text: string;
  /** 追加一段新内容（来自 SSE / mock）。 */
  push: (chunk: string) => void;
  /** 立即显示全部内容，返回完整文本。 */
  flush: () => string;
  /** 清空，准备下一次生成。 */
  reset: () => void;
  /** 尚未显示的完整文本（含已显示部分）。 */
  getTarget: () => string;
}

export function useTypewriter(): Typewriter {
  const [text, setText] = useState("");
  const targetRef = useRef<string[]>([]);
  const visibleRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const render = useCallback(() => {
    setText(targetRef.current.slice(0, visibleRef.current).join(""));
  }, []);

  const tick = useCallback(() => {
    const total = targetRef.current.length;
    if (visibleRef.current >= total) {
      stop();
      return;
    }
    const backlog = total - visibleRef.current;
    const step = Math.min(MAX_STEP, Math.max(MIN_STEP, Math.ceil(backlog / 8)));
    visibleRef.current = Math.min(total, visibleRef.current + step);
    render();
    if (visibleRef.current >= total) stop();
  }, [render, stop]);

  const start = useCallback(() => {
    if (timerRef.current !== null || typeof window === "undefined") return;
    timerRef.current = window.setInterval(tick, TICK_MS);
  }, [tick]);

  const push = useCallback(
    (chunk: string) => {
      if (!chunk) return;
      targetRef.current.push(...Array.from(chunk));
      if (reducedMotion) {
        visibleRef.current = targetRef.current.length;
        render();
        return;
      }
      start();
    },
    [reducedMotion, render, start],
  );

  const flush = useCallback(() => {
    stop();
    visibleRef.current = targetRef.current.length;
    const full = targetRef.current.join("");
    setText(full);
    return full;
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    targetRef.current = [];
    visibleRef.current = 0;
    setText("");
  }, [stop]);

  useEffect(() => {
    if (!reducedMotion) return;
    stop();
    visibleRef.current = targetRef.current.length;
    render();
  }, [reducedMotion, render, stop]);

  useEffect(() => stop, [stop]);

  return {
    text,
    push,
    flush,
    reset,
    getTarget: () => targetRef.current.join(""),
  };
}
