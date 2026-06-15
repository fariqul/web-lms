/**
 * API Helper for backend requests
 * Uses NEXT_PUBLIC_API_URL environment variable to route to correct backend
 */

// Get API base URL from environment variable
// Defaults to empty string for same-origin requests (fallback)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Get full API URL for a given endpoint
 * @param endpoint - API endpoint (e.g., '/api/health' or 'api/health' or '/login')
 * @returns Full URL to API endpoint
 * 
 * Examples:
 * - getApiUrl('/api/health') → 'https://api.libelslms.my.id/api/health'
 * - getApiUrl('/login') → 'https://api.libelslms.my.id/api/login' (auto-adds /api)
 * - getApiUrl('health') → 'https://api.libelslms.my.id/api/health'
 */
export function getApiUrl(endpoint: string): string {
  // Ensure endpoint starts with /
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // If endpoint doesn't start with /api, prepend it
  if (!cleanEndpoint.startsWith('/api/')) {
    cleanEndpoint = `/api${cleanEndpoint}`;
  }
  
  // If no base URL configured, return endpoint as-is (same-origin request)
  if (!API_BASE_URL) {
    return cleanEndpoint;
  }
  
  // Return full URL with base
  return `${API_BASE_URL}${cleanEndpoint}`;
}

/**
 * Make authenticated API request
 * @param endpoint - API endpoint
 * @param options - Fetch options
 * @returns Fetch response
 */
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  
  return fetch(getApiUrl(endpoint), {
    ...options,
    headers,
  });
}

/**
 * Make authenticated GET request
 */
export async function apiGet(endpoint: string, options: RequestInit = {}): Promise<Response> {
  return apiRequest(endpoint, { ...options, method: 'GET' });
}

/**
 * Make authenticated POST request
 */
export async function apiPost(endpoint: string, data?: any, options: RequestInit = {}): Promise<Response> {
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Make authenticated PUT request
 */
export async function apiPut(endpoint: string, data?: any, options: RequestInit = {}): Promise<Response> {
  return apiRequest(endpoint, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Make authenticated DELETE request
 */
export async function apiDelete(endpoint: string, options: RequestInit = {}): Promise<Response> {
  return apiRequest(endpoint, { ...options, method: 'DELETE' });
}
