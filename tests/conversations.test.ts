import { describe, expect, it } from "vitest";
import { sortConversations, titleFromMessage } from "@/lib/conversations";

describe("会话标题", () => {
  it("用首条消息生成标题并压缩空白", () => {
    expect(titleFromMessage("  解释一下  递归和迭代的区别  ")).toBe(
      "解释一下 递归和迭代的区别",
    );
  });

  it("图片/空消息给可读标题", () => {
    expect(titleFromMessage("（图片提问）")).toBe("图片提问");
    expect(titleFromMessage("   ")).toBe("图片提问");
  });

  it("过长标题按字符截断到 24 字并加省略号", () => {
    const title = titleFromMessage("这是一段特别长的提问".repeat(5));
    expect(Array.from(title)).toHaveLength(25); // 24 字 + 省略号
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("会话排序", () => {
  it("按 updatedAt 倒序，时间相同时按 id 稳定排序", () => {
    const list = [
      { id: "b", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "a", updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: "c", updatedAt: "2026-01-02T00:00:00.000Z" },
    ];
    expect(sortConversations(list).map((item) => item.id)).toEqual(["a", "c", "b"]);
  });
});
