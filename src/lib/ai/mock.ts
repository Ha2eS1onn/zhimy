import { newId } from "@/lib/ids";
import type { KnowledgeNode, RelationType, Suggestion } from "@/types";

/** P0 的演示模式：确定性脚本 + 关键词命中，用来验证「收编 → 归位 → 命中」交互。 */

interface ScenarioSuggestion {
  title: string;
  summary: string;
  parentTitle: string | null;
  confidence: number;
  relations: Array<{ type: RelationType; targetTitle: string; confidence: number }>;
}

interface MockScenario {
  keywords: string[];
  answer: string;
  suggestions: ScenarioSuggestion[];
}

const SCENARIOS: MockScenario[] = [
  {
    keywords: ["并联", "分流"],
    answer: [
      "并联电路的总电阻不能把两个电阻直接相加，要用**等效电阻**来算。",
      "",
      "电压关系：各支路两端电压相等，U = U₁ = U₂",
      "电流关系：干路电流等于各支路电流之和，I = I₁ + I₂",
      "电阻关系：1/R = 1/R₁ + 1/R₂",
      "",
      "两个电阻并联时可以直接用：",
      "R = R₁R₂ / (R₁ + R₂)",
      "",
      "解题步骤：",
      "1. 先判断是并联：电流在节点处有分岔，各支路共用两端",
      "2. 用并联公式求等效电阻",
      "3. 再用 U = IR 求电压或电流",
      "",
      "易错点：并联后的总电阻比任何一条支路都小；不要和串联的 R = R₁ + R₂ 混用。",
    ].join("\n"),
    suggestions: [
      {
        title: "电阻的并联",
        summary: "多个电阻并联时总电阻的求法，以及支路电压、电流与分流关系。",
        parentTitle: "电阻",
        confidence: 0.88,
        relations: [
          { type: "contrast", targetTitle: "电阻的串联", confidence: 0.9 },
          { type: "prerequisite", targetTitle: "欧姆定律", confidence: 0.8 },
        ],
      },
      {
        title: "等效电阻",
        summary: "几个电阻组成电路后，可以等效成一个电阻来计算。",
        parentTitle: "电阻",
        confidence: 0.7,
        relations: [{ type: "related", targetTitle: "电阻的并联", confidence: 0.75 }],
      },
    ],
  },
  {
    keywords: ["欧姆", "电压", "电流"],
    answer: [
      "欧姆定律把电流、电压、电阻联系起来：**I = U / R**。",
      "",
      "要算谁，就把公式变形：",
      "求电压：U = IR",
      "求电阻：R = U / I",
      "",
      "解题步骤：",
      "1. 先确认是同一段导体（同一个电路元件）",
      "2. 找出已知的两个量",
      "3. 代入公式求出第三个量",
      "",
      "使用条件：导体电阻不变、忽略温度影响。遇到串并联电路，要先理清元件关系再套公式。",
    ].join("\n"),
    suggestions: [
      {
        title: "欧姆定律",
        summary: "同一段导体中电流、电压、电阻的关系：I = U / R。",
        parentTitle: "欧姆定律",
        confidence: 0.86,
        relations: [
          { type: "related", targetTitle: "电压", confidence: 0.8 },
          { type: "prerequisite", targetTitle: "电阻", confidence: 0.75 },
        ],
      },
      {
        title: "伏安法测电阻",
        summary: "用电压表和电流表测电阻的实验方法。",
        parentTitle: "欧姆定律",
        confidence: 0.66,
        relations: [{ type: "prerequisite", targetTitle: "欧姆定律", confidence: 0.85 }],
      },
    ],
  },
  {
    keywords: ["浮力", "阿基米德", "排开"],
    answer: [
      "浮力是液体或气体对浸入其中物体向上的托力，方向竖直向上。",
      "",
      "阿基米德原理：**F浮 = G排 = ρ液 g V排**",
      "",
      "解题步骤：",
      "1. 用题目条件求出排开液体的体积 V排",
      "2. 代入 ρ液 g V排 得到浮力",
      "3. 比较浮力与重力：F浮 > G 上浮，F浮 = G 悬浮，F浮 < G 下沉",
      "",
      "易错点：V排不一定等于物体体积——物体部分露出液面时，只算浸入部分。",
    ].join("\n"),
    suggestions: [
      {
        title: "浮力",
        summary: "浸在液体或气体中的物体受到竖直向上的托力。",
        parentTitle: "压强与浮力",
        confidence: 0.87,
        relations: [
          { type: "prerequisite", targetTitle: "液体压强", confidence: 0.8 },
          { type: "related", targetTitle: "重力", confidence: 0.7 },
        ],
      },
      {
        title: "阿基米德原理",
        summary: "浮力等于物体排开液体所受的重力：F浮 = ρ液 g V排。",
        parentTitle: "压强与浮力",
        confidence: 0.74,
        relations: [{ type: "prerequisite", targetTitle: "浮力", confidence: 0.9 }],
      },
      {
        title: "物体的浮沉条件",
        summary: "通过比较浮力与重力判断物体上浮、悬浮还是下沉。",
        parentTitle: "压强与浮力",
        confidence: 0.6,
        relations: [{ type: "related", targetTitle: "浮力", confidence: 0.8 }],
      },
    ],
  },
  {
    keywords: ["配平", "化学方程式", "质量守恒"],
    answer: [
      "化学方程式配平的目标是：反应前后每种元素的原子个数都相等。",
      "",
      "最小公倍数法：",
      "1. 先写出正确的反应物、生成物化学式（不能改分子式）",
      "2. 找出出现次数少、原子数最不平衡的元素",
      "3. 求该元素左右两边原子数的最小公倍数，配出系数",
      "4. 用同样方法处理下一个元素，最后检查各元素原子数",
      "",
      "例如：Fe + O₂ → Fe₃O₄，按氧原子平衡可得 3Fe + 2O₂ = Fe₃O₄。",
      "",
      "注意：系数必须是最简整数比，不能为了配平去改化学式本身。",
    ].join("\n"),
    suggestions: [
      {
        title: "化学方程式的配平",
        summary: "用最小公倍数或观察法让反应前后各元素原子数相等。",
        parentTitle: "化学方程式",
        confidence: 0.85,
        relations: [
          { type: "prerequisite", targetTitle: "化学方程式的书写", confidence: 0.85 },
          { type: "related", targetTitle: "质量守恒定律", confidence: 0.8 },
        ],
      },
      {
        title: "质量守恒定律",
        summary: "化学反应前后物质的总质量不变。",
        parentTitle: "化学方程式",
        confidence: 0.7,
        relations: [{ type: "related", targetTitle: "化学方程式的配平", confidence: 0.8 }],
      },
    ],
  },
  {
    keywords: ["凸透镜", "成像", "焦距"],
    answer: [
      "凸透镜成像规律取决于物距 u 与焦距 f 的关系：",
      "",
      "u > 2f：倒立、缩小的实像（照相机）",
      "u = 2f：倒立、等大的实像",
      "f < u < 2f：倒立、放大的实像（投影仪）",
      "u = f：不成像（平行光射出）",
      "u < f：正立、放大的虚像（放大镜）",
      "",
      "解题步骤：",
      "1. 先明确焦距 f 是多少",
      "2. 比较物距 u 与 f、2f 的位置关系",
      "3. 按规律判断像的虚实、倒正、大小",
      "",
      "易错点：\"放大\"指像比物大，不是指距离更远。",
    ].join("\n"),
    suggestions: [
      {
        title: "凸透镜成像",
        summary: "物距与焦距不同关系下，像的虚实、倒正、大小规律。",
        parentTitle: "光的折射",
        confidence: 0.86,
        relations: [
          { type: "prerequisite", targetTitle: "光的折射规律", confidence: 0.8 },
          { type: "related", targetTitle: "凹透镜", confidence: 0.6 },
        ],
      },
      {
        title: "光的折射规律",
        summary: "光从一种介质斜射入另一种介质时传播方向发生偏折。",
        parentTitle: "光的折射",
        confidence: 0.66,
        relations: [{ type: "related", targetTitle: "凸透镜成像", confidence: 0.8 }],
      },
    ],
  },
];

const FALLBACK_ANSWER = [
  "这个问题可以拆成三步来看：",
  "",
  "1. 先把题目里涉及的物理量 / 化学量列出来，标出已知条件和待求量",
  "2. 找到对应的规律或公式（同类题通常只考一个核心关系）",
  "3. 代入计算，并检查单位与结果是否合理",
  "",
  "如果你能补充具体题目或图片，我可以按你的条件一步步讲清楚。",
].join("\n");

function findNodeByTitle(nodes: KnowledgeNode[], title: string): KnowledgeNode | undefined {
  const normalized = title.trim();
  // 先精确匹配标题/别名，避免「电阻」抢先匹配到「电阻的串联」。
  const exact = nodes.find(
    (node) => node.title === normalized || node.aliases.includes(normalized),
  );
  if (exact) return exact;
  return nodes.find(
    (node) => node.title.includes(normalized) || normalized.includes(node.title),
  );
}

function findParentId(nodes: KnowledgeNode[], parentTitle: string | null): string | null {
  if (!parentTitle) return null;
  return findNodeByTitle(nodes, parentTitle)?.id ?? null;
}

export function pickScenario(question: string): MockScenario | null {
  const text = question.toLowerCase();
  return (
    SCENARIOS.find((scenario) => scenario.keywords.some((keyword) => text.includes(keyword))) ?? null
  );
}

export function mockAnswerFor(question: string): string {
  return pickScenario(question)?.answer ?? FALLBACK_ANSWER;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 模拟逐字输出；被 AbortSignal 打断时抛 AbortError。 */
export async function streamMockAnswer(
  question: string,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const answer = mockAnswerFor(question);
  const chars = Array.from(answer);
  let index = 0;
  while (index < chars.length) {
    if (signal?.aborted) {
      throw new DOMException("已停止生成", "AbortError");
    }
    const chunk = chars.slice(index, index + 2).join("");
    onDelta(chunk);
    index += 2;
    await delay(14);
  }
  return answer;
}

/** 兜底标题：过滤「再详细讲一道」「继续」这类对话指令，避免把废话收编成知识点。 */
export function fallbackKnowledgeTitle(question: string): string {
  const cleaned = question.replace(/[？?。！!，,\s]+$/g, "").trim();
  const stripped = cleaned.replace(/^(再|继续|然后|详细|具体|讲|解释|举例|说)/g, "").trim();
  const candidate = stripped.length >= 2 ? stripped : cleaned;
  if (!candidate || candidate.length < 2) return "待整理知识点";
  if (/^(再|继续|然后|详细|具体|讲|解释|举例|说|这道|这道题|题目)/.test(candidate)) {
    return "待整理知识点";
  }
  return candidate.slice(0, 18);
}

/** 演示抽取：根据问题关键词给出 1–3 个知识点建议。 */
export function mockExtract(
  question: string,
  nodes: KnowledgeNode[],
  sourceId: string | null,
): Suggestion[] {
  const scenario = pickScenario(question);
  if (!scenario) {
    const title = fallbackKnowledgeTitle(question);
    return [
      {
        id: newId(),
        title,
        summary:
          title === "待整理知识点"
            ? "这句提问没有包含具体学科内容，先作为临时条目放着，稍后补充。"
            : "来自一次提问的临时知识点，等待归位。",
        suggestedParentId: null,
        confidence: 0.38,
        relations: [],
        sourceId,
        status: "pending",
      },
    ];
  }
  return scenario.suggestions.map((item) => ({
    id: newId(),
    title: item.title,
    summary: item.summary,
    suggestedParentId: findParentId(nodes, item.parentTitle),
    confidence: item.confidence,
    relations: item.relations.map((relation) => ({
      type: relation.type,
      targetNodeId: findNodeByTitle(nodes, relation.targetTitle)?.id ?? null,
      targetTitle: relation.targetTitle,
      confidence: relation.confidence,
    })),
    sourceId,
    status: "pending" as const,
  }));
}
