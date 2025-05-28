
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

const ACCENT_COLOR_STORAGE_KEY = 'lifeos-accent-color-hex_v1';

const predefinedPalettes: AccentPalette[] = [
  { name: 'Default Purple', hex: '#9575CD' }, // Original default for consistency
  { name: 'Red', hex: '#F44336' },
  { name: 'Blue', hex: '#2196F3' },
  { name: 'Orange', hex: '#FF9800' },
  { name: 'Yellow', hex: '#FFEB3B' },
  { name: 'Green', hex: '#4CAF50' },
  { name: 'Purple', hex: '#9C27B0' },
];

const defaultAccentHex = predefinedPalettes[0].hex; // Default Purple

const isValidHexColor = (color: string): boolean => {
  return /^#([0-9A-Fa-f]{3}){1,2}$/.test(color);
};

export function AccentColorSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [activeColorHex, setActiveColorHex] = useState<string>(defaultAccentHex);
  const [customHexInput, setCustomHexInput] = useState<string>(defaultAccentHex);

  const applyTheme = (hexColor: string) => {
    if (!isValidHexColor(hexColor)) {
      // Optionally, provide feedback that the hex is invalid
      // For now, just don't apply if invalid
      return;
    }
    
    document.documentElement.style.setProperty('--accent', hexColor);
    document.documentElement.style.setProperty('--primary', hexColor);
    document.documentElement.style.setProperty('--ring', hexColor);
    document.documentElement.style.setProperty('--chart-1', hexColor);

    // For dark theme, a white foreground usually works well with most accents
    document.documentElement.style.setProperty('--accent-foreground', 'hsl(0 0% 100%)');
    document.documentElement.style.setProperty('--primary-foreground', 'hsl(0 0% 100%)');
    
    setActiveColorHex(hexColor);
    setCustomHexInput(hexColor); // Sync input field with applied color
  };

  useEffect(() => {
    setMounted(true);
    const savedAccentHex = localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
    if (savedAccentHex && isValidHexColor(savedAccentHex)) {
      applyTheme(savedAccentHex);
    } else {
      applyTheme(defaultAccentHex); // Apply default if nothing valid saved
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
      // Provide feedback for invalid hex, e.g., using toast
      console.warn("Invalid hex color entered:", customHexInput);
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
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-8 w-8 rounded-full bg-muted animate-pulse"></div>
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
              {activeColorHex.toLowerCase() === palette.hex.toLowerCase() && <Check className="h-3.5 w-3.5 text-white mix-blend-difference" />}
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
