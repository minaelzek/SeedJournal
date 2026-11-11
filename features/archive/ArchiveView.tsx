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
import "./archive.css";

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

function todayLocalDayEnCa(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
  const [onThisDay, setOnThisDay] = useState(false);
  const tags = useMemo(() => collectArchiveTags(entries), [entries]);
  const todayLocalDay = useMemo(() => todayLocalDayEnCa(), []);
  const results = useMemo(
    () =>
      searchEntries(entries, {
        query: deferredQuery,
        category,
        tag,
        onThisDayLocalDay: onThisDay ? todayLocalDay : undefined,
      }),
    [category, deferredQuery, entries, onThisDay, tag, todayLocalDay],
  );
  const searching = Boolean(
    query || category !== "all" || tag || onThisDay,
  );

  return (
    <section className="sj-archive" id="main-content" aria-label="Journal archive">
      <div className="sj-archive__shell">
        <header className="sj-archive__header">
          <button
            type="button"
            onClick={onBack}
            aria-label="Return to garden"
            className="sj-archive__icon-btn"
          >
            <ArrowLeft aria-hidden size={20} />
          </button>
          <button
            type="button"
            onClick={onNewEntry}
            className="sj-archive__ghost-btn"
          >
            <NotePencil aria-hidden size={18} />
            New reflection
          </button>
        </header>

        <div className="sj-archive__intro">
          <p className="sj-archive__eyebrow">Held with the tree</p>
          <h1>Journal</h1>
          <p className="sj-archive__lede">
            Every page remains private to your unlocked session. Each one is an
            equal memory petal on your sakura — return when one wants another
            breath.
          </p>
        </div>

        <div className="sj-archive__tools">
          <label className="sr-only" htmlFor="archive-search">
            Search your journal
          </label>
          <div className="sj-archive__search">
            <MagnifyingGlass aria-hidden size={19} />
            <input
              id="archive-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your journal"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="sj-archive__search-clear"
              >
                <X aria-hidden size={17} />
              </button>
            ) : null}
          </div>

          <div className="sj-archive__chips" role="group" aria-label="Filter by path">
            {CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={category === item.value}
                onClick={() => setCategory(item.value)}
                className="sj-archive__chip"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={onThisDay}
              onClick={() => setOnThisDay((current) => !current)}
              className="sj-archive__chip sj-archive__chip--on-this-day"
            >
              On this day
            </button>
          </div>
          {onThisDay ? (
            <p className="sj-archive__on-this-day-note">
              Past pages that share today’s date — rediscovery without a streak.
            </p>
          ) : null}

          {tags.length > 0 ? (
            <label className="sj-archive__tag-row">
              <span>Tag</span>
              <select
                className="sj-archive__tag-select"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
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
            <p className="sj-archive__count">
              {searching
                ? `${results.length} ${results.length === 1 ? "entry" : "entries"} found`
                : `${results.length} ${results.length === 1 ? "memory" : "memories"}`}
            </p>
            <ol className="sj-archive__list">
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
              setOnThisDay(false);
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
    <button type="button" onClick={onOpen} className="sj-archive__row sj-control">
      <span
        className="sj-archive__petal-mark"
        aria-hidden="true"
      />
      <time dateTime={new Date(timestamp).toISOString()}>
        {new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(timestamp)}
      </time>
      <span>
        <span className="sj-archive__row-title">{title}</span>
        <span className="sj-archive__row-excerpt">
          {entryExcerpt(entry.payload.body)}
        </span>
        <span className="sj-archive__row-form">Memory petal</span>
        {entry.payload.tags.length > 0 ? (
          <span className="sj-archive__tags">
            {entry.payload.tags.slice(0, 3).map((tag) => (
              <span className="sj-archive__tag" key={tag}>
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
    <div className="sj-archive__empty">
      <h2>{searching ? "No entries found" : "Your first page is waiting"}</h2>
      <p>
        {searching
          ? "Try a different word, path, tag, or clear On this day."
          : "The record will grow quietly as you return to care for the tree."}
      </p>
      <button
        type="button"
        onClick={searching ? onClear : onNewEntry}
        className="sj-archive__ghost-btn"
      >
        {searching ? "Clear filters" : "Begin a reflection"}
      </button>
    </div>
  );
}
