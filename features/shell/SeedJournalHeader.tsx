"use client";

import {
  ArrowLeftIcon,
  BookOpenTextIcon,
  GearSixIcon,
  LockSimpleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import "./shell.css";

export interface SeedJournalHeaderProps {
  onOpenArchive?: () => void;
  onOpenSettings?: () => void;
  onLock?: () => void;
  onBack?: () => void;
  compact?: boolean;
}

export function SeedJournalHeader({
  onOpenArchive,
  onOpenSettings,
  onLock,
  onBack,
  compact = false,
}: SeedJournalHeaderProps) {
  return (
    <header className="sj-header" data-compact={compact || undefined}>
      <div className="sj-header__identity">
        {onBack ? (
          <button
            className="sj-icon-button"
            type="button"
            onClick={onBack}
            aria-label="Return to garden"
            title="Return to garden"
          >
            <ArrowLeftIcon aria-hidden />
          </button>
        ) : null}
        <Link className="sj-wordmark" href="/" aria-label="Seed Journal home">
          <span aria-hidden className="sj-wordmark__seed" />
          <span>Seed Journal</span>
        </Link>
      </div>
      <nav className="sj-header__actions" aria-label="Journal controls">
        <button
          className="sj-icon-button"
          type="button"
          onClick={onOpenArchive}
          aria-label="Open journal archive"
          title="Journal archive"
        >
          <BookOpenTextIcon aria-hidden />
        </button>
        <button
          className="sj-icon-button"
          type="button"
          onClick={onLock}
          aria-label="Lock journal"
          title="Lock journal"
        >
          <LockSimpleIcon aria-hidden />
        </button>
        <button
          className="sj-icon-button"
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <GearSixIcon aria-hidden />
        </button>
      </nav>
    </header>
  );
}
