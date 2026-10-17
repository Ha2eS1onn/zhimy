"use client";

import Link from "next/link";
import { buildPath } from "@/lib/path";
import { useGraphStore } from "@/store/graphStore";
import type { ChatMessage } from "@/types";
import { CaptureCard } from "./CaptureCard";
import { RichText } from "./RichText";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const nodes = useGraphStore((state) => state.nodes);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{message.content}</p>
          {message.imageName ? (
            <p className="mt-1 text-[11px] text-muted">图片：{message.imageName}（P1 支持上传原图）</p>
          ) : null}
        </div>
      </div>
    );
  }

  const hit = message.payload.hit;
  const hitNode = hit ? nodes.find((node) => node.id === hit.nodeId) : undefined;
  const suggestions = (message.payload.suggestions ?? []).filter(
    (suggestion) => suggestion.status !== "dismissed",
  );

  return (
    <div className="space-y-2.5">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-surface/80 px-3.5 py-2.5">
        <RichText text={message.content} />
      </div>

      {hit && hitNode ? (
        <div className="max-w-[92%] rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-accent">已命中知识图谱 · 不再重讲</p>
          <p className="mt-1 break-all text-sm text-ink">
            {buildPath(nodes, hitNode.id)
              .map((node) => node.title)
              .join(" / ")}
          </p>
          <Link href={`/atlas?node=${hitNode.id}`} className="btn-subtle btn-sm mt-2">
            在知识库中查看
          </Link>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="max-w-[92%] space-y-2">
          <p className="text-[11px] text-muted">AI 从这次解答里抽出了 {suggestions.length} 个知识点：</p>
          {suggestions.map((suggestion) => (
            <CaptureCard key={suggestion.id} suggestion={suggestion} messageId={message.id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
