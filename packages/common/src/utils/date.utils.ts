import { format } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Formats a date object to a localized date string
 * @param date The date to format
 * @returns Formatted date string in German format (dd.MM.yyyy)
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formats a date object to a localized time string
 * @param date The date to format
 * @returns Formatted time string in German format (HH:mm)
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Formats a date object to a localized date and time string
 * @param date The date to format
 * @returns Formatted date and time string
 */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Converts a month number (1-12) to its German name
 * @param monthNumber The month number (1 = January, 12 = December)
 * @returns The German month name
 */
export function getGermanMonth(monthNumber: number): string {
  const months = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];

  // Validate month is in range 1-12
  if (monthNumber < 1 || monthNumber > 12) {
    return 'Ungültiger Monat';
  }

  return months[monthNumber - 1] as string; // Adjust for zero-based array
}

/**
 * Formats a day and month in German style (e.g., "1. Mai")
 * Alias for formatGermanDateFromNumbers for backward compatibility
 * @param day The day of the month
 * @param month The month number (1-12)
 * @returns Formatted date string in German style with month name
 */
export function formatGermanDate(day: number | undefined, month: number | undefined): string {
  if (day === undefined || month === undefined) {
    return 'Unbekannt';
  }

  return `${day}. ${getGermanMonth(month)}`;
}

/**
 * Formats a date to ISO format for input fields (yyyy-MM-dd)
 * @param date The date to format
 * @returns The date in ISO format (yyyy-MM-dd)
 */
export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date for a calendar's display
 * @param date The date to format
 * @returns The date in German format (dd.MM.yyyy)
 */
export function formatCalendarDate(date: Date): string {
  return formatDate(date);
}

/**
 * Formats a date to German long format with day name (e.g., "Montag, 1. Januar 2024")
 * @param date The date to format
 * @returns Formatted date string with German day and month names
 */
export function formatGermanLongDate(date: Date): string {
  return format(date, 'EEEE, d. MMMM yyyy', { locale: de });
}

/**
 * Extracts time from ISO string in HH:mm format
 * @param isoString The ISO datetime string to extract time from
 * @returns Time string in HH:mm format, or empty string if invalid
 */
export function extractTime(isoString?: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return format(date, 'HH:mm');
  } catch {
    return '';
  }
}
