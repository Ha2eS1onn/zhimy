"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/shell/Icon";

export interface ListboxOption<T extends string> {
  value: T;
  label: string;
}

interface ListboxProps<T extends string> {
  value: T;
  options: ListboxOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** 纸感自定义选择器：支持方向键、Home/End、Enter、Esc 与点击外部关闭。 */
export function Listbox<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  className = "",
}: ListboxProps<T>) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const active = options[activeIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openList = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const commit = (option: ListboxOption<T> | undefined) => {
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onKeyDown={(event) => {
        if (disabled) return;
        if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
          event.preventDefault();
          openList();
          return;
        }
        if (!open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        } else if (event.key === "Tab") {
          setOpen(false);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % options.length);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((index) => (index - 1 + options.length) % options.length);
        } else if (event.key === "Home") {
          event.preventDefault();
          setActiveIndex(0);
        } else if (event.key === "End") {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          commit(active);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 text-left text-xs text-ink hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        <span className="truncate">{options[selectedIndex]?.label ?? value}</span>
        <Icon name="chevron-down" size={14} className={open ? "rotate-180" : ""} />
      </button>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          className="absolute right-0 z-50 mt-1 min-w-full overflow-hidden rounded-[18px] border border-line bg-surface p-1 shadow-[var(--shadow-float)]"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => commit(option)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-xs ${
                index === activeIndex ? "bg-shell text-accent" : "text-ink"
              }`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
