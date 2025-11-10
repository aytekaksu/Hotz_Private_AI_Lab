import { z } from 'zod';

const toolDescriptors = [
  {
    name: 'list_calendar_events',
    displayName: 'List Calendar Events',
    description: 'Retrieve calendar events within a date range. Use this to check schedules, find meetings, or see what events are planned.',
    category: 'Google Calendar',
    authProvider: 'google',
    parameters: z.object({
      start_date: z.string().describe('Start date and time in ISO 8601 format (e.g., 2024-01-01T00:00:00Z)'),
      end_date: z.string().describe('End date and time in ISO 8601 format (e.g., 2024-01-31T23:59:59Z)'),
      calendar_id: z.string().optional().describe('Calendar ID (defaults to primary calendar)'),
    }),
  },
  {
    name: 'create_calendar_event',
    displayName: 'Create Calendar Event',
    description: 'Create a new calendar event. Use this to schedule meetings, appointments, or any time-blocked activities.',
    category: 'Google Calendar',
    authProvider: 'google',
    parameters: z.object({
      title: z.string().describe('Event title/summary'),
      start_time: z.string().describe('Event start time in ISO 8601 format'),
      end_time: z.string().describe('Event end time in ISO 8601 format'),
      description: z.string().optional().describe('Event description/notes'),
      attendees: z.array(z.string()).optional().describe('Array of attendee email addresses'),
      location: z.string().optional().describe('Event location'),
    }),
  },
  {
    name: 'update_calendar_event',
    displayName: 'Update Calendar Event',
    description: 'Update an existing calendar event. Use this to modify event details like time, title, or attendees.',
    category: 'Google Calendar',
    authProvider: 'google',
    parameters: z.object({
      event_id: z.string().describe('The ID of the event to update'),
      title: z.string().optional().describe('Updated event title'),
      start_time: z.string().optional().describe('Updated start time in ISO 8601 format'),
      end_time: z.string().optional().describe('Updated end time in ISO 8601 format'),
      description: z.string().optional().describe('Updated description'),
      location: z.string().optional().describe('Updated location'),
    }),
  },
  {
    name: 'delete_calendar_event',
    displayName: 'Delete Calendar Event',
    description: 'Delete a calendar event. Use this to cancel or remove events from the calendar.',
    category: 'Google Calendar',
    authProvider: 'google',
    parameters: z.object({
      event_id: z.string().describe('The ID of the event to delete'),
    }),
  },
  {
    name: 'list_tasks',
    displayName: 'List Tasks',
    description: 'Get all tasks from a task list. Use this to see what tasks are pending, their due dates, and status.',
    category: 'Google Tasks',
    authProvider: 'google',
    parameters: z.object({
      task_list_id: z.string().optional().describe('Task list ID (defaults to primary list)'),
      include_completed: z.boolean().optional().describe('Include completed tasks (default false)'),
      include_notes: z.boolean().optional().describe('Include task notes/description (default false)'),
      max_results: z.number().int().positive().optional().describe('Maximum tasks to return (default 20, capped)'),
      page_token: z.string().optional().describe('Pagination token from a previous response'),
    }),
  },
  {
    name: 'create_task',
    displayName: 'Create Task',
    description: 'Create a new task. Use this to add to-do items, reminders, or action items.',
    category: 'Google Tasks',
    authProvider: 'google',
    parameters: z.object({
      title: z.string().describe('Task title'),
      due_date: z.string().optional().describe('Due date in ISO 8601 format (e.g., 2024-01-31T00:00:00Z)'),
      notes: z.string().optional().describe('Task notes/description'),
      parent_task_id: z.string().optional().describe('Parent task ID for creating subtasks'),
    }),
  },
  {
    name: 'update_task',
    displayName: 'Update Task',
    description: 'Update an existing task. Use this to modify task details, change due dates, or update notes.',
    category: 'Google Tasks',
    authProvider: 'google',
    parameters: z.object({
      task_id: z.string().describe('The ID of the task to update'),
      title: z.string().optional().describe('Updated task title'),
      due_date: z.string().optional().describe('Updated due date'),
      notes: z.string().optional().describe('Updated notes'),
      status: z.enum(['needsAction', 'completed']).optional().describe('Task status'),
    }),
  },
  {
    name: 'complete_task',
    displayName: 'Complete Task',
    description: 'Mark a task as completed. Use this when a task is finished.',
    category: 'Google Tasks',
    authProvider: 'google',
    parameters: z.object({
      task_id: z.string().describe('The ID of the task to mark as complete'),
    }),
  },
  {
    name: 'query_notion_database',
    displayName: 'Query Database',
    description: 'Search and filter pages in a Notion database. Use this to find specific pages, view database contents, or query with filters.',
    category: 'Notion',
    authProvider: 'notion',
    parameters: z.object({
      database_id: z.string().describe('The ID of the Notion database to query'),
      filters: z.record(z.any()).optional().describe('Notion API filter object'),
      sorts: z.array(z.any()).optional().describe('Notion API sort array'),
    }),
  },
  {
    name: 'create_notion_page',
    displayName: 'Create Page',
    description: 'Create a new page in a Notion database or under a parent page. Use this to add new entries, create documents, or add items to databases.',
    category: 'Notion',
    authProvider: 'notion',
    parameters: z.object({
      parent_id: z.string().describe('Parent database ID or page ID where the new page will be created'),
      title: z.string().describe('Page title'),
      properties: z.record(z.any()).optional().describe('Notion page properties object (for database pages)'),
      content_blocks: z.array(z.any()).optional().describe('Array of Notion block objects for page content'),
    }),
  },
  {
    name: 'update_notion_page',
    displayName: 'Update Page',
    description: 'Update properties of an existing Notion page. Use this to modify page properties, change status, or update fields.',
    category: 'Notion',
    authProvider: 'notion',
    parameters: z.object({
      page_id: z.string().describe('The ID of the page to update'),
      properties: z.record(z.any()).describe('Notion properties object with fields to update'),
    }),
  },
  {
    name: 'append_notion_blocks',
    displayName: 'Append Content',
    description: 'Append content blocks to an existing Notion page. Use this to add text, lists, or other content to a page.',
    category: 'Notion',
    authProvider: 'notion',
    parameters: z.object({
      page_id: z.string().describe('The ID of the page to append content to'),
      blocks: z.array(z.any()).describe('Array of Notion block objects to append'),
    }),
  },
  {
    name: 'get_notion_page',
    displayName: 'Get Page Details',
    description: 'Get complete details of a Notion page including its properties and content.',
    category: 'Notion',
    authProvider: 'notion',
    parameters: z.object({
      page_id: z.string().describe('The ID of the page to retrieve'),
    }),
  },
  {
    name: 'get_current_datetime',
    displayName: 'Get Current Date/Time',
    description: 'Get the current date and time in the user\'s timezone. Use this whenever you need to know what time it is now, or to calculate relative dates like "tomorrow", "next week", etc.',
    category: 'System',
    authProvider: undefined,
    parameters: z.object({
      timezone: z.string().optional().describe('Optional IANA timezone override (e.g., America/Los_Angeles)'),
    }),
  },
] as const;

export type ToolName = (typeof toolDescriptors)[number]['name'];

export type ToolSchema = {
  description: string;
  parameters: z.ZodTypeAny;
};

export const tools: Record<ToolName, ToolSchema> = toolDescriptors.reduce((acc, tool) => {
  acc[tool.name] = {
    description: tool.description,
    parameters: tool.parameters,
  };
  return acc;
}, {} as Record<ToolName, ToolSchema>);

export type ToolMetadata = {
  displayName: string;
  description: string;
  category: string;
  requiresAuth: boolean;
  authProvider: 'google' | 'notion' | null;
};

export const toolMetadata: Record<ToolName, ToolMetadata> = toolDescriptors.reduce(
  (acc, tool) => {
    const authProvider = 'authProvider' in tool && tool.authProvider ? tool.authProvider : null;
    acc[tool.name] = {
      displayName: tool.displayName,
      description: tool.description,
      category: tool.category,
      requiresAuth: !!authProvider,
      authProvider: authProvider as 'google' | 'notion' | null,
    };
    return acc;
  },
  {} as Record<ToolName, ToolMetadata>,
);

export function getToolSchema(toolName: ToolName) {
  return tools[toolName];
}
