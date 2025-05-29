
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { TrendingUp, ArrowDown, ArrowUp, PlusCircle, Edit3, Trash2, Save, Loader2, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import type { Asset, AssetPortfolio, AssetHolding } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getAssetPrice } from '@/ai/flows/asset-price-flow';
import { getAssetProfile } from '@/ai/flows/asset-profile-flow';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const initialAssetFormState: Omit<Asset, 'id'> & { name?: string } = {
  symbol: '',
  quantity: 0,
  purchasePrice: 0,
  type: 'stock',
  name: '',
};

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const LOCALSTORAGE_KEY = 'userAssetsLifeOS_Tiingo_v1';

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
    } else if (asset.type === 'crypto') {
      // For crypto, if no price is fetched, its current value is considered 0 for portfolio calculation
      currentValue = 0;
    }

    const profitLoss = (typeof currentPricePerUnit === 'number' || (asset.type === 'crypto' && currentPricePerUnit !== undefined))
      ? currentValue - initialCost
      : 0 - initialCost; // If price is N/A, P/L is negative initial cost

    totalPortfolioValue += currentValue;
    totalInitialCost += initialCost;

    return {
      ...asset,
      currentPricePerUnit: currentPricePerUnit === undefined ? null : currentPricePerUnit,
      totalValue: currentValue,
      profitLoss,
    };
  });

  const totalProfitLoss = totalPortfolioValue - totalInitialCost;

  return {
    holdings,
    totalPortfolioValue,
    totalProfitLoss,
  };
}

interface AssetTrackerWidgetProps {
  settingsOpen: boolean;
  displayMode?: 'widgetOnly' | 'settingsOnly';
}

export function AssetTrackerWidget({ settingsOpen, displayMode = 'widgetOnly' }: AssetTrackerWidgetProps) {
  const [assets, setAssets] = useState<Asset[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    const savedAssetsString = localStorage.getItem(LOCALSTORAGE_KEY);
    if (savedAssetsString) {
      try {
        const parsedAssetsArray = JSON.parse(savedAssetsString);
        if (Array.isArray(parsedAssetsArray)) {
          return parsedAssetsArray.filter((asset: any) =>
            asset &&
            typeof asset.id === 'string' &&
            typeof asset.name === 'string' && asset.name.trim() !== '' &&
            typeof asset.symbol === 'string' && asset.symbol.trim() !== '' &&
            typeof asset.quantity === 'number' && asset.quantity > 0 &&
            typeof asset.purchasePrice === 'number' && asset.purchasePrice >= 0 &&
            ['stock', 'fund', 'crypto'].includes(asset.type)
          );
        }
      } catch (e) {
        console.error("AssetTracker: Error parsing assets from localStorage on init:", e);
        // Do not toast here, will be handled by useEffect
      }
    }
    return [];
  });

  const [fetchedPrices, setFetchedPrices] = useState<Record<string, number | null>>({});
  const [portfolio, setPortfolio] = useState<AssetPortfolio | null>(null);

  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetFormData, setAssetFormData] = useState<Omit<Asset, 'id'> & { name?: string }>(initialAssetFormState);

  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [priceFetchError, setPriceFetchError] = useState<string | null>(null);
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [showNewAssetForm, setShowNewAssetForm] = useState(false);

  const isFetchingPricesRef = useRef(isFetchingPrices);
  useEffect(() => {
    isFetchingPricesRef.current = isFetchingPrices;
  }, [isFetchingPrices]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.log("AssetTracker: Attempting to load assets from localStorage with key:", LOCALSTORAGE_KEY);
    const savedAssetsString = localStorage.getItem(LOCALSTORAGE_KEY);
    console.log("AssetTracker: Raw data from localStorage:", savedAssetsString);

    if (savedAssetsString) {
      try {
        const parsedAssetsArray = JSON.parse(savedAssetsString);
        console.log("AssetTracker: Parsed data from localStorage:", parsedAssetsArray);

        if (!Array.isArray(parsedAssetsArray)) {
          toast({
            title: "Storage Error",
            description: "Asset data in storage was corrupted and has been cleared.",
            variant: "destructive",
            duration: 7000,
          });
          localStorage.removeItem(LOCALSTORAGE_KEY);
          setAssets([]);
        } else {
          const validAssets = parsedAssetsArray.filter((asset: any) =>
            asset &&
            typeof asset.id === 'string' &&
            typeof asset.name === 'string' && asset.name.trim() !== '' &&
            typeof asset.symbol === 'string' && asset.symbol.trim() !== '' &&
            typeof asset.quantity === 'number' && asset.quantity > 0 &&
            typeof asset.purchasePrice === 'number' && asset.purchasePrice >= 0 &&
            ['stock', 'fund', 'crypto'].includes(asset.type)
          );
          console.log("AssetTracker: Valid assets after filtering:", validAssets);
          setAssets(validAssets);

          if (validAssets.length < parsedAssetsArray.length) {
            toast({
              title: "Data Integrity Check",
              description: "Some saved assets had invalid data and were not loaded.",
              variant: "default",
              duration: 5000,
            });
          }
        }
      } catch (e) {
        console.error("AssetTracker: Error parsing or validating assets from localStorage in useEffect:", e);
        toast({
          title: "Storage Error",
          description: "Could not load saved assets due to a data error. Previous data has been cleared.",
          variant: "destructive",
          duration: 7000,
        });
        localStorage.removeItem(LOCALSTORAGE_KEY);
        setAssets([]);
      }
    } else {
        console.log("AssetTracker: No assets found in localStorage.");
        setAssets([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Ran once on mount

  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log("AssetTracker: Saving assets to localStorage:", JSON.stringify(assets));
      try {
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(assets));
      } catch (error) {
        console.error("AssetTracker: Saving useEffect - Error saving assets to localStorage:", error);
        toast({
          title: "Storage Error",
          description: "Could not save asset changes. Your browser storage might be full or unavailable.",
          variant: "destructive",
        });
      }
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
       console.log("AssetTracker: Price fetch already in progress, skipping.");
      return;
    }
    setIsFetchingPrices(true);
    setPriceFetchError(null);
    const prices: Record<string, number | null> = {};
    let anErrorOccurred = false;
    let specificErrorMessage = "Could not fetch prices for some assets. Ensure symbols are correct and Tiingo API key is set in .env.local.";

    console.log("AssetTracker: Fetching prices for assets:", currentAssets.map(a => a.symbol));

    for (const asset of currentAssets) {
      if ((asset.type === 'stock' || asset.type === 'fund') && asset.symbol) {
        try {
          const priceData = await getAssetPrice({ symbol: asset.symbol });
          prices[asset.id] = priceData.currentPrice;
           if (priceData.currentPrice === null) {
             console.warn(`Tiingo: Price not found or unavailable for symbol ${asset.symbol} (Type: ${asset.type}). API Response for ${asset.symbol} was ${JSON.stringify(priceData)}`);
          } else {
             console.log(`Tiingo: Successfully fetched price for ${asset.symbol}: ${priceData.currentPrice}`);
          }
        } catch (err) {
          console.error(`Error fetching price for ${asset.symbol} from Tiingo:`, err);
          prices[asset.id] = null;
          anErrorOccurred = true;
          if (err instanceof Error) {
            if (err.message.includes('TIINGO_API_KEY_NOT_CONFIGURED')) {
              specificErrorMessage = "Tiingo API Key is not configured. Please set TIINGO_API_KEY in your .env.local file and restart the server.";
            } else if (err.message.startsWith('TIINGO_API_ERROR')) {
               const statusMatch = err.message.match(/TIINGO_API_ERROR: (\d+)/);
               const status = statusMatch ? statusMatch[1] : 'Unknown Status';
               specificErrorMessage = `Tiingo API error for ${asset.symbol} (Status: ${status}). Check symbol, API limits, or plan.`;
            } else if (err.message.startsWith('FETCH_ERROR')) {
               specificErrorMessage = `Network error fetching price for ${asset.symbol}. Check connection or Tiingo status.`;
            }
          }
        }
      } else {
        // For crypto or other types, we currently don't fetch prices automatically.
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
  }, []); // Removed isFetchingPrices from dependencies

  useEffect(() => {
    if (assets.length > 0 && (displayMode === 'widgetOnly' || (settingsOpen && displayMode === 'settingsOnly'))) {
      fetchAllAssetPrices(assets);
    } else {
      setFetchedPrices({});
      setPortfolio(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, displayMode, settingsOpen]); // fetchAllAssetPrices is memoized

  useEffect(() => {
    if (assets.length === 0 || displayMode !== 'widgetOnly') {
      return;
    }
    const intervalId = setInterval(() => {
      if (!isFetchingPricesRef.current) {
        console.log("AssetTracker: Auto-refreshing prices via interval.");
        fetchAllAssetPrices(assets);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      console.log("AssetTracker: Clearing auto-refresh interval.");
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, displayMode]); // fetchAllAssetPrices is memoized

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
    const symbol = e.target.value.trim().toUpperCase();
    if (!symbol) {
        setAssetFormData(prev => ({ ...prev, name: prev.type === 'crypto' ? '' : '', symbol: '' }));
        return;
    }

    setAssetFormData(prev => ({ ...prev, symbol })); // Update symbol in form data first

    // Fetch name only if it's a stock or fund
    if (assetFormData.type === 'stock' || assetFormData.type === 'fund') {
      setIsFetchingName(true);
      try {
        const profile = await getAssetProfile({ symbol });
        if (profile.assetName) {
          setAssetFormData(prev => ({ ...prev, name: profile.assetName! }));
        } else {
          setAssetFormData(prev => ({ ...prev, name: symbol })); // Fallback to symbol if name not found
          toast({ title: "Name Fetch", description: `Could not fetch name for ${symbol} from Tiingo. Using symbol as name.`, variant: "default", duration: 3000});
        }
      } catch (error) {
        console.error("Error fetching asset profile for symbol from Tiingo:", symbol, error);
        setAssetFormData(prev => ({ ...prev, name: symbol })); // Fallback on error
        toast({ title: "Name Fetch Error", description: `Error fetching name for ${symbol} from Tiingo. Using symbol as name.`, variant: "destructive"});
      } finally {
        setIsFetchingName(false);
      }
    } else if (assetFormData.type === 'crypto') {
      // For crypto, directly set the name to the symbol
      setAssetFormData(prev => ({ ...prev, name: symbol }));
    }
  };

  const handleTypeChange = (value: 'stock' | 'fund' | 'crypto') => {
    const currentSymbol = assetFormData.symbol.toUpperCase();
    setAssetFormData(prev => ({
        ...prev,
        type: value,
        // If type changes to crypto and symbol exists, set name to symbol.
        // Otherwise, keep existing name (which might be from a previous fetch if it was stock/fund)
        name: (value === 'crypto' && currentSymbol) ? currentSymbol : (prev.name || '')
    }));

    // If type changes TO stock/fund and a symbol exists, re-fetch name.
    if ((value === 'stock' || value === 'fund') && currentSymbol) {
        // Simulate blur event to trigger name fetch
        handleSymbolBlur({ target: { value: currentSymbol } } as React.FocusEvent<HTMLInputElement>);
    }
  };

  const validateForm = () => {
     if (!assetFormData.symbol || !assetFormData.symbol.trim()) {
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
    // Name is now auto-populated or derived, so less strict client-side validation needed here for it.
    // The backend/submission logic will ensure a name is present.
    if (!assetFormData.name || !assetFormData.name.trim()) {
        // This case should be rare now due to auto-population, but as a fallback:
        const nameToUse = assetFormData.symbol.toUpperCase();
        setAssetFormData(prev => ({ ...prev, name: nameToUse }));
    }
    return true;
  };

  const handleSubmitAsset = () => {
    if (!validateForm()) return;

    // Ensure name is populated (should be by handleSymbolBlur or handleTypeChange)
    const finalName = (assetFormData.name && assetFormData.name.trim() !== '') ? assetFormData.name.trim() : assetFormData.symbol.toUpperCase();
    const finalSymbol = assetFormData.symbol.toUpperCase();

    if (editingAsset) {
      setAssets(assets.map(asset =>
        asset.id === editingAsset.id ? { ...asset, symbol: finalSymbol, quantity: assetFormData.quantity, purchasePrice: assetFormData.purchasePrice, type: assetFormData.type, name: finalName } : asset
      ));
      toast({ title: "Asset Updated", description: `"${finalName}" has been updated.` });
      setEditingAsset(null);
    } else {
      const newAsset: Asset = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        symbol: finalSymbol,
        quantity: assetFormData.quantity,
        purchasePrice: assetFormData.purchasePrice,
        type: assetFormData.type,
        name: finalName,
      };
      setAssets(prevAssets => [...prevAssets, newAsset]);
      toast({ title: "Asset Added", description: `"${newAsset.name}" has been added.` });
      setShowNewAssetForm(false);
    }
    setAssetFormData(initialAssetFormState);
    setIsFetchingName(false); // Reset fetching name status
  };

  const handleStartEditAsset = (assetToEdit: Asset) => {
    setEditingAsset(assetToEdit);
    setAssetFormData({ // Populate form with existing asset's data
      name: assetToEdit.name,
      symbol: assetToEdit.symbol,
      quantity: assetToEdit.quantity,
      purchasePrice: assetToEdit.purchasePrice,
      type: assetToEdit.type,
    });
    setShowNewAssetForm(false); // Ensure add form is hidden if opening edit
  };

  const handleCancelEditAsset = () => {
    setEditingAsset(null);
    setAssetFormData(initialAssetFormState);
    setIsFetchingName(false);
  }

  const handleOpenNewAssetForm = () => {
    setEditingAsset(null); // Ensure not in edit mode
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
    // Also remove its price from fetchedPrices to avoid stale data
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

  // Renders the form fields for adding or editing an asset
  const renderAssetFormFields = (isInlineEdit: boolean = false) => (
    <div className="grid gap-y-4 gap-x-2 py-4">
      <div className="space-y-1">
        <Label htmlFor={isInlineEdit ? `edit-symbol-${editingAsset?.id}` : "symbol"}>Symbol {isFetchingName && <Loader2 className="ml-1 h-3 w-3 inline-block animate-spin" />}</Label>
        <Input
          id={isInlineEdit ? `edit-symbol-${editingAsset?.id}` : "symbol"}
          name="symbol"
          value={assetFormData.symbol}
          onChange={handleInputChange}
          onBlur={handleSymbolBlur}
          placeholder="e.g., AAPL, FXAIX, BTC"
          disabled={isFetchingName}
          className="text-sm"
        />
         {assetFormData.name && (assetFormData.type === 'stock' || assetFormData.type === 'fund') && !isFetchingName && (
            <p className="text-xs text-muted-foreground pt-1">Fetched Name: {assetFormData.name}</p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor={isInlineEdit ? `edit-quantity-${editingAsset?.id}` : "quantity"}>Quantity</Label>
        <Input
            id={isInlineEdit ? `edit-quantity-${editingAsset?.id}` : "quantity"}
            name="quantity"
            type="number"
            value={assetFormData.quantity}
            onChange={handleInputChange}
            placeholder="e.g., 10"
            min="0"
            step="any"
            className="text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={isInlineEdit ? `edit-purchasePrice-${editingAsset?.id}` : "purchasePrice"}>Purchase Price (per unit)</Label>
        <Input
            id={isInlineEdit ? `edit-purchasePrice-${editingAsset?.id}` : "purchasePrice"}
            name="purchasePrice"
            type="number"
            value={assetFormData.purchasePrice}
            onChange={handleInputChange}
            placeholder="e.g., 150"
            min="0"
            step="any"
            className="text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={isInlineEdit ? `edit-type-${editingAsset?.id}` : "type"}>Type</Label>
        <Select name="type" value={assetFormData.type} onValueChange={handleTypeChange} disabled={isFetchingName}>
          <SelectTrigger id={isInlineEdit ? `edit-type-${editingAsset?.id}` : "type"} className="text-sm">
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
              Price fetching is not available for most cryptocurrencies. Name defaults to symbol.
          </p>
      )}
       {(assetFormData.type === 'stock' || assetFormData.type === 'fund') && (
          <p className="text-xs text-muted-foreground text-center px-2 py-1 bg-muted/50 rounded-md">
              Stock/Fund name is auto-fetched. Price fetching uses Tiingo (EOD prices). Data availability may vary.
          </p>
      )}
    </div>
  );

  const renderSettingsContent = () => (
     <Card className="shadow-md">
        <CardHeader>
            <CardTitle className="text-lg">Asset Tracker Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            {!showNewAssetForm && !editingAsset && (
            <Button size="sm" onClick={handleOpenNewAssetForm} className="w-full mb-3">
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Asset
            </Button>
            )}

            {showNewAssetForm && !editingAsset && (
            <Card className="mb-3 p-3 bg-background">
                <CardHeader className="p-1 pt-0">
                <CardTitle className="text-base">Add New Asset</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                {renderAssetFormFields()}
                <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleCancelNewAsset}>Cancel</Button>
                    <Button type="button" onClick={handleSubmitAsset} disabled={isFetchingName} size="sm">
                    {isFetchingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" /> }
                    Add Asset
                    </Button>
                </div>
                </CardContent>
            </Card>
            )}

            {assets.length > 0 ? (
            <div className="mt-2">
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Manage Existing Assets</h4>
                <ScrollArea className="pr-1"> {/* Removed fixed height */}
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead className="p-2 text-xs">Asset</TableHead>
                        <TableHead className="p-2 text-xs">Type</TableHead>
                        <TableHead className="p-2 text-xs text-center">Actions</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {assets.map((asset) => (
                        <TableRow key={asset.id}>
                          {editingAsset && editingAsset.id === asset.id ? (
                            <TableCell colSpan={3} className="p-0">
                              {/* Inline Edit Form */}
                              <Card className="m-1 p-2 bg-background shadow-md">
                                <CardHeader className="p-1 pt-0">
                                  <CardTitle className="text-sm">Edit: {assetFormData.name || asset.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                  {renderAssetFormFields(true)}
                                  <div className="mt-2 flex justify-end gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={handleCancelEditAsset}>Cancel</Button>
                                    <Button type="button" onClick={handleSubmitAsset} disabled={isFetchingName} size="sm">
                                      {isFetchingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                      Save Changes
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            </TableCell>
                          ) : (
                            <>
                              <TableCell className="p-2">
                                  <div className="font-medium text-sm text-card-foreground">{asset.name}</div>
                                  <div className="text-xs text-muted-foreground">{asset.symbol.toUpperCase()}</div>
                              </TableCell>
                              <TableCell className="p-2 text-xs capitalize">{asset.type}</TableCell>
                              <TableCell className="p-2 text-center">
                                  <div className="flex justify-center items-center gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleStartEditAsset(asset)} aria-label="Edit asset">
                                      <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                  <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-6 w-6" aria-label="Delete asset">
                                          <Trash2 className="w-3.5 h-3.5" />
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
                            </>
                          )}
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                </ScrollArea>
            </div>
            ) : (
            !showNewAssetForm && !editingAsset && <p className="text-xs text-muted-foreground text-center py-1">No assets added yet. Click "Add New Asset" to start.</p>
            )}
        </CardContent>
     </Card>
  );

  const renderWidgetDisplay = () => (
      <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={TrendingUp} title="Asset Tracker" className="mb-0 text-lg" />
        </CardHeader>
        <CardContent className="pt-4 px-3 pb-3">
          {portfolio && assets.length > 0 ? (
            <>
              <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="p-2 rounded-md bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-0.5">Total Value</div>
                  <div className="text-xl font-semibold text-primary">{formatCurrency(portfolio.totalPortfolioValue)}</div>
                </div>
                <div className="p-2 rounded-md bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-0.5">Total P/L</div>
                  <div className={cn(
                    "text-lg font-semibold flex items-center",
                    portfolio.totalProfitLoss >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {portfolio.totalProfitLoss >= 0 ? <ArrowUp className="w-3.5 h-3.5 mr-1" /> : <ArrowDown className="w-3.5 h-3.5 mr-1" />}
                    {formatCurrency(portfolio.totalProfitLoss)}
                  </div>
                </div>
              </div>

              <ScrollArea className="h-[280px] pr-0.5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="p-2 text-xs h-10">Asset (Symbol)</TableHead>
                      <TableHead className="p-2 text-xs text-right h-10">Qty</TableHead>
                      <TableHead className="p-2 text-xs text-right h-10">Buy Price</TableHead>
                      <TableHead className="p-2 text-xs text-right h-10">Current Price</TableHead>
                      <TableHead className="p-2 text-xs text-right h-10">Value</TableHead>
                      <TableHead className="p-2 text-xs text-right h-10">P/L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolio.holdings.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell className="p-2">
                          <div className="font-medium text-sm text-card-foreground">{asset.name} ({asset.symbol.toUpperCase()})</div>
                          <div className="text-xs text-muted-foreground capitalize">{asset.type}</div>
                        </TableCell>
                        <TableCell className="p-2 text-xs text-right">{asset.quantity}</TableCell>
                        <TableCell className="p-2 text-xs text-right">{formatCurrency(asset.purchasePrice)}</TableCell>
                        <TableCell className="p-2 text-xs text-right">
                          {isFetchingPrices && fetchedPrices[asset.id] === undefined ? (
                            <Skeleton className="h-3 w-12 inline-block" />
                          ) : (
                            formatCurrency(asset.currentPricePerUnit, 'N/A')
                          )}
                          {asset.currentPricePerUnit === null && (asset.type === 'stock' || asset.type === 'fund') && !isFetchingPrices && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="w-2.5 h-2.5 inline-block ml-0.5 text-destructive cursor-help"/>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                <p>Price data from Tiingo (EOD) unavailable. May be an invalid symbol, API plan limits (e.g., some mutual funds require higher tiers), or temporary API issues.</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="p-2 text-xs text-right">{formatCurrency(asset.totalValue)}</TableCell>
                        <TableCell className={cn(
                          "p-2 text-xs text-right",
                          asset.profitLoss >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {formatCurrency(asset.profitLoss)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              {priceFetchError && !isFetchingPrices && <p className="text-xs text-destructive mt-2 text-center">{priceFetchError}</p>}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {isFetchingPrices ? (
                <>
                  <Loader2 className="mx-auto h-6 w-6 animate-spin mb-1.5" />
                  <p className="text-sm">Loading assets and prices...</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No assets tracked yet.</p>
                   <p className="text-xs">Open global settings <SettingsIcon className="inline h-3 w-3 align-middle" /> to add assets.</p>
                </>
              )}
              {priceFetchError && !isFetchingPrices && <p className="text-xs text-destructive mt-3">{priceFetchError}</p>}
            </div>
          )}
        </CardContent>
      </Card>
  );

  if (displayMode === 'settingsOnly') {
    return settingsOpen ? renderSettingsContent() : null;
  }

  return (
    <TooltipProvider>
      {renderWidgetDisplay()}
    </TooltipProvider>
  );
}
