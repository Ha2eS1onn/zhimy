import type { KnowledgeNode } from "@/types";

let counter = 0;

export function makeNode(
  id: string,
  parentId: string | null,
  title: string,
  extra: Partial<KnowledgeNode> = {},
): KnowledgeNode {
  counter += 1;
  return {
    id,
    parentId,
    title,
    summary: `${title}的摘要`,
    status: "active",
    aliases: [],
    mastery: null,
    createdAt: `2026-01-01T00:00:0${counter % 10}.000Z`,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

/** 两学科、三层深的固定样本，用于布局/路径/可见性测试。 */
export function sampleNodes(): KnowledgeNode[] {
  return [
    makeNode("phys", null, "物理"),
    makeNode("chem", null, "化学"),
    makeNode("phys-elec", "phys", "电学"),
    makeNode("phys-mech", "phys", "力学"),
    makeNode("chem-comp", "chem", "物质的构成"),
    makeNode("resistor", "phys-elec", "电阻"),
    makeNode("ohm", "phys-elec", "欧姆定律"),
    makeNode("r-series", "resistor", "电阻的串联"),
    makeNode("r-parallel", "resistor", "电阻的并联", {
      aliases: ["并联电阻", "电阻并联"],
    }),
    makeNode("r-equivalent", "resistor", "等效电阻"),
    makeNode("ohm-law", "ohm", "欧姆定律的应用"),
    makeNode("motion", "phys-mech", "运动的描述"),
    makeNode("molecule", "chem-comp", "分子与原子"),
  ];
}
