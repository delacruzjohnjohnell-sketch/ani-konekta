"use client";

import { useState } from "react";
import { editListing } from "@/app/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/lib/i18n/client";

type EditableListing = {
  id: string;
  cropType: string;
  variety: string | null;
  volumeKg: number;
  harvestDate: Date;
  askingPricePerKg: number;
  qualityTag: string;
  municipality: string;
  minOrderQtyKg: number | null;
  description: string | null;
};

/**
 * Inline, collapsible edit form for a single listing — reuses the exact
 * same field set as the create-listing form, minus a mandatory photo
 * (re-uploading is optional; the server action keeps the existing photo
 * when none is provided). Toggled open/closed with local client state next
 * to the existing Delete button.
 */
export function EditListingForm({
  listing,
  municipalities,
}: {
  listing: EditableListing;
  municipalities: string[];
}) {
  const [open, setOpen] = useState(false);
  const t = useT();

  if (!open) {
    return (
      <Button variant="outline" size="sm" type="button" onClick={() => setOpen(true)}>
        {t("common.edit")}
      </Button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-lg border border-brand-green-700/20 bg-brand-green-50 p-4">
      <ActionForm action={editListing} className="space-y-3" onSuccess={() => setOpen(false)}>
        <input type="hidden" name="listingId" value={listing.id} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`cropType-${listing.id}`}>{t("seller.field.cropType")}</Label>
                <Input
                  id={`cropType-${listing.id}`}
                  name="cropType"
                  defaultValue={listing.cropType}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`variety-${listing.id}`}>{t("seller.field.variety")}</Label>
                <Input
                  id={`variety-${listing.id}`}
                  name="variety"
                  defaultValue={listing.variety ?? ""}
                />
              </div>
              <div>
                <Label htmlFor={`volumeKg-${listing.id}`}>{t("seller.field.volumeKg")}</Label>
                <Input
                  id={`volumeKg-${listing.id}`}
                  name="volumeKg"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={listing.volumeKg}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`askingPricePerKg-${listing.id}`}>{t("seller.field.askingPrice")}</Label>
                <Input
                  id={`askingPricePerKg-${listing.id}`}
                  name="askingPricePerKg"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={listing.askingPricePerKg}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`harvestDate-${listing.id}`}>{t("seller.field.harvestDate")}</Label>
                <Input
                  id={`harvestDate-${listing.id}`}
                  name="harvestDate"
                  type="date"
                  defaultValue={listing.harvestDate.toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`qualityTag-${listing.id}`}>{t("seller.field.qualityTag")}</Label>
                <Select id={`qualityTag-${listing.id}`} name="qualityTag" defaultValue={listing.qualityTag}>
                  <option value="STANDARD">{t("quality.STANDARD")}</option>
                  <option value="GRADE_A">{t("quality.GRADE_A")}</option>
                  <option value="ORGANIC">{t("quality.ORGANIC")}</option>
                  <option value="GAP_CERTIFIED">{t("quality.GAP_CERTIFIED")}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor={`municipality-${listing.id}`}>{t("seller.field.municipality")}</Label>
                <Select id={`municipality-${listing.id}`} name="municipality" defaultValue={listing.municipality}>
                  {municipalities.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`minOrderQtyKg-${listing.id}`}>{t("seller.field.minOrderQty")}</Label>
                <Input
                  id={`minOrderQtyKg-${listing.id}`}
                  name="minOrderQtyKg"
                  type="number"
                  min="0"
                  step="0.1"
                  defaultValue={listing.minOrderQtyKg ?? ""}
                />
              </div>
            </div>
            <div>
              <Label htmlFor={`description-${listing.id}`}>{t("seller.field.description")}</Label>
              <Textarea
                id={`description-${listing.id}`}
                name="description"
                rows={2}
                defaultValue={listing.description ?? ""}
              />
            </div>
            <PhotoUpload name="photo" label={t("seller.field.photo")} />
            <div className="flex gap-2">
              <SubmitButton
                size="sm"
                label={t("seller.saveChanges")}
                pendingLabel={t("seller.saveChanges.submitting")}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
            </div>
      </ActionForm>
    </div>
  );
}
