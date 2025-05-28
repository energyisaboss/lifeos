
"use client";

import { useEffect, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AccentPalette {
  name: string;
  hex: string;
}

const ACCENT_COLOR_STORAGE_KEY = 'lifeos-accent-color-hex_v3'; // Updated key

const predefinedPalettes: AccentPalette[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#F44336' },
  { name: 'Blue', hex: '#2196F3' },
  { name: 'Orange', hex: '#FF9800' },
  { name: 'Yellow', hex: '#FFEB3B' },
  { name: 'Green', hex: '#4CAF50' },
  { name: 'Purple', hex: '#9C27B0' },
];

const defaultAccentHex = predefinedPalettes[0].hex; // Default to White

const isValidHexColor = (color: string): boolean => {
  return /^#([0-9A-Fa-f]{3}){1,2}$/.test(color);
};

function hexToHslValues(hex: string): string | null {
  if (!isValidHexColor(hex)) return null;
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) { // #RGB
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) { // #RRGGBB
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  } else {
    return null;
  }

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  const hue = Math.round(h * 360);
  const saturation = Math.round(s * 100);
  const lightness = Math.round(l * 100);
  
  return `${hue} ${saturation}% ${lightness}%`;
}


export function AccentColorSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [activeColorHex, setActiveColorHex] = useState<string>(defaultAccentHex);
  const [customHexInput, setCustomHexInput] = useState<string>(defaultAccentHex);

  const applyTheme = (hexColor: string) => {
    if (!isValidHexColor(hexColor)) {
      console.warn("Invalid hex color for theme application:", hexColor);
      return;
    }
    
    const hslValues = hexToHslValues(hexColor);
    if (!hslValues) {
        console.warn("Could not convert hex to HSL:", hexColor);
        return;
    }

    document.documentElement.style.setProperty('--accent', hslValues);
    document.documentElement.style.setProperty('--primary', hslValues);
    document.documentElement.style.setProperty('--ring', hslValues);
    document.documentElement.style.setProperty('--chart-1', hslValues); // Also update chart-1 for consistency

    // Adjust foreground colors for contrast
    const isWhiteAccent = hexColor.toLowerCase() === '#ffffff';
    const primaryFgHsl = isWhiteAccent ? hexToHslValues('#212121') : hexToHslValues('#FFFFFF'); // Dark grey for white accent, white otherwise
    const accentFgHsl = isWhiteAccent ? hexToHslValues('#212121') : hexToHslValues('#FFFFFF');
    
    if (primaryFgHsl) {
        document.documentElement.style.setProperty('--primary-foreground', primaryFgHsl);
    }
    if (accentFgHsl) {
        document.documentElement.style.setProperty('--accent-foreground', accentFgHsl);
    }
    
    setActiveColorHex(hexColor);
    setCustomHexInput(hexColor); 
  };

  useEffect(() => {
    setMounted(true);
    const savedAccentHex = localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
    if (savedAccentHex && isValidHexColor(savedAccentHex)) {
      applyTheme(savedAccentHex);
    } else {
      applyTheme(defaultAccentHex); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleSwatchClick = (hexColor: string) => {
    applyTheme(hexColor);
    localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, hexColor);
  };

  const handleCustomHexApply = () => {
    if (isValidHexColor(customHexInput)) {
      applyTheme(customHexInput);
      localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, customHexInput);
    } else {
      console.warn("Invalid custom hex color entered:", customHexInput);
      // Optionally, provide user feedback here, e.g., using a toast
    }
  };
  
  const handleCustomHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomHexInput(e.target.value);
  };


  if (!mounted) {
    return (
      <div className="p-1 space-y-2">
        <div className="h-5 w-24 bg-muted animate-pulse rounded"></div>
        <div className="flex flex-wrap gap-2">
          {Array(predefinedPalettes.length).fill(0).map((_, i) => (
            <div key={i} className="h-7 w-7 rounded-full bg-muted animate-pulse"></div>
          ))}
        </div>
         <div className="h-8 w-full bg-muted animate-pulse rounded mt-1"></div>
      </div>
    ); 
  }

  return (
    <div className="p-1 space-y-3">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Predefined Accents</Label>
        <div className="flex flex-wrap gap-2">
          {predefinedPalettes.map((palette) => (
            <Button
              key={palette.name}
              variant="outline"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-full border-2 p-0",
                activeColorHex.toLowerCase() === palette.hex.toLowerCase() ? 'border-foreground ring-2 ring-ring ring-offset-1 ring-offset-background' : 'border-muted-foreground/30 hover:border-muted-foreground/70'
              )}
              style={{ backgroundColor: palette.hex }}
              onClick={() => handleSwatchClick(palette.hex)}
              title={palette.name}
              aria-label={`Set accent color to ${palette.name}`}
            >
              {activeColorHex.toLowerCase() === palette.hex.toLowerCase() && <Check className="h-3.5 w-3.5 text-foreground mix-blend-difference" />}
            </Button>
          ))}
        </div>
      </div>
      
      <div>
        <Label htmlFor="custom-hex-input" className="text-xs font-medium text-muted-foreground mb-1.5 block">Custom Hex Color</Label>
        <div className="flex items-center gap-2">
          <Input
            id="custom-hex-input"
            type="text"
            value={customHexInput}
            onChange={handleCustomHexInputChange}
            placeholder="#RRGGBB"
            className={cn("h-8 text-sm flex-grow", !isValidHexColor(customHexInput) && customHexInput.length > 0 ? "border-destructive focus-visible:ring-destructive" : "")}
          />
          <Button size="sm" onClick={handleCustomHexApply} className="h-8 px-3" disabled={!isValidHexColor(customHexInput)}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
