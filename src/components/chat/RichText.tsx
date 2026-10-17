"use client";

import { Fragment } from "react";

/** 轻量富文本：支持 **加粗**、无序/有序列表与换行，不引入 markdown 依赖。 */
export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-ink">
      {lines.map((line, index) => {
        const key = `${index}-${line.slice(0, 8)}`;
        if (!line.trim()) return <div key={key} className="h-1" />;
        const bullet = line.match(/^[-•]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={key} className="flex gap-2">
              <span className="mt-[3px] text-muted">•</span>
              <span>{renderInline(bullet[1] ?? "")}</span>
            </div>
          );
        }
        const ordered = line.match(/^(\d+)[.、]\s+(.*)$/);
        if (ordered) {
          return (
            <div key={key} className="flex gap-2">
              <span className="shrink-0 text-muted">{ordered[1]}.</span>
              <span>{renderInline(ordered[2] ?? "")}</span>
            </div>
          );
        }
        return <p key={key}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-accent">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
