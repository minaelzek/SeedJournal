"use client";

import {
  ArrowLeft,
  MagnifyingGlass,
  NotePencil,
  X,
} from "@phosphor-icons/react";
import { useDeferredValue, useMemo, useState } from "react";
import type { PromptCategory } from "@/lib/contracts";
import type { DecryptedJournalEntry } from "@/features/journal";
import {
  collectArchiveTags,
  entryExcerpt,
  searchEntries,
} from "./search";

const CATEGORIES: ReadonlyArray<{
  value: PromptCategory | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "moment", label: "Moments" },
  { value: "feeling", label: "Feelings" },
  { value: "relationship", label: "Relationships" },
  { value: "decision", label: "Decisions" },
  { value: "change", label: "Change" },
  { value: "gratitude", label: "Gratitude" },
  { value: "open", label: "Open pages" },
];

export interface ArchiveViewProps {
  entries: readonly DecryptedJournalEntry[];
  onOpenEntry: (entryId: string) => void;
  onNewEntry: () => void;
  onBack?: () => void;
}

export function ArchiveView({
  entries,
  onOpenEntry,
  onNewEntry,
  onBack,
}: ArchiveViewProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<PromptCategory | "all">("all");
  const [tag, setTag] = useState("");
  const tags = useMemo(() => collectArchiveTags(entries), [entries]);
  const results = useMemo(
    () => searchEntries(entries, { query: deferredQuery, category, tag }),
    [category, deferredQuery, entries, tag],
  );
  const searching = Boolean(query || category !== "all" || tag);

  return (
    <section className="min-h-[100dvh] bg-[var(--color-surface)] text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-[880px] px-5 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))] sm:px-8 lg:px-12">
        <header className="mb-12 flex min-h-11 items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            aria-label="Return to garden"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-secondary)] outline-none transition-colors duration-150 hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          >
            <ArrowLeft aria-hidden size={20} />
          </button>
          <button
            type="button"
            onClick={onNewEntry}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 font-[var(--font-ui)] text-[14px] text-[var(--color-text-primary)] outline-none transition-colors duration-150 hover:bg-[var(--color-surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          >
            <NotePencil aria-hidden size={18} />
            New entry
          </button>
        </header>

        <div className="mb-10">
          <p className="mb-3 font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]">
            Your living record
          </p>
          <h1 className="font-[var(--font-poetic)] text-[32px] leading-[40px] sm:text-[40px] sm:leading-[44px]">
            Journal
          </h1>
          <p className="mt-3 max-w-[520px] font-[var(--font-ui)] text-[15px] leading-6 text-[var(--color-text-secondary)]">
            Every entry remains private to your unlocked session.
          </p>
        </div>

        <div className="mb-8">
          <label className="sr-only" htmlFor="archive-search">
            Search your journal
          </label>
          <div className="relative">
            <MagnifyingGlass
              aria-hidden
              size={19}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
            />
            <input
              id="archive-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your journal"
              autoComplete="off"
              className="min-h-14 w-full appearance-none rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3 pl-12 pr-12 font-[var(--font-ui)] text-[16px] text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--color-text-secondary)]/70 focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]/20 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-secondary)] outline-none transition-colors hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              >
                <X aria-hidden size={17} />
              </button>
            ) : null}
          </div>

          <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
            {CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={category === item.value}
                onClick={() => setCategory(item.value)}
                className={`min-h-11 shrink-0 rounded-full border px-4 font-[var(--font-ui)] text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${
                  category === item.value
                    ? "border-[var(--color-blossom)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tags.length > 0 ? (
            <label className="mt-4 flex max-w-[280px] items-center gap-3 font-[var(--font-ui)] text-[13px] text-[var(--color-text-secondary)]">
              <span>Tag</span>
              <select
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                className="min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-[14px] text-[var(--color-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              >
                <option value="">All tags</option>
                {tags.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {results.length > 0 ? (
          <>
            <p className="mb-4 font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]">
              {searching
                ? `${results.length} ${results.length === 1 ? "entry" : "entries"} found`
                : `${results.length} ${results.length === 1 ? "memory" : "memories"}`}
            </p>
            <ol className="divide-y divide-[var(--color-border)]">
              {results.map((entry) => (
                <li key={entry.id}>
                  <EntryRow
                    entry={entry}
                    onOpen={() => onOpenEntry(entry.id)}
                  />
                </li>
              ))}
            </ol>
          </>
        ) : (
          <EmptyArchive
            searching={searching}
            onClear={() => {
              setQuery("");
              setCategory("all");
              setTag("");
            }}
            onNewEntry={onNewEntry}
          />
        )}
      </div>
    </section>
  );
}

function EntryRow({
  entry,
  onOpen,
}: {
  entry: DecryptedJournalEntry;
  onOpen: () => void;
}) {
  const timestamp = entry.completedAt ?? entry.updatedAt;
  const title =
    entry.payload.title.trim() ||
    entry.payload.seedInsight.trim() ||
    entry.payload.prompt.renderedText;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full grid-cols-1 gap-3 py-7 text-left outline-none sm:grid-cols-[140px_1fr] sm:gap-8 focus-visible:rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
    >
      <time
        dateTime={new Date(timestamp).toISOString()}
        className="font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]"
      >
        {new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(timestamp)}
      </time>
      <span>
        <span className="block text-balance font-[var(--font-poetic)] text-[20px] leading-[28px] text-[var(--color-text-primary)] transition-colors duration-150 group-hover:text-[var(--color-blossom-light)]">
          {title}
        </span>
        <span className="mt-2 block font-[var(--font-ui)] text-[14px] leading-[22px] text-[var(--color-text-secondary)]">
          {entryExcerpt(entry.payload.body)}
        </span>
        {entry.payload.tags.length > 0 ? (
          <span className="mt-3 flex flex-wrap gap-2">
            {entry.payload.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--color-border)] px-2.5 py-1 font-[var(--font-ui)] text-[12px] leading-4 text-[var(--color-text-secondary)]"
              >
                {tag}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function EmptyArchive({
  searching,
  onClear,
  onNewEntry,
}: {
  searching: boolean;
  onClear: () => void;
  onNewEntry: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-6 py-12 text-center sm:px-10">
      <h2 className="font-[var(--font-poetic)] text-[24px] leading-[30px]">
        {searching ? "No entries found" : "Your first page is waiting"}
      </h2>
      <p className="mx-auto mt-3 max-w-[420px] font-[var(--font-ui)] text-[14px] leading-[22px] text-[var(--color-text-secondary)]">
        {searching
          ? "Try a different word, path, or tag."
          : "The record will grow quietly as you return to it."}
      </p>
      <button
        type="button"
        onClick={searching ? onClear : onNewEntry}
        className="mt-7 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-5 font-[var(--font-ui)] text-[14px] text-[var(--color-text-primary)] outline-none transition-colors hover:border-[var(--color-blossom)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
      >
        {searching ? "Clear filters" : "Begin an entry"}
      </button>
    </div>
  );
}

