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
