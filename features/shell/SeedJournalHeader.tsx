"use client";

import {
  ArrowLeftIcon,
  BookOpenTextIcon,
  GearSixIcon,
  LockSimpleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { GardenWeather } from "@/features/reflection";
import "./shell.css";

export interface SeedJournalHeaderProps {
  onOpenArchive?: () => void;
  onOpenSettings?: () => void;
  onLock?: () => void;
  onBack?: () => void;
  compact?: boolean;
  weather?: GardenWeather;
}

export function SeedJournalHeader({
  onOpenArchive,
  onOpenSettings,
  onLock,
  onBack,
  compact = false,
  weather,
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
      <div className="sj-header__end">
        {weather ? (
          <>
            <p
              className="sj-header__weather"
              data-weather={weather.kind}
              title={weather.description}
            >
              <span aria-hidden />
              {weather.label}
            </p>
            <p className="sr-only">
              Garden weather: {weather.label}. {weather.description}
            </p>
          </>
        ) : null}
        {onOpenArchive || onLock || onOpenSettings ? (
          <nav className="sj-header__actions" aria-label="Journal controls">
            {onOpenArchive ? (
              <button
                className="sj-icon-button"
                type="button"
                onClick={onOpenArchive}
                aria-label="Open journal archive"
                title="Journal archive"
              >
                <BookOpenTextIcon aria-hidden />
              </button>
            ) : null}
            {onLock ? (
              <button
                className="sj-icon-button"
                type="button"
                onClick={onLock}
                aria-label="Lock journal"
                title="Lock journal"
              >
                <LockSimpleIcon aria-hidden />
              </button>
            ) : null}
            {onOpenSettings ? (
              <button
                className="sj-icon-button"
                type="button"
                onClick={onOpenSettings}
                aria-label="Open settings"
                title="Settings"
              >
                <GearSixIcon aria-hidden />
              </button>
            ) : null}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
