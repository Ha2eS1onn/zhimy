/**
 * 从整段文本里切出独立公式（$$...$$ 与 \[...\]）。
 *
 * 与 MarkdownLite 的“行首公式块”不同，这里允许公式出现在行中间、跨多行，
 * 适合聊天消息这种一行一个段落的渲染方式。代码围栏、行内反引号和转义美元
 * 不会被当成公式，避免误伤代码示例。
 */

export type DisplayMathSegment =
  | { type: "text"; value: string }
  | { type: "math"; value: string };

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findClosing(source: string, token: string, from: number): number {
  let index = source.indexOf(token, from);
  while (index >= 0) {
    if (!isEscaped(source, index)) return index;
    index = source.indexOf(token, index + token.length);
  }
  return -1;
}

export function splitDisplayMath(input: string): DisplayMathSegment[] {
  if (!input) return [];

  const segments: DisplayMathSegment[] = [];
  let textStart = 0;
  let index = 0;
  let inInlineCode = false;

  while (index < input.length) {
    // 代码围栏整体跳过，避免把代码里的 $$ 当公式。
    if (input.startsWith("```", index) && !inInlineCode) {
      const close = input.indexOf("```", index + 3);
      index = close >= 0 ? close + 3 : input.length;
      continue;
    }

    const char = input[index]!;
    if (char === "`") {
      inInlineCode = !inInlineCode;
      index += 1;
      continue;
    }
    if (inInlineCode) {
      index += 1;
      continue;
    }

    const isDollar = input.startsWith("$$", index) && !isEscaped(input, index);
    const isBracket =
      char === "\\" &&
      input[index + 1] === "[" &&
      !isEscaped(input, index);

    if (!isDollar && !isBracket) {
      index += 1;
      continue;
    }

    const openLength = 2;
    const closeToken = isDollar ? "$$" : "\\]";
    const close = findClosing(input, closeToken, index + openLength);
    if (close < 0) {
      // 未闭合：按普通文本处理，不吞掉后续正文。
      index += openLength;
      continue;
    }

    const value = input.slice(index + openLength, close).trim();
    if (!value) {
      index += openLength;
      continue;
    }

    if (index > textStart) {
      segments.push({ type: "text", value: input.slice(textStart, index) });
    }
    segments.push({ type: "math", value });
    index = close + closeToken.length;
    textStart = index;
  }

  if (textStart < input.length) {
    segments.push({ type: "text", value: input.slice(textStart) });
  }

  return segments;
}
