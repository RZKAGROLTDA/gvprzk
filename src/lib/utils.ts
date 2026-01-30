import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a date string (YYYY-MM-DD or ISO) preserving the local date
 * without timezone conversion issues.
 * 
 * This fixes the common issue where "2025-01-30" gets interpreted as
 * UTC midnight, which then becomes "2025-01-29" in timezones behind UTC.
 */
export function parseLocalDate(dateStr: string | Date | null | undefined): Date {
  if (!dateStr) return new Date();
  
  if (dateStr instanceof Date) return dateStr;
  
  // If it's a full ISO string with time, use it directly
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  
  // For date-only strings (YYYY-MM-DD), parse components to avoid timezone shift
  const [year, month, day] = dateStr.split('-').map(Number);
  if (year && month && day) {
    // Month is 0-indexed in Date constructor
    return new Date(year, month - 1, day);
  }
  
  // Fallback
  return new Date(dateStr);
}

/**
 * Format a date to YYYY-MM-DD string using local date components.
 * This avoids timezone issues that can occur with toISOString().
 */
export function formatDateToLocal(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  const d = date instanceof Date ? date : parseLocalDate(date);
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Format a date for display in pt-BR format (dd/MM/yyyy)
 * using local date components to avoid timezone shift.
 */
export function formatDateDisplay(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  const d = date instanceof Date ? date : parseLocalDate(date);
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
}
