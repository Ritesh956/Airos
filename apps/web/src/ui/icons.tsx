import type { SVGProps } from 'react';

/**
 * A small hand-rolled icon set. Nine icons don't justify an icon library
 * dependency — these are plain stroke-based SVGs sharing one visual
 * language (1.5px stroke, rounded joins, 20x20 viewBox).
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

export function CursorIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5 18 12l-5.2 1.3L15.5 19l-2.6 1.2-2.7-5.6L6 18.5Z" />
    </svg>
  );
}

export function FlaskIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3h6" />
      <path d="M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

export function CubeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" />
      <path d="M4 7.5 12 12l8-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20 5 15.5 15.5 5 19 8.5 8.5 19Z" />
      <path d="M13 7 17 11" />
    </svg>
  );
}

export function PresentIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  );
}

export function GameIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="8" width="19" height="9" rx="4" />
      <path d="M7 10.5v4M5 12.5h4" />
      <path d="M16.2 12h.01M18.5 10.2h.01" />
    </svg>
  );
}

export function AnalyticsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M2.5 20h19" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.7a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.4 2.3a7.6 7.6 0 0 0-2.6 1.5l-2.3-.7-2 3.4L4.6 10a7.6 7.6 0 0 0 0 3l-1.9 1.5 2 3.4 2.3-.7c.77.66 1.65 1.17 2.6 1.5L10 22h4l.4-2.3a7.6 7.6 0 0 0 2.6-1.5l2.3.7 2-3.4Z" />
    </svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1-1.6h6.6l1 1.6h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21M9 21h6" />
    </svg>
  );
}

export function CommandIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m19.5 19.5-4.3-4.3" />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 9.5v4.5M12 17h.01" />
    </svg>
  );
}
