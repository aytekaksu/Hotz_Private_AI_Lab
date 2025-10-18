'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

const THEME_OPTIONS = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme =
    theme === 'system' && mounted ? systemTheme ?? 'system' : theme ?? 'system';

  const displayTheme = mounted ? (theme ?? 'system') : 'system';

  return (
    <div className="flex items-center gap-3 rounded-full border border-border bg-card/60 px-3 py-2 text-xs font-medium text-muted shadow-sm backdrop-blur">
      <span className="inline-flex items-center gap-1 text-muted">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
          <path
            d="M10 15a5 5 0 0 0 4.58-7.1A4.98 4.98 0 1 1 5.1 5.42 5 5 0 0 0 10 15Z"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Theme
      </span>
      <div className="flex items-center gap-1 rounded-full border border-border bg-background/60 p-1">
        {THEME_OPTIONS.map((option) => {
          const isActive = displayTheme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setTheme(option.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                isActive
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
