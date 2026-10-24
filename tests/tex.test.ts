import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tokenizeInline } from "@/lib/math/inline";
import { splitDisplayMath } from "@/lib/math/display";
import { MarkdownLite } from "@/components/node/MarkdownLite";
import { TeXMath } from "@/components/node/TeXMath";
import { RichText } from "@/components/chat/RichText";

/** KaTeX 的 MathML 会在 <annotation> 里保留原始 TeX；断言“可见输出”时先剥掉。 */
function visibleHtml(html: string): string {
  return html.replace(/<annotation[\s\S]*?<\/annotation>/g, "");
}

describe("KaTeX 公式渲染", () => {
  it("渲染向量箭头、绝对值与嵌套分数/根号", () => {
    const html = renderToStaticMarkup(
      createElement(TeXMath, {
        tex: "\\sin45^\\circ=\\frac{\\left|\\overrightarrow{DE}\\cdot(0,1,0)\\right|}{\\left|\\overrightarrow{DE}\\right|}=\\frac{\\frac a2}{\\sqrt{\\frac{a^2}{4}+1}}",
        display: true,
      }),
    );
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
    expect(html).not.toContain("katex-error");
    expect(visibleHtml(html)).not.toContain("\\overrightarrow");
    // 原始 TeX 仍保留在 MathML annotation 中，屏幕阅读器/复制可用
    expect(html).toContain("<annotation");
  });

  it("未知命令不抛错，以错误高亮保留其余内容", () => {
    const html = renderToStaticMarkup(
      createElement(TeXMath, { tex: "\\notacommand{x}+1" }),
    );
    expect(html).toContain("katex");
    // KaTeX 用 errorColor 把无法识别的命令标红，而不是整段抛错
    expect(html).toContain("#f87171");
    expect(html).toContain("+");
  });

  it("空公式不渲染", () => {
    expect(renderToStaticMarkup(createElement(TeXMath, { tex: "   " }))).toBe("");
  });

  it("MarkdownLite 把定界符渲染成公式，而不是显示原始反斜杠", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownLite, {
        markdown: "行内 \\(R_x\\) 与根号\n\n$$\\sqrt{R_A \\cdot R_V}$$\n\n普通文字",
      }),
    );
    expect(html).not.toContain("\\(");
    expect(html).toContain("katex");
    expect(html).not.toContain("$$");
    expect(html).toContain("普通文字");
  });
});

describe("行内公式分词", () => {
  it("加粗、行内代码与 $...$ 混排", () => {
    const tokens = tokenizeInline("**能量**与 $E=mc^2$ 和 `code`");
    expect(tokens.map((token) => token.type)).toEqual(["strong", "text", "math", "text", "code"]);
    expect(tokens[2]).toMatchObject({ type: "math", value: "E=mc^2", display: false });
  });

  it("支持 \\(...\\) 与 \\[...\\] 两种定界符", () => {
    const tokens = tokenizeInline("行内 \\(R_x\\) 与 \\[\\frac{a}{b}\\]");
    const maths = tokens.filter((token) => token.type === "math");
    expect(maths).toHaveLength(2);
    expect(maths[0]).toMatchObject({ value: "R_x", display: false });
    expect(maths[1]).toMatchObject({ value: "\\frac{a}{b}", display: true });
  });

  it("纯数字坐标按公式处理，金额和单价不处理", () => {
    expect(tokenizeInline("$(1,0,0)$")).toEqual([
      { type: "math", value: "(1,0,0)", display: false },
    ]);
    expect(tokenizeInline("$ (1, 0, 0) $")).toEqual([
      { type: "math", value: "(1, 0, 0)", display: false },
    ]);
    expect(tokenizeInline("$5")).toEqual([{ type: "text", value: "$5" }]);
    expect(tokenizeInline("$1,000")).toEqual([{ type: "text", value: "$1,000" }]);
    expect(tokenizeInline("价格 $5 和 $6").some((token) => token.type === "math")).toBe(false);
  });

  it("转义 \\$ 与代码里的 $ 不解析", () => {
    expect(tokenizeInline("价格 \\$5")).toEqual([{ type: "text", value: "价格 $5" }]);
    expect(tokenizeInline("`$x$`")).toEqual([{ type: "code", value: "$x$" }]);
  });

  it("加粗内部仍可递归解析公式", () => {
    const tokens = tokenizeInline("**公式 $x$**");
    expect(tokens[0]).toMatchObject({ type: "strong", value: "公式 $x$" });
  });

  it("display 公式允许内容跨行", () => {
    const tokens = tokenizeInline("$$a+b\nc$$");
    expect(tokens[0]).toMatchObject({ type: "math", display: true });
    expect((tokens[0] as { value: string }).value).toContain("\n");
  });
});

describe("跨行独立公式切分", () => {
  it("行中、跨行的 $$...$$ 会变成独立公式段", () => {
    const segments = splitDisplayMath("则\n$$\\overrightarrow{DE}=E-D$$\n所以");
    expect(segments.map((segment) => segment.type)).toEqual(["text", "math", "text"]);
    expect(segments[1]).toMatchObject({
      type: "math",
      value: "\\overrightarrow{DE}=E-D",
    });
  });

  it("支持 \\[...\\] 与多个公式", () => {
    const segments = splitDisplayMath("\\[x^2\\] 和 $$y^2$$");
    expect(segments.filter((segment) => segment.type === "math")).toHaveLength(2);
  });

  it("转义美元、未闭合公式与代码围栏不误判", () => {
    const escaped = splitDisplayMath("价格 \\$5 和 $$x$$");
    expect(escaped[0]).toMatchObject({ type: "text" });
    expect(escaped[0]).toMatchObject({ value: "价格 \\$5 和 " });

    expect(splitDisplayMath("$$未闭合")).toEqual([{ type: "text", value: "$$未闭合" }]);
    expect(splitDisplayMath("```\n$$x$$\n```")).toEqual([
      { type: "text", value: "```\n$$x$$\n```" },
    ]);
    expect(splitDisplayMath("`$$x$$`")).toEqual([{ type: "text", value: "`$$x$$`" }]);
  });

  it("RichText 把跨行公式渲染成 KaTeX，而不是原始 $$", () => {
    const answer = [
      "于是",
      "$$\\sin45^\\circ=\\frac{\\left|\\overrightarrow{DE}\\cdot(0,1,0)\\right|}{\\left|\\overrightarrow{DE}\\right|}$$",
      "所以结论成立。",
    ].join("\n");
    const html = renderToStaticMarkup(createElement(RichText, { text: answer }));
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    expect(html).not.toContain("$$");
    expect(visibleHtml(html)).not.toContain("\\overrightarrow");
    expect(html).toContain("所以结论成立。");
  });

  it("RichText 渲染围栏代码块（编程问题）", () => {
    const html = renderToStaticMarkup(
      createElement(RichText, {
        text: "示例：\n```ts\nconst answer = 42;\n```\n以上。",
      }),
    );
    expect(html).toContain("<pre");
    expect(html).toContain("const answer = 42;");
    expect(html).not.toContain("```");
    expect(html).toContain("以上。");
  });
});
