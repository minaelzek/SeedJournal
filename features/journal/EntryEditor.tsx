"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
} from "react";

export interface EntryEditorHandle {
  focus: () => void;
}

export interface EntryEditorProps {
  title: string;
  body: string;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  bodyLabel?: string;
  bodyPlaceholder?: string;
  showTitle?: boolean;
}

export const EntryEditor = forwardRef<EntryEditorHandle, EntryEditorProps>(
  function EntryEditor(
    {
      title,
      body,
      onTitleChange,
      onBodyChange,
      onBlur,
      disabled = false,
      autoFocus = false,
      bodyLabel = "Journal entry",
      bodyPlaceholder = "Let the words arrive without arranging them first…",
      showTitle = false,
    },
    forwardedRef,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(forwardedRef, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textarea.scrollHeight, 240)}px`;
    }, [body]);

    const handleBodyChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      onBodyChange(event.target.value);
    };

    return (
      <div className="w-full">
        {showTitle ? (
          <div className="mb-6">
            <label
              className="mb-2 block font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]"
              htmlFor="journal-title"
            >
              Title <span className="sr-only">(optional)</span>
            </label>
            <input
              id="journal-title"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              onBlur={onBlur}
              disabled={disabled}
              maxLength={160}
              placeholder="A quiet title"
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-transparent px-4 font-[var(--font-poetic)] text-[18px] leading-[28px] text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--color-text-secondary)] focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-focus)]/20 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        ) : null}

        <label className="sr-only" htmlFor="journal-body">
          {bodyLabel}
        </label>
        <textarea
          ref={textareaRef}
          id="journal-body"
          value={body}
          onChange={handleBodyChange}
          onBlur={onBlur}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={200_000}
          placeholder={bodyPlaceholder}
          spellCheck
          className="min-h-60 w-full resize-none overflow-hidden bg-transparent font-[var(--font-poetic)] text-[18px] leading-[30px] text-[var(--color-text-primary)] caret-[var(--color-blossom)] outline-none placeholder:text-[var(--color-text-secondary)]/60 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    );
  },
);

