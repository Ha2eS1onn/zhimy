"use client";

import { memo } from "react";
import Link from "next/link";
import { LocalThumbnail } from "@/components/common/LocalThumbnail";
import { buildPath } from "@/lib/path";
import { useGraphStore } from "@/store/graphStore";
import type { ChatMessage } from "@/types";
import { CaptureCard } from "./CaptureCard";
import { RichText } from "./RichText";

export const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const nodes = useGraphStore((state) => state.nodes);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2.5">
          {message.imageName ? (
            <LocalThumbnail
              id={message.id}
              alt={message.imageName}
              className="mb-1.5 h-40 w-full max-w-xs rounded-lg border border-line object-cover"
              fallback={
                <p className="mb-1 text-[11px] text-muted">
                  图片：{message.imageName}（本机未缓存缩略图）
                </p>
              }
            />
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{message.content}</p>
        </div>
      </div>
    );
  }

  const hit = message.payload.hit;
  const hitNode = hit ? nodes.find((node) => node.id === hit.nodeId) : undefined;
  const suggestions = (message.payload.suggestions ?? []).filter(
    (suggestion) => suggestion.status !== "dismissed",
  );
  const reasoning = message.payload.reasoning?.trim() ?? "";

  return (
    <div className="space-y-2.5">
      {reasoning ? (
        <details className="max-w-[92%] rounded-2xl bg-surface px-3 py-2 shadow-[var(--neu-soft)]">
          <summary className="cursor-pointer text-[11px] text-muted">思考</summary>
          <div className="details-body mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
            {reasoning}
          </div>
        </details>
      ) : null}

      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface px-4 py-3 shadow-[var(--neu-soft)]">
        <RichText text={message.content} />
      </div>

      {hit && hitNode ? (
        <div className="max-w-[92%] rounded-2xl bg-surface px-4 py-3 shadow-[var(--neu-soft)]">
          <p className="flex items-center gap-1.5 text-[11px] text-accent">已收录</p>
          <p className="mt-1 break-all text-sm text-ink">
            {buildPath(nodes, hitNode.id)
              .map((node) => node.title)
              .join(" / ")}
          </p>
          <Link href={`/atlas?node=${hitNode.id}`} className="btn-subtle btn-sm mt-2">
            查看
          </Link>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="max-w-[92%] space-y-2">
          <p className="text-[11px] text-muted">可收编</p>
          {suggestions.map((suggestion) => (
            <CaptureCard key={suggestion.id} suggestion={suggestion} messageId={message.id} />
          ))}
        </div>
      ) : null}
    </div>
  );
});
