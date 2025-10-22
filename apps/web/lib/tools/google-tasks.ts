import { google } from 'googleapis';
import { getGoogleOAuth2Client } from '../google-auth';

// Small helper to prevent hanging requests
async function withTimeout<T>(
  promise: Promise<T>,
  ms = Number(process.env.GTASKS_TIMEOUT_MS ?? 15000),
  errorMessage = 'Google Tasks request timed out',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), Math.max(1000, ms));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getTasksClient(userId: string) {
  const oauth2Client = await getGoogleOAuth2Client(userId);
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

export async function listTasks(
  userId: string,
  params: {
    task_list_id?: string;
    include_completed?: boolean;
    include_notes?: boolean;
    max_results?: number;
    page_token?: string;
  }
): Promise<any> {
  try {
    const tasks = await getTasksClient(userId);

    // Resolve task list (default to primary to avoid extra roundtrip)
    const taskListId = params.task_list_id || '@default';

    // Token-safe shaping
    const envMax = Number(process.env.GTASKS_MAX_TASKS ?? 50);
    const maxResults = Math.max(
      1,
      Math.min(envMax, params.max_results != null ? Number(params.max_results) || 0 : 20),
    );
    const includeCompleted = !!params.include_completed; // default false
    const includeNotes = !!params.include_notes; // default false

    const response = await withTimeout(
      tasks.tasks.list({
        tasklist: taskListId,
        showCompleted: includeCompleted,
        showHidden: false,
        maxResults: Math.min(maxResults, 100),
        pageToken: params.page_token,
        // Request only what we might return
        fields: 'items(id,title,notes,status,due,completed,parent),nextPageToken',
      }),
    );

    const items = response.data.items || [];
    const sanitized = items.slice(0, maxResults).map((task) => {
      const out: any = {
        id: task.id,
        title: task.title,
        status: task.status,
        due: task.due,
      };
      if (includeNotes && task.notes) out.notes = task.notes;
      if (task.completed) out.completed = task.completed;
      if (task.parent) out.parent = task.parent;
      return out;
    });

    return {
      success: true,
      tasks: sanitized,
      count: items.length,
      returned: sanitized.length,
      truncated: items.length > sanitized.length,
      next_page_token: response.data.nextPageToken || null,
    };
  } catch (error: any) {
    console.error('Error listing tasks:', error);
    return {
      success: false,
      error: error.message || 'Failed to list tasks',
    };
  }
}

export async function createTask(
  userId: string,
  params: {
    title: string;
    due_date?: string;
    notes?: string;
    parent_task_id?: string;
  }
): Promise<any> {
  try {
    const tasks = await getTasksClient(userId);

    const taskListId = '@default';

    const task: any = {
      title: params.title,
      notes: params.notes,
      due: params.due_date,
    };

    const response = await withTimeout(
      tasks.tasks.insert({
        tasklist: taskListId,
        parent: params.parent_task_id,
        requestBody: task,
        fields: 'id,title,status,due,completed,parent',
      }),
    );

    return {
      success: true,
      task: {
        id: response.data.id,
        title: response.data.title,
        status: response.data.status,
        due: response.data.due,
      },
      message: 'Task created successfully',
    };
  } catch (error: any) {
    console.error('Error creating task:', error);
    return {
      success: false,
      error: error.message || 'Failed to create task',
    };
  }
}

export async function updateTask(
  userId: string,
  params: {
    task_id: string;
    title?: string;
    due_date?: string;
    notes?: string;
    status?: 'needsAction' | 'completed';
  }
): Promise<any> {
  try {
    const tasks = await getTasksClient(userId);

    const taskListId = '@default';

    // Use patch to avoid an extra GET and only change provided fields
    const requestBody: any = {};
    if (params.title !== undefined) requestBody.title = params.title;
    if (params.notes !== undefined) requestBody.notes = params.notes;
    if (params.due_date !== undefined) requestBody.due = params.due_date;
    if (params.status !== undefined) requestBody.status = params.status;

    const response = await withTimeout(
      tasks.tasks.patch({
        tasklist: taskListId,
        task: params.task_id,
        requestBody,
        fields: 'id,title,status,due,completed,parent',
      }),
    );

    return {
      success: true,
      task: {
        id: response.data.id,
        title: response.data.title,
        status: response.data.status,
        due: response.data.due,
      },
      message: 'Task updated successfully',
    };
  } catch (error: any) {
    console.error('Error updating task:', error);
    return {
      success: false,
      error: error.message || 'Failed to update task',
    };
  }
}

export async function completeTask(
  userId: string,
  params: {
    task_id: string;
  }
): Promise<any> {
  try {
    const tasks = await getTasksClient(userId);

    const taskListId = '@default';

    // Patch minimal fields to mark as completed
    const response = await withTimeout(
      tasks.tasks.patch({
        tasklist: taskListId,
        task: params.task_id,
        requestBody: {
          status: 'completed',
          completed: new Date().toISOString(),
        },
        fields: 'id,title,status,completed,parent',
      }),
    );

    return {
      success: true,
      task: {
        id: response.data.id,
        title: response.data.title,
        status: response.data.status,
        completed: response.data.completed,
      },
      message: 'Task marked as complete',
    };
  } catch (error: any) {
    console.error('Error completing task:', error);
    return {
      success: false,
      error: error.message || 'Failed to complete task',
    };
  }
}

