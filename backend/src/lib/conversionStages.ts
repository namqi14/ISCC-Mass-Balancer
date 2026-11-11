/**
 * The conversion chain, the units each step takes and produces, and which
 * stages a site may run.
 *
 * Client clarifications: 2026-10-16 (the stages, and a site runs any
 * combination of them) and the 19 Oct 2026 Developer Clarification (the units
 * and the typical rates; regasification as a fourth, reverse step).
 *
 * What lives HERE is structure that does not change week to week: the four
 * steps and the unit each takes/produces. The conversion RATES themselves are
 * not fixed in code -- they change monthly or weekly, so each site maintains
 * its own dated rates (the ConversionRate table, conversions.routes.ts). The
 * `typical` ranges below are the client document's figures, kept ONLY as a
 * non-binding hint shown beside the input; nothing here is ever applied
 * automatically or enforced.
 *
 * The frontend mirrors the stage table in frontend/src/lib/constants.ts and
 * fetches units/hints from GET /conversions/stages; keep the two in sync.
 */

export type ConversionProduct = "POME" | "BIOGAS" | "BIOMETHANE" | "BIOLNG";
export type ConversionStage = "P1" | "P2" | "P3" | "P4";
export type ConversionUnit = "M3" | "NM3" | "METRIC_TONS" | "KG" | "M3_15C" | "J" | "KWH";

/** One allowed source unit for a stage, and what the step then produces. */
export interface UnitRule {
  sourceUnit: ConversionUnit;
  targetUnit: ConversionUnit;
  /** Plain wording for the factor, e.g. "Nm3 biogas per m3 POME". */
  perUnitText: string;
  /** The client document's typical range -- a hint only, never enforced. */
  typical: { min: number; max: number; basis: string };
}

export interface StageDef {
  stage: ConversionStage;
  source: ConversionProduct;
  target: ConversionProduct;
  label: string;
  unitRules: UnitRule[];
}

export const CONVERSION_STAGES: StageDef[] = [
  {
    stage: "P1",
    source: "POME",
    target: "BIOGAS",
    label: "P1 (POME to Biogas)",
    unitRules: [
      {
        sourceUnit: "M3",
        targetUnit: "NM3",
        perUnitText: "Nm3 biogas per m3 POME",
        typical: { min: 25, max: 29, basis: "Equivalent to about 0.60-0.63 Nm3 per kg COD removed." },
      },
    ],
  },
  {
    stage: "P2",
    source: "BIOGAS",
    target: "BIOMETHANE",
    label: "P2 (Biogas to Biomethane)",
    unitRules: [
      {
        sourceUnit: "NM3",
        targetUnit: "NM3",
        perUnitText: "Nm3 biomethane per Nm3 biogas",
        typical: { min: 0.55, max: 0.6, basis: "Raw biogas at 60% CH4 with a 98% CH4 recovery rate." },
      },
    ],
  },
  {
    stage: "P3",
    source: "BIOMETHANE",
    target: "BIOLNG",
    label: "P3 (Biomethane to Bio-LNG)",
    unitRules: [
      {
        sourceUnit: "NM3",
        targetUnit: "KG",
        perUnitText: "kg Bio-LNG per Nm3 biomethane",
        typical: { min: 0.7, max: 0.72, basis: "Density of gaseous CH4 is about 0.717 kg/Nm3." },
      },
    ],
  },
  {
    stage: "P4",
    source: "BIOLNG",
    target: "BIOMETHANE",
    label: "P4 (Bio-LNG to Biomethane)",
    unitRules: [
      {
        sourceUnit: "KG",
        targetUnit: "NM3",
        perUnitText: "Nm3 biomethane per kg Bio-LNG",
        typical: { min: 1.39, max: 1.4, basis: "Standard conditions (0 C, 1 atm, pure CH4)." },
      },
      {
        sourceUnit: "M3",
        targetUnit: "NM3",
        perUnitText: "Nm3 biomethane per m3 Bio-LNG",
        typical: { min: 590, max: 600, basis: "Liquid density about 425-430 kg/m3 at -162 C." },
      },
    ],
  },
];

export const STAGE_CODES: ConversionStage[] = CONVERSION_STAGES.map((s) => s.stage);

export interface SiteStageFlags {
  canConvertP1: boolean;
  canConvertP2: boolean;
  canConvertP3: boolean;
  canConvertP4: boolean;
}

export function stageByCode(code: ConversionStage): StageDef {
  return CONVERSION_STAGES.find((s) => s.stage === code)!;
}

/** The stage a (source, target) pair is, or null if it isn't a single valid step of the chain. */
export function stageForConversion(source: ConversionProduct, target: ConversionProduct): StageDef | null {
  return CONVERSION_STAGES.find((s) => s.source === source && s.target === target) ?? null;
}

export function siteHasStage(site: SiteStageFlags, stage: ConversionStage): boolean {
  switch (stage) {
    case "P1":
      return site.canConvertP1;
    case "P2":
      return site.canConvertP2;
    case "P3":
      return site.canConvertP3;
    case "P4":
      return site.canConvertP4;
  }
}

export function siteStages(site: SiteStageFlags): ConversionStage[] {
  return CONVERSION_STAGES.filter((s) => siteHasStage(site, s.stage)).map((s) => s.stage);
}

/** The unit rule for a stage given the source pool's unit, or null if the stage doesn't take that unit. */
export function unitRuleFor(stage: StageDef, sourceUnit: ConversionUnit): UnitRule | null {
  return stage.unitRules.find((r) => r.sourceUnit === sourceUnit) ?? null;
}

/** Plain-English list of the units a stage accepts, e.g. "m3" or "kg or m3". */
export function describeSourceUnits(stage: StageDef): string {
  return stage.unitRules.map((r) => UNIT_WORDS[r.sourceUnit]).join(" or ");
}

export const UNIT_WORDS: Record<ConversionUnit, string> = {
  M3: "m3",
  NM3: "Nm3",
  METRIC_TONS: "MT",
  KG: "kg",
  M3_15C: "m3 (15 C)",
  J: "J",
  KWH: "kWh",
};

/** Site.operatorType is derived from the stage flags: any stage on means PROCESSING_UNIT. */
export function derivedOperatorType(site: SiteStageFlags): "PROCESSING_UNIT" | "TRADER" {
  return site.canConvertP1 || site.canConvertP2 || site.canConvertP3 || site.canConvertP4 ? "PROCESSING_UNIT" : "TRADER";
}

/**
 * A warning (never a rejection) when a factor falls outside the user's OWN
 * min/max on the rate in force. Returns null when the rate has no range set,
 * or the factor is inside it.
 */
export function rateRangeWarning(
  stage: StageDef,
  factor: number,
  rate: { minFactor: unknown; maxFactor: unknown } | null
): string | null {
  if (!rate) return null;
  const min = rate.minFactor === null || rate.minFactor === undefined ? null : Number(rate.minFactor);
  const max = rate.maxFactor === null || rate.maxFactor === undefined ? null : Number(rate.maxFactor);
  if ((min !== null && factor < min) || (max !== null && factor > max)) {
    const range = `${min ?? "no minimum"} to ${max ?? "no maximum"}`;
    return `Conversion factor ${factor} is outside this site's configured range for ${stage.label} (${range}).`;
  }
  return null;
}
