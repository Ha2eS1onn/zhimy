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
});
