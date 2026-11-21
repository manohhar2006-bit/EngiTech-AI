/**
 * EngiTrace Frontend Configuration
 * Centralized configuration source for API Base URL and application environment flags.
 */

export const API_BASE_URL: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:4000/api/v1';
