"use client";

import { Fragment } from "react";
import type { ReactNode } from "react";
import { TeXMath } from "@/components/node/TeXMath";
import { splitDisplayMath } from "@/lib/math/display";
import { tokenizeInline } from "@/lib/math/inline";

/**
 * 轻量富文本：支持 **加粗**、行内代码、行内 LaTeX、独立公式、无序/有序列表与换行。
 * 独立公式先按整段文本切分（支持跨行、行中），避免聊天渲染按行拆开后把 $$ 显示成原文。
 */
export function RichText({ text }: { text: string }) {
  const segments = splitDisplayMath(text);
  if (segments.length === 0) return null;

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-ink">
      {segments.map((segment, segmentIndex) => {
        if (segment.type === "math") {
          return <TeXMath key={`math-${segmentIndex}`} tex={segment.value} display />;
        }
        // 公式前后的换行由公式块的 margin 负责，避免多出空白行。
        const text = segment.value.replace(/^\n+|\n+$/g, "");
        if (!text) return null;
        return (
          <Fragment key={`text-${segmentIndex}`}>
            {renderTextLines(text, segmentIndex)}
          </Fragment>
        );
      })}
    </div>
  );
}

function renderTextLines(text: string, segmentIndex: number): ReactNode[] {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const key = `${segmentIndex}-${index}-${line.slice(0, 8)}`;

    const fence = line.match(/^```([^\s]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      nodes.push(
        <pre
          key={`${key}-code`}
          className="overflow-x-auto rounded-xl border border-line bg-canvas p-3 text-xs leading-relaxed text-ink/80"
        >
          {fence[1] ? (
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
              {fence[1]}
            </span>
          ) : null}
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (!line.trim()) {
      nodes.push(<div key={key} className="h-1" />);
      continue;
    }
    const bullet = line.match(/^[-•]\s+(.*)$/);
    if (bullet) {
      nodes.push(
        <div key={key} className="flex gap-2">
          <span className="mt-[3px] text-muted">•</span>
          <span>{renderInline(bullet[1] ?? "")}</span>
        </div>,
      );
      continue;
    }
    const ordered = line.match(/^(\d+)[.、]\s+(.*)$/);
    if (ordered) {
      nodes.push(
        <div key={key} className="flex gap-2">
          <span className="shrink-0 text-muted">{ordered[1]}.</span>
          <span>{renderInline(ordered[2] ?? "")}</span>
        </div>,
      );
      continue;
    }
    nodes.push(<p key={key}>{renderInline(line)}</p>);
  }

  return nodes;
}

function renderInline(text: string): ReactNode[] {
  return tokenizeInline(text).map((token, index) => {
    switch (token.type) {
      case "strong":
        return (
          <strong key={index} className="font-semibold text-accent">
            {renderInline(token.value)}
          </strong>
        );
      case "code":
        return (
          <code
            key={index}
            className="rounded bg-surface-2 px-1 py-0.5 text-[0.92em] text-accent"
          >
            {token.value}
          </code>
        );
      case "math":
        return <TeXMath key={index} tex={token.value} display={token.display} />;
      default:
        return <Fragment key={index}>{token.value}</Fragment>;
    }
  });
}
