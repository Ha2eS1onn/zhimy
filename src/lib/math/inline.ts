/** 行内 Markdown-lite 分词：加粗、行内代码与 LaTeX 公式。 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "code"; value: string }
  | { type: "math"; value: string; display: boolean };

/** 判断 $...$ 内容是否像公式：纯数字（如 $5）按货币处理，不渲染。 */
const MATH_HINT = /[A-Za-z\\^_{}=<>+\-*/|]|[\u0370-\u03ff]/;

/** 纯数字坐标，例如 (1,0,0)、(0, 1, 0)；不把 1,000 这种金额误判为公式。 */
const NUMERIC_TUPLE = /^\(\s*[-+]?\d+(?:\.\d+)?(?:\s*,\s*[-+]?\d+(?:\.\d+)?)+\s*\)$/;

function looksLikeMath(value: string): boolean {
  return MATH_HINT.test(value) || NUMERIC_TUPLE.test(value);
}

/**
 * 把一行文本拆成 token。数学公式优先于加粗识别，
 * 避免公式里的 `_`、`*` 被当成 Markdown 强调语法。
 */
export function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let buffer = "";
  let index = 0;

  const flush = () => {
    if (buffer) {
      tokens.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  while (index < input.length) {
    const char = input[index]!;

    // 行内代码：内部不解析公式与加粗。
    if (char === "`") {
      const end = input.indexOf("`", index + 1);
      if (end > index + 1) {
        flush();
        tokens.push({ type: "code", value: input.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    // **加粗**
    if (char === "*" && input.startsWith("**", index)) {
      const end = input.indexOf("**", index + 2);
      if (end > index + 2) {
        flush();
        tokens.push({ type: "strong", value: input.slice(index + 2, end) });
        index = end + 2;
        continue;
      }
    }

    // \( ... \) / \[ ... \]
    if (char === "\\" && (input[index + 1] === "(" || input[index + 1] === "[")) {
      const open = input[index + 1]!;
      const close = open === "(" ? "\\)" : "\\]";
      const end = input.indexOf(close, index + 2);
      if (end > index + 2) {
        const value = input.slice(index + 2, end).trim();
        if (value) {
          flush();
          tokens.push({ type: "math", value, display: open === "[" });
          index = end + 2;
          continue;
        }
      }
    }

    // 转义的美元符号按普通文本处理。
    if (char === "\\" && input[index + 1] === "$") {
      buffer += "$";
      index += 2;
      continue;
    }

    // $ ... $ / $$ ... $$
    if (char === "$") {
      const display = input.startsWith("$$", index);
      const openLength = display ? 2 : 1;
      const close = display ? "$$" : "$";
      const end = input.indexOf(close, index + openLength);
      if (end > index + openLength) {
        const raw = input.slice(index + openLength, end);
        const value = raw.trim();
        const valid =
          value.length > 0 &&
          (display || !/[\n\r]/.test(value)) &&
          (display || looksLikeMath(value));
        if (valid) {
          flush();
          tokens.push({ type: "math", value, display });
          index = end + close.length;
          continue;
        }
      }
    }

    buffer += char;
    index += 1;
  }

  flush();
  return tokens;
}
