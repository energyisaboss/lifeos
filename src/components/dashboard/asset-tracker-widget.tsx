
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { TrendingUp, ArrowDown, ArrowUp, PlusCircle, Edit3, Trash2, Save, Loader2, Settings, ListTree, AlertCircle } from 'lucide-react';
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
import { getAssetPrice } from '@/ai/flows/asset-price-flow';
import { getAssetProfile } from '@/ai/flows/asset-profile-flow';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const initialAssetFormState: Omit<Asset, 'id'> = {
  name: '',
  symbol: '',
  quantity: 0,
  purchasePrice: 0,
  type: 'stock',
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function calculateAssetPortfolio(
  assets: Asset[],
  fetchedPrices: Record<string, number | null>
): AssetPortfolio {
  let totalPortfolioValue = 0;
  let totalInitialCost = 0;

  const holdings: AssetHolding[] = assets.map(asset => {
    const currentPricePerUnit = fetchedPrices[asset.id];
    const initialCost = asset.quantity * asset.purchasePrice;
    
    let currentValue = 0;
    if (typeof currentPricePerUnit === 'number') {
      currentValue = asset.quantity * currentPricePerUnit;
    }

    const profitLoss = typeof currentPricePerUnit === 'number' ? currentValue - initialCost : 0 - initialCost; 

    totalPortfolioValue += currentValue;
    totalInitialCost += initialCost;

    return {
      ...asset,
      currentPricePerUnit: currentPricePerUnit === undefined ? null : currentPricePerUnit,
      totalValue: currentValue,
      profitLoss,
      profitLossPercentage: initialCost === 0 && profitLoss > 0 ? Infinity : (initialCost === 0 ? 0 : (profitLoss / initialCost) * 100),
    };
  });

  const totalProfitLoss = totalPortfolioValue - totalInitialCost;

  return {
    holdings,
    totalPortfolioValue,
    totalProfitLoss,
  };
}

export function AssetTrackerWidget() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [fetchedPrices, setFetchedPrices] = useState<Record<string, number | null>>({});
  const [portfolio, setPortfolio] = useState<AssetPortfolio | null>(null);
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false); // For editing dialog
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetFormData, setAssetFormData] = useState<Omit<Asset, 'id'>>(initialAssetFormState);
  
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [priceFetchError, setPriceFetchError] = useState<string | null>(null);
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [showAssetManagement, setShowAssetManagement] = useState(false);
  const [showNewAssetForm, setShowNewAssetForm] = useState(false); // For inline add form

  const isFetchingPricesRef = useRef(isFetchingPrices);
  useEffect(() => {
    isFetchingPricesRef.current = isFetchingPrices;
  }, [isFetchingPrices]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAssets = localStorage.getItem('userAssetsLifeOS_v2');
      if (savedAssets) {
        try {
          const parsedAssets = JSON.parse(savedAssets);
          if (Array.isArray(parsedAssets)) {
            setAssets(parsedAssets.filter((asset: any) =>
              typeof asset.id === 'string' &&
              (typeof asset.name === 'string' || asset.name === null) && // Allow null name initially
              typeof asset.symbol === 'string' &&
              typeof asset.quantity === 'number' &&
              typeof asset.purchasePrice === 'number' &&
              ['stock', 'fund', 'crypto'].includes(asset.type)
            ).map((asset: any) => ({...asset, name: asset.name || ''}))); // Ensure name is empty string if null
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
      localStorage.setItem('userAssetsLifeOS_v2', JSON.stringify(assets));
    }
  }, [assets]);

  const fetchAllAssetPrices = useCallback(async (currentAssets: Asset[]) => {
    if (currentAssets.length === 0) {
      setFetchedPrices({});
      setIsFetchingPrices(false);
      setPriceFetchError(null);
      return;
    }
    if (isFetchingPricesRef.current) { 
      console.log("AssetTracker: Price fetch already in progress, skipping new fetchAllAssetPrices call.");
      return;
    }
    setIsFetchingPrices(true);
    setPriceFetchError(null);
    const prices: Record<string, number | null> = {};
    let anErrorOccurred = false;
    let specificErrorMessage = "Could not fetch prices for some assets. Ensure symbols are correct and Finnhub API key is set in .env.local.";

    for (const asset of currentAssets) {
      if ((asset.type === 'stock' || asset.type === 'fund') && asset.symbol) {
        try {
          const priceData = await getAssetPrice({ symbol: asset.symbol });
          prices[asset.id] = priceData.currentPrice;
          if (priceData.currentPrice === null) {
             console.warn(`Finnhub: Price not found or unavailable for symbol ${asset.symbol} (Type: ${asset.type}). API Response for ${asset.symbol} was ${JSON.stringify(priceData)}`);
          }
        } catch (err) {
          console.error(`Error fetching price for ${asset.symbol}:`, err);
          prices[asset.id] = null; 
          anErrorOccurred = true;
          if (err instanceof Error) {
            if (err.message.includes('FINNHUB_API_KEY_NOT_CONFIGURED')) {
              specificErrorMessage = "Finnhub API Key is not configured. Please set FINNHUB_API_KEY in your .env.local file and restart the server.";
            } else if (err.message.startsWith('FINNHUB_API_ERROR')) {
               const statusMatch = err.message.match(/FINNHUB_API_ERROR: (\d+)/);
               const status = statusMatch ? statusMatch[1] : 'Unknown Status';
               specificErrorMessage = `Finnhub API error for ${asset.symbol} (Status: ${status}). Check symbol, API limits, or plan.`;
            } else if (err.message.startsWith('FETCH_ERROR')) {
               specificErrorMessage = `Network error fetching price for ${asset.symbol}. Check connection or Finnhub status.`;
            }
          }
        }
      } else {
        prices[asset.id] = null; 
      }
    }
    setFetchedPrices(prices);
    setIsFetchingPrices(false);
    if (anErrorOccurred) {
      setPriceFetchError(specificErrorMessage);
       toast({
          title: "Price Fetching Issue",
          description: specificErrorMessage,
          variant: "destructive",
          duration: 7000,
        });
    }
  }, []); 

  useEffect(() => {
    if (assets.length > 0) {
      fetchAllAssetPrices(assets);
    } else {
      setFetchedPrices({}); 
      setPortfolio(null); 
    }
  }, [assets, fetchAllAssetPrices]);

  useEffect(() => {
    if (assets.length === 0) {
      return; 
    }
    const intervalId = setInterval(() => {
      if (!isFetchingPricesRef.current) {
        console.log('AssetTracker: Auto-refreshing prices via interval.');
        fetchAllAssetPrices(assets);
      } else {
        console.log('AssetTracker: Interval tick - skipping auto-refresh, a fetch is already in progress.');
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      console.log('AssetTracker: Clearing price refresh interval.');
      clearInterval(intervalId);
    };
  }, [assets, fetchAllAssetPrices]);

  useEffect(() => {
    if (assets.length > 0 || Object.keys(fetchedPrices).length > 0) {
      setPortfolio(calculateAssetPortfolio(assets, fetchedPrices));
    } else {
      setPortfolio(null);
    }
  }, [assets, fetchedPrices]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAssetFormData(prev => ({ ...prev, [name]: name === 'quantity' || name === 'purchasePrice' ? parseFloat(value) || 0 : value }));
  };

  const handleSymbolBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const symbol = e.target.value.trim();
    if (symbol && (assetFormData.type === 'stock' || assetFormData.type === 'fund')) { 
      setIsFetchingName(true);
      try {
        const profile = await getAssetProfile({ symbol });
        if (profile.assetName) {
          setAssetFormData(prev => ({ ...prev, name: profile.assetName! }));
        } else if (!assetFormData.name) { 
          setAssetFormData(prev => ({ ...prev, name: '' }));
        }
      } catch (error) {
        console.error("Error fetching asset profile:", error);
        if (!assetFormData.name) {
             setAssetFormData(prev => ({ ...prev, name: '' }));
        }
      } finally {
        setIsFetchingName(false);
      }
    }
  };

  const handleTypeChange = (value: 'stock' | 'fund' | 'crypto') => {
    setAssetFormData(prev => ({ ...prev, type: value, name: (value === 'crypto' && !prev.name) ? prev.symbol.toUpperCase() : prev.name }));
     if (value === 'crypto' && assetFormData.symbol && !assetFormData.name) {
        setAssetFormData(prev => ({ ...prev, name: prev.symbol.toUpperCase() }));
    }
  };
  
  const validateForm = () => {
    if (!assetFormData.name.trim() && (assetFormData.type === 'stock' || assetFormData.type === 'fund') && !isFetchingName) {
      toast({ title: "Validation Error", description: "Asset name is required for stocks/funds unless it's being fetched.", variant: "destructive" });
      return false;
    }
     if (!assetFormData.symbol.trim()) {
      toast({ title: "Validation Error", description: "Asset symbol/ticker is required.", variant: "destructive" });
      return false;
    }
    if (assetFormData.quantity <= 0) {
      toast({ title: "Validation Error", description: "Quantity must be greater than 0.", variant: "destructive" });
      return false;
    }
    if (assetFormData.purchasePrice < 0) {
      toast({ title: "Validation Error", description: "Purchase price cannot be negative.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmitAsset = () => {
    if (!validateForm()) return;

    if (editingAsset) { // This is for editing via dialog
      setAssets(assets.map(asset => 
        asset.id === editingAsset.id ? { id: editingAsset.id, ...assetFormData } : asset
      ));
      toast({ title: "Asset Updated", description: `"${assetFormData.name || assetFormData.symbol}" has been updated.` });
      setIsEditDialogOpen(false);
      setEditingAsset(null);
    } else { // This is for adding new asset via inline form
      const newAsset: Asset = { 
        ...assetFormData, 
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        name: (assetFormData.name.trim() || assetFormData.symbol.toUpperCase()) 
      };
      setAssets([...assets, newAsset]);
      toast({ title: "Asset Added", description: `"${newAsset.name}" has been added.` });
      setShowNewAssetForm(false);
    }
    setAssetFormData(initialAssetFormState);
  };

  const handleOpenEditDialog = (assetToEdit: Asset) => {
    setEditingAsset(assetToEdit);
    setAssetFormData({
      name: assetToEdit.name,
      symbol: assetToEdit.symbol,
      quantity: assetToEdit.quantity,
      purchasePrice: assetToEdit.purchasePrice,
      type: assetToEdit.type,
    });
    setIsEditDialogOpen(true);
  };
  
  const handleOpenNewAssetForm = () => {
    setEditingAsset(null);
    setAssetFormData(initialAssetFormState);
    setShowNewAssetForm(true);
  };

  const handleCancelNewAsset = () => {
    setShowNewAssetForm(false);
    setAssetFormData(initialAssetFormState);
    setIsFetchingName(false);
  };

  const handleRemoveAsset = (assetId: string) => {
    const assetToRemove = assets.find(a => a.id === assetId);
    setAssets(assets.filter(asset => asset.id !== assetId));
    setFetchedPrices(prevPrices => {
        const newPrices = {...prevPrices};
        delete newPrices[assetId];
        return newPrices;
    });
    if (assetToRemove) {
      toast({ title: "Asset Removed", description: `"${assetToRemove.name}" has been removed.` });
    }
  };

  const formatCurrency = (value: number | undefined | null, placeholder = '$--.--') => {
    if (value === undefined || value === null) return placeholder;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatPercentage = (value: number) => {
    if (value === Infinity) return "+∞%";
    if (value === -Infinity) return "-∞%";
    if (isNaN(value)) return "N/A %";
    return `${value.toFixed(2)}%`;
  };

  const renderAssetFormFields = (forEditingDialog: boolean = false) => (
    <div className="grid gap-y-4 gap-x-2 py-4">
      <div className="space-y-1">
        <Label htmlFor={forEditingDialog ? "edit-symbol" : "symbol"}>Symbol</Label>
        <Input 
          id={forEditingDialog ? "edit-symbol" : "symbol"}
          name="symbol" 
          value={assetFormData.symbol} 
          onChange={handleInputChange} 
          onBlur={handleSymbolBlur}
          placeholder="e.g., AAPL, FXAIX" 
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={forEditingDialog ? "edit-name" : "name"}>Name</Label>
        <div className="flex items-center">
          <Input 
            id={forEditingDialog ? "edit-name" : "name"}
            name="name" 
            value={assetFormData.name} 
            onChange={handleInputChange} 
            className="flex-1" 
            placeholder="e.g., Apple Inc." 
            readOnly={isFetchingName && (assetFormData.type === 'stock' || assetFormData.type === 'fund')}
          />
          {isFetchingName && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={forEditingDialog ? "edit-quantity" : "quantity"}>Quantity</Label>
        <Input 
            id={forEditingDialog ? "edit-quantity" : "quantity"} 
            name="quantity" 
            type="number" 
            value={assetFormData.quantity} 
            onChange={handleInputChange} 
            placeholder="e.g., 10" 
            min="0" 
            step="any" 
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={forEditingDialog ? "edit-purchasePrice" : "purchasePrice"}>Purchase Price (per unit)</Label>
        <Input 
            id={forEditingDialog ? "edit-purchasePrice" : "purchasePrice"} 
            name="purchasePrice" 
            type="number" 
            value={assetFormData.purchasePrice} 
            onChange={handleInputChange} 
            placeholder="e.g., 150" 
            min="0" 
            step="any" 
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={forEditingDialog ? "edit-type" : "type"}>Type</Label>
        <Select name="type" value={assetFormData.type} onValueChange={handleTypeChange}>
          <SelectTrigger id={forEditingDialog ? "edit-type" : "type"}>
            <SelectValue placeholder="Select asset type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stock">Stock</SelectItem>
            <SelectItem value="fund">Fund/ETF</SelectItem>
            <SelectItem value="crypto">Cryptocurrency</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {assetFormData.type === 'crypto' && (
          <p className="text-xs text-muted-foreground text-center px-2 py-1 bg-muted/50 rounded-md">
              Automatic price fetching is not available for cryptocurrencies.
          </p>
      )}
       {(assetFormData.type === 'stock' || assetFormData.type === 'fund') && (
          <p className="text-xs text-muted-foreground text-center px-2 py-1 bg-muted/50 rounded-md">
              Price fetching for stocks/funds uses Finnhub. Data availability may vary based on symbol and API plan.
          </p>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex justify-between items-center mb-4">
        <SectionTitle icon={TrendingUp} title="Asset Tracker" className="mb-0" />
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setShowAssetManagement(!showAssetManagement)}
            aria-label="Manage Assets"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showAssetManagement && (
        <div className="mb-6 p-4 border rounded-lg bg-muted/10 shadow-sm">
          {!showNewAssetForm && (
            <Button size="sm" onClick={handleOpenNewAssetForm} className="w-full mb-4">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Asset
            </Button>
          )}

          {showNewAssetForm && (
            <Card className="mb-4 p-4 bg-background">
              <CardHeader className="p-2 pt-0">
                <CardTitle className="text-md">Add New Asset</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {renderAssetFormFields()}
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCancelNewAsset}>Cancel</Button>
                  <Button type="button" onClick={handleSubmitAsset} disabled={isFetchingName}>
                    {isFetchingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" /> }
                    Add Asset
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {assets.length > 0 ? (
            <ScrollArea className="h-[200px] pr-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <div className="font-medium text-card-foreground">{asset.name}</div>
                        <div className="text-xs text-muted-foreground">{asset.symbol.toUpperCase()}</div>
                      </TableCell>
                      <TableCell className="capitalize">{asset.type}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEditDialog(asset)} aria-label="Edit asset">
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" aria-label="Delete asset">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the asset "{asset.name}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRemoveAsset(asset.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
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
          ) : (
            !showNewAssetForm && <p className="text-sm text-muted-foreground text-center py-2">No assets added yet. Click "Add New Asset" to start.</p>
          )}
        </div>
      )}

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

              <ScrollArea className="h-[320px] pr-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset (Symbol)</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Purchase Price</TableHead>
                      <TableHead className="text-right">Current Price</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                      <TableHead className="text-right">P/L %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolio.holdings.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell>
                          <div className="font-medium text-card-foreground">{asset.name} ({asset.symbol.toUpperCase()})</div>
                          <div className="text-xs text-muted-foreground capitalize">{asset.type}</div>
                        </TableCell>
                        <TableCell className="text-right">{asset.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(asset.purchasePrice)}</TableCell>
                        <TableCell className="text-right">
                          {isFetchingPrices && fetchedPrices[asset.id] === undefined ? (
                            <Skeleton className="h-4 w-16 inline-block" />
                          ) : (
                            formatCurrency(asset.currentPricePerUnit, 'N/A')
                          )}
                          {asset.currentPricePerUnit === null && (asset.type === 'stock' || asset.type === 'fund') && !isFetchingPrices && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="w-3 h-3 inline-block ml-1 text-destructive cursor-help"/>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                <p>Price data unavailable. This might be due to an invalid symbol, API plan limitations (e.g. some mutual funds), or temporary API issues. Check server logs for details.</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(asset.totalValue)}</TableCell>
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
               {priceFetchError && !isFetchingPrices && <p className="text-xs text-destructive mt-2 text-center">{priceFetchError}</p>}
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              {isFetchingPrices ? (
                <>
                  <Loader2 className="mx-auto h-8 w-8 animate-spin mb-2" />
                  <p>Loading assets and prices...</p>
                </>
              ) : (
                <>
                  <p>No assets tracked yet.</p>
                  <p className="text-sm">Click the settings icon <Settings className="inline h-3 w-3 align-middle" /> then "Add New Asset" to get started.</p>
                </>
              )}
               {priceFetchError && !isFetchingPrices && <p className="text-xs text-destructive mt-4">{priceFetchError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
        setIsEditDialogOpen(isOpen);
        if (!isOpen) {
          setEditingAsset(null);
          setAssetFormData(initialAssetFormState);
          setIsFetchingName(false);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
            <DialogDescription>
              Update the details of your asset.
            </DialogDescription>
          </DialogHeader>
          {renderAssetFormFields(true)}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmitAsset} disabled={isFetchingName}>
              {isFetchingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" /> }
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

    