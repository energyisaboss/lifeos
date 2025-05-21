"use client";

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { Newspaper, Tag } from 'lucide-react';
import type { NewsArticle } from '@/lib/types';
import { mockNewsArticles } from '@/lib/mock-data';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export function NewsWidget() {
  const articles: NewsArticle[] = mockNewsArticles; // In a real app, fetch this data

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <SectionTitle icon={Newspaper} title="Latest News" />
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[250px] pr-3">
          <ul className="space-y-4">
            {articles.map((article) => (
              <li key={article.id} className="pb-2 border-b border-border last:border-b-0">
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                  <h3 className="font-medium text-card-foreground">{article.title}</h3>
                </a>
                <p className="text-xs text-muted-foreground mt-1">{article.source} - {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{article.summary}</p>
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
      </CardContent>
    </Card>
  );
}
