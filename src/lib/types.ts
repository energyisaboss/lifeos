
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
  startTime: string; 
  endTime: string;   
  calendarSource: string; 
  color: string; 
  isAllDay?: boolean;
}

export interface EnvironmentalData {
  locationName?: string;
  moonPhase?: {
    name: string; // e.g., "Waxing Crescent"
    illumination: number; // Moon illumination percentage
    iconName: string; // Lucide icon name, e.g., "Moon" or "Sun" for full moon
  };
  uvIndex?: {
    value: number;
    description: string; // e.g., "Low", "Moderate", "High"
  };
  airQuality?: {
    aqi: number; // OWM AQI Index (1-5)
    level: string; // e.g., "Good", "Fair", "Moderate", "Poor", "Very Poor"
    iconName: string; // Lucide icon name for the level
    colorClass: string; // Tailwind CSS class for text color
  };
  currentWeather: {
    temp: number;
    description: string;
    iconName: string;
    humidity: number;
    windSpeed: number;
  };
  weeklyWeather: WeatherDay[];
}

export interface WeatherDay {
  day: string; 
  iconName: string;
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
