import { ToolName } from './definitions';
import * as googleCalendar from './google-calendar';
import * as googleTasks from './google-tasks';
import * as notion from './notion';
import * as system from './system';

export async function executeTool(
  toolName: ToolName,
  args: any,
  userId: string
): Promise<any> {
  console.log(`Executing tool: ${toolName}`, { args, userId });
  
  try {
    switch (toolName) {
      // Google Calendar Tools
      case 'list_calendar_events':
        return await googleCalendar.listCalendarEvents(userId, args);
      
      case 'create_calendar_event':
        return await googleCalendar.createCalendarEvent(userId, args);
      
      case 'update_calendar_event':
        return await googleCalendar.updateCalendarEvent(userId, args);
      
      case 'delete_calendar_event':
        return await googleCalendar.deleteCalendarEvent(userId, args);
      
      // Google Tasks Tools
      case 'list_tasks':
        return await googleTasks.listTasks(userId, args);
      
      case 'create_task':
        return await googleTasks.createTask(userId, args);
      
      case 'update_task':
        return await googleTasks.updateTask(userId, args);
      
      case 'complete_task':
        return await googleTasks.completeTask(userId, args);
  
      // Notion Tools
      case 'search_notion':
        return await notion.searchNotion(userId, args);
      
      case 'query_notion_database':
        return await notion.queryNotionDatabase(userId, args);
      
      case 'create_notion_page':
        return await notion.createNotionPage(userId, args);
      
      case 'update_notion_page':
        return await notion.updateNotionPage(userId, args);
      
      case 'append_notion_blocks':
        return await notion.appendNotionBlocks(userId, args);
      
      case 'get_notion_page':
        return await notion.getNotionPage(userId, args);
      
      // System Tools
      case 'get_current_datetime':
        return await system.getCurrentDatetime();
      
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error: any) {
    console.error(`Error executing tool ${toolName}:`, error);
    return {
      success: false,
      error: error.message || 'Tool execution failed',
    };
  }
}



