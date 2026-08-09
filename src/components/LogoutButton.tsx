"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onLogout() {
    startTransition(async () => {
      await createClient().auth.signOut();
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={isPending}
      className="rounded-full px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
