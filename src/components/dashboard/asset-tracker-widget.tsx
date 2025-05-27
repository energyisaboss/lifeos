
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { TrendingUp, ArrowDown, ArrowUp, PlusCircle, Edit3, Trash2, Save } from 'lucide-react';
import type { Asset, AssetPortfolio, AssetHolding } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Helper function (can be moved to utils if used elsewhere)
function calculateAssetPortfolio(assets: Asset[]): AssetPortfolio {
  let totalPortfolioValue = 0;
  let totalInitialCost = 0;

  const holdings: AssetHolding[] = assets.map(asset => {
    const initialCost = asset.quantity * asset.purchasePrice;
    const currentValue = asset.quantity * asset.currentValue;
    const profitLoss = currentValue - initialCost;
    const profitLossPercentage = initialCost === 0 ? 0 : (profitLoss / initialCost) * 100;

    totalPortfolioValue += currentValue;
    totalInitialCost += initialCost;

    return {
      ...asset,
      totalValue: currentValue,
      profitLoss,
      profitLossPercentage,
    };
  });

  const totalProfitLoss = totalPortfolioValue - totalInitialCost;
  // Total P/L % was removed as per user request, so not calculating it here.

  return {
    holdings,
    totalPortfolioValue,
    totalProfitLoss,
    totalProfitLossPercentage: 0, // Placeholder as it's not displayed
  };
}


const initialAssetFormState: Omit<Asset, 'id'> = {
  name: '',
  symbol: '',
  quantity: 0,
  purchasePrice: 0,
  currentValue: 0,
  type: 'stock',
};

export function AssetTrackerWidget() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [portfolio, setPortfolio] = useState<AssetPortfolio | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetFormData, setAssetFormData] = useState<Omit<Asset, 'id'>>(initialAssetFormState);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAssets = localStorage.getItem('userAssetsLifeOS');
      if (savedAssets) {
        try {
            const parsedAssets = JSON.parse(savedAssets);
            if (Array.isArray(parsedAssets)) {
                 setAssets(parsedAssets.filter((asset: any) => 
                    typeof asset.id === 'string' &&
                    typeof asset.name === 'string' &&
                    typeof asset.symbol === 'string' &&
                    typeof asset.quantity === 'number' &&
                    typeof asset.purchasePrice === 'number' &&
                    typeof asset.currentValue === 'number' &&
                    ['stock', 'fund', 'crypto'].includes(asset.type)
                ));
            }
        } catch (e) {
            console.error("Failed to parse assets from localStorage", e);
            setAssets([]);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('userAssetsLifeOS', JSON.stringify(assets));
    }
    if (assets.length > 0) {
      setPortfolio(calculateAssetPortfolio(assets));
    } else {
      setPortfolio(null);
    }
  }, [assets]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAssetFormData(prev => ({ ...prev, [name]: name === 'quantity' || name === 'purchasePrice' || name === 'currentValue' ? parseFloat(value) || 0 : value }));
  };
  
  const handleTypeChange = (value: 'stock' | 'fund' | 'crypto') => {
    setAssetFormData(prev => ({ ...prev, type: value }));
  };

  const validateForm = () => {
    if (!assetFormData.name.trim()) {
      toast({ title: "Validation Error", description: "Asset name is required.", variant: "destructive" });
      return false;
    }
    if (!assetFormData.symbol.trim()) {
      toast({ title: "Validation Error", description: "Asset symbol is required.", variant: "destructive" });
      return false;
    }
    if (assetFormData.quantity <= 0) {
      toast({ title: "Validation Error", description: "Quantity must be greater than 0.", variant: "destructive" });
      return false;
    }
    if (assetFormData.purchasePrice < 0) { // Can be 0 if it was a gift/airdrop
      toast({ title: "Validation Error", description: "Purchase price cannot be negative.", variant: "destructive" });
      return false;
    }
     if (assetFormData.currentValue < 0) {
      toast({ title: "Validation Error", description: "Current value cannot be negative.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmitAsset = () => {
    if (!validateForm()) return;

    if (editingAsset) {
      setAssets(assets.map(asset => asset.id === editingAsset.id ? { ...editingAsset, ...assetFormData } : asset));
      toast({ title: "Asset Updated", description: `"${assetFormData.name}" has been updated.` });
    } else {
      const newAsset: Asset = { ...assetFormData, id: Date.now().toString() + Math.random().toString(36).substring(2,9) };
      setAssets([...assets, newAsset]);
      toast({ title: "Asset Added", description: `"${newAsset.name}" has been added.` });
    }
    setIsFormOpen(false);
    setEditingAsset(null);
    setAssetFormData(initialAssetFormState);
  };

  const handleEditAsset = (assetToEdit: Asset) => {
    setEditingAsset(assetToEdit);
    setAssetFormData({
      name: assetToEdit.name,
      symbol: assetToEdit.symbol,
      quantity: assetToEdit.quantity,
      purchasePrice: assetToEdit.purchasePrice,
      currentValue: assetToEdit.currentValue,
      type: assetToEdit.type,
    });
    setIsFormOpen(true);
  };

  const handleRemoveAsset = (assetId: string) => {
    const assetToRemove = assets.find(a => a.id === assetId);
    setAssets(assets.filter(asset => asset.id !== assetId));
    if (assetToRemove) {
        toast({ title: "Asset Removed", description: `"${assetToRemove.name}" has been removed.` });
    }
  };
  
  const openAddForm = () => {
    setEditingAsset(null);
    setAssetFormData(initialAssetFormState);
    setIsFormOpen(true);
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <React.Fragment>
      <div className="flex justify-between items-center mb-4">
        <SectionTitle icon={TrendingUp} title="Asset Tracker" className="mb-0" />
        <Button size="sm" onClick={openAddForm}>
          <PlusCircle className="mr-2" /> Add Asset
        </Button>
      </div>
      
      <Card className="shadow-lg">
        <CardContent className="pt-6">
          {portfolio && assets.length > 0 ? (
            <>
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
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolio.holdings.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell>
                          <div className="font-medium text-card-foreground">{asset.name}</div>
                          <div className="text-xs text-muted-foreground">{asset.symbol} - {asset.quantity} units</div>
                          <div className="text-xs text-muted-foreground capitalize">Type: {asset.type}</div>
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
                        <TableCell className="text-center">
                           <div className="flex justify-center items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEditAsset(asset)} aria-label="Edit asset">
                                <Edit3 className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" aria-label="Delete asset">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete the asset
                                        "{asset.name}".
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleRemoveAsset(asset.id)} className={buttonVariants({variant: "destructive"})}>
                                        Delete
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                           </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <p>No assets tracked yet.</p>
              <p className="text-sm">Click "Add Asset" to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(isOpen) => {
          setIsFormOpen(isOpen);
          if (!isOpen) {
            setEditingAsset(null);
            setAssetFormData(initialAssetFormState);
          }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingAsset ? 'Edit Asset' : 'Add New Asset'}</DialogTitle>
            <DialogDescription>
              {editingAsset ? 'Update the details of your asset.' : 'Enter the details of the asset you want to track.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name</Label>
              <Input id="name" name="name" value={assetFormData.name} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Apple Inc." />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="symbol" className="text-right">Symbol</Label>
              <Input id="symbol" name="symbol" value={assetFormData.symbol} onChange={handleInputChange} className="col-span-3" placeholder="e.g., AAPL" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">Quantity</Label>
              <Input id="quantity" name="quantity" type="number" value={assetFormData.quantity} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 10" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="purchasePrice" className="text-right">Purchase Price</Label>
              <Input id="purchasePrice" name="purchasePrice" type="number" value={assetFormData.purchasePrice} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 150" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="currentValue" className="text-right">Current Value</Label>
              <Input id="currentValue" name="currentValue" type="number" value={assetFormData.currentValue} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 175" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">Type</Label>
                <Select name="type" value={assetFormData.type} onValueChange={handleTypeChange}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select asset type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="stock">Stock</SelectItem>
                        <SelectItem value="fund">Fund/ETF</SelectItem>
                        <SelectItem value="crypto">Cryptocurrency</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmitAsset}>
                <Save className="mr-2 h-4 w-4" /> {editingAsset ? 'Save Changes' : 'Add Asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </React.Fragment>
  );
}

    