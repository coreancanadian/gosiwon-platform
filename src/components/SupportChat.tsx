"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import { markSupportRead, sendSupportMessage } from "@/lib/actions/support";
import { createClient } from "@/lib/supabase/client";
import type { SupportThreadView } from "@/lib/data/support";

// Mirrors the bucket's own limits (see migration 0011) so a bad file is
// rejected here with a clear message instead of a generic upload failure.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export function SupportChat({
  thread,
  viewerId,
  viewerIsAdmin,
  peerName,
  initialBody = "",
}: {
  thread: SupportThreadView;
  viewerId: string;
  viewerIsAdmin: boolean;
  /** Who the viewer is talking to: the operator team, or the user (admin view). */
  peerName: string;
  initialBody?: string;
}) {
  const t = useTranslations("Support");
  const locale = useLocale();
  const router = useRouter();

  const [body, setBody] = useState(initialBody);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Opening the conversation clears this viewer's own unread flag.
  useEffect(() => {
    if (thread.threadId) void markSupportRead(thread.threadId);
  }, [thread.threadId]);

  // Land on the newest message.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread.messages.length]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!ALLOWED_TYPES.includes(picked.type)) {
      setError(t("fileTypeNotAllowed"));
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(t("fileTooLarge"));
      return;
    }
    setError(null);
    setFile(picked);
  }

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !file) return;
    setError(null);

    startTransition(async () => {
      let attachmentPath: string | undefined;
      if (file) {
        // The stored key is a plain uuid (Storage rejects many non-ASCII
        // filenames); the original name travels separately for display.
        const path = `${thread.ownerId}/${crypto.randomUUID()}.${EXT_BY_TYPE[file.type]}`;
        const { error: uploadError } = await createClient()
          .storage.from("support-attachments")
          .upload(path, file, { contentType: file.type });
        if (uploadError) {
          setError(t("uploadFailed"));
          return;
        }
        attachmentPath = path;
      }

      const result = await sendSupportMessage({
        body,
        // Only an admin writes into a thread that isn't their own.
        threadUserId: viewerIsAdmin ? thread.ownerId : undefined,
        attachmentPath,
        attachmentName: file?.name,
      });
      if (!result.ok) {
        setError(result.error ?? t("sendFailed"));
        return;
      }

      setBody("");
      setFile(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-h-[55vh] min-h-[260px] space-y-3 overflow-y-auto rounded-[var(--radius-card)] border border-ink-200 p-4">
        {thread.messages.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-ink-700">{t("empty")}</p>
            <p className="mt-1 text-sm text-ink-400">
              {viewerIsAdmin ? t("emptyAdminHint") : t("emptyHint")}
            </p>
          </div>
        ) : (
          thread.messages.map((m) => {
            const isMine = m.senderId === viewerId;
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%]">
                  {!isMine ? (
                    <p className="mb-1 px-1 text-[11px] font-medium text-ink-400">{peerName}</p>
                  ) : null}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line ${
                      isMine ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-800"
                    }`}
                  >
                    {m.body}
                    {m.attachment ? (
                      <a
                        href={m.attachment.url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${m.body ? "mt-2" : ""} flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium underline-offset-2 hover:underline ${
                          isMine ? "bg-white/15 text-white" : "bg-white text-ink-700"
                        }`}
                      >
                        <FileText className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 truncate">{m.attachment.name}</span>
                      </a>
                    ) : null}
                    <span
                      suppressHydrationWarning
                      className={`mt-1 block text-[11px] ${isMine ? "text-white/70" : "text-ink-400"}`}
                    >
                      {new Date(m.createdAt).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-600">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSend} className="space-y-2">
        {file ? (
          <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-700">
            <FileText className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label={t("removeAttachment")}
              className="shrink-0 rounded-full p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            onChange={onPickFile}
            className="sr-only"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
            aria-label={t("attach")}
            title={t("attach")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink-200 text-ink-600 transition hover:bg-ink-100 disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" aria-hidden />
          </button>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={t("placeholder")}
            className="min-h-11 flex-1 resize-y rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />

          <button
            type="submit"
            disabled={pending || (!body.trim() && !file)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            {t("send")}
          </button>
        </div>
        <p className="text-xs text-ink-400">{t("attachHint")}</p>
      </form>
    </div>
  );
}
