import { DateTimeWidget } from '@/components/dashboard/datetime-widget';
import { NewsWidget } from '@/components/dashboard/news-widget';
import { CalendarWidget } from '@/components/dashboard/calendar-widget';
import { EnvironmentalWidget } from '@/components/dashboard/environmental-widget';
import { AssetTrackerWidget } from '@/components/dashboard/asset-tracker-widget';
import { TaskListWidget } from '@/components/dashboard/task-list-widget';
import { Separator } from '@/components/ui/separator';
import { LifeBuoy } from 'lucide-react';

export default function LifeOSPage() {
  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <header className="mb-8">
        <div className="flex items-center space-x-3">
          <LifeBuoy className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold">LifeOS</h1>
        </div>
        <p className="text-muted-foreground mt-1">Your personal operating system for life.</p>
      </header>
      
      <Separator className="my-6" />

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 */}
        <div className="lg:col-span-1 space-y-6">
          <DateTimeWidget />
          <CalendarWidget />
          
        </div>

        {/* Column 2 */}
        <div className="lg:col-span-1 space-y-6">
          <NewsWidget />
          <EnvironmentalWidget />
        </div>
        
        {/* Column 3 */}
        <div className="lg:col-span-1 space-y-6">
          <AssetTrackerWidget />
          <TaskListWidget />
        </div>
      </main>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} LifeOS. Minimalist dashboard design.</p>
      </footer>
    </div>
  );
}
