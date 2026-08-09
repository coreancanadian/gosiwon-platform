"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createProperty, setPublished } from "@/lib/actions/properties";

export function PublishToggle({
  propertyId,
  isPublished,
}: {
  propertyId: string;
  isPublished: boolean;
}) {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      await setPublished(propertyId, !isPublished);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
        isPublished
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
          : "bg-ink-200 text-ink-600 hover:bg-ink-300"
      }`}
    >
      {pending ? "…" : t(isPublished ? "published" : "draft")}
    </button>
  );
}

export function AddPropertyButton() {
  const t = useTranslations("Dashboard");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProperty(name, address);
      if (!result.ok) {
        setError(result.error ?? "Failed to create listing.");
        return;
      }
      setOpen(false);
      router.push(`/dashboard/properties/${result.propertyId}`);
    });
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("addProperty")}
      </button>
    );
  }

  return (
    <form
      onSubmit={onCreate}
      className="w-full max-w-md space-y-3 rounded-[var(--radius-card)] border border-ink-200 p-4"
    >
      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="고시원 이름 / Listing name"
        className={inputClass}
      />
      <input
        type="text"
        required
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="주소 / Address"
        className={inputClass}
      />
      {error ? <p className="text-sm text-brand-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {tCommon("save")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-ink-200 px-4 py-2.5 text-sm text-ink-600 transition hover:bg-ink-50"
        >
          {tCommon("cancel")}
        </button>
      </div>
    </form>
  );
}
