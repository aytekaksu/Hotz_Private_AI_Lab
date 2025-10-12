import { google } from 'googleapis';
import { getDecryptedOAuthCredential } from '../db';

function getTasksClient(userId: string) {
  const credentials = getDecryptedOAuthCredential(userId, 'google');
  if (!credentials) {
    throw new Error('Google account not connected. Please connect in Settings.');
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
    scope: credentials.scope,
    expiry_date: credentials.expiresAt?.getTime(),
  });
  
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

export async function listTasks(
  userId: string,
  params: {
    task_list_id?: string;
  }
): Promise<any> {
  try {
    const tasks = getTasksClient(userId);
    
    // Get the task list ID (use default if not provided)
    let taskListId = params.task_list_id;
    if (!taskListId) {
      const listsResponse = await tasks.tasklists.list();
      taskListId = listsResponse.data.items?.[0]?.id || '@default';
    }
    
    const response = await tasks.tasks.list({
      tasklist: taskListId,
      showCompleted: true,
      showHidden: false,
    });
    
    const taskItems = response.data.items || [];
    
    return {
      success: true,
      tasks: taskItems.map(task => ({
        id: task.id,
        title: task.title,
        notes: task.notes,
        status: task.status,
        due: task.due,
        completed: task.completed,
        parent: task.parent,
      })),
      count: taskItems.length,
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
    const tasks = getTasksClient(userId);
    
    // Get default task list
    const listsResponse = await tasks.tasklists.list();
    const taskListId = listsResponse.data.items?.[0]?.id || '@default';
    
    const task: any = {
      title: params.title,
      notes: params.notes,
      due: params.due_date,
    };
    
    const response = await tasks.tasks.insert({
      tasklist: taskListId,
      parent: params.parent_task_id,
      requestBody: task,
    });
    
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
    const tasks = getTasksClient(userId);
    
    // Get default task list
    const listsResponse = await tasks.tasklists.list();
    const taskListId = listsResponse.data.items?.[0]?.id || '@default';
    
    // Get existing task
    const existingTask = await tasks.tasks.get({
      tasklist: taskListId,
      task: params.task_id,
    });
    
    // Update only provided fields
    const updatedTask: any = {
      ...existingTask.data,
    };
    
    if (params.title !== undefined) updatedTask.title = params.title;
    if (params.notes !== undefined) updatedTask.notes = params.notes;
    if (params.due_date !== undefined) updatedTask.due = params.due_date;
    if (params.status !== undefined) updatedTask.status = params.status;
    
    const response = await tasks.tasks.update({
      tasklist: taskListId,
      task: params.task_id,
      requestBody: updatedTask,
    });
    
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
    const tasks = getTasksClient(userId);
    
    // Get default task list
    const listsResponse = await tasks.tasklists.list();
    const taskListId = listsResponse.data.items?.[0]?.id || '@default';
    
    // Get existing task
    const existingTask = await tasks.tasks.get({
      tasklist: taskListId,
      task: params.task_id,
    });
    
    // Mark as completed
    const updatedTask: any = {
      ...existingTask.data,
      status: 'completed',
      completed: new Date().toISOString(),
    };
    
    const response = await tasks.tasks.update({
      tasklist: taskListId,
      task: params.task_id,
      requestBody: updatedTask,
    });
    
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




