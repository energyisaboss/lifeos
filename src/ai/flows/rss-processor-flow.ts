
'use server';
/**
 * @fileOverview A Genkit flow to fetch and parse RSS feeds.
 *
 * - processRssFeed - Fetches and parses an RSS feed URL, returning feed title and articles.
 * - RssProcessorInput - The input type for the processRssFeed function.
 * - RssProcessorOutput - The return type for the processRssFeed function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import Parser from 'rss-parser';
import type { NewsArticle } from '@/lib/types';

const RssProcessorInputSchema = z.object({
  rssFeedUrl: z.string().url().describe('The URL of the RSS feed.'),
});
export type RssProcessorInput = z.infer<typeof RssProcessorInputSchema>;

const ProcessedArticleSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  link: z.string().url().optional(),
  sourceName: z.string(), // This will be the feed's title or overridden by user label
  contentSnippet: z.string().optional(),
  isoDate: z.string().datetime({ offset: true }).optional(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional().describe('Optional image URL for the article'),
});

const RssProcessorOutputSchema = z.object({
  sourceName: z.string().describe('The title of the RSS feed.'),
  articles: z.array(ProcessedArticleSchema).describe('A list of articles from the feed.'),
});
export type RssProcessorOutput = z.infer<typeof RssProcessorOutputSchema>;

export async function processRssFeed(input: RssProcessorInput): Promise<RssProcessorOutput> {
  return rssProcessorFlow(input);
}

const rssProcessorFlow = ai.defineFlow(
  {
    name: 'rssProcessorFlow',
    inputSchema: RssProcessorInputSchema,
    outputSchema: RssProcessorOutputSchema,
  },
  async ({ rssFeedUrl }) => {
    const parser = new Parser({
      customFields: {
        item: [['media:content', 'mediaContent', {keepArray: false}]], // Common for images in some feeds
      }
    });

    try {
      const feed = await parser.parseURL(rssFeedUrl);
      const sourceName = feed.title || 'Untitled Feed';

      const articles: NewsArticle[] = (feed.items || []).map(item => {
        let imageUrl: string | undefined = undefined;
        if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
          imageUrl = item.enclosure.url;
        } else if ((item as any).mediaContent && (item as any).mediaContent.$ && (item as any).mediaContent.$.url) {
          // Attempt to get image from <media:content url="...">
          imageUrl = (item as any).mediaContent.$.url;
        }

        return {
          id: item.guid || item.link || item.title || Date.now().toString() + Math.random(),
          title: item.title,
          link: item.link,
          sourceName: sourceName, // Will be overridden by user label on client-side if provided
          contentSnippet: item.contentSnippet?.substring(0, 200) || item.summary?.substring(0,200) || item.content?.substring(0, 200), // Take first 200 chars
          isoDate: item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : undefined),
          category: Array.isArray(item.categories) ? item.categories[0] : item.categories,
          imageUrl: imageUrl,
        };
      }).filter(article => article.title && article.link); // Ensure basic fields are present

      return {
        sourceName,
        articles,
      };
    } catch (error) {
      console.error(`Error processing RSS feed ${rssFeedUrl}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to process RSS feed ${rssFeedUrl}: ${errorMessage}`);
    }
  }
);
