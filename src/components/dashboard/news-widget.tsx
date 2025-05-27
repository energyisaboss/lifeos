
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { Newspaper, Settings, PlusCircle, Trash2, LinkIcon, RefreshCw, Tag } from 'lucide-react';
import type { NewsArticle as AppNewsArticle } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { processRssFeed, RssProcessorInput } from '@/ai/flows/rss-processor-flow';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';

const MAX_RSS_FEEDS = 10;
const MAX_ARTICLES_DISPLAY = 25;

interface RssFeedSource {
  id: string;
  url: string;
  userLabel: string;
}

export function NewsWidget() {
  const [showFeedManagement, setShowFeedManagement] = useState(false);
  const [rssFeeds, setRssFeeds] = useState<RssFeedSource[]>(() => {
    if (typeof window !== 'undefined') {
      const savedFeeds = localStorage.getItem('rssFeedsLifeOS_v1');
      try {
        const parsed = savedFeeds ? JSON.parse(savedFeeds) : [];
        return Array.isArray(parsed) ? parsed.map((item: any, index: number) => ({
          id: item.id || `feed-${Date.now()}-${index}`,
          url: item.url || '',
          userLabel: item.userLabel || `Feed ${index + 1}`,
        })).filter(item => typeof item.url === 'string' && typeof item.userLabel === 'string') : [];
      } catch (e) {
        console.error("Failed to parse RSS feeds from localStorage", e);
        return [];
      }
    }
    return [];
  });

  const [allArticles, setAllArticles] = useState<AppNewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerFeedRefresh, setTriggerFeedRefresh] = useState(0);
  
  const feedListRef = useRef<HTMLDivElement>(null);
  const [justAddedFeedId, setJustAddedFeedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rssFeedsLifeOS_v1', JSON.stringify(rssFeeds));
    }
  }, [rssFeeds]);
  
  useEffect(() => {
    if (justAddedFeedId && feedListRef.current) {
      const newFeedCard = feedListRef.current.querySelector(`[data-feed-id="${justAddedFeedId}"]`);
      if (newFeedCard) {
        newFeedCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      setJustAddedFeedId(null); 
    }
  }, [rssFeeds, justAddedFeedId]);

  const fetchAndProcessAllFeeds = useCallback(async () => {
    const validFeeds = rssFeeds.filter(feed => feed.url.trim().toLowerCase().startsWith('http'));
    if (validFeeds.length === 0) {
      setAllArticles([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    const articlePromises = validFeeds.map(async (feedSource) => {
      try {
        const result = await processRssFeed({ rssFeedUrl: feedSource.url });
        // Attach the user-defined label to each article from this source
        return result.articles.map(article => ({
          ...article,
          sourceName: feedSource.userLabel || result.sourceName, // Prioritize user label
          id: article.link || article.title || `${feedSource.url}-${article.isoDate || Math.random()}`, // Ensure unique ID
        }));
      } catch (err) {
        console.error(`Error fetching/processing RSS feed ${feedSource.userLabel} (${feedSource.url}):`, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(prevError => {
          const newErrorMessage = `Failed for ${feedSource.userLabel || 'feed'}: ${errorMessage.substring(0, 50)}...`;
          return prevError ? `${prevError}; ${newErrorMessage}` : newErrorMessage;
        });
        return []; // Return empty array for this failed feed
      }
    });

    const results = await Promise.allSettled(articlePromises);
    
    let fetchedArticles: AppNewsArticle[] = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        fetchedArticles.push(...result.value);
      }
    });
    
    // Sort all articles by date (newest first)
    fetchedArticles.sort((a, b) => {
      if (a.isoDate && b.isoDate) {
        return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime();
      }
      if (a.isoDate) return -1; // a is newer
      if (b.isoDate) return 1;  // b is newer
      return 0; // No dates, keep original order relative to each other
    });
    
    setAllArticles(fetchedArticles.slice(0, MAX_ARTICLES_DISPLAY));
    setIsLoading(false);

    if (error && typeof window !== 'undefined') { // If any error was set during fetches
        toast({
          title: "Error Loading Some Feeds",
          description: "Some RSS feeds could not be loaded or processed. Check settings.",
          variant: "destructive",
        });
      }

  }, [rssFeeds, error]); // Added 'error' to dependencies to avoid stale closure for toast

  useEffect(() => {
    fetchAndProcessAllFeeds();
  }, [rssFeeds, triggerFeedRefresh, fetchAndProcessAllFeeds]);


  const handleAddNewFeed = () => {
    if (rssFeeds.length >= MAX_RSS_FEEDS) {
      toast({
        title: "Feed Limit Reached",
        description: `You can add a maximum of ${MAX_RSS_FEEDS} RSS feeds.`,
        variant: "destructive",
      });
      return;
    }
    const newFeedId = `new-rss-${Date.now().toString()}`;
    const newFeed = { 
      id: newFeedId,
      url: '', 
      userLabel: `Feed ${rssFeeds.length + 1}`,
    };
    setRssFeeds(prev => [...prev, newFeed]);
    setJustAddedFeedId(newFeedId);
  };

  const handleFeedInputChange = (id: string, field: 'url' | 'userLabel', value: string) => {
    setRssFeeds(prevFeeds =>
      prevFeeds.map(feed =>
        feed.id === id ? { ...feed, [field]: value } : feed
      )
    );
  };
  
  const handleUpdateFeedSettings = (id: string) => {
    const feedToUpdate = rssFeeds.find(feed => feed.id === id);
    if (!feedToUpdate) return;

    if (!feedToUpdate.url.trim()) {
      toast({ title: "URL Required", description: "Please enter an RSS feed URL.", variant: "destructive" });
      return;
    }
    if (!feedToUpdate.url.toLowerCase().startsWith('http')) {
       toast({
        title: "Invalid URL",
        description: "Please enter a valid RSS URL (starting with http:// or https://).",
        variant: "destructive",
      });
      return;
    }
    
    const updatedFeedsWithPersistentId = rssFeeds.map(f => 
        f.id === id && id.startsWith('new-rss-') 
        ? {...f, id: `rss-${Date.now()}-${Math.random().toString(36).substring(2,9)}`} 
        : f 
    );
    
    setRssFeeds(updatedFeedsWithPersistentId);
    setTriggerFeedRefresh(prev => prev + 1); 
    toast({ title: "Feed Settings Updated", description: `Feed "${feedToUpdate.userLabel || feedToUpdate.url}" settings saved. Articles refreshing.` });
  };

  const handleRemoveRssFeed = (idToRemove: string) => {
    setRssFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    toast({ title: "Feed Removed", description: "The RSS feed has been removed." });
  };

  return (
    <Card className="shadow-lg flex flex-col h-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <SectionTitle icon={Newspaper} title="Latest News" />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowFeedManagement(!showFeedManagement)}
            aria-label="Manage RSS Feeds"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 py-0 flex-grow overflow-hidden flex flex-col">
        {showFeedManagement && (
          <div className="pt-3 pb-2 border-b border-border mb-2">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-medium text-muted-foreground">Manage RSS Feeds</h4>
              <Button size="sm" variant="outline" onClick={handleAddNewFeed} disabled={rssFeeds.length >= MAX_RSS_FEEDS}>
                <PlusCircle className="w-4 h-4 mr-2" /> Add New Feed ({rssFeeds.length}/{MAX_RSS_FEEDS})
              </Button>
            </div>
            
            <ScrollArea className="max-h-[200px] pr-1 overflow-y-auto calendar-feed-scroll-area" ref={feedListRef}>
              <div className="space-y-3">
                {rssFeeds.map((feed) => (
                  <Card key={feed.id} data-feed-id={feed.id} className="p-3 bg-muted/30">
                    <div className="space-y-2">
                      <div>
                        <Label htmlFor={`label-${feed.id}`} className="text-xs">Custom Label</Label>
                        <Input
                          id={`label-${feed.id}`}
                          type="text"
                          placeholder="e.g., Tech News"
                          value={feed.userLabel}
                          onChange={(e) => handleFeedInputChange(feed.id, 'userLabel', e.target.value)}
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`url-${feed.id}`} className="text-xs">RSS Feed URL</Label>
                        <Input
                          id={`url-${feed.id}`}
                          type="url"
                          placeholder="https://example.com/feed.xml"
                          value={feed.url}
                          onChange={(e) => handleFeedInputChange(feed.id, 'url', e.target.value)}
                          className="h-8 text-xs mt-1"
                          required
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                       <Button variant="outline" size="sm" className="h-8" onClick={() => handleUpdateFeedSettings(feed.id)}>
                        <RefreshCw className="w-3 h-3 mr-1.5" />
                        Update & Refresh
                      </Button>
                      <Button variant="destructive" size="sm" className="h-8" onClick={() => handleRemoveRssFeed(feed.id)}>
                        <Trash2 className="w-3 h-3 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
             {rssFeeds.length === 0 && !isLoading && (
                <p className="text-xs text-muted-foreground text-center py-2">No RSS feeds added yet. Click "Add New Feed".</p>
             )}
          </div>
        )}

        <ScrollArea className="flex-1 pr-3 py-2">
          {isLoading && (
             <div className="space-y-4 p-2">
                {Array.from({length: 3}).map((_, i) => (
                    <div key={i} className="pb-2 border-b border-border last:border-b-0">
                        <Skeleton className="h-5 w-3/4 mb-1.5" />
                        <Skeleton className="h-3 w-1/2 mb-2" />
                        <Skeleton className="h-4 w-full mb-1" />
                        <Skeleton className="h-4 w-5/6" />
                    </div>
                ))}
             </div>
          )}
          {!isLoading && error && <p className="text-sm text-destructive p-2 py-2">Error loading articles: {error}</p>}
          {!isLoading && !error && allArticles.length === 0 && rssFeeds.filter(f => f.url.trim()).length === 0 && (
             <p className="text-sm text-muted-foreground p-2 py-2">No news articles. Click the settings icon to add RSS feeds.</p>
          )}
           {!isLoading && !error && allArticles.length === 0 && rssFeeds.filter(f => f.url.trim()).length > 0 && (
             <p className="text-sm text-muted-foreground p-2 py-2">No articles found from active feeds, or feeds might need updating/checking.</p>
          )}
          {!isLoading && !error && allArticles.length > 0 && (
            <ul className="space-y-4">
              {allArticles.map((article) => (
                <li key={article.id} className="pb-3 border-b border-border last:border-b-0">
                  {article.imageUrl && (
                     <a href={article.link} target="_blank" rel="noopener noreferrer" className="block mb-2">
                        <Image
                            src={article.imageUrl}
                            alt={article.title || 'Article image'}
                            width={300}
                            height={150}
                            className="rounded-md object-cover w-full max-h-40"
                            data-ai-hint="news article"
                        />
                     </a>
                  )}
                  <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                    <h3 className="font-medium text-card-foreground leading-tight">{article.title || 'Untitled Article'}</h3>
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
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
