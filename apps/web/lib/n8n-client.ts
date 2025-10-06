/**
 * n8n webhook client for triggering workflows
 */

const N8N_BASE_URL = process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook';

export interface N8nWorkflowResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Call an n8n workflow via webhook
 */
export async function callN8nWorkflow(
  workflowName: string,
  parameters: Record<string, any>,
  userId: string
): Promise<N8nWorkflowResult> {
  try {
    const url = `${N8N_BASE_URL}/${workflowName}`;
    
    console.log(`Calling n8n workflow: ${workflowName}`, parameters);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        ...parameters,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`n8n workflow error (${response.status}):`, errorText);
      return {
        success: false,
        error: `Workflow execution failed: ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('n8n workflow call error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Map tool names to n8n workflow names
 */
export const TOOL_TO_WORKFLOW_MAP: Record<string, string> = {
  // Calendar workflows
  list_calendar_events: 'google-calendar-list-events',
  create_calendar_event: 'google-calendar-create-event',
  update_calendar_event: 'google-calendar-update-event',
  delete_calendar_event: 'google-calendar-delete-event',
  
  // Task workflows
  list_tasks: 'google-tasks-list-tasks',
  create_task: 'google-tasks-create-task',
  update_task: 'google-tasks-update-task',
  complete_task: 'google-tasks-complete-task',
  
  // Notion workflows
  query_notion_database: 'notion-query-database',
  create_notion_page: 'notion-create-page',
  update_notion_page: 'notion-update-page',
  append_notion_blocks: 'notion-append-blocks',
  get_notion_page: 'notion-get-page',
};

/**
 * Execute a tool by calling the corresponding n8n workflow
 */
export async function executeTool(
  toolName: string,
  parameters: Record<string, any>,
  userId: string
): Promise<N8nWorkflowResult> {
  const workflowName = TOOL_TO_WORKFLOW_MAP[toolName];
  
  if (!workflowName) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
    };
  }
  
  return callN8nWorkflow(workflowName, parameters, userId);
}


