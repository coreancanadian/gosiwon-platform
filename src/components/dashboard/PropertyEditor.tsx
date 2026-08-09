"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Star, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  addPropertyImage,
  deletePropertyImage,
  deleteRoom,
  setCoverImage,
  setPropertyAmenities,
  updatePropertyDetails,
  upsertRoom,
} from "@/lib/actions/properties";
import { AMENITY_CATEGORY_ORDER } from "@/lib/data/seed-amenities";
import { publicImageUrl } from "@/lib/storage";
import type {
  Amenity,
  PropertyWithRelations,
  Room,
} from "@/lib/types/database";

const INPUT =
  "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-700";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-ink-200 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Small inline status line shared by every save button in the editor. */
function SaveStatus({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  const t = useTranslations("Dashboard");
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 text-sm text-emerald-700">
        <Check className="h-4 w-4" aria-hidden />
        {t("saved")}
      </span>
    );
  if (state === "error")
    return <span className="text-sm text-brand-600">{t("saveFailed")}</span>;
  return null;
}

// ---------------------------------------------------------------------------

function DetailsForm({ property }: { property: PropertyWithRelations }) {
  const t = useTranslations("Dashboard");
  const tCommon = useTranslations("Common");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [form, setForm] = useState({
    name_ko: property.name_ko,
    name_en: property.name_en ?? "",
    address_ko: property.address_ko,
    address_en: property.address_en ?? "",
    address_detail: property.address_detail ?? "",
    property_type: property.property_type,
    gender: property.gender,
    age_min: property.age_min?.toString() ?? "",
    age_max: property.age_max?.toString() ?? "",
    floors_total: property.floors_total?.toString() ?? "",
    floors_used: property.floors_used ?? "",
    languages: property.languages.join(", "),
    description_ko: property.description_ko ?? "",
    description_en: property.description_en ?? "",
    lat: property.lat?.toString() ?? "",
    lng: property.lng?.toString() ?? "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  const strOrNull = (v: string) => (v.trim() === "" ? null : v.trim());

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    startTransition(async () => {
      const result = await updatePropertyDetails({
        propertyId: property.id,
        name_ko: form.name_ko,
        name_en: strOrNull(form.name_en),
        address_ko: form.address_ko,
        address_en: strOrNull(form.address_en),
        address_detail: strOrNull(form.address_detail),
        property_type: form.property_type,
        gender: form.gender,
        age_min: numOrNull(form.age_min),
        age_max: numOrNull(form.age_max),
        floors_total: numOrNull(form.floors_total),
        floors_used: strOrNull(form.floors_used),
        languages: form.languages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        description_ko: strOrNull(form.description_ko),
        description_en: strOrNull(form.description_en),
        lat: numOrNull(form.lat),
        lng: numOrNull(form.lng),
      });
      setState(result.ok ? "saved" : "error");
    });
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL}>이름 (한국어)</label>
          <input
            required
            value={form.name_ko}
            onChange={(e) => set("name_ko")(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Name (English)</label>
          <input
            value={form.name_en}
            onChange={(e) => set("name_en")(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>주소 (한국어)</label>
          <input
            required
            value={form.address_ko}
            onChange={(e) => set("address_ko")(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Address (English)</label>
          <input
            value={form.address_en}
            onChange={(e) => set("address_en")(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>상세 주소 / Address detail</label>
          <input
            value={form.address_detail}
            onChange={(e) => set("address_detail")(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>가능 언어 / Languages (comma separated)</label>
          <input
            value={form.languages}
            onChange={(e) => set("languages")(e.target.value)}
            placeholder="Korean, English, Chinese"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>주거 유형 / Type</label>
          <select
            value={form.property_type}
            onChange={(e) =>
              set("property_type")(e.target.value as typeof form.property_type)
            }
            className={INPUT}
          >
            <option value="gosiwon">고시원 / Gosiwon</option>
            <option value="share_house">셰어하우스 / Share house</option>
            <option value="one_room">원룸 / One room</option>
            <option value="dormitory">기숙사 / Dormitory</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>성별 / Gender</label>
          <select
            value={form.gender}
            onChange={(e) => set("gender")(e.target.value as typeof form.gender)}
            className={INPUT}
          >
            <option value="any">남녀 공용 / Any</option>
            <option value="male">남성 전용 / Male only</option>
            <option value="female">여성 전용 / Female only</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>최소 나이</label>
            <input
              type="number"
              min={0}
              max={120}
              value={form.age_min}
              onChange={(e) => set("age_min")(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>최대 나이</label>
            <input
              type="number"
              min={0}
              max={120}
              value={form.age_max}
              onChange={(e) => set("age_max")(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>총 층수</label>
            <input
              type="number"
              min={1}
              value={form.floors_total}
              onChange={(e) => set("floors_total")(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>운영 층</label>
            <input
              value={form.floors_used}
              onChange={(e) => set("floors_used")(e.target.value)}
              placeholder="2~4F"
              className={INPUT}
            />
          </div>
        </div>
        <div>
          <label className={LABEL}>위도 / Latitude</label>
          <input
            type="number"
            step="any"
            value={form.lat}
            onChange={(e) => set("lat")(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>경도 / Longitude</label>
          <input
            type="number"
            step="any"
            value={form.lng}
            onChange={(e) => set("lng")(e.target.value)}
            className={INPUT}
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>소개 (한국어)</label>
        <textarea
          rows={5}
          value={form.description_ko}
          onChange={(e) => set("description_ko")(e.target.value)}
          className={`${INPUT} resize-y`}
        />
      </div>
      <div>
        <label className={LABEL}>About (English)</label>
        <textarea
          rows={5}
          value={form.description_en}
          onChange={(e) => set("description_en")(e.target.value)}
          className={`${INPUT} resize-y`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {tCommon("save")}
        </button>
        <SaveStatus state={state} />
      </div>
      <p className="sr-only">{t("basicInfo")}</p>
    </form>
  );
}

// ---------------------------------------------------------------------------

function PhotosSection({ property }: { property: PropertyWithRelations }) {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    const supabase = createClient();

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      // Path must start with the property id — both the storage policy and
      // addPropertyImage() validate that prefix.
      const path = `${property.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        break;
      }

      const result = await addPropertyImage(property.id, path);
      if (!result.ok) {
        setError(result.error ?? "Upload failed.");
        break;
      }
    }

    setUploading(false);
    e.target.value = "";
    router.refresh();
  }

  function onSetCover(imageId: string) {
    startTransition(async () => {
      await setCoverImage(property.id, imageId);
      router.refresh();
    });
  }

  function onDelete(imageId: string) {
    startTransition(async () => {
      await deletePropertyImage(property.id, imageId);
      router.refresh();
    });
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-300 px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50">
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        {t("uploadPhotos")}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onUpload}
          disabled={uploading}
          className="sr-only"
        />
      </label>

      {error ? <p className="mt-2 text-sm text-brand-600">{error}</p> : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {property.property_images.map((image) => (
          <div key={image.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-ink-100">
            <Image
              src={publicImageUrl(image.storage_path)}
              alt=""
              fill
              sizes="200px"
              className="object-cover"
            />
            {image.is_cover ? (
              <span className="absolute top-2 left-2 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-medium text-white">
                <Star className="mr-1 inline h-3 w-3" aria-hidden />
                Cover
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-black/50 p-1.5 opacity-0 transition group-hover:opacity-100">
              {!image.is_cover ? (
                <button
                  type="button"
                  onClick={() => onSetCover(image.id)}
                  className="flex-1 rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-ink-800"
                >
                  {t("setCover")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onDelete(image.id)}
                aria-label={t("deletePhoto")}
                className="rounded bg-white/90 px-2 py-1 text-ink-800"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RoomRow({
  propertyId,
  room,
  onDone,
}: {
  propertyId: string;
  room: Room | null;
  onDone: () => void;
}) {
  const t = useTranslations("Dashboard");
  const tCommon = useTranslations("Common");
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: room?.name ?? "",
    monthly_rent: room?.monthly_rent?.toString() ?? "",
    deposit: room?.deposit?.toString() ?? "0",
    size_sqm: room?.size_sqm?.toString() ?? "",
    min_contract_days: room?.min_contract_days?.toString() ?? "30",
    is_available: room?.is_available ?? true,
  });

  function onSave() {
    startTransition(async () => {
      const result = await upsertRoom({
        id: room?.id ?? null,
        propertyId,
        name: form.name,
        monthly_rent: Number(form.monthly_rent || 0),
        deposit: Number(form.deposit || 0),
        size_sqm: form.size_sqm ? Number(form.size_sqm) : null,
        min_contract_days: form.min_contract_days
          ? Number(form.min_contract_days)
          : null,
        max_contract_days: null,
        is_available: form.is_available,
      });
      if (result.ok) onDone();
    });
  }

  function onDelete() {
    if (!room) return;
    startTransition(async () => {
      await deleteRoom(propertyId, room.id);
      onDone();
    });
  }

  return (
    <div className="grid gap-2 rounded-xl border border-ink-200 p-3 sm:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto]">
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="ROOM A"
        className={INPUT}
      />
      <input
        type="number"
        value={form.monthly_rent}
        onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })}
        placeholder="월세"
        className={INPUT}
      />
      <input
        type="number"
        value={form.deposit}
        onChange={(e) => setForm({ ...form, deposit: e.target.value })}
        placeholder="보증금"
        className={INPUT}
      />
      <input
        type="number"
        step="0.1"
        value={form.size_sqm}
        onChange={(e) => setForm({ ...form, size_sqm: e.target.value })}
        placeholder="㎡"
        className={INPUT}
      />
      <label className="flex items-center gap-2 text-sm text-ink-600">
        <input
          type="checkbox"
          checked={form.is_available}
          onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
          className="h-4 w-4 rounded border-ink-300"
        />
        공실
      </label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !form.name || !form.monthly_rent}
          className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {tCommon("save")}
        </button>
        {room ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            aria-label={t("deleteRoom")}
            className="rounded-lg border border-ink-200 p-2 text-ink-500 transition hover:bg-ink-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RoomsSection({ property }: { property: PropertyWithRelations }) {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const [addingKey, setAddingKey] = useState(0);
  const [showNew, setShowNew] = useState(false);

  const refresh = () => {
    setShowNew(false);
    setAddingKey((k) => k + 1);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {[...property.rooms]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((room) => (
          <RoomRow
            key={room.id}
            propertyId={property.id}
            room={room}
            onDone={refresh}
          />
        ))}

      {showNew ? (
        <RoomRow
          key={`new-${addingKey}`}
          propertyId={property.id}
          room={null}
          onDone={refresh}
        />
      ) : null}

      <button
        type="button"
        onClick={() => setShowNew(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-ink-300 px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("addRoom")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AmenitiesSection({
  property,
  amenities,
  selectedIds,
}: {
  property: PropertyWithRelations;
  amenities: Amenity[];
  selectedIds: string[];
}) {
  const tCommon = useTranslations("Common");
  const tEnum = useTranslations("Enums");
  const [selected, setSelected] = useState(new Set(selectedIds));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSave() {
    setState("saving");
    startTransition(async () => {
      const result = await setPropertyAmenities(property.id, [...selected]);
      setState(result.ok ? "saved" : "error");
    });
  }

  return (
    <div>
      <div className="space-y-5">
        {AMENITY_CATEGORY_ORDER.map((category) => {
          const items = amenities.filter((a) => a.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category}>
              <p className="text-sm font-semibold text-ink-800">
                {tEnum(`amenityCategory.${category}`)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {items.map((a) => {
                  const isOn = selected.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggle(a.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        isOn
                          ? "border-brand-400 bg-brand-50 text-brand-800"
                          : "border-ink-200 text-ink-600 hover:border-ink-300"
                      }`}
                    >
                      {a.name_ko} / {a.name_en}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {tCommon("save")}
        </button>
        <SaveStatus state={state} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PropertyEditor({
  property,
  amenities,
  selectedAmenityIds,
}: {
  property: PropertyWithRelations;
  amenities: Amenity[];
  selectedAmenityIds: string[];
}) {
  const t = useTranslations("Dashboard");

  return (
    <div className="space-y-6">
      <Section title={t("basicInfo")}>
        <DetailsForm property={property} />
      </Section>

      <Section title={t("photos")}>
        <PhotosSection property={property} />
      </Section>

      <Section title={t("roomsAndPricing")}>
        <RoomsSection property={property} />
      </Section>

      <Section title={t("amenitiesSection")}>
        <AmenitiesSection
          property={property}
          amenities={amenities}
          selectedIds={selectedAmenityIds}
        />
      </Section>
    </div>
  );
}
