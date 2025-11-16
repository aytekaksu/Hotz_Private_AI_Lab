import { google } from 'googleapis';
import { getGoogleOAuth2Client } from '../google-auth';

async function getCalendarClient(userId: string) {
  const oauth2Client = await getGoogleOAuth2Client(userId);
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

type ListEventsParams = {
  // Preferred window filters (RFC3339 or YYYY-MM-DD); falling back to legacy names
  start_date?: string;
  end_date?: string;
  start?: string;
  end?: string;
  calendar_id?: string;

  // Output shaping controls (defaults keep output small)
  max_results?: number;           // default 100, hard cap by GCAL_MAX_EVENTS/env
  include_description?: boolean;  // default false
  include_location?: boolean;     // default false
  include_attendees?: boolean;    // default false
  include_link?: boolean;         // default false
  truncate_description?: number;  // default from env GCAL_MAX_EVENT_DESCRIPTION

  // Pagination support
  page_token?: string;
};

function normalizeDateValue(value: string | undefined, fallbackTime: 'start' | 'end'): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();

  // If the value is a plain date (YYYY-MM-DD), append a time so Google accepts it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return fallbackTime === 'start'
      ? `${trimmed}T00:00:00Z`
      : `${trimmed}T23:59:59Z`;
  }

  // Try to parse other formats and convert to ISO string.
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return fallbackTime === 'end'
      ? new Date(parsed.getTime()).toISOString()
      : parsed.toISOString();
  }

  // Assume caller already provided an RFC3339 string.
  return trimmed;
}

export async function listCalendarEvents(userId: string, params: ListEventsParams): Promise<any> {
  try {
    const calendar = await getCalendarClient(userId);
    const timeMin = normalizeDateValue(params.start_date ?? params.start, 'start');
    const timeMax = normalizeDateValue(params.end_date ?? params.end, 'end');
    const envMaxEvents = Number(process.env.GCAL_MAX_EVENTS ?? 100);
    const requestedMax = params.max_results != null ? Number(params.max_results) || 0 : envMaxEvents;
    const maxEvents = Math.max(1, Math.min(envMaxEvents, requestedMax));
    const maxDescriptionLength = Number(
      params.truncate_description ?? process.env.GCAL_MAX_EVENT_DESCRIPTION ?? 140,
    );

    const includeDescription = !!params.include_description;
    const includeLocation = !!params.include_location;
    const includeAttendees = !!params.include_attendees;
    const includeLink = !!params.include_link;

    // Ask Google only for fields we potentially return.
    const itemSubfields: string[] = [
      'id',
      'summary',
      'start',
      'end',
    ];
    if (includeDescription) itemSubfields.push('description');
    if (includeLocation) itemSubfields.push('location');
    if (includeAttendees) itemSubfields.push('attendees/email');
    if (includeLink) itemSubfields.push('htmlLink');
    const fields = `items(${itemSubfields.join(',')}),nextPageToken`;
    
    const response = await calendar.events.list({
      calendarId: params.calendar_id || 'primary',
      timeMin: timeMin ?? undefined,
      timeMax: timeMax ?? undefined,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: Math.min(maxEvents, 250),
      pageToken: params.page_token,
      fields,
    });
    
    const events = (response.data.items || []).filter(event => {
      const startValue = event.start?.dateTime || event.start?.date;
      if (!startValue) return true;
      const startTime = new Date(startValue).getTime();
      const minTime = timeMin ? new Date(timeMin).getTime() : undefined;
      const maxTime = timeMax ? new Date(timeMax).getTime() : undefined;
      if (Number.isNaN(startTime)) return true;
      if (minTime !== undefined && startTime < minTime) return false;
      if (maxTime !== undefined && startTime > maxTime) return false;
      return true;
    });
    
    const limitedEvents = events.slice(0, maxEvents);
    const sanitizedEvents = limitedEvents.map(event => {
      const out: any = {
        id: event.id,
        title: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
      };
      if (includeDescription) {
        const description = event.description || '';
        const trimmedDescription =
          description.length > maxDescriptionLength
            ? `${description.slice(0, maxDescriptionLength)}…`
            : description;
        if (trimmedDescription) out.description = trimmedDescription;
      }
      if (includeLocation && event.location) out.location = event.location;
      if (includeAttendees && event.attendees) out.attendees = event.attendees.map(a => a.email);
      if (includeLink && event.htmlLink) out.htmlLink = event.htmlLink;
      return out;
    });
    
    return {
      success: true,
      events: sanitizedEvents,
      count: events.length,
      returned: sanitizedEvents.length,
      truncated: events.length > sanitizedEvents.length,
      next_page_token: response.data.nextPageToken || null,
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
