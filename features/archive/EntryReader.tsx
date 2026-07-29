"use client";

import {
  ArrowLeft,
  FloppyDisk,
  PencilSimple,
  SpinnerGap,
  Trash,
} from "@phosphor-icons/react";
import { useState } from "react";
import { EntryEditor, type DecryptedJournalEntry } from "@/features/journal";
import type { JournalEntryPayloadV1 } from "@/lib/contracts";

export interface EntryReaderProps {
  entry: DecryptedJournalEntry;
  onBack: () => void;
  onSave: (
    entryId: string,
    payload: JournalEntryPayloadV1,
  ) => Promise<void> | void;
  onDelete: (entryId: string) => Promise<void> | void;
  onRevisit: (entryId: string) => void;
}

export function EntryReader({
  entry,
  onBack,
  onSave,
  onDelete,
  onRevisit,
}: EntryReaderProps) {
  const [draft, setDraft] = useState(entry.payload);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState<"save" | "delete">();
  const [error, setError] = useState<string>();
  const date = entry.completedAt ?? entry.updatedAt;

  const save = async () => {
    setPending("save");
    setError(undefined);
    try {
      await onSave(entry.id, draft);
      setEditing(false);
    } catch {
      setError("Your changes could not be saved. They remain on this page.");
    } finally {
      setPending(undefined);
    }
  };

  const remove = async () => {
    setPending("delete");
    setError(undefined);
    try {
      await onDelete(entry.id);
      onBack();
    } catch {
      setError("This entry could not be deleted. Nothing was changed.");
      setPending(undefined);
    }
  };

  return (
    <article className="min-h-[100dvh] bg-[var(--color-surface)] text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-[760px] px-5 pb-[calc(56px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))] sm:px-8 lg:px-10">
        <header className="mb-14 flex min-h-11 items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to journal"
            className="inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-secondary)] outline-none transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          >
            <ArrowLeft aria-hidden size={20} />
          </button>
          <div className="flex items-center gap-2">
            {editing ? (
              <button
                type="button"
                onClick={() => void save()}
                disabled={Boolean(pending)}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-blossom-light)] px-4 font-[var(--font-ui)] text-[14px] font-medium text-[var(--color-surface)] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-40"
              >
                {pending === "save" ? (
                  <SpinnerGap aria-hidden className="animate-spin" size={17} />
                ) : (
                  <FloppyDisk aria-hidden size={17} />
                )}
                Save
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 font-[var(--font-ui)] text-[14px] outline-none transition-colors hover:bg-[var(--color-surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              >
                <PencilSimple aria-hidden size={17} />
                Edit
              </button>
            )}
          </div>
        </header>

        <time
          dateTime={new Date(date).toISOString()}
          className="font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]"
        >
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "long",
          }).format(date)}
        </time>

        <p className="mb-10 mt-4 text-balance font-[var(--font-poetic)] text-[26px] leading-[34px] sm:text-[32px] sm:leading-[40px]">
          {entry.payload.prompt.renderedText}
        </p>

        {editing ? (
          <EntryEditor
            title={draft.title}
            body={draft.body}
            showTitle
            autoFocus
            onTitleChange={(title) => setDraft({ ...draft, title })}
            onBodyChange={(body) => setDraft({ ...draft, body })}
          />
        ) : (
          <>
            {draft.title ? (
              <h1 className="mb-7 font-[var(--font-poetic)] text-[24px] leading-[30px]">
                {draft.title}
              </h1>
            ) : null}
            <div className="whitespace-pre-wrap font-[var(--font-poetic)] text-[18px] leading-[30px]">
              {draft.body}
            </div>
          </>
        )}

        {!editing && draft.followUp ? (
          <section className="mt-12 border-l border-[var(--color-blossom)] pl-5 sm:pl-7">
            <h2 className="font-[var(--font-poetic)] text-[20px] leading-[28px]">
              {draft.followUp.renderedText}
            </h2>
            {draft.followUp.skipped ? (
              <p className="mt-3 font-[var(--font-ui)] text-[13px] text-[var(--color-text-secondary)]">
                Left open.
              </p>
            ) : (
              <p className="mt-4 whitespace-pre-wrap font-[var(--font-poetic)] text-[18px] leading-[30px] text-[var(--color-text-secondary)]">
                {draft.followUp.response}
              </p>
            )}
          </section>
        ) : null}

        {!editing && draft.seedInsight ? (
          <section className="mt-12 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 sm:p-8">
            <p className="font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]">
              What you carried
            </p>
            <p className="mt-3 font-[var(--font-poetic)] text-[20px] leading-[30px]">
              {draft.seedInsight}
            </p>
          </section>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-8 rounded-[var(--radius-control)] border border-[var(--color-destructive)] p-4 font-[var(--font-ui)] text-[14px] leading-5"
          >
            {error}
          </p>
        ) : null}

        {!editing ? (
          <footer className="mt-14 border-t border-[var(--color-border)] pt-8">
            <button
              type="button"
              onClick={() => onRevisit(entry.id)}
              className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-blossom-light)] px-5 font-[var(--font-ui)] text-[14px] font-medium text-[var(--color-surface)] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            >
              Revisit this memory
            </button>

            <div className="mt-12">
              {confirmingDelete ? (
                <div className="rounded-[var(--radius-surface)] border border-[var(--color-destructive)] p-5">
                  <p className="font-[var(--font-ui)] text-[14px] leading-[22px]">
                    Delete the encrypted entry? Its anonymous growth will remain
                    on your tree.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={Boolean(pending)}
                      onClick={() => void remove()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-destructive)] px-4 font-[var(--font-ui)] text-[14px] text-[var(--color-text-primary)] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-40"
                    >
                      {pending === "delete" ? (
                        <SpinnerGap
                          aria-hidden
                          className="animate-spin"
                          size={17}
                        />
                      ) : (
                        <Trash aria-hidden size={17} />
                      )}
                      Delete entry
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 font-[var(--font-ui)] text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 font-[var(--font-ui)] text-[13px] text-[var(--color-text-secondary)] outline-none transition-colors hover:text-[var(--color-destructive)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                >
                  <Trash aria-hidden size={16} />
                  Delete entry
                </button>
              )}
            </div>
          </footer>
        ) : null}
      </div>
    </article>
  );
}

