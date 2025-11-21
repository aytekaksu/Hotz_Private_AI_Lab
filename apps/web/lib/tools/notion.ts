import { Client } from '@notionhq/client';
import { getDecryptedOAuthCredential } from '../db';

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
  }
): Promise<any> {
  try {
    const notion = await getNotionClient(userId);
    
    const page = await notion.pages.retrieve({ page_id: params.page_id });
    const blocks = await notion.blocks.children.list({ block_id: params.page_id });
    
    const createdTime = 'created_time' in page ? page.created_time : undefined;
    const lastEditedTime = 'last_edited_time' in page ? page.last_edited_time : undefined;

    return {
      success: true,
      page: {
        id: page.id,
        properties: (page as any).properties,
        url: (page as any).url,
        created_time: createdTime,
        last_edited_time: lastEditedTime,
        blocks: blocks.results,
      },
    };
  } catch (error: any) {
    console.error('Error getting Notion page:', error);
    return {
      success: false,
      error: error.message || 'Failed to get Notion page',
    };
  }
}
