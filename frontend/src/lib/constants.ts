import type { ProductType, Site, Unit } from "../api/types";

// The official ISCC EU raw-material list, taken verbatim (including its own
// capitalization/spacing) from the "RawMat" dropdown sheet of
// References/Appendix 12a - ISCC EU Sustainability Declaration (v4.0_21 May 2025).xlsx
// -- the real Proof-of-Sustainability declaration form, not just a KHPB-specific
// guess. Replaces an earlier ad hoc 10-item list. Note KHPB's own historically
// recorded feedstock, "Palm Oil Mill Effluent (POME)" (no "oil"), isn't on this
// official list verbatim -- the closest official entry is "Palm oil mill
// effluent (POME) oil" below, a different residue stream (the oil skimmed from
// POME, not the effluent itself). Not changed here or in already-recorded
// transactions; flagged for whoever books the next KHPB entry to confirm the
// correct official term with their auditor.
export const FEEDSTOCKS = [
  "Algae",
  "Animal by-products (category 1)",
  "Animal by-products (category 2)",
  "Animal by-products (category 3)",
  "Animal by-products (uncategorized)",
  "Animal fats from rendering (category 1)",
  "Animal fats from rendering (category 2)",
  "Animal fats from rendering (category 3)",
  "Animal fats from rendering (uncategorized)",
  "Bagasse",
  "Barley",
  "Black liquor",
  "Brown grease / grease trap fat",
  "Brown liquor / spent sulphite liquor",
  "Camelina",
  "Cashew Nut Shell Liquid (CNSL)",
  "Castor seed",
  "Champost",
  "Corn / Maize",
  "Corn / Maize cobs",
  "Cotton",
  "Cotton seed",
  "Croton seed",
  "Crude glycerine",
  "Crude tall oil (CTO)",
  "Draff",
  "Empty Palm Fruit Bunches (EFB) oil",
  "Empty Palm Fruit Bunches (EFB)",
  "Ethanol used in the cleaning/extraction of blood plasma",
  "Ethanol used in the extraction of ingredients from medicinal plants",
  "Feed waste",
  "Fish Oil Ethyl Ester (FOEE)",
  "Flower bulbs",
  "Food waste",
  "Forestry residues",
  "Forestry processing residues",
  "Fruit tree cuttings (from agriculture)",
  "Giant cane",
  "Grape marc",
  "Grass",
  "Grass fiber residues from the production of grass protein",
  "Husks",
  "Intermediate crop (specification of crop)",
  "Jatropha",
  "Linseed / Flaxseed",
  "Manure",
  "Matter Organic Non-Glycerol (MONG)",
  "Municipal grass cuttings",
  "Mustard / Carinata",
  "Nut shells",
  "Oat",
  "Oil palm fresh fruit bunches (FFBs)",
  "Olives",
  "Organic municipal solid waste (MSW)",
  "Out of shelf-life disinfectant",
  "Palm Fatty Acid Distillate (PFAD)",
  "Palm kernel shells (PKS)",
  // Restored from References/Appendix 13a - ISCC EU Material List_June 2026.pdf
  // (the true obligatory-wording material list -- more authoritative than the
  // Excel RawMat sheet this array was originally built from, which omitted this
  // entry entirely). This is KHPB's actual real-world feedstock: the wastewater
  // used directly for biogas production. Distinct from POME oil below --
  // Appendix 13a states explicitly "POME Oil cannot be covered under the
  // material entry of POME."
  "Palm oil mill effluent (POME)",
  "Palm oil mill effluent (POME) oil",
  "Pongamia seed",
  "Pot ale",
  "Poultry feather acid oil",
  "Pressed palm fiber oil",
  "Rapeseed / canola",
  "Biogenic fraction of end-of-life tyres",
  "Residues from processing of corn/maize",
  "Residue of FAME end distillation",
  "Rye",
  "Safflower",
  "Sewage sludge",
  "Shea nuts",
  "Short Rotation Coppice",
  "Soapstock acid oil contaminated with sulphur",
  "Sorghum",
  "Soybean",
  "Spent bleaching earth",
  "Starch slurry (low grade)",
  "Straw",
  "Sugar beet",
  "Sugar beet residues",
  "Sugar beet betaine residues",
  "Sugar cane",
  "Sunflower",
  "Tall oil pitch",
  "Technical corn oil",
  "Tiger nuts / Chuffa",
  "Transesterification residues (TER)",
  "Triticale",
  "Unrefined liquid dextrose ultrafiltration retentate",
  "Used cooking oil (UCO) entirely of veg. origin",
  "Used cooking oil (UCO)",
  "Waste pressings (from production of vegetable oils)",
  "Waste starch slurry",
  "Waste starch slurry from distillation of grain mixtures",
  "Wastewater from ship transport",
  "Waste oil from sewage sludge treatment",
  "Waste wood",
  "Waste/residues from processing of alcohol",
  "Waste/residues from processing of vegetable or animal oil",
  "Wet corn fiber",
  "Wheat",
  "Whey permeate",
  "Wine lees",
  "Woody biomass fraction of non-recycable industrial and municipal construction and demolition waste",
  "Other: specify here individually",
];

export const COUNTRIES = [
  "Malaysia",
  "Indonesia",
  "Netherlands",
  "Germany",
  "Denmark",
  "France",
  "United Kingdom",
  "Spain",
  "Italy",
  "Poland",
  "Thailand",
  "Vietnam",
  "China",
  "United States",
  "Brazil",
];

export const EU_MATERIAL_CATEGORIES = [
  "Annex IX Part A Feedstocks",
  "Annex IX Part B Feedstocks",
  "Other / Unclassified Sustainable Feedstocks",
  "Waste & Residues"
];

export const PLUS_MATERIAL_CATEGORIES = [
  "Bio",
  "Bio-Circular",
  "Circular",
  "Renewable energy-derived"
];

// ---------------------------------------------------------------------------
// Conversion stages (client clarification, 2026-10-16). Mirrors the backend's
// lib/conversionStages.ts -- keep the two in sync. A conversion is exactly one
// step of the POME -> Biogas -> Biomethane -> Bio-LNG chain, and a site runs
// whichever of the three stages are switched on for it, in any combination.
// ---------------------------------------------------------------------------

export const PRODUCT_LABELS: Record<ProductType, string> = {
  POME: "POME",
  BIOGAS: "Biogas",
  BIOMETHANE: "Biomethane",
  BIOLNG: "Bio-LNG",
};

export type ConversionStage = "P1" | "P2" | "P3" | "P4";
type StageFlag = "canConvertP1" | "canConvertP2" | "canConvertP3" | "canConvertP4";

export const CONVERSION_STAGES: {
  stage: ConversionStage;
  flag: StageFlag;
  source: ProductType;
  target: ProductType;
  label: string;
}[] = [
  { stage: "P1", flag: "canConvertP1", source: "POME", target: "BIOGAS", label: "P1 · POME to Biogas" },
  { stage: "P2", flag: "canConvertP2", source: "BIOGAS", target: "BIOMETHANE", label: "P2 · Biogas to Biomethane" },
  { stage: "P3", flag: "canConvertP3", source: "BIOMETHANE", target: "BIOLNG", label: "P3 · Biomethane to Bio-LNG" },
  // Regasification: a reverse step (19 Oct 2026 Developer Clarification).
  { stage: "P4", flag: "canConvertP4", source: "BIOLNG", target: "BIOMETHANE", label: "P4 · Bio-LNG to Biomethane" },
];

/** The stages switched on for a site. */
export function enabledStages(site: Pick<Site, StageFlag>) {
  return CONVERSION_STAGES.filter((s) => site[s.flag]);
}

/**
 * The product types that actually appear at a site, in chain order: every
 * source and target of its enabled stages. A site with no stages (a trader)
 * keeps the original two, Biomethane and Bio-LNG.
 */
export function productsForSite(site: Pick<Site, StageFlag>): ProductType[] {
  const stages = enabledStages(site);
  if (stages.length === 0) return ["BIOMETHANE", "BIOLNG"];
  const present = new Set<ProductType>();
  for (const s of stages) {
    present.add(s.source);
    present.add(s.target);
  }
  return (["POME", "BIOGAS", "BIOMETHANE", "BIOLNG"] as ProductType[]).filter((p) => present.has(p));
}

/** Display labels for units. NM3 is a normal cubic metre (0 C, 1 atm). */
export const UNIT_LABELS: Record<Unit, string> = {
  M3: "m³",
  NM3: "Nm³",
  METRIC_TONS: "MT",
  KG: "kg",
  M3_15C: "m³ (15°C)",
  J: "J",
  KWH: "kWh",
};
