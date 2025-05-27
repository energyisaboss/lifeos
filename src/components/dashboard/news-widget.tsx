
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Added CardTitle
import { SectionTitle } from './section-title';
import { Newspaper, Settings, PlusCircle, Trash2, LinkIcon, RefreshCw, Tag, Edit3, FolderPlus, FolderMinus, FilePlus, CheckCircle, GripVertical } from 'lucide-react';
import type { NewsArticle as AppNewsArticle } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { processRssFeed } from '@/ai/flows/rss-processor-flow';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const MAX_CATEGORIES = 7;
const MAX_FEEDS_PER_CATEGORY = 5;
const MAX_ARTICLES_DISPLAY_TOTAL = 50; 

interface RssFeedSource {
  id: string;
  url: string;
  userLabel: string;
}

interface NewsCategory {
  id: string;
  name: string;
  feeds: RssFeedSource[];
  isEditingName?: boolean; 
}

interface CategorizedNewsArticle extends AppNewsArticle {
  categoryId: string;
}

export function NewsWidget() {
  const [showFeedManagement, setShowFeedManagement] = useState(false);
  const [categories, setCategories] = useState<NewsCategory[]>(() => {
    if (typeof window !== 'undefined') {
      const savedCategories = localStorage.getItem('rssCategoriesLifeOS_v2');
      try {
        const parsed = savedCategories ? JSON.parse(savedCategories) : [];
        return Array.isArray(parsed) ? parsed.map((cat: any) => ({
          id: cat.id || `cat-${Date.now()}-${Math.random()}`,
          name: cat.name || 'Untitled Category',
          feeds: Array.isArray(cat.feeds) ? cat.feeds.map((feed: any) => ({
            id: feed.id || `feed-${Date.now()}-${Math.random()}`,
            url: feed.url || '',
            userLabel: feed.userLabel || 'Untitled Feed',
          })) : [],
          isEditingName: false,
        })) : [];
      } catch (e) {
        console.error("Failed to parse RSS categories from localStorage", e);
        return [];
      }
    }
    return [];
  });

  const [allArticles, setAllArticles] = useState<CategorizedNewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerFeedRefresh, setTriggerFeedRefresh] = useState(0);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryState, setEditingCategoryState] = useState<{ [key: string]: string }>({});
  
  const [editingFeed, setEditingFeed] = useState<{ categoryId: string; feedId?: string; url: string; userLabel: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rssCategoriesLifeOS_v2', JSON.stringify(categories.map(c => ({...c, isEditingName: undefined}))));
    }
  }, [categories]);

  const fetchAndProcessAllFeeds = useCallback(async () => {
    const allFeedsWithCategory: Array<{ categoryId: string; feed: RssFeedSource }> = [];
    categories.forEach(cat => {
      cat.feeds.forEach(feed => {
        if (feed.url.trim().toLowerCase().startsWith('http')) {
          allFeedsWithCategory.push({ categoryId: cat.id, feed });
        }
      });
    });

    if (allFeedsWithCategory.length === 0) {
      setAllArticles([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    let currentError = null; // Local error accumulation
    
    const articlePromises = allFeedsWithCategory.map(async ({ categoryId, feed }) => {
      try {
        const result = await processRssFeed({ rssFeedUrl: feed.url });
        return result.articles.map(article => ({
          ...article,
          sourceName: feed.userLabel || result.sourceName,
          id: `${feed.id}-${article.link || article.title || article.isoDate || Math.random()}`,
          categoryId: categoryId,
        }));
      } catch (err) {
        console.error(`Error processing RSS feed ${feed.userLabel} (${feed.url}):`, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        const newErrorMsg = `Failed for ${feed.userLabel || 'feed'}`;
        currentError = currentError ? `${currentError}; ${newErrorMsg}` : newErrorMsg;
        return [];
      }
    });

    const results = await Promise.allSettled(articlePromises);
    
    let fetchedArticles: CategorizedNewsArticle[] = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        fetchedArticles.push(...result.value as CategorizedNewsArticle[]);
      }
    });
    
    fetchedArticles.sort((a, b) => {
      if (a.isoDate && b.isoDate) return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime();
      if (a.isoDate) return -1;
      if (b.isoDate) return 1;
      return 0;
    });
    
    setAllArticles(fetchedArticles.slice(0, MAX_ARTICLES_DISPLAY_TOTAL));
    setIsLoading(false);
    setError(currentError); // Set accumulated errors

    if (currentError && typeof window !== 'undefined') {
      toast({
        title: "Error Loading Some Feeds",
        description: "Some RSS feeds couldn't be loaded. Check settings & URLs.",
        variant: "destructive",
      });
    }
  }, [categories]); 

  useEffect(() => {
    fetchAndProcessAllFeeds();
  }, [categories, triggerFeedRefresh, fetchAndProcessAllFeeds]);

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Category Name Required", variant: "destructive" });
      return;
    }
    if (categories.length >= MAX_CATEGORIES) {
      toast({ title: "Category Limit Reached", description: `Max ${MAX_CATEGORIES} categories.`, variant: "destructive" });
      return;
    }
    setCategories(prev => [
      ...prev,
      { id: `cat-${Date.now()}`, name: newCategoryName.trim(), feeds: [], isEditingName: false }
    ]);
    setNewCategoryName('');
    toast({ title: "Category Added", description: `"${newCategoryName.trim()}" added.`});
  };

  const handleToggleEditCategoryName = (categoryId: string) => {
    setCategories(prev => prev.map(cat => 
      cat.id === categoryId ? { ...cat, isEditingName: !cat.isEditingName } : {...cat, isEditingName: false}
    ));
    const categoryToEdit = categories.find(cat => cat.id === categoryId);
    if (categoryToEdit) {
      setEditingCategoryState(prev => ({ ...prev, [categoryId]: categoryToEdit.name }));
    }
  };
  
  const handleSaveCategoryName = (categoryId: string) => {
    const newName = editingCategoryState[categoryId];
    if (!newName || !newName.trim()) {
      toast({ title: "Category Name Required", variant: "destructive" });
      setCategories(prev => prev.map(cat => cat.id === categoryId ? { ...cat, isEditingName: false } : cat)); // Revert isEditingName
      return;
    }
    setCategories(prev => prev.map(cat =>
      cat.id === categoryId ? { ...cat, name: newName.trim(), isEditingName: false } : cat
    ));
    toast({ title: "Category Name Updated" });
  };

  const handleDeleteCategory = (categoryId: string) => {
    const categoryToDelete = categories.find(cat => cat.id === categoryId);
    setCategories(prev => prev.filter(cat => cat.id !== categoryId));
    toast({ title: "Category Deleted", description: `"${categoryToDelete?.name}" and its feeds removed.`});
  };

  const handleStartAddOrEditFeed = (categoryId: string, feed?: RssFeedSource) => {
    if (feed) { 
      setEditingFeed({ categoryId, feedId: feed.id, url: feed.url, userLabel: feed.userLabel });
    } else { 
      const category = categories.find(c => c.id === categoryId);
      if (category && category.feeds.length >= MAX_FEEDS_PER_CATEGORY) {
         toast({ title: "Feed Limit Reached", description: `Max ${MAX_FEEDS_PER_CATEGORY} feeds per category.`, variant: "destructive" });
         return;
      }
      setEditingFeed({ categoryId, url: '', userLabel: '' });
    }
  };

  const handleSaveFeed = () => {
    if (!editingFeed || !editingFeed.url.trim()) {
      toast({ title: "Feed URL Required", variant: "destructive" });
      return;
    }
    if (!editingFeed.url.toLowerCase().startsWith('http')) {
        toast({ title: "Invalid URL", description: "Feed URL must start with http(s)://.", variant: "destructive" });
        return;
    }

    setCategories(prev => prev.map(cat => {
      if (cat.id === editingFeed.categoryId) {
        let newFeeds;
        if (editingFeed.feedId) { 
          newFeeds = cat.feeds.map(f => f.id === editingFeed.feedId ? { ...f, url: editingFeed.url, userLabel: editingFeed.userLabel || `Feed ${cat.feeds.length}` } : f);
        } else { 
          const newFeedId = `feed-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
          newFeeds = [...cat.feeds, { id: newFeedId, url: editingFeed.url, userLabel: editingFeed.userLabel || `Feed ${cat.feeds.length + 1}` }];
        }
        return { ...cat, feeds: newFeeds };
      }
      return cat;
    }));
    
    toast({ title: editingFeed.feedId ? "Feed Updated" : "Feed Added" });
    setEditingFeed(null);
    setTriggerFeedRefresh(prev => prev + 1);
  };

  const handleDeleteFeed = (categoryId: string, feedId: string) => {
    setCategories(prev => prev.map(cat =>
      cat.id === categoryId ? { ...cat, feeds: cat.feeds.filter(f => f.id !== feedId) } : cat
    ));
    toast({ title: "Feed Deleted" });
  };
  
  const articlesByCategoryId = (catId: string) => {
    return allArticles.filter(article => article.categoryId === catId);
  }

  return (
    <React.Fragment>
      <div className="flex justify-between items-center mb-4"> {/* Replaces CardHeader */}
        <SectionTitle icon={Newspaper} title="Categorized News" className="mb-0" />
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowFeedManagement(!showFeedManagement)}
          aria-label="Manage RSS Feeds & Categories"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      {showFeedManagement && (
        <div className="mb-6 p-4 border rounded-lg bg-muted/10 shadow-sm">
          <div className="p-3 bg-muted/20 rounded-md mb-4">
            <Label htmlFor="new-category-name" className="text-xs font-medium">New Category Name</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="new-category-name"
                type="text"
                placeholder="e.g., Technology, Sports"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="h-9 text-sm"
              />
              <Button size="sm" onClick={handleAddCategory} disabled={categories.length >= MAX_CATEGORIES}>
                <FolderPlus className="mr-1.5" /> Add ({categories.length}/{MAX_CATEGORIES})
              </Button>
            </div>
          </div>

          {editingFeed && (
            <Card className="p-3 my-3 bg-muted/40">
              <Label className="text-xs font-semibold block mb-1">
                {editingFeed.feedId ? "Edit Feed" : "Add New Feed"} in "{categories.find(c=>c.id === editingFeed.categoryId)?.name}"
              </Label>
              <div className="space-y-2 mt-1">
                <div>
                  <Label htmlFor="editing-feed-label" className="text-xs">Feed Label (Optional)</Label>
                  <Input
                    id="editing-feed-label"
                    type="text"
                    placeholder="e.g., TechCrunch News"
                    value={editingFeed.userLabel}
                    onChange={(e) => setEditingFeed(ef => ef ? { ...ef, userLabel: e.target.value } : null)}
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <Label htmlFor="editing-feed-url" className="text-xs">Feed URL*</Label>
                  <Input
                    id="editing-feed-url"
                    type="url"
                    placeholder="https://example.com/feed.xml"
                    value={editingFeed.url}
                    onChange={(e) => setEditingFeed(ef => ef ? { ...ef, url: e.target.value } : null)}
                    className="h-8 text-xs mt-0.5"
                    required
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingFeed(null)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveFeed}><CheckCircle className="mr-1.5" /> Save Feed</Button>
              </div>
            </Card>
          )}
          
          <ScrollArea className="max-h-[300px] pr-1 calendar-feed-scroll-area">
            <div className="space-y-3">
              {categories.map((category) => (
                <Card key={category.id} className="p-3 bg-muted/30">
                  <div className="flex justify-between items-center mb-2">
                    {category.isEditingName ? (
                      <div className="flex-grow flex items-center gap-2">
                         <Input 
                           type="text" 
                           value={editingCategoryState[category.id] || ''}
                           onChange={(e) => setEditingCategoryState(prev => ({...prev, [category.id]: e.target.value}))}
                           className="h-8 text-sm flex-grow"
                           onKeyDown={(e) => e.key === 'Enter' && handleSaveCategoryName(category.id)}
                           onBlur={() => handleSaveCategoryName(category.id)}
                         />
                         <Button size="sm" variant="ghost" onClick={() => handleSaveCategoryName(category.id)}><CheckCircle size={16}/></Button>
                      </div>
                    ) : (
                      <h5 className="text-sm font-semibold text-card-foreground truncate flex-grow cursor-pointer hover:underline" onClick={() => handleToggleEditCategoryName(category.id)} title="Click to edit name">
                        {category.name}
                      </h5>
                    )}
                     <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                       {!category.isEditingName && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleEditCategoryName(category.id)} title="Edit category name"><Edit3 size={14}/></Button>}
                       <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteCategory(category.id)} title="Delete category"><FolderMinus size={14}/></Button>
                     </div>
                  </div>
                  
                  <div className="pl-2 border-l-2 border-border/50 space-y-2 mb-2">
                    {category.feeds.map(feed => (
                      <div key={feed.id} className="text-xs p-1.5 rounded bg-background/50">
                         <div className="flex justify-between items-center">
                              <div className="truncate flex-1 min-w-0">
                                  <p className="font-medium truncate" title={feed.userLabel}>{feed.userLabel || "Untitled Feed"}</p>
                                  <p className="text-muted-foreground truncate" title={feed.url}>{feed.url}</p>
                              </div>
                              <div className="flex-shrink-0 ml-2 space-x-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleStartAddOrEditFeed(category.id, feed)} title="Edit feed"><Edit3 size={12}/></Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteFeed(category.id, feed.id)} title="Delete feed"><Trash2 size={12}/></Button>
                              </div>
                         </div>
                      </div>
                    ))}
                    {category.feeds.length === 0 && <p className="text-xs text-muted-foreground pl-1.5">No feeds in this category.</p>}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full h-8 text-xs mt-1" 
                    onClick={() => handleStartAddOrEditFeed(category.id)}
                    disabled={editingFeed !== null || category.feeds.length >= MAX_FEEDS_PER_CATEGORY}
                  >
                    <FilePlus className="mr-1.5" /> Add Feed to "{category.name.substring(0,15)}{category.name.length > 15 ? '...' : ''}" ({category.feeds.length}/{MAX_FEEDS_PER_CATEGORY})
                  </Button>
                </Card>
              ))}
               {categories.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No categories created yet. Add one above.</p>}
            </div>
          </ScrollArea>
        </div>
      )}

      {isLoading && (
         <div className="space-y-4 p-2">
            {Array.from({length: 3}).map((_, i) => (
              <Card key={i} className="mb-4 p-4">
                <Skeleton className="h-5 w-1/3 mb-3" />
                <div className="pb-2 border-b border-border last:border-b-0">
                    <Skeleton className="h-5 w-3/4 mb-1.5" />
                    <Skeleton className="h-3 w-1/2 mb-2" />
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-4 w-5/6" />
                </div>
              </Card>
            ))}
         </div>
      )}
      {!isLoading && error && <p className="text-sm text-destructive p-2 py-2">Error loading articles: {error}</p>}
      {!isLoading && !error && allArticles.length === 0 && categories.flatMap(c => c.feeds).filter(f => f.url.trim()).length === 0 && (
         <p className="text-sm text-muted-foreground p-2 py-2">No news articles. Add categories and RSS feeds in settings.</p>
      )}
       {!isLoading && !error && allArticles.length === 0 && categories.flatMap(c => c.feeds).filter(f => f.url.trim()).length > 0 && (
         <p className="text-sm text-muted-foreground p-2 py-2">No articles found from active feeds, or feeds might need updating/checking.</p>
      )}

      {!isLoading && !error && allArticles.length > 0 && (
        <div className="space-y-6">
          {categories.map(category => {
            const categoryArticles = articlesByCategoryId(category.id);
            if (categoryArticles.length === 0 && !isLoading && !showFeedManagement) return null; // Don't render empty category cards unless settings are open (or loading)
             if (categoryArticles.length === 0 && isLoading) return null; // Don't render empty category cards if loading

            return (
              <Card key={category.id} className="shadow-md mb-6">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center">
                    <GripVertical className="mr-2 h-5 w-5 text-muted-foreground" /> {/* Optional: for a "draggable" look */}
                    {category.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-0">
                  {categoryArticles.length === 0 && !isLoading && (
                     <p className="text-sm text-muted-foreground py-4 px-2">No articles for this category.</p>
                  )}
                  {categoryArticles.length > 0 && (
                    <ScrollArea className="h-[300px] pr-3 py-2">
                      <ul className="space-y-4">
                        {categoryArticles.map((article) => (
                          <li key={article.id} className="pb-3 border-b border-border last:border-b-0">
                            {article.imageUrl && (
                               <a href={article.link} target="_blank" rel="noopener noreferrer" className="block mb-2 rounded-md overflow-hidden aspect-[16/9] max-h-32">
                                  <Image
                                      src={article.imageUrl}
                                      alt={article.title || 'Article image'}
                                      width={300}
                                      height={169} // Approximate 16:9 aspect ratio
                                      className="object-cover w-full h-full hover:scale-105 transition-transform duration-200"
                                      data-ai-hint="news article"
                                      onError={(e) => (e.currentTarget.style.display = 'none')}
                                  />
                               </a>
                            )}
                            <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                              <h4 className="font-medium text-card-foreground leading-tight">{article.title || 'Untitled Article'}</h4>
                            </a>
                            <p className="text-xs text-muted-foreground mt-1">
                              {article.sourceName} 
                              {article.isoDate && ` - ${formatDistanceToNow(new Date(article.isoDate), { addSuffix: true })}`}
                            </p>
                            {article.contentSnippet && (
                              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3">{article.contentSnippet}</p>
                            )}
                            {article.category && (
                              <Badge variant="secondary" className="mt-2 text-xs">
                                <Tag className="w-3 h-3 mr-1" />
                                {article.category}
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </React.Fragment>
  );
}
