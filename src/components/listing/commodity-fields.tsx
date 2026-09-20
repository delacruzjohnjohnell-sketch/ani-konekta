"use client";

import { useState } from "react";
import { Input, Label, Select } from "@/components/ui/input";

type Category = "GRAIN" | "VEGETABLE" | "FRUIT";

export interface CommodityFieldDefaults {
  cropCategory?: Category | null;
  isGrainWet?: boolean | null;
  moistureContentPercent?: number | null;
  grainGrade?: string | null;
  produceClass?: string | null;
  packagingType?: string | null;
  harvestTimestamp?: string | null;
}

/**
 * Commodity-adaptive quality inputs shared by every listing form (seller,
 * cooperative, offline desk, edit). Field names match parseCommodityQuality()
 * in src/lib/listing-service.ts, which does the authoritative server-side
 * validation — this component only decides which inputs to show.
 */
export function CommodityFields({ defaults = {}, idPrefix = "cf" }: { defaults?: CommodityFieldDefaults; idPrefix?: string }) {
  const [category, setCategory] = useState<Category | "">(defaults.cropCategory ?? "");
  const [wet, setWet] = useState(Boolean(defaults.isGrainWet));

  return (
    <div className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-3">
      <div>
        <Label htmlFor={`${idPrefix}-cat`}>Crop category</Label>
        <Select
          id={`${idPrefix}-cat`}
          name="cropCategory"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "")}
          required
        >
          <option value="">Select…</option>
          <option value="GRAIN">Grain (palay, corn…)</option>
          <option value="VEGETABLE">Vegetable</option>
          <option value="FRUIT">Fruit</option>
        </Select>
      </div>

      {category === "GRAIN" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-end gap-2 pb-2">
            <input
              id={`${idPrefix}-wet`}
              type="checkbox"
              name="isGrainWet"
              checked={wet}
              onChange={(e) => setWet(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor={`${idPrefix}-wet`}>Wet grain (fresh-harvest)</Label>
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-moist`}>Moisture %</Label>
            <Input
              id={`${idPrefix}-moist`}
              name="moistureContentPercent"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={defaults.moistureContentPercent ?? ""}
              required
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-grade`}>Grade</Label>
            {wet ? (
              <>
                <Select id={`${idPrefix}-grade`} disabled value="WET_UNCLASSIFIED" onChange={() => {}}>
                  <option value="WET_UNCLASSIFIED">Wet / unclassified</option>
                </Select>
                <input type="hidden" name="grainGrade" value="WET_UNCLASSIFIED" />
              </>
            ) : (
              <Select id={`${idPrefix}-grade`} name="grainGrade" defaultValue={defaults.grainGrade && defaults.grainGrade !== "WET_UNCLASSIFIED" ? defaults.grainGrade : ""} required>
                <option value="">Select…</option>
                <option value="GRADE_1">Grade 1</option>
                <option value="GRADE_2">Grade 2</option>
                <option value="GRADE_3">Grade 3</option>
              </Select>
            )}
          </div>
        </div>
      )}

      {(category === "VEGETABLE" || category === "FRUIT") && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor={`${idPrefix}-class`}>Produce class</Label>
            <Select id={`${idPrefix}-class`} name="produceClass" defaultValue={defaults.produceClass ?? ""} required>
              <option value="">Select…</option>
              <option value="CLASS_EXTRA">Extra class</option>
              <option value="CLASS_I">Class I</option>
              <option value="CLASS_II">Class II</option>
              <option value="SUBSTANDARD">Substandard</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-pack`}>Packaging</Label>
            <Select id={`${idPrefix}-pack`} name="packagingType" defaultValue={defaults.packagingType ?? ""} required>
              <option value="">Select…</option>
              <option value="CRATE">Crate</option>
              <option value="SACK">Sack</option>
              <option value="BOX">Box</option>
              <option value="BUNDLE">Bundle</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-harvest`}>Harvest date/time</Label>
            <Input
              id={`${idPrefix}-harvest`}
              name="harvestTimestamp"
              type="datetime-local"
              defaultValue={defaults.harvestTimestamp ?? ""}
              required
            />
          </div>
        </div>
      )}
    </div>
  );
}
