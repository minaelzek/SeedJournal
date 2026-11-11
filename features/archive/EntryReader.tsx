"use client";

import {
  ArrowLeft,
  FloppyDisk,
  PencilSimple,
  SpinnerGap,
  Trash,
} from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import { EntryEditor, type DecryptedJournalEntry } from "@/features/journal";
import type { JournalEntryPayloadV1 } from "@/lib/contracts";
import "./archive.css";

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
  const warningRef = useRef<HTMLParagraphElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreDeleteFocus = useRef(false);
  const date = entry.completedAt ?? entry.updatedAt;

  useLayoutEffect(() => {
    if (confirmingDelete) {
      warningRef.current?.focus();
      return;
    }
    if (!restoreDeleteFocus.current) return;
    restoreDeleteFocus.current = false;
    deleteTriggerRef.current?.focus();
  }, [confirmingDelete]);

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
    } catch {
      setError("This entry could not be deleted. Nothing was changed.");
      setPending(undefined);
    }
  };

  return (
    <article className="sj-entry-reader" id="main-content">
      <div className="sj-entry-reader__shell">
        <header className="sj-entry-reader__header">
          <button
            type="button"
            onClick={onBack}
            aria-label="Return to your sakura"
            className="sj-entry-reader__icon-btn"
          >
            <ArrowLeft aria-hidden size={20} />
          </button>
          <div className="sj-entry-reader__actions">
            {editing ? (
              <button
                type="button"
                onClick={() => void save()}
                disabled={Boolean(pending)}
                className="sj-entry-reader__btn sj-entry-reader__btn--primary"
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
                className="sj-entry-reader__btn"
              >
                <PencilSimple aria-hidden size={17} />
                Edit
              </button>
            )}
          </div>
        </header>

        <time dateTime={new Date(date).toISOString()}>
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "long",
          }).format(date)}
        </time>

        <p className="sj-entry-reader__prompt">
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
              <h1 className="sj-entry-reader__title">{draft.title}</h1>
            ) : null}
            <div className="sj-entry-reader__body">{draft.body}</div>
          </>
        )}

        {!editing
          ? [draft.followUp, draft.secondFollowUp].map((reflection, index) =>
              reflection ? (
                <section className="sj-entry-reader__layer" key={reflection.id}>
                  <p className="sj-entry-reader__layer-label">
                    {index === 0 ? "Reflection" : "One layer deeper"}
                  </p>
                  <h2>{reflection.renderedText}</h2>
                  {reflection.skipped ? (
                    <p data-skipped>Left open.</p>
                  ) : (
                    <p>{reflection.response}</p>
                  )}
                </section>
              ) : null,
            )
          : null}

        {!editing && draft.seedInsight ? (
          <section className="sj-entry-reader__seed">
            <p>What you carried</p>
            <p>{draft.seedInsight}</p>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="sj-entry-reader__error">
            {error}
          </p>
        ) : null}

        {!editing ? (
          <footer className="sj-entry-reader__footer">
            <button
              type="button"
              onClick={() => onRevisit(entry.id)}
              className="sj-entry-reader__btn sj-entry-reader__btn--primary"
            >
              Revisit this memory
            </button>

            <div className="sj-entry-reader__danger">
              {confirmingDelete ? (
                <div
                  className="sj-entry-reader__danger-panel"
                  role="group"
                  aria-labelledby="entry-delete-warning"
                >
                  <p id="entry-delete-warning" ref={warningRef} tabIndex={-1}>
                    These words will be removed. The tree keeps an anonymous
                    mark. An encrypted download of this journal cannot be
                    opened again. A readable page is the copy you can keep.
                  </p>
                  <div className="sj-entry-reader__danger-actions">
                    <button
                      type="button"
                      disabled={Boolean(pending)}
                      onClick={() => void remove()}
                      className="sj-entry-reader__btn sj-entry-reader__btn--danger"
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
                      onClick={() => {
                        restoreDeleteFocus.current = true;
                        setConfirmingDelete(false);
                      }}
                      className="sj-entry-reader__btn"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  ref={deleteTriggerRef}
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="sj-entry-reader__btn sj-entry-reader__btn--quiet"
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
