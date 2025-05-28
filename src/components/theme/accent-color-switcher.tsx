
"use client";

import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AccentPalette {
  name: string;
  hsl: {
    accent: string; // e.g., "261 42% 66.3%"
    accentForeground: string; // e.g., "0 0% 100%"
    primary: string; // often same as accent
    primaryForeground: string; // often same as accentForeground
    ring: string; // often same as accent
    chart1?: string; // Optional: if chart-1 should also match
  };
  previewColor: string; // A hex or HSL string for the swatch background
}

const ACCENT_COLOR_STORAGE_KEY = 'lifeos-accent-color';

const defaultDarkAccent: AccentPalette = {
  name: 'Default Purple',
  hsl: {
    accent: '261 42% 66.3%',
    accentForeground: '0 0% 100%',
    primary: '261 42% 66.3%',
    primaryForeground: '0 0% 100%',
    ring: '261 42% 66.3%',
    chart1: '261 42% 66.3%',
  },
  previewColor: 'hsl(261, 42%, 66.3%)',
};

const availablePalettes: AccentPalette[] = [
  defaultDarkAccent,
  {
    name: 'Blue',
    hsl: {
      accent: '217 91% 60%', // hsl for #3B82F6
      accentForeground: '0 0% 100%',
      primary: '217 91% 60%',
      primaryForeground: '0 0% 100%',
      ring: '217 91% 60%',
      chart1: '217 91% 60%',
    },
    previewColor: 'hsl(217, 91%, 60%)',
  },
  {
    name: 'Green',
    hsl: {
      accent: '142 71% 45%', // hsl for #22C55E
      accentForeground: '0 0% 100%',
      primary: '142 71% 45%',
      primaryForeground: '0 0% 100%',
      ring: '142 71% 45%',
      chart1: '142 71% 45%',
    },
    previewColor: 'hsl(142, 71%, 45%)',
  },
  {
    name: 'Orange',
    hsl: {
      accent: '25 95% 53%', // hsl for #F97316 (Tailwind Orange 600)
      accentForeground: '0 0% 100%',
      primary: '25 95% 53%',
      primaryForeground: '0 0% 100%',
      ring: '25 95% 53%',
      chart1: '25 95% 53%',
    },
    previewColor: 'hsl(25, 95%, 53%)',
  },
  {
    name: 'Rose',
    hsl: {
      accent: '347 89% 60%', // hsl for #F43F5E (Tailwind Rose 500)
      accentForeground: '0 0% 100%',
      primary: '347 89% 60%',
      primaryForeground: '0 0% 100%',
      ring: '347 89% 60%',
      chart1: '347 89% 60%',
    },
    previewColor: 'hsl(347, 89%, 60%)',
  },
  {
    name: 'Teal',
    hsl: {
      accent: '170 75% 41%', // hsl for #14B8A6 (Tailwind Teal 500)
      accentForeground: '0 0% 100%',
      primary: '170 75% 41%',
      primaryForeground: '0 0% 100%',
      ring: '170 75% 41%',
      chart1: '170 75% 41%',
    },
    previewColor: 'hsl(170, 75%, 41%)',
  },
];

export function AccentColorSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [currentAccentName, setCurrentAccentName] = useState<string>(defaultDarkAccent.name);

  const applyTheme = (paletteName: string) => {
    const palette = availablePalettes.find(p => p.name === paletteName) || defaultDarkAccent;
    
    document.documentElement.style.setProperty('--accent', palette.hsl.accent);
    document.documentElement.style.setProperty('--accent-foreground', palette.hsl.accentForeground);
    document.documentElement.style.setProperty('--primary', palette.hsl.primary);
    document.documentElement.style.setProperty('--primary-foreground', palette.hsl.primaryForeground);
    document.documentElement.style.setProperty('--ring', palette.hsl.ring);
    if (palette.hsl.chart1) {
      document.documentElement.style.setProperty('--chart-1', palette.hsl.chart1);
    }
    setCurrentAccentName(palette.name);
  };

  useEffect(() => {
    setMounted(true);
    const savedAccentName = localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
    if (savedAccentName) {
      applyTheme(savedAccentName);
    } else {
      applyTheme(defaultDarkAccent.name); // Apply default if nothing saved
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleColorChange = (paletteName: string) => {
    applyTheme(paletteName);
    localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, paletteName);
  };

  if (!mounted) {
    // Avoid rendering on server or before hydration to prevent mismatch
    return null; 
  }

  return (
    <div className="p-1">
      <p className="text-sm font-medium text-muted-foreground mb-2">Accent Color</p>
      <div className="flex flex-wrap gap-2">
        {availablePalettes.map((palette) => (
          <Button
            key={palette.name}
            variant="outline"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-full border-2",
              currentAccentName === palette.name ? 'border-foreground ring-2 ring-ring ring-offset-1 ring-offset-background' : 'border-muted-foreground/50'
            )}
            style={{ backgroundColor: palette.previewColor }}
            onClick={() => handleColorChange(palette.name)}
            title={palette.name}
            aria-label={`Set accent color to ${palette.name}`}
          />
        ))}
      </div>
    </div>
  );
}
