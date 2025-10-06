import { z } from 'zod';

// Tool definitions for Claude Sonnet 4
export const tools = {
  // Google Calendar Tools
  list_calendar_events: {
    description: 'Retrieve calendar events within a date range. Use this to check schedules, find meetings, or see what events are planned.',
    parameters: z.object({
      start_date: z.string().describe('Start date and time in ISO 8601 format (e.g., 2024-01-01T00:00:00Z)'),
      end_date: z.string().describe('End date and time in ISO 8601 format (e.g., 2024-01-31T23:59:59Z)'),
      calendar_id: z.string().optional().describe('Calendar ID (defaults to primary calendar)'),
    }),
  },
  
  create_calendar_event: {
    description: 'Create a new calendar event. Use this to schedule meetings, appointments, or any time-blocked activities.',
    parameters: z.object({
      title: z.string().describe('Event title/summary'),
      start_time: z.string().describe('Event start time in ISO 8601 format'),
      end_time: z.string().describe('Event end time in ISO 8601 format'),
      description: z.string().optional().describe('Event description/notes'),
      attendees: z.array(z.string()).optional().describe('Array of attendee email addresses'),
      location: z.string().optional().describe('Event location'),
    }),
  },
  
  update_calendar_event: {
    description: 'Update an existing calendar event. Use this to modify event details like time, title, or attendees.',
    parameters: z.object({
      event_id: z.string().describe('The ID of the event to update'),
      title: z.string().optional().describe('Updated event title'),
      start_time: z.string().optional().describe('Updated start time in ISO 8601 format'),
      end_time: z.string().optional().describe('Updated end time in ISO 8601 format'),
      description: z.string().optional().describe('Updated description'),
      location: z.string().optional().describe('Updated location'),
    }),
  },
  
  delete_calendar_event: {
    description: 'Delete a calendar event. Use this to cancel or remove events from the calendar.',
    parameters: z.object({
      event_id: z.string().describe('The ID of the event to delete'),
    }),
  },
  
  // Google Tasks Tools
  list_tasks: {
    description: 'Get all tasks from a task list. Use this to see what tasks are pending, their due dates, and status.',
    parameters: z.object({
      task_list_id: z.string().optional().describe('Task list ID (defaults to primary task list)'),
    }),
  },
  
  create_task: {
    description: 'Create a new task. Use this to add to-do items, reminders, or action items.',
    parameters: z.object({
      title: z.string().describe('Task title'),
      due_date: z.string().optional().describe('Due date in ISO 8601 format (e.g., 2024-01-31T00:00:00Z)'),
      notes: z.string().optional().describe('Task notes/description'),
      parent_task_id: z.string().optional().describe('Parent task ID for creating subtasks'),
    }),
  },
  
  update_task: {
    description: 'Update an existing task. Use this to modify task details, change due dates, or update notes.',
    parameters: z.object({
      task_id: z.string().describe('The ID of the task to update'),
      title: z.string().optional().describe('Updated task title'),
      due_date: z.string().optional().describe('Updated due date'),
      notes: z.string().optional().describe('Updated notes'),
      status: z.enum(['needsAction', 'completed']).optional().describe('Task status'),
    }),
  },
  
  complete_task: {
    description: 'Mark a task as completed. Use this when a task is finished.',
    parameters: z.object({
      task_id: z.string().describe('The ID of the task to mark as complete'),
    }),
  },
  
  // Notion Tools
  query_notion_database: {
    description: 'Search and filter pages in a Notion database. Use this to find specific pages, view database contents, or query with filters.',
    parameters: z.object({
      database_id: z.string().describe('The ID of the Notion database to query'),
      filters: z.record(z.any()).optional().describe('Notion API filter object'),
      sorts: z.array(z.any()).optional().describe('Notion API sort array'),
    }),
  },
  
  create_notion_page: {
    description: 'Create a new page in a Notion database or under a parent page. Use this to add new entries, create documents, or add items to databases.',
    parameters: z.object({
      parent_id: z.string().describe('Parent database ID or page ID where the new page will be created'),
      title: z.string().describe('Page title'),
      properties: z.record(z.any()).optional().describe('Notion page properties object (for database pages)'),
      content_blocks: z.array(z.any()).optional().describe('Array of Notion block objects for page content'),
    }),
  },
  
  update_notion_page: {
    description: 'Update properties of an existing Notion page. Use this to modify page properties, change status, or update fields.',
    parameters: z.object({
      page_id: z.string().describe('The ID of the page to update'),
      properties: z.record(z.any()).describe('Notion properties object with fields to update'),
    }),
  },
  
  append_notion_blocks: {
    description: 'Append content blocks to an existing Notion page. Use this to add text, lists, or other content to a page.',
    parameters: z.object({
      page_id: z.string().describe('The ID of the page to append content to'),
      blocks: z.array(z.any()).describe('Array of Notion block objects to append'),
    }),
  },
  
  get_notion_page: {
    description: 'Get complete details of a Notion page including its properties and content.',
    parameters: z.object({
      page_id: z.string().describe('The ID of the page to retrieve'),
    }),
  },
};

// Type for tool names
export type ToolName = keyof typeof tools;

// Helper to get tool schema
export function getToolSchema(toolName: ToolName) {
  return tools[toolName];
}


