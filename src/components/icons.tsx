// Project icon set: simple 24px line icons drawn for SALAMAT (no third-party artwork).
import type { SVGProps } from "react";

const paths = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  cart: <><path d="M3 4h2.2l2.2 10.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.1" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />,
  heartFilled: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" fill="currentColor" />,
  pin: <><path d="M12 21s-6.5-6.1-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21Z" /><circle cx="12" cy="9.8" r="2.3" /></>,
  phone: <path d="M6.6 3.5h2.6l1.4 4-1.9 1.3a11 11 0 0 0 6.5 6.5l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  filter: <><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></>,
  sort: <><path d="M7 5v14" /><path d="m4 8 3-3 3 3" /><path d="M17 19V5" /><path d="m14 16 3 3 3-3" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="8.5" /><path d="m8.2 12.3 2.6 2.6 5-5.3" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.2" /><path d="M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  question: <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.5" /><path d="M12 16.8h.01" /></>,
  xCircle: <><circle cx="12" cy="12" r="8.5" /><path d="m9.3 9.3 5.4 5.4" /><path d="m14.7 9.3-5.4 5.4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  trash: <><path d="M4.5 7h15" /><path d="M9.5 7V5h5v2" /><path d="m6.5 7 .9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12" /></>,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16" /></>,
  external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5Z" /></>,
  home: <><path d="M4 11 12 4.5l8 6.5" /><path d="M6 9.5V20h12V9.5" /></>,
  store: <><path d="M4 9.5 5.5 4.5h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12v8h13v-8" /><path d="M10 20v-4.5h4V20" /></>,
  tag: <><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0l-8.1-7.9Z" /><circle cx="8.2" cy="8.2" r="1.4" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18" /><path d="M12 9v11" /><path d="M12 9S10.5 4.5 8 5.2 9.5 9 12 9Zm0 0s1.5-4.5 4-3.8S14.5 9 12 9Z" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  logout: <><path d="M10 4H5.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1H10" /><path d="m15 8 4 4-4 4" /><path d="M19 12H9" /></>,
  upload: <><path d="M12 15V4.5" /><path d="m7.5 9 4.5-4.5L16.5 9" /><path d="M4.5 15v4a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4" /></>,
  download: <><path d="M12 4.5V15" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4.5 15v4a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4" /></>,
  edit: <><path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-4-4l-10 10v4Z" /><path d="m13.5 6.5 4 4" /></>,
  file: <><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" /><path d="M14 3.5V8h4.5" /></>,
  shield: <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-2.5Z" />,
  history: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4.5v4h4" /><path d="M12 8v4l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></>,
  box: <><path d="m12 3.5 8 4v9l-8 4-8-4v-9l8-4Z" /><path d="m4 7.5 8 4 8-4" /><path d="M12 11.5v9" /></>,
  // Category marks
  pill: <><rect x="3.8" y="8.7" width="16.4" height="6.6" rx="3.3" transform="rotate(-45 12 12)" /><path d="m9.7 9.7 4.6 4.6" /></>,
  vitamin: <><circle cx="12" cy="12" r="7.5" /><path d="m8.5 9 3.5 7 3.5-7" /></>,
  leaf: <><path d="M5 19c0-8 5-13.5 14-14-.5 9-6 14-14 14Z" /><path d="M5 19 13 11" /></>,
  device: <><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M7 11h2l1.5-3 3 6 1.5-3h2" /><path d="M9 20h6" /></>,
  nutrition: <><path d="M12 7c-1.5-2-5.5-2.5-6.8.8-1.3 3.4.6 9.2 3.3 11.2 1.4 1 2.4.5 3.5.5s2.1.5 3.5-.5c2.7-2 4.6-7.8 3.3-11.2C17.5 4.5 13.5 5 12 7Z" /><path d="M12 7c0-1.7.8-3 2.3-3.6" /></>,
  baby: <><circle cx="12" cy="11" r="6.5" /><circle cx="9.7" cy="10.3" r=".6" fill="currentColor" /><circle cx="14.3" cy="10.3" r=".6" fill="currentColor" /><path d="M10 13.6a2.7 2.7 0 0 0 4 0" /><path d="M12 4.5c0-1 1.2-1.5 2-1" /></>,
  cosmetic: <><rect x="8" y="9" width="8" height="11.5" rx="1.5" /><path d="M10 9V6.5h4V9" /><path d="M11 3.5h2v3h-2z" /><path d="M10.5 14h3" /></>,
  tooth: <path d="M12 6.2C10.4 4.6 6 3.8 5.4 7.6c-.5 3.1 1 5.3 1.7 8.4.5 2.3.9 4.5 2.1 4.5 1.4 0 1.3-4.5 2.8-4.5s1.4 4.5 2.8 4.5c1.2 0 1.6-2.2 2.1-4.5.7-3.1 2.2-5.3 1.7-8.4-.6-3.8-5-3-6.6-1.4Z" />,
  hygiene: <><path d="M7 10h10l-1 10.5H8L7 10Z" /><path d="M9.5 10V7.5h5V10" /><path d="M14.5 7.5h3V5.5h-6" /><path d="M10 14.5h4" /></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

export function isIconName(v: string | null | undefined): v is IconName {
  return !!v && v in paths;
}
