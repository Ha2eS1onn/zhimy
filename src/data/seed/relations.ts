import type { SeedRelationDef } from "@/types";

type Row = [fromSid: string, toSid: string, type: SeedRelationDef["type"], confidence?: number];

/**
 * 示例关系：先修 / 相关 / 易混三类（同源关系来自真实对话，示例数据里不造）。
 * 无向类型的 from/to 顺序不重要，入库时会按 id 规范化。
 */
const ROWS: Row[] = [
  // —— 先修 ——
  ["phys.mech.motion.displacement", "phys.mech.motion.speed", "prerequisite"],
  ["phys.mech.motion.speed", "phys.mech.motion.acceleration", "prerequisite"],
  ["phys.mech.force.elastic", "phys.mech.force.friction", "prerequisite"],
  ["phys.mech.motion.frame", "phys.mech.motion.displacement", "prerequisite"],
  ["phys.mech.pressure.liquid", "phys.mech.pressure.buoyancy", "prerequisite"],
  ["phys.mech.pressure.buoyancy", "phys.mech.pressure.archimedes", "prerequisite"],
  ["phys.mech.pressure.archimedes", "phys.mech.pressure.float", "prerequisite"],
  ["phys.mech.energy.work", "phys.mech.energy.power", "prerequisite"],
  ["phys.mech.energy.work", "phys.mech.energy.kinetic", "prerequisite"],
  ["phys.elec.current.charge", "phys.elec.current.current", "prerequisite"],
  ["phys.elec.current.current", "phys.elec.current.voltage", "prerequisite"],
  ["phys.elec.current.voltage", "phys.elec.current.voltmeter", "prerequisite"],
  ["phys.elec.resistor.resistance", "phys.elec.resistor.factors", "prerequisite"],
  ["phys.elec.resistor.resistance", "phys.elec.resistor.rheostat", "prerequisite"],
  ["phys.elec.resistor.resistance", "phys.elec.resistor.series", "prerequisite"],
  ["phys.elec.resistor.resistance", "phys.elec.resistor.parallel", "prerequisite"],
  ["phys.elec.ohm.law", "phys.elec.ohm.voltammetry", "prerequisite"],
  ["phys.elec.ohm.law", "phys.elec.ohm.seriesRules", "prerequisite"],
  ["phys.elec.ohm.law", "phys.elec.ohm.parallelRules", "prerequisite"],
  ["phys.elec.resistor.series", "phys.elec.ohm.seriesRules", "prerequisite"],
  ["phys.elec.resistor.parallel", "phys.elec.ohm.parallelRules", "prerequisite"],
  ["phys.elec.ohm.parallelRules", "phys.elec.ohm.shunt", "prerequisite"],
  ["phys.elec.ohm.seriesRules", "phys.elec.ohm.voltageDivider", "prerequisite"],
  ["phys.elec.power.work", "phys.elec.power.power", "prerequisite"],
  ["phys.elec.power.power", "phys.elec.power.joule", "prerequisite"],
  ["phys.elec.power.power", "phys.elec.power.rated", "prerequisite"],
  ["phys.elec.power.power", "phys.elec.safety.home", "prerequisite"],
  ["phys.optics.propagation.straight", "phys.optics.reflection.law", "prerequisite"],
  ["phys.optics.reflection.law", "phys.optics.reflection.mirror", "prerequisite"],
  ["phys.optics.refraction.law", "phys.optics.refraction.convex", "prerequisite"],
  ["phys.optics.refraction.convex", "phys.optics.refraction.vision", "prerequisite"],
  ["phys.thermo.state.melt", "phys.thermo.state.vapor", "prerequisite"],
  ["chem.composition.element", "chem.composition.formula", "prerequisite"],
  ["chem.equation.conservation", "chem.equation.balancing", "prerequisite"],
  ["chem.equation.writing", "chem.equation.balancing", "prerequisite"],
  ["chem.equation.balancing", "chem.equation.calculation", "prerequisite"],
  ["chem.substance.air", "chem.substance.oxygen", "prerequisite"],
  ["chem.composition.molecule", "chem.composition.atom", "prerequisite"],
  ["chem.reaction.combination", "chem.reaction.combustion", "prerequisite"],
  // —— 相关 ——
  ["phys.elec.current.voltage", "phys.elec.current.current", "related"],
  ["phys.elec.current.voltage", "phys.elec.resistor.resistance", "related"],
  ["phys.mech.energy.kinetic", "phys.mech.energy.potential", "related"],
  ["phys.thermo.heat.specific", "phys.thermo.heat.calc", "related"],
  ["phys.elec.ohm.seriesRules", "phys.elec.ohm.parallelRules", "related"],
  ["chem.substance.oxygen", "chem.substance.co2", "related"],
  ["chem.reaction.combination", "chem.reaction.decomposition", "related"],
  ["chem.substance.water", "chem.substance.solution", "related"],
  ["phys.optics.reflection.mirror", "phys.optics.refraction.convex", "related"],
  ["phys.mech.pressure.buoyancy", "phys.mech.force.gravity", "related"],
  // —— 易混 ——
  ["phys.elec.resistor.series", "phys.elec.resistor.parallel", "contrast"],
  ["phys.elec.ohm.seriesRules", "phys.elec.ohm.parallelRules", "contrast"],
  ["phys.mech.force.newton1", "phys.mech.force.newton3", "contrast"],
  ["chem.reaction.combination", "chem.reaction.decomposition", "contrast"],
  ["phys.optics.reflection.mirror", "phys.optics.refraction.convex", "contrast"],
  ["phys.mech.energy.kinetic", "phys.mech.energy.potential", "contrast"],
];

export const SEED_RELATIONS: SeedRelationDef[] = ROWS.map(([fromSid, toSid, type, confidence]) => ({
  fromSid,
  toSid,
  type,
  confidence: confidence ?? 0.8,
}));
