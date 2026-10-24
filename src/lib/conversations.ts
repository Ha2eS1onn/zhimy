/** 会话标题等纯逻辑（不依赖 store / 浏览器，方便单测）。 */

export const NEW_CONVERSATION_TITLE = "新对话";

/** 用首条消息生成会话标题：去掉多余空白，过长截断。 */
export function titleFromMessage(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === "（图片提问）") return "图片提问";
  const chars = Array.from(cleaned);
  return chars.length > 24 ? `${chars.slice(0, 24).join("")}…` : cleaned;
}

/** 会话列表按最近更新倒序；时间相同按 id 稳定排序。 */
export function sortConversations<T extends { id: string; updatedAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return a.id.localeCompare(b.id);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
