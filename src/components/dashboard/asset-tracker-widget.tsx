
"use client";

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { TrendingUp, DollarSign, ArrowDown, ArrowUp } from 'lucide-react';
import type { AssetPortfolio } from '@/lib/types';
import { mockAssets, calculateAssetPortfolio } from '@/lib/mock-data.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function AssetTrackerWidget() {
  const portfolio: AssetPortfolio = calculateAssetPortfolio(mockAssets); // In a real app, fetch and calculate this

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <SectionTitle icon={TrendingUp} title="Asset Tracker" />
      </CardHeader>
      <CardContent>
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 rounded-md bg-muted/30">
            <div className="text-sm text-muted-foreground mb-1">Total Value</div>
            <div className="text-2xl font-semibold text-primary">{formatCurrency(portfolio.totalPortfolioValue)}</div>
          </div>
          <div className="p-3 rounded-md bg-muted/30">
            <div className="text-sm text-muted-foreground mb-1">Total P/L</div>
            <div className={cn(
                "text-xl font-semibold flex items-center",
                portfolio.totalProfitLoss >= 0 ? "text-green-500" : "text-red-500"
              )}>
              {portfolio.totalProfitLoss >= 0 ? <ArrowUp className="w-4 h-4 mr-1" /> : <ArrowDown className="w-4 h-4 mr-1" />}
              {formatCurrency(portfolio.totalProfitLoss)}
            </div>
          </div>
        </div>

        <ScrollArea className="h-[280px] pr-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">P/L</TableHead>
                <TableHead className="text-right">P/L %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.holdings.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    <div className="font-medium text-card-foreground">{asset.name}</div>
                    <div className="text-xs text-muted-foreground">{asset.symbol} - {asset.quantity} units</div>
                  </TableCell>
                  <TableCell className="text-right text-card-foreground">{formatCurrency(asset.totalValue)}</TableCell>
                  <TableCell className={cn(
                      "text-right",
                      asset.profitLoss >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                    {formatCurrency(asset.profitLoss)}
                  </TableCell>
                  <TableCell className={cn(
                      "text-right",
                      asset.profitLossPercentage >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                    {formatPercentage(asset.profitLossPercentage)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
