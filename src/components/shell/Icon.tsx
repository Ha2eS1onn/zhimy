"use client";

import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "chat"
  | "atlas"
  | "settings"
  | "send"
  | "camera"
  | "stop"
  | "search"
  | "plus"
  | "close"
  | "check"
  | "refresh"
  | "download"
  | "user"
  | "arrow-right"
  | "spark"
  | "zoom-in"
  | "zoom-out"
  | "rotate"
  | "chevron-down"
  | "sun"
  | "moon"
  | "more";

const PATHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5",
  chat: "M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.2-.6L3 21l1.7-4.4A8.4 8.4 0 1 1 21 11.5Z",
  atlas: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9m0-18C9.5 5.5 8.2 8.5 8.2 12s1.3 6.5 3.8 9M3.4 9h17.2M3.4 15h17.2",
  settings:
    "M4 7h8M16 7h4M14.5 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM4 17h3M11 17h9M9.5 14.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  send: "M4 12 21 4l-7 17-2.4-6.6L4 12Z",
  camera:
    "M4 8h3l1.5-2h7L17 8h3v11H4V8Zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  stop: "M7 7h10v10H7z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.5-1.5L21 21",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  check: "m5 13 4.5 4.5L19 7",
  refresh: "M20 11a8 8 0 1 0-2.3 6.4M20 5v6h-6",
  download: "M12 4v11m0 0 4-4m-4 4-4-4M5 19h14",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  "arrow-right": "M5 12h14m0 0-5-5m5 5-5 5",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  "zoom-in": "M11 8v6m-3-3h6m4.5 9.5L21 21M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z",
  "zoom-out": "M8 11h6m4.5 9.5L21 21M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z",
  rotate: "M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5",
  "chevron-down": "m6 9 6 6 6-6",
  sun: "M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
