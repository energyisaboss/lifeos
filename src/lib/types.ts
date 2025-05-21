
export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  summary: string;
  url: string;
  category?: string;
  publishedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  calendarSource: string; // e.g., 'Google Calendar', 'Outlook'
  color: string; // Hex color for visual distinction
  isAllDay?: boolean;
}

export interface EnvironmentalData {
  moonPhase: {
    name: string;
    icon?: React.ReactNode; // Could be an emoji or an SVG component
  };
  uvIndex: {
    value: number;
    description: string; // e.g., 'Low', 'Moderate', 'High'
  };
  weeklyWeather: WeatherDay[];
}

export interface WeatherDay {
  day: string; // e.g., 'Mon', 'Tue'
  icon: React.ReactNode; // Icon component for weather condition
  tempHigh: number;
  tempLow: number;
  rainPercentage: number;
}

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  quantity: number;
  purchasePrice: number;
  currentValue: number;
  type: 'stock' | 'fund' | 'crypto';
}

export interface AssetHolding extends Asset {
  totalValue: number;
  profitLoss: number;
  profitLossPercentage: number;
}

export interface AssetPortfolio {
  holdings: AssetHolding[];
  totalPortfolioValue: number;
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
}
