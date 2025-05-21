"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { Clock } from 'lucide-react';

export function DateTimeWidget() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  const formattedDate = currentTime.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = currentTime.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <SectionTitle icon={Clock} title="Current Date & Time" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-primary">{formattedTime}</p>
        <p className="text-sm text-muted-foreground">{formattedDate}</p>
      </CardContent>
    </Card>
  );
}
