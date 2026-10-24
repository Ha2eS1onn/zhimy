"use client";

import { Fragment } from "react";
import type { ReactNode } from "react";
import { tokenizeInline } from "@/lib/math/inline";
import { TeXMath } from "./TeXMath";

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "math"; text: string }
  | { type: "hr" };

/** 读取一整段独立公式：$$...$$ 或 \[...\]，允许跨行。 */
function readDisplayMath(
  lines: string[],
  start: number,
): { text: string; nextIndex: number } | null {
  const first = (lines[start] ?? "").trim();
  const isDollar = first.startsWith("$$");
  if (!isDollar && !first.startsWith("\\[")) return null;

  const closeToken = isDollar ? "$$" : "\\]";
  const after = first.slice(2);
  const closeIndex = after.indexOf(closeToken);
  if (closeIndex >= 0) {
    const text = after.slice(0, closeIndex).trim();
    const tail = after.slice(closeIndex + closeToken.length).trim();
    // 闭合后还有正文（如 "$$x$$ 是公式"）：交给段落内联解析，避免吞掉文字。
    if (tail || !text) return null;
    return { text, nextIndex: start + 1 };
  }

  const parts: string[] = [after];
  let index = start + 1;
  while (index < lines.length) {
    const current = lines[index] ?? "";
    index += 1;
    const closeAt = current.indexOf(closeToken);
    if (closeAt >= 0) {
      parts.push(current.slice(0, closeAt));
      return { text: parts.join("\n").trim(), nextIndex: index };
    }
    parts.push(current);
  }
  return { text: parts.join("\n").trim(), nextIndex: index };
}

/** 把 Markdown-lite 解析成块级结构（导出便于单测）。 */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  const isBlockStart = (line: string) =>
    /^#{1,3}\s/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+[.、]\s+/.test(line) ||
    line.startsWith(">") ||
    line.startsWith("```") ||
    line.startsWith("$$") ||
    line.startsWith("\\[") ||
    /^(-{3,}|\*{3,})$/.test(line);

  while (index < lines.length) {
    const raw = lines[index] ?? "";
    const line = raw.trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const displayMath = readDisplayMath(lines, index);
    if (displayMath) {
      blocks.push({ type: "math", text: displayMath.text });
      index = displayMath.nextIndex;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const parts: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith(">")) {
        parts.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: parts.join("\n") });
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").trim().match(/^[-*]\s+(.*)$/);
        if (!match) break;
        items.push(match[1]!);
        index += 1;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    const ordered = line.match(/^\d+[.、]\s+(.*)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").trim().match(/^\d+[.、]\s+(.*)$/);
        if (!match) break;
        items.push(match[1]!);
        index += 1;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = (lines[index] ?? "").trim();
      if (!next || isBlockStart(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  return tokenizeInline(text).map((token, index) => {
    switch (token.type) {
      case "strong":
        return (
          <strong key={index} className="font-semibold text-ink">
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

/** 只读渲染 Markdown-lite；编辑在详情页的编辑器里完成。 */
export function MarkdownLite({ markdown }: { markdown: string }) {
  const blocks = parseMarkdownBlocks(markdown);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-3 text-sm leading-7 text-ink/90">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            if (block.level === 1) {
              return (
                <h2 key={index} className="mt-6 text-xl font-semibold text-ink">
                  {renderInline(block.text)}
                </h2>
              );
            }
            if (block.level === 2) {
              return (
                <h3 key={index} className="mt-5 border-l-2 border-accent/60 pl-2 text-base font-semibold text-ink">
                  {renderInline(block.text)}
                </h3>
              );
            }
            return (
              <h4 key={index} className="mt-4 text-sm font-semibold text-ink">
                {renderInline(block.text)}
              </h4>
            );
          }
          case "paragraph":
            return <p key={index}>{renderInline(block.text)}</p>;
          case "list":
            return block.ordered ? (
              <ol key={index} className="list-decimal space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul key={index} className="list-disc space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote
                key={index}
                className="rounded-r-lg border-l-2 border-line bg-surface-2/50 px-3 py-2 text-xs text-muted"
              >
                {renderInline(block.text)}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={index}
                className="overflow-x-auto rounded-xl border border-line bg-canvas p-3 text-xs leading-relaxed text-ink/80"
              >
                <code>{block.text}</code>
              </pre>
            );
          case "math":
            return <TeXMath key={index} tex={block.text} display />;
          case "hr":
            return <hr key={index} className="border-line" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
