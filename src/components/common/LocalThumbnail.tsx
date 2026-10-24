"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getThumbnail } from "@/lib/media/localThumbnailStore";

interface LocalThumbnailProps {
  /** 本地缓存的 key：聊天消息用 message.id，来源用 source.id。 */
  id: string | null | undefined;
  alt?: string | null;
  className?: string;
  /** 缓存缺失时的降级内容；默认什么都不渲染（详情页来源列）。 */
  fallback?: ReactNode;
}

type LoadedThumbnail =
  | { id: string; status: "ready"; url: string }
  | { id: string; status: "missing" };

/**
 * 从 IndexedDB 读取本地缩略图并展示。
 * 原图没有上传云端，所以换设备/清站点数据后这里会自然回退到 fallback。
 */
export function LocalThumbnail({
  id,
  alt,
  className = "h-24 w-24 rounded-lg border border-line object-cover",
  fallback = null,
}: LocalThumbnailProps) {
  // 记录“这条 id 已经读完”的结果；id 变化时旧结果自然失效，渲染层回到骨架，
  // 不在 effect 里同步 setState（避免 React 的级联渲染告警）。
  const [loaded, setLoaded] = useState<LoadedThumbnail | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getThumbnail(id).then((thumbnail) => {
      if (cancelled) return;
      setLoaded(
        thumbnail
          ? { id, status: "ready", url: thumbnail.dataUrl }
          : { id, status: "missing" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return <>{fallback}</>;
  }
  if (loaded?.id !== id) {
    return <div aria-hidden className={`${className} animate-pulse bg-surface-2`} />;
  }
  if (loaded.status === "missing") {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={loaded.url}
      alt={alt ?? "题目图片"}
      className={className}
      loading="lazy"
    />
  );
}
