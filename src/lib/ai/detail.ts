import type { KnowledgeNode, Relation } from "@/types";
import { relationLabel } from "@/lib/relations";
import { streamChat } from "./llmClient";
import type { LlmSettings } from "./types";

/** 用 BYOK 模型为知识点生成整篇讲解；演示模式用确定性模板。 */

const DETAIL_SYSTEM = [
  "你是「知脉」的学习内容编辑，负责把知识点整理成用户能直接复习的完整讲解。",
  "你只输出 Markdown 正文，不要输出解释、不要用代码块包裹整篇内容。",
  "数学公式用 LaTeX：行内写 $...$，独立公式单独一行用 $$...$$（支持 \\frac、\\sqrt、上下标、\\cdot、\\times、希腊字母）；不要用代码块包公式。",
  "讲解中的事实必须来自给定信息，不要编造来源中没有的题目、数据或结论；信息不足时写「待补充」。",
].join("\n");

export interface DetailRelationInfo {
  type: Relation["type"];
  targetTitle: string;
}

export interface DetailSourceInfo {
  question: string;
  answer: string;
}

export interface DetailInput {
  node: KnowledgeNode;
  path: string;
  relations: DetailRelationInfo[];
  childTitles: string[];
  sources: DetailSourceInfo[];
}

export function buildDetailPrompt(input: DetailInput): string {
  return [
    `知识点：${input.node.title}`,
    `位置：${input.path}`,
    input.node.summary ? `摘要：${input.node.summary}` : "",
    input.node.aliases.length > 0 ? `别名：${input.node.aliases.join("、")}` : "",
    `关系：${input.relations.map((item) => `${relationLabel(item.type)}·${item.targetTitle}`).join("；") || "暂无"}`,
    `子知识点：${input.childTitles.join("、") || "暂无"}`,
    "",
    "来源对话（可能为空）：",
    ...(input.sources.length === 0
      ? ["（暂无来源）"]
      : input.sources.map(
          (source, index) =>
            `[${index + 1}] 用户问：${source.question}\n助手答：${source.answer.slice(0, 900)}`,
        )),
    "",
    "请写一份 400~900 字的完整讲解，使用 Markdown，包含以下小节（没有内容的小节写「待补充」）：",
    "## 一句话理解",
    "## 核心概念",
    "## 关键要点",
    "## 易错点",
    "## 例题（仅当来源里有题目时写原题与思路）",
    "## 与其他知识点的关系",
    "",
    "要求：事实必须来自上面的信息，不要编造来源中没有的题目、数据或结论。",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 去掉整篇代码块包裹/前后解释，返回干净的 Markdown。 */
export function parseDetailResponse(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/\r\n/g, "\n").trim();

  const wrapped = text.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/i);
  if (wrapped?.[1]) {
    text = wrapped[1].trim();
  } else {
    const headingIndex = text.search(/^#{1,3}\s/m);
    if (headingIndex >= 0) text = text.slice(headingIndex);
  }

  // 去掉残留的代码块标记行
  text = text
    .split("\n")
    .filter((line) => !/^```/.test(line.trim()))
    .join("\n")
    .trim();

  return text.slice(0, 12000);
}

export async function generateDetailWithLlm(input: {
  settings: LlmSettings;
  detailInput: DetailInput;
  signal?: AbortSignal;
}): Promise<string> {
  let raw = "";
  await streamChat({
    settings: input.settings,
    messages: [
      { role: "system", content: DETAIL_SYSTEM },
      { role: "user", content: buildDetailPrompt(input.detailInput) },
    ],
    temperature: 0.4,
    maxTokens: 1600,
    signal: input.signal,
    onDelta: (chunk) => {
      raw += chunk;
    },
  });
  const text = parseDetailResponse(raw);
  if (text.length < 20) {
    throw new Error("模型没有返回可用的讲解内容，请重试");
  }
  return text;
}

/** 演示模式/未接入模型时的确定性模板。 */
export function buildTemplateDetail(input: DetailInput): string {
  const lines: string[] = [`## 一句话理解`, "", input.node.summary || "待补充", ""];

  lines.push("## 核心概念", "");
  lines.push(`**${input.node.title}** 位于知识图谱的 \`${input.path}\`。`);
  if (input.childTitles.length > 0) {
    lines.push(`包含的子知识点：${input.childTitles.map((title) => `「${title}」`).join("、")}。`);
  } else {
    lines.push("这条知识点目前没有子知识点，可以补充概念拆解。");
  }
  lines.push("");

  lines.push("## 关键要点", "");
  if (input.sources.length > 0) {
    for (const source of input.sources.slice(0, 3)) {
      lines.push(`- 来自提问「${source.question}」：${source.answer.replace(/\s+/g, " ").slice(0, 120)}…`);
    }
  } else {
    lines.push("- 待补充（可以在这里写下自己的理解或摘录）");
  }
  lines.push("");

  lines.push("## 易错点", "", "- 待补充：可以在复习时补上自己踩过的坑。", "");

  lines.push("## 例题", "");
  const firstSource = input.sources.find((source) => source.question.trim().length > 0);
  if (firstSource) {
    lines.push("**原题**", "", firstSource.question, "", "**思路**", "");
    lines.push(firstSource.answer.replace(/\s+/g, " ").slice(0, 500));
  } else {
    lines.push("待补充：还没有来源题目。");
  }
  lines.push("");

  lines.push("## 与其他知识点的关系", "");
  if (input.relations.length === 0) {
    lines.push("暂无关系，可以在 3D 知识库里手动连线或让 AI 推荐。");
  } else {
    for (const relation of input.relations) {
      lines.push(`- ${relationLabel(relation.type)}：${relation.targetTitle}`);
    }
  }

  return lines.join("\n");
}
