import { google } from 'googleapis';
import { getGoogleOAuth2Client } from '../google-auth';

async function getCalendarClient(userId: string) {
  const oauth2Client = await getGoogleOAuth2Client(userId);
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export async function listCalendarEvents(
  userId: string,
  params: {
    start_date: string;
    end_date: string;
    calendar_id?: string;
  }
): Promise<any> {
  try {
    const calendar = await getCalendarClient(userId);
    
    const response = await calendar.events.list({
      calendarId: params.calendar_id || 'primary',
      timeMin: params.start_date,
      timeMax: params.end_date,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = response.data.items || [];
    
    return {
      success: true,
      events: events.map(event => ({
        id: event.id,
        title: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        description: event.description,
        location: event.location,
        attendees: event.attendees?.map(a => a.email),
        htmlLink: event.htmlLink,
      })),
      count: events.length,
    };
  } catch (error: any) {
    console.error('Error listing calendar events:', error);
    return {
      success: false,
      error: error.message || 'Failed to list calendar events',
    };
  }
}

export async function createCalendarEvent(
  userId: string,
  params: {
    title: string;
    start_time: string;
    end_time: string;
    description?: string;
    attendees?: string[];
    location?: string;
  }
): Promise<any> {
  try {
    const calendar = await getCalendarClient(userId);
    
    const event = {
      summary: params.title,
      description: params.description,
      location: params.location,
      start: {
        dateTime: params.start_time,
        timeZone: 'UTC',
      },
      end: {
        dateTime: params.end_time,
        timeZone: 'UTC',
      },
      attendees: params.attendees?.map(email => ({ email })),
    };
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    
    return {
      success: true,
      event: {
        id: response.data.id,
        title: response.data.summary,
        start: response.data.start?.dateTime,
        end: response.data.end?.dateTime,
        htmlLink: response.data.htmlLink,
      },
      message: 'Event created successfully',
    };
  } catch (error: any) {
    console.error('Error creating calendar event:', error);
    return {
      success: false,
      error: error.message || 'Failed to create calendar event',
    };
  }
}

export async function updateCalendarEvent(
  userId: string,
  params: {
    event_id: string;
    title?: string;
    start_time?: string;
    end_time?: string;
    description?: string;
    location?: string;
  }
): Promise<any> {
  try {
    const calendar = await getCalendarClient(userId);
    
    // First, get the existing event
    const existingEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: params.event_id,
    });
    
    // Update only provided fields
    const updatedEvent: any = {
      ...existingEvent.data,
    };
    
    if (params.title !== undefined) updatedEvent.summary = params.title;
    if (params.description !== undefined) updatedEvent.description = params.description;
    if (params.location !== undefined) updatedEvent.location = params.location;
    if (params.start_time !== undefined) {
      updatedEvent.start = { dateTime: params.start_time, timeZone: 'UTC' };
    }
    if (params.end_time !== undefined) {
      updatedEvent.end = { dateTime: params.end_time, timeZone: 'UTC' };
    }
    
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: params.event_id,
      requestBody: updatedEvent,
    });
    
    return {
      success: true,
      event: {
        id: response.data.id,
        title: response.data.summary,
        start: response.data.start?.dateTime,
        end: response.data.end?.dateTime,
      },
      message: 'Event updated successfully',
    };
  } catch (error: any) {
    console.error('Error updating calendar event:', error);
    return {
      success: false,
      error: error.message || 'Failed to update calendar event',
    };
  }
}

export async function deleteCalendarEvent(
  userId: string,
  params: {
    event_id: string;
  }
): Promise<any> {
  try {
    const calendar = await getCalendarClient(userId);
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: params.event_id,
    });
    
    return {
      success: true,
      message: 'Event deleted successfully',
    };
  } catch (error: any) {
    console.error('Error deleting calendar event:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete calendar event',
    };
  }
}




