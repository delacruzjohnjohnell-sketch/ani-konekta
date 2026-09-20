// Human-readable, commodity-adaptive quality summary for a listing — grain and
// fresh produce show different fields (never one generic standard).
const GRAIN_GRADE_LABEL: Record<string, string> = {
  GRADE_1: "Grade 1",
  GRADE_2: "Grade 2",
  GRADE_3: "Grade 3",
  WET_UNCLASSIFIED: "Wet / unclassified",
};
const PRODUCE_CLASS_LABEL: Record<string, string> = {
  CLASS_EXTRA: "Class Extra",
  CLASS_I: "Class I",
  CLASS_II: "Class II",
  SUBSTANDARD: "Substandard",
};
const CATEGORY_LABEL: Record<string, string> = { GRAIN: "Grain", VEGETABLE: "Vegetable", FRUIT: "Fruit" };

export function commodityQualitySummary(l: {
  cropCategory: string;
  isGrainWet: boolean | null;
  moistureContentPercent: number | null;
  grainGrade: string | null;
  produceClass: string | null;
  packagingType: string | null;
  harvestTimestamp: Date | null;
}): string {
  const parts = [CATEGORY_LABEL[l.cropCategory] ?? l.cropCategory];
  if (l.cropCategory === "GRAIN") {
    if (l.grainGrade) parts.push(GRAIN_GRADE_LABEL[l.grainGrade] ?? l.grainGrade);
    if (l.moistureContentPercent != null) parts.push(`${l.moistureContentPercent}% moisture${l.isGrainWet ? " (wet)" : ""}`);
  } else {
    if (l.produceClass) parts.push(PRODUCE_CLASS_LABEL[l.produceClass] ?? l.produceClass);
    if (l.packagingType) parts.push(l.packagingType.charAt(0) + l.packagingType.slice(1).toLowerCase());
    if (l.harvestTimestamp) parts.push(`harvested ${l.harvestTimestamp.toISOString().slice(0, 10)}`);
  }
  return parts.join(" · ");
}

export const CROP_CATEGORY_LABEL = CATEGORY_LABEL;
export const GRAIN_GRADE_LABELS = GRAIN_GRADE_LABEL;
export const PRODUCE_CLASS_LABELS = PRODUCE_CLASS_LABEL;
