"use client";

import React from 'react';

export type CustomIconName =
  | 'alert'
  | 'success'
  | 'blocked'
  | 'folder'
  | 'file'
  | 'attachment'
  | 'arrow-left'
  | 'close'
  | 'edit'
  | 'flame'
  | 'star'
  | 'eye'
  | 'hidden'
  | 'download'
  | 'upload'
  | 'globe'
  | 'brew'
  | 'idea'
  | 'refresh'
  | 'brain'
  | 'user'
  | 'sprout'
  | 'rocket'
  | 'send'
  | 'book'
  | 'material'
  | 'lantern'
  | 'chat'
  | 'menu'
  | 'gear'
  | 'day'
  | 'check'
  | 'x'
  | 'infinity'
  | 'cap';

type CustomIconProps = {
  name: CustomIconName;
  size?: number;
  color?: string;
  accent?: string;
  title?: string;
};

const iconShell: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  verticalAlign: 'middle',
  lineHeight: 0
};

export default function CustomIcon({
  name,
  size = 22,
  color = '#0abab5',
  accent = '#111',
  title
}: CustomIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    role: title ? 'img' : 'presentation',
    'aria-label': title
  } as const;

  const strokeProps = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };

  const icons: Record<CustomIconName, React.ReactNode> = {
    alert: (
      <svg {...common}>
        <path d="M12 3L22 20H2L12 3Z" fill="rgba(255,77,77,0.14)" {...strokeProps} />
        <path d="M12 8V13" {...strokeProps} />
        <path d="M12 17H12.01" {...strokeProps} />
      </svg>
    ),
    success: (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" fill="rgba(10,186,181,0.14)" {...strokeProps} />
        <path d="M7.5 12.2L10.5 15.2L16.8 8.8" {...strokeProps} />
      </svg>
    ),
    blocked: (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" fill="rgba(255,77,77,0.12)" {...strokeProps} />
        <path d="M7 17L17 7" {...strokeProps} />
      </svg>
    ),
    folder: (
      <svg {...common}>
        <path d="M3 7.5C3 6.7 3.7 6 4.5 6H9L11 8H19.5C20.3 8 21 8.7 21 9.5V18C21 18.8 20.3 19.5 19.5 19.5H4.5C3.7 19.5 3 18.8 3 18V7.5Z" fill="rgba(10,186,181,0.12)" {...strokeProps} />
      </svg>
    ),
    file: (
      <svg {...common}>
        <path d="M7 3.5H14L19 8.5V20.5H7V3.5Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
        <path d="M14 3.5V9H19" {...strokeProps} />
        <path d="M9.5 13H16.5M9.5 16H14" {...strokeProps} />
      </svg>
    ),
    attachment: (
      <svg {...common}>
        <path d="M8 12.5L13.8 6.7C15.1 5.4 17.2 5.4 18.5 6.7C19.8 8 19.8 10.1 18.5 11.4L10.7 19.2C8.8 21.1 5.8 21.1 3.9 19.2C2 17.3 2 14.3 3.9 12.4L11.4 4.9" {...strokeProps} />
      </svg>
    ),
    'arrow-left': (
      <svg {...common}>
        <path d="M19 12H5" {...strokeProps} />
        <path d="M11 6L5 12L11 18" {...strokeProps} />
      </svg>
    ),
    close: (
      <svg {...common}>
        <path d="M6 6L18 18M18 6L6 18" {...strokeProps} />
      </svg>
    ),
    edit: (
      <svg {...common}>
        <path d="M5 19L8.5 18.2L18.2 8.5C19 7.7 19 6.5 18.2 5.8C17.5 5 16.3 5 15.5 5.8L5.8 15.5L5 19Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
      </svg>
    ),
    flame: (
      <svg {...common}>
        <path d="M12.4 21C8.7 21 6 18.6 6 15.1C6 12.3 8.1 10.2 10.2 8C11.2 7 12.1 5.7 12 3C15.4 5.1 18 8.7 18 13.2C18 17.2 15.5 21 12.4 21Z" fill="rgba(255,215,0,0.16)" {...strokeProps} />
        <path d="M11.8 18C10.4 18 9.5 17 9.5 15.7C9.5 14.6 10.2 13.8 11.1 12.9C11.6 12.4 12.1 11.7 12.1 10.5C13.7 11.8 14.5 13.3 14.5 15C14.5 16.8 13.4 18 11.8 18Z" fill={color} opacity="0.6" />
      </svg>
    ),
    star: (
      <svg {...common}>
        <path d="M12 3.5L14.7 8.6L20.4 9.6L16.4 13.7L17.2 19.5L12 16.9L6.8 19.5L7.6 13.7L3.6 9.6L9.3 8.6L12 3.5Z" fill="rgba(255,215,0,0.18)" {...strokeProps} />
      </svg>
    ),
    eye: (
      <svg {...common}>
        <path d="M3 12C5.4 7.8 8.4 6 12 6C15.6 6 18.6 7.8 21 12C18.6 16.2 15.6 18 12 18C8.4 18 5.4 16.2 3 12Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
        <circle cx="12" cy="12" r="3" {...strokeProps} />
      </svg>
    ),
    hidden: (
      <svg {...common}>
        <path d="M3 12C5.4 7.8 8.4 6 12 6C15.6 6 18.6 7.8 21 12C20.2 13.4 19.3 14.5 18.3 15.4" {...strokeProps} />
        <path d="M9.2 17.4C6.8 16.7 4.8 15 3 12" {...strokeProps} />
        <path d="M5 5L19 19" {...strokeProps} />
      </svg>
    ),
    download: (
      <svg {...common}>
        <path d="M12 4V14M8 10L12 14L16 10" {...strokeProps} />
        <path d="M5 19H19" {...strokeProps} />
      </svg>
    ),
    upload: (
      <svg {...common}>
        <path d="M12 14V4M8 8L12 4L16 8" {...strokeProps} />
        <path d="M5 19H19" {...strokeProps} />
      </svg>
    ),
    globe: (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" fill="rgba(10,186,181,0.08)" {...strokeProps} />
        <path d="M3.5 12H20.5M12 3.5C14 6 15 8.8 15 12C15 15.2 14 18 12 20.5C10 18 9 15.2 9 12C9 8.8 10 6 12 3.5Z" {...strokeProps} />
      </svg>
    ),
    brew: (
      <svg {...common}>
        <path d="M7 10H16V15C16 17.2 14.2 19 12 19H11C8.8 19 7 17.2 7 15V10Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
        <path d="M16 11H18C19.1 11 20 11.9 20 13C20 14.1 19.1 15 18 15H16" {...strokeProps} />
        <path d="M9 5C8.5 6.1 8.5 7 9 8M12 4C11.5 5.1 11.5 6 12 7M15 5C14.5 6.1 14.5 7 15 8" {...strokeProps} />
      </svg>
    ),
    idea: (
      <svg {...common}>
        <path d="M8 11C8 8.8 9.8 7 12 7C14.2 7 16 8.8 16 11C16 12.5 15.2 13.4 14.3 14.4C13.8 15 13.5 15.6 13.5 16.5H10.5C10.5 15.6 10.2 15 9.7 14.4C8.8 13.4 8 12.5 8 11Z" fill="rgba(255,215,0,0.12)" {...strokeProps} />
        <path d="M10.5 19H13.5M11 22H13" {...strokeProps} />
      </svg>
    ),
    refresh: (
      <svg {...common}>
        <path d="M19 8V4H15" {...strokeProps} />
        <path d="M5 16V20H9" {...strokeProps} />
        <path d="M18.2 9C17.1 6.6 14.7 5 12 5C8.4 5 5.5 7.6 5.1 11" {...strokeProps} />
        <path d="M5.8 15C6.9 17.4 9.3 19 12 19C15.6 19 18.5 16.4 18.9 13" {...strokeProps} />
      </svg>
    ),
    brain: (
      <svg {...common}>
        <path d="M9 5.5C7.3 5.5 6 6.8 6 8.5C4.8 9 4 10.1 4 11.5C4 13 5 14.2 6.3 14.7C6.2 16.6 7.6 18 9.3 18H10V5.5H9Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
        <path d="M15 5.5C16.7 5.5 18 6.8 18 8.5C19.2 9 20 10.1 20 11.5C20 13 19 14.2 17.7 14.7C17.8 16.6 16.4 18 14.7 18H14V5.5H15Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
      </svg>
    ),
    user: (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" fill="rgba(10,186,181,0.1)" {...strokeProps} />
        <path d="M4.5 20C5.8 16.8 8.2 15 12 15C15.8 15 18.2 16.8 19.5 20" {...strokeProps} />
      </svg>
    ),
    sprout: (
      <svg {...common}>
        <path d="M12 20V10" {...strokeProps} />
        <path d="M12 12C8 12 6 9.8 6 6C10 6 12 8.2 12 12Z" fill="rgba(10,186,181,0.14)" {...strokeProps} />
        <path d="M12 13C16 13 18 10.8 18 7C14 7 12 9.2 12 13Z" fill="rgba(10,186,181,0.14)" {...strokeProps} />
      </svg>
    ),
    rocket: (
      <svg {...common}>
        <path d="M9 15L5 19L4 15L8 11C8.7 8.5 10.4 5.6 15 3C16.5 6.4 15.7 9.8 13 12L9 15Z" fill="rgba(10,186,181,0.12)" {...strokeProps} />
        <path d="M13.5 6.5H13.51M8 16L6 18" {...strokeProps} />
      </svg>
    ),
    send: (
      <svg {...common}>
        <path d="M3.5 4.5L21 12L3.5 19.5L6.25 12L3.5 4.5Z" fill="rgba(10,186,181,0.14)" {...strokeProps} />
        <path d="M6.25 12H15.5" {...strokeProps} />
      </svg>
    ),
    book: (
      <svg {...common}>
        <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11V20H5.5C4.7 20 4 19.3 4 18.5V5.5Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
        <path d="M20 5.5C20 4.7 19.3 4 18.5 4H13V20H18.5C19.3 20 20 19.3 20 18.5V5.5Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
      </svg>
    ),
    material: (
      <svg {...common}>
        <rect x="5" y="3" width="14" height="18" rx="3" fill="rgba(10,186,181,0.1)" {...strokeProps} />
        <path d="M9 3V21" {...strokeProps} />
        <path d="M12 8H16M12 12H16M12 16H15" {...strokeProps} />
      </svg>
    ),
    lantern: (
      <svg {...common}>
        <path d="M9 4H15M8 7H16M8 17H16M9 20H15" {...strokeProps} />
        <path d="M8 7C7 9 7 15 8 17H16C17 15 17 9 16 7H8Z" fill="rgba(255,77,77,0.1)" {...strokeProps} />
        <path d="M12 7V17" {...strokeProps} />
      </svg>
    ),
    chat: (
      <svg {...common}>
        <path d="M4 5.5C4 4.7 4.7 4 5.5 4H18.5C19.3 4 20 4.7 20 5.5V14.5C20 15.3 19.3 16 18.5 16H10L5.5 20V16H5.5C4.7 16 4 15.3 4 14.5V5.5Z" fill="rgba(10,186,181,0.1)" {...strokeProps} />
      </svg>
    ),
    menu: (
      <svg {...common}>
        <path d="M5 7H19M5 12H19M5 17H19" {...strokeProps} />
      </svg>
    ),
    gear: (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.2" fill="rgba(10,186,181,0.14)" {...strokeProps} />
        <path d="M12 2.8V5.1M12 18.9V21.2M21.2 12H18.9M5.1 12H2.8M18.5 5.5L16.8 7.2M7.2 16.8L5.5 18.5M18.5 18.5L16.8 16.8M7.2 7.2L5.5 5.5" {...strokeProps} />
      </svg>
    ),
    day: (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" fill="rgba(255,215,0,0.26)" {...strokeProps} />
        <path d="M12 2.5V5M12 19V21.5M2.5 12H5M19 12H21.5M5.3 5.3L7.1 7.1M16.9 16.9L18.7 18.7M18.7 5.3L16.9 7.1M7.1 16.9L5.3 18.7" {...strokeProps} />
      </svg>
    ),
    check: (
      <svg {...common}>
        <path d="M5 12.5L10 17L19 7" {...strokeProps} />
      </svg>
    ),
    x: (
      <svg {...common}>
        <path d="M6 6L18 18M18 6L6 18" {...strokeProps} />
      </svg>
    ),
    infinity: (
      <svg {...common}>
        <path d="M7.5 15C5.8 15 4.5 13.7 4.5 12C4.5 10.3 5.8 9 7.5 9C10.2 9 12 15 15.5 15C17.2 15 18.5 13.7 18.5 12C18.5 10.3 17.2 9 15.5 9C12.8 9 11 15 7.5 15Z" {...strokeProps} />
      </svg>
    ),
    cap: (
      <svg {...common}>
        <path d="M3 9L12 4L21 9L12 14L3 9Z" fill="rgba(10,186,181,0.12)" {...strokeProps} />
        <path d="M7 12V16C9.5 18 14.5 18 17 16V12" {...strokeProps} />
      </svg>
    )
  };

  return (
    <span style={{ ...iconShell, width: size, height: size, color, background: accent === 'none' ? 'transparent' : undefined }}>
      {icons[name]}
    </span>
  );
}
