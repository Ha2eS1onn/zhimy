"use client";

export type MintyIllustrationVariant = "capture" | "graph" | "account" | "error";

interface MintyIllustrationProps {
  variant: MintyIllustrationVariant;
  className?: string;
}

/**
 * 扁平纸感线稿插图。仅用于空态与状态页，带文字说明时保持装饰性。
 * 线条和纸面使用固定 art 色板，避免深色主题下浅底浅字。
 */
export function MintyIllustration({ variant, className = "" }: MintyIllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 126"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="20" y="10" width="200" height="106" rx="26" fill="var(--art-paper)" />
      {variant === "capture" ? <Capture /> : null}
      {variant === "graph" ? <Graph /> : null}
      {variant === "account" ? <Account /> : null}
      {variant === "error" ? <ErrorMark /> : null}
    </svg>
  );
}

function Capture() {
  return (
    <>
      <rect x="54" y="29" width="94" height="68" rx="12" fill="var(--art-mint)" />
      <path d="M66 48h56M66 59h40M66 70h28" stroke="var(--art-ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M148 63h31m0 0-8-8m8 8-8 8"
        stroke="var(--orange)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="196" cy="63" r="13" fill="var(--art-yellow)" stroke="var(--art-ink)" strokeWidth="2.5" />
      <path d="M191 63h10M196 58v10" stroke="var(--art-ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M47 24c6-5 13-6 18-4" stroke="var(--art-ink)" strokeWidth="2.4" strokeLinecap="round" opacity=".4" />
    </>
  );
}

function Graph() {
  return (
    <>
      <path d="M78 49 120 76l44-34M78 49l86 1" stroke="var(--art-ink)" strokeWidth="2.4" strokeLinecap="round" opacity=".62" />
      <circle cx="78" cy="49" r="16" fill="var(--art-mint)" stroke="var(--art-ink)" strokeWidth="2.5" />
      <circle cx="120" cy="76" r="18" fill="var(--art-yellow)" stroke="var(--art-ink)" strokeWidth="2.5" />
      <circle cx="164" cy="42" r="14" fill="var(--art-blue)" stroke="var(--art-ink)" strokeWidth="2.5" />
      <path d="M73 49h10M115 76h10M159 42h10" stroke="var(--art-ink)" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
      <path d="M93 92c10 9 26 9 36-1" stroke="var(--orange)" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Account() {
  return (
    <>
      <rect x="45" y="35" width="102" height="58" rx="14" fill="var(--art-mint)" stroke="var(--art-ink)" strokeWidth="2.5" />
      <circle cx="70" cy="58" r="10" fill="var(--art-yellow)" stroke="var(--art-ink)" strokeWidth="2.4" />
      <path d="M88 54h42M88 65h30M58 80h70" stroke="var(--art-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="180" cy="57" r="12" stroke="var(--orange)" strokeWidth="3" />
      <path d="m189 66 12 12m-5-5 5-5" stroke="var(--orange)" strokeWidth="3.2" strokeLinecap="round" />
    </>
  );
}

function ErrorMark() {
  return (
    <>
      <path
        d="M49 67c12-20 29-26 44-13 10 8 18 8 27 1 13-10 26-6 34 9"
        stroke="var(--art-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="m101 53 12 20m0-20-12 20" stroke="var(--orange)" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="59" cy="83" r="15" fill="var(--art-mint)" stroke="var(--art-ink)" strokeWidth="2.5" />
      <path d="M59 76v8m0 6h.01" stroke="var(--art-ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M150 77c10 7 21 7 31 0" stroke="var(--art-blue)" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}
