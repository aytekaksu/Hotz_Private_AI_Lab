/**
 * System tools - always available to the LLM
 */

export async function getCurrentDatetime(): Promise<any> {
  try {
    const now = new Date();
    
    // Get timezone info
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timezoneOffset = -now.getTimezoneOffset() / 60;
    const timezoneString = `UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset}`;
    
    // Format date and time
    const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeString = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const monthName = now.toLocaleDateString('en-US', { month: 'long' });
    
    return {
      success: true,
      datetime: {
        iso: now.toISOString(),
        date: dateString,
        time: timeString,
        timezone: timezone,
        timezone_offset: timezoneString,
        day_of_week: dayOfWeek,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        month_name: monthName,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
      },
      formatted: `${dayOfWeek}, ${monthName} ${now.getDate()}, ${now.getFullYear()} at ${timeString} (${timezone}, ${timezoneString})`,
    };
  } catch (error: any) {
    console.error('Error getting current datetime:', error);
    return {
      success: false,
      error: error.message || 'Failed to get current datetime',
    };
  }
}

