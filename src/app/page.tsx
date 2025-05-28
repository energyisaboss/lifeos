
"use client"; 

import { useState } from 'react'; 
import { DateTimeWidget } from '@/components/dashboard/datetime-widget';
import { NewsWidget } from '@/components/dashboard/news-widget';
import { CalendarWidget } from '@/components/dashboard/calendar-widget';
import { EnvironmentalWidget } from '@/components/dashboard/environmental-widget';
import { AssetTrackerWidget } from '@/components/dashboard/asset-tracker-widget';
import { TaskListWidget } from '@/components/dashboard/task-list-widget';
import { Separator } from '@/components/ui/separator';
import { LifeBuoy, Palette as PaletteIcon, Settings as SettingsIcon, X } from 'lucide-react'; 
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AccentColorSwitcher } from '@/components/theme/accent-color-switcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


export default function LifeOSPage() {
  const [showGlobalWidgetSettings, setShowGlobalWidgetSettings] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <header className="mb-6 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <LifeBuoy className="h-10 w-10 text-primary" />
          <div>
            <h1 className="text-4xl font-bold">LifeOS</h1>
            <p className="text-muted-foreground mt-1">Your personal operating system for life.</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle Widget Settings"
            onClick={() => setShowGlobalWidgetSettings(!showGlobalWidgetSettings)}
          >
            {showGlobalWidgetSettings ? <X className="h-5 w-5" /> : <SettingsIcon className="h-5 w-5" />}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Change accent color">
                <PaletteIcon className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <AccentColorSwitcher />
            </PopoverContent>
          </Popover>
        </div>
      </header>
      
      {showGlobalWidgetSettings && (
        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Global Widget Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <CalendarWidget settingsOpen={true} displayMode="settingsOnly" />
              </div>
              <div>
                <NewsWidget settingsOpen={true} displayMode="settingsOnly" />
              </div>
              <div>
                <AssetTrackerWidget settingsOpen={true} displayMode="settingsOnly" />
              </div>
              <div>
                <TaskListWidget settingsOpen={true} displayMode="settingsOnly" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <Separator className="my-6" />

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 */}
        <div className="lg:col-span-1 space-y-6">
          <DateTimeWidget />
          <CalendarWidget displayMode="widgetOnly" settingsOpen={false} />
        </div>

        {/* Column 2 */}
        <div className="lg:col-span-1 space-y-6">
          <NewsWidget displayMode="widgetOnly" settingsOpen={false}/>
          <EnvironmentalWidget />
        </div>
        
        {/* Column 3 */}
        <div className="lg:col-span-1 space-y-6">
          <AssetTrackerWidget displayMode="widgetOnly" settingsOpen={false} />
          <TaskListWidget displayMode="widgetOnly" settingsOpen={false} />
        </div>
      </main>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} LifeOS. Minimalist dashboard design.</p>
      </footer>
    </div>
  );
}
