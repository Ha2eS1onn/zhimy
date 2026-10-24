import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks } from "@/components/node/MarkdownLite";

describe("Markdown-lite 解析", () => {
  it("解析标题、段落、列表与加粗", () => {
    const blocks = parseMarkdownBlocks(
      ["## 一句话理解", "", "**电阻** 是导体对电流的阻碍。", "", "- 要点一", "- 要点二"].join("\n"),
    );
    expect(blocks[0]).toEqual({ type: "heading", level: 2, text: "一句话理解" });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false });
    expect((blocks[2] as { items: string[] }).items).toEqual(["要点一", "要点二"]);
  });

  it("有序列表、引用、代码块与分割线", () => {
    const blocks = parseMarkdownBlocks(
      ["1. 第一步", "2. 第二步", "", "> 引用一句", "", "```", "code here", "```", "", "---"].join("\n"),
    );
    expect(blocks[0]).toMatchObject({ type: "list", ordered: true });
    expect(blocks[1]).toMatchObject({ type: "quote" });
    expect(blocks[2]).toMatchObject({ type: "code", text: "code here" });
    expect(blocks[3]).toMatchObject({ type: "hr" });
  });

  it("普通段落会合并连续行", () => {
    const blocks = parseMarkdownBlocks("第一行\n第二行\n\n新段落");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "paragraph", text: "第一行 第二行" });
  });

  it("空内容返回空数组", () => {
    expect(parseMarkdownBlocks("")).toEqual([]);
    expect(parseMarkdownBlocks("\n\n")).toEqual([]);
  });

  it("独立公式块：$$...$$ 与 \\[...\\]（含跨行）", () => {
    const single = parseMarkdownBlocks("$$\\frac{a}{b}$$\n\n正文");
    expect(single[0]).toMatchObject({ type: "math", text: "\\frac{a}{b}" });

    const multi = parseMarkdownBlocks("$$\na+b\n$$\n\n正文");
    expect(multi[0]).toMatchObject({ type: "math", text: "a+b" });

    const bracket = parseMarkdownBlocks("\\[x^2\\]");
    expect(bracket[0]).toMatchObject({ type: "math", text: "x^2" });
  });

  it("行内公式仍是段落，不会被拆成公式块", () => {
    const blocks = parseMarkdownBlocks("公式 $x$ 在文中");
    expect(blocks[0]).toMatchObject({ type: "paragraph", text: "公式 $x$ 在文中" });
  });
});
