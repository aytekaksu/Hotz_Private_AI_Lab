import { Client } from '@notionhq/client';
import { getDecryptedOAuthCredential } from '../db';
import { NotionPageCache } from './notion-cache';

async function getNotionClient(userId: string) {
  const credentials = await getDecryptedOAuthCredential(userId, 'notion');
  const authToken = credentials?.accessToken ?? process.env.NOTION_INTEGRATION_SECRET;

  if (!authToken) {
    throw new Error('Notion integration not configured. Add your integration secret in Settings.');
  }
  
  return new Client({ auth: authToken });
}

function extractPlainTextTitle(from: any): string | null {
  if (!from) return null;

  // Database objects expose `title`
  if (Array.isArray(from.title)) {
    const plain = from.title.map((t: any) => t?.plain_text || t?.text?.content || '').join('').trim();
    if (plain) return plain;
  }

  // Page objects expose `properties` with a title type
  if (from.properties && typeof from.properties === 'object') {
    const titleProp = Object.values(from.properties as Record<string, any>).find((prop: any) => prop?.type === 'title');
    if (titleProp && Array.isArray(titleProp.title)) {
      const plain = titleProp.title.map((t: any) => t?.plain_text || t?.text?.content || '').join('').trim();
      if (plain) return plain;
    }
  }

  return null;
}

const PREVIEW_LINE_COUNT = 256;
const DEFAULT_RANGE_SIZE = 256;

const richTextToPlainString = (parts: any[]): string =>
  parts
    .map((p: any) => p?.plain_text || p?.text?.content || '')
    .join('')
    .replace(/\s+\n/g, '\n')
    .trimEnd();

const indentForDepth = (depth: number) => ' '.repeat(Math.max(0, depth) * 2);

function blockToTextLines(block: any, depth = 0): string[] {
  if (!block || typeof block !== 'object' || !block.type) return [];
  const data = (block as any)[block.type] ?? {};
  const prefix = indentForDepth(depth);
  const text = Array.isArray(data.rich_text) ? richTextToPlainString(data.rich_text) : '';

  switch (block.type) {
    case 'paragraph':
      return text ? [`${prefix}${text}`] : [];
    case 'heading_1':
      return [`${prefix}# ${text}`.trimEnd()];
    case 'heading_2':
      return [`${prefix}## ${text}`.trimEnd()];
    case 'heading_3':
      return [`${prefix}### ${text}`.trimEnd()];
    case 'bulleted_list_item':
      return [`${prefix}- ${text}`];
    case 'numbered_list_item':
      return [`${prefix}1. ${text}`];
    case 'to_do':
      return [`${prefix}[${data.checked ? 'x' : ' '}] ${text}`];
    case 'quote':
      return [`${prefix}> ${text}`];
    case 'callout':
      return [`${prefix}💡 ${text}`];
    case 'toggle':
      return [`${prefix}▸ ${text}`];
    case 'code': {
      const header = `${prefix}\`\`\`${data.language || ''}`.trimEnd();
      const body = text.split('\n').map((line: string) => `${prefix}${line}`);
      return [header, ...body, `${prefix}\`\`\``];
    }
    case 'divider':
      return [`${prefix}---`];
    case 'equation':
      return [`${prefix}$${data?.expression ?? ''}$`];
    case 'bookmark':
      return [`${prefix}[bookmark] ${data.url || ''}`.trimEnd()];
    case 'image': {
      const url =
        data?.type === 'file'
          ? data?.file?.url
          : data?.type === 'external'
            ? data?.external?.url
            : '';
      return [`${prefix}[image] ${url || ''}`.trimEnd()];
    }
    case 'child_page':
      return [`${prefix}[Child Page] ${(block as any).child_page?.title || ''}`.trimEnd()];
    case 'synced_block':
      return [`${prefix}[synced block] ${text}`.trimEnd()];
    case 'table_row': {
      const cells = Array.isArray(data.cells)
        ? data.cells.map((cell: any[]) => richTextToPlainString(cell)).join(' | ')
        : '';
      return [`${prefix}| ${cells} |`.trimEnd()];
    }
    default:
      if (text) return [`${prefix}${text}`];
      return [`${prefix}[${block.type}]`];
  }
}

async function collectChildBlocks(notion: Client, blockId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const resp = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    all.push(...resp.results);
    cursor = resp.has_more ? (resp as any).next_cursor ?? undefined : undefined;
  } while (cursor);
  return all;
}

async function flattenBlocks(notion: Client, blocks: any[], depth = 0): Promise<string[]> {
  const lines: string[] = [];

  for (const block of blocks) {
    lines.push(...blockToTextLines(block, depth));
    if (block?.has_children && block?.id) {
      try {
        const children = await collectChildBlocks(notion, block.id);
        const childLines = await flattenBlocks(notion, children, depth + 1);
        lines.push(...childLines);
      } catch (error) {
        console.error('Failed to fetch Notion child blocks:', error);
        lines.push(`${indentForDepth(depth + 1)}[child content unavailable]`);
      }
    }
  }

  return lines;
}

export type NotionToolContext = {
  notionCache?: NotionPageCache;
};

export async function searchNotion(
  userId: string,
  params: {
    query: string;
    filter?: 'page' | 'database';
    page_size?: number;
    start_cursor?: string;
    sort_direction?: 'ascending' | 'descending';
  }
): Promise<any> {
  try {
    const notion = await getNotionClient(userId);

    const pageSize = Math.min(
      100,
      Math.max(1, Number.isFinite(params.page_size as number) ? Number(params.page_size) : 10),
    );

    const response = await notion.search({
      query: params.query,
      filter: params.filter ? { property: 'object', value: params.filter } : undefined,
      sort: params.sort_direction
        ? { direction: params.sort_direction, timestamp: 'last_edited_time' }
        : undefined,
      page_size: pageSize,
      start_cursor: params.start_cursor,
    });

    const results = response.results.map((item: any) => {
      const title = extractPlainTextTitle(item);
      return {
        id: item.id,
        object: item.object,
        title: title || null,
        url: 'url' in item ? item.url : null,
        last_edited_time: 'last_edited_time' in item ? (item as any).last_edited_time : null,
        created_time: 'created_time' in item ? (item as any).created_time : null,
        parent: 'parent' in item ? (item as any).parent : null,
      };
    });

    return {
      success: true,
      results,
      has_more: response.has_more,
      next_cursor: (response as any).next_cursor ?? null,
      result_count: results.length,
    };
  } catch (error: any) {
    console.error('Error searching Notion:', error);
    return {
      success: false,
      error: error.message || 'Failed to search Notion',
    };
  }
}

export async function queryNotionDatabase(
  userId: string,
  params: {
    database_id: string;
    filters?: any;
    sorts?: any[];
  }
): Promise<any> {
  try {
    const notion = await getNotionClient(userId);
    
    const response = await notion.databases.query({
      database_id: params.database_id,
      filter: params.filters,
      sorts: params.sorts,
    });
    
    return {
      success: true,
      results: response.results.map((page: any) => ({
        id: page.id,
        properties: page.properties,
        url: page.url,
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
      })),
      count: response.results.length,
      has_more: response.has_more,
    };
  } catch (error: any) {
    console.error('Error querying Notion database:', error);
    return {
      success: false,
      error: error.message || 'Failed to query Notion database',
    };
  }
}

export async function createNotionPage(
  userId: string,
  params: {
    parent_id: string;
    title: string;
    properties?: any;
    content_blocks?: any[];
  }
): Promise<any> {
  try {
    const notion = await getNotionClient(userId);
    
    // Determine if parent is a database or page
    let parent: any;
    try {
      await notion.databases.retrieve({ database_id: params.parent_id });
      parent = { database_id: params.parent_id };
    } catch {
      parent = { page_id: params.parent_id };
    }
    
    // Build properties
    let properties: any = {};
    if (parent.database_id && params.properties) {
      properties = params.properties;
    } else {
      // For page parent, just use title
      properties = {
        title: {
          title: [
            {
              text: { content: params.title },
            },
          ],
        },
      };
    }
    
    // Ensure title is set for database pages
    if (parent.database_id && !properties.title && !properties.Title && !properties.Name) {
      // Try to find the title property
      const db = await notion.databases.retrieve({ database_id: params.parent_id });
      const titleProp = Object.entries(db.properties).find(([_, prop]: any) => prop.type === 'title');
      if (titleProp) {
        properties[titleProp[0]] = {
          title: [{ text: { content: params.title } }],
        };
      }
    }
    
    const pageData: any = {
      parent,
      properties,
    };
    
    if (params.content_blocks && params.content_blocks.length > 0) {
      pageData.children = params.content_blocks;
    }
    
    const response = await notion.pages.create(pageData);
    
    const pageUrl = 'url' in response ? response.url : undefined;
    const createdTime = 'created_time' in response ? response.created_time : undefined;

    return {
      success: true,
      page: {
        id: response.id,
        url: pageUrl,
        created_time: createdTime,
      },
      message: 'Page created successfully',
    };
  } catch (error: any) {
    console.error('Error creating Notion page:', error);
    return {
      success: false,
      error: error.message || 'Failed to create Notion page',
    };
  }
}

export async function updateNotionPage(
  userId: string,
  params: {
    page_id: string;
    properties: any;
  }
): Promise<any> {
  try {
    const notion = await getNotionClient(userId);
    
    const response = await notion.pages.update({
      page_id: params.page_id,
      properties: params.properties,
    });
    
    const pageUrl = 'url' in response ? response.url : undefined;
    const lastEditedTime = 'last_edited_time' in response ? response.last_edited_time : undefined;

    return {
      success: true,
      page: {
        id: response.id,
        url: pageUrl,
        last_edited_time: lastEditedTime,
      },
      message: 'Page updated successfully',
    };
  } catch (error: any) {
    console.error('Error updating Notion page:', error);
    return {
      success: false,
      error: error.message || 'Failed to update Notion page',
    };
  }
}

export async function appendNotionBlocks(
  userId: string,
  params: {
    page_id: string;
    blocks: any[];
  }
): Promise<any> {
  try {
    const notion = await getNotionClient(userId);
    
    const response = await notion.blocks.children.append({
      block_id: params.page_id,
      children: params.blocks,
    });
    
    return {
      success: true,
      blocks: response.results.length,
      message: 'Content appended successfully',
    };
  } catch (error: any) {
    console.error('Error appending Notion blocks:', error);
    return {
      success: false,
      error: error.message || 'Failed to append content',
    };
  }
}

export async function getNotionPage(
  userId: string,
  params: {
    page_id: string;
    start_line?: number;
    end_line?: number;
    cache_key?: string | null;
  },
  context?: NotionToolContext,
): Promise<any> {
  try {
    const cache = context?.notionCache ?? new NotionPageCache();
    const normalizeNumber = (value: number | undefined) =>
      Number.isFinite(value as number) ? Math.max(1, Math.floor(value as number)) : undefined;

    const requestedStart = normalizeNumber(params.start_line);
    const requestedEnd = normalizeNumber(params.end_line);

    let cachedPage = cache.getByKey(params.cache_key) || cache.getByPageId(params.page_id);
    const reusedCache = !!cachedPage;

    if (!cachedPage || cachedPage.pageId !== params.page_id) {
      const notion = await getNotionClient(userId);
      const page = await notion.pages.retrieve({ page_id: params.page_id });
      const topLevelBlocks = await collectChildBlocks(notion, params.page_id);
      const lines = await flattenBlocks(notion, topLevelBlocks, 0);

      cachedPage = await cache.store(params.page_id, lines, {
        properties: (page as any).properties ?? {},
        url: 'url' in page ? (page as any).url : null,
        created_time: 'created_time' in page ? (page as any).created_time : undefined,
        last_edited_time: 'last_edited_time' in page ? (page as any).last_edited_time : undefined,
      });
    } else {
      cachedPage = (await cache.ensureLines(cachedPage.cacheKey)) || cachedPage;
    }

    if (!cachedPage) {
      return {
        success: false,
        error: 'Failed to cache Notion page content.',
      };
    }

    const totalLines = cachedPage.lineCount;
    const headEnd = Math.max(0, Math.min(PREVIEW_LINE_COUNT, totalLines));
    const headLines = cachedPage.lines.slice(0, PREVIEW_LINE_COUNT);
    const tailStart = Math.max(1, totalLines - PREVIEW_LINE_COUNT + 1);
    const tailLines = cachedPage.lines.slice(-PREVIEW_LINE_COUNT);

    let range:
      | {
          start: number;
          end: number;
          lines: string[];
        }
      | undefined;

    if (typeof requestedStart === 'number') {
      const desiredStart = requestedStart;
      const desiredEnd =
        typeof requestedEnd === 'number'
          ? requestedEnd
          : requestedStart + DEFAULT_RANGE_SIZE - 1;

      const slice = await cache.slice(cachedPage.cacheKey, desiredStart, desiredEnd);
      if (slice) {
        range = {
          start: slice.start,
          end: slice.end,
          lines: slice.lines,
        };
      }
    }

    return {
      success: true,
      cache_key: cachedPage.cacheKey,
      line_count: totalLines,
      head: {
        start: totalLines === 0 ? 0 : 1,
        end: headEnd,
        lines: headLines,
      },
      tail: {
        start: totalLines === 0 ? 0 : tailStart,
        end: totalLines,
        lines: tailLines,
      },
      range,
      page: {
        id: cachedPage.pageId,
        properties: cachedPage.properties,
        url: cachedPage.url,
        created_time: cachedPage.created_time,
        last_edited_time: cachedPage.last_edited_time,
      },
      source: reusedCache ? 'cache' : 'fresh',
      note:
        'Use cache_key with start_line and end_line to pull specific slices without reloading the entire page.',
    };
  } catch (error: any) {
    console.error('Error getting Notion page:', error);
    return {
      success: false,
      error: error.message || 'Failed to get Notion page',
    };
  }
}
