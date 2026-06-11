import { Platform } from 'react-native';
import { authStorage } from './auth';

// --- CONNECTION CONFIGURATION FOR PHYSICAL DEVICES ---
// If running on a physical iPhone/Android device via Expo Go, replace 'localhost'
// with your computer's local IP address (e.g., '192.168.1.50') and make sure both
// devices are connected to the same Wi-Fi network.
const LOCALHOST = Platform.OS === 'web' ? 'localhost' : '192.168.14.78';
export const API_BASE_URL = `http://${LOCALHOST}:8000`;

type UnauthorizedCallback = () => void;
let unauthorizedCallback: UnauthorizedCallback | null = null;

export function registerUnauthorizedCallback(cb: UnauthorizedCallback) {
  unauthorizedCallback = cb;
}

// Attempt a silent token refresh. Returns the new access token or null on failure.
async function tryRefreshToken(): Promise<string | null> {
  try {
    const refreshToken = await authStorage.getRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${API_BASE_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.access_token) {
      await authStorage.saveToken(data.access_token);
      if (data.refresh_token) {
        await authStorage.saveRefreshToken(data.refresh_token);
      }
      console.log('[Auth] Token silently refreshed.');
      return data.access_token;
    }
    return null;
  } catch (err) {
    console.warn('[Auth] Silent token refresh failed:', err);
    return null;
  }
}

let _isRefreshing = false;
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, options);

  if (response.status === 401) {
    // Avoid re-entrant refresh loops (e.g., the /refresh call itself returning 401)
    if (!_isRefreshing && !url.includes('/refresh') && !url.includes('/login')) {
      _isRefreshing = true;
      try {
        const newToken = await tryRefreshToken();
        if (newToken) {
          // Retry the original request with the new token
          const retryOptions: RequestInit = {
            ...options,
            headers: {
              ...(options.headers as Record<string, string> || {}),
              'Authorization': `Bearer ${newToken}`,
            },
          };
          _isRefreshing = false;
          return await fetch(url, retryOptions);
        }
      } finally {
        _isRefreshing = false;
      }
    }
    // Refresh failed or not applicable — call the force-logout callback
    if (unauthorizedCallback) {
      unauthorizedCallback();
    }
  }

  return response;
}

function handleRequestError(endpoint: string, error: any) {
  console.warn(`[API Connection Error] Failed to call: ${endpoint}`);
  console.warn(
    `💡 Connection tip: If you are running on a physical phone, 'localhost' resolves to the phone itself. ` +
    `Update 'LOCALHOST' in src/services/api.ts to your Mac's local IP address (e.g., 192.168.X.X) and ensure ` +
    `both devices are on the same Wi-Fi. Current Base URL is: ${API_BASE_URL}`
  );
}

export interface SOSResponse {
  status: string;
  sos_id: number;
  source: string;
  recipient_contacts_count: number;
  sms_simulated: boolean;
  whatsapp_simulated: boolean;
  fallback_payload: {
    message: string;
    contacts: string[];
  };
}

export interface CommandLine {
  id: number;
  state: string;
  lga: string;
  facility_name: string;
  facility_type: string;
  phone_number: string;
}

export interface Journey {
  id: number;
  start_location: string;
  destination: string;
  emergency_contact_phone: string;
  duration_minutes: number;
  license_plate?: string;
  watcher_type?: string;
  watcher_id?: number;
  is_active: boolean;
  started_at: string;
}

export interface SOSActiveInfo {
  id: number;
  user_id: number;
  status: string;
  trigger_source: string;
  triggered_at: string;
}

// Helper to construct authenticated headers
async function getAuthHeaders(contentType: string | null = 'application/json'): Promise<HeadersInit> {
  const token = await authStorage.getToken();
  const headers: Record<string, string> = {};

  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export const apiService = {
  async addContact(data: { name: string; phone_number: string; relation?: string }): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/contacts/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to add contact');
    }
    return await response.json();
  },

  async getContacts(): Promise<any[]> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/contacts/list`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to fetch contacts');
    }
    return await response.json();
  },

  async updateContact(contactId: number, data: { name: string; phone_number: string; relation?: string }): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/contacts/${contactId}/update`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to update contact');
    }
    return await response.json();
  },

  async deleteContact(contactId: number): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/contacts/${contactId}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to delete contact');
    }
    return await response.json();
  },

  async triggerSOS(lat: number | null, lng: number | null, source: string = 'button'): Promise<SOSResponse> {
    try {
      const headers = await getAuthHeaders();
      const response = await apiFetch(`${API_BASE_URL}/sos/trigger`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          location_lat: lat,
          location_lng: lng,
          trigger_source: source,
        }),
      });
      if (!response.ok) {
        throw new Error('API server returned error');
      }
      return await response.json();
    } catch (error) {
      handleRequestError('/sos/trigger', error);
      throw error;
    }
  },

  async getCommandLines(state?: string, lga?: string): Promise<CommandLine[]> {
    try {
      let url = `${API_BASE_URL}/emergency/command-lines`;
      const params = new URLSearchParams();
      if (state) params.append('state', state);
      if (lga) params.append('lga', lga);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await apiFetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch command lines');
      }
      return await response.json();
    } catch (error) {
      handleRequestError('/emergency/command-lines', error);
      throw error;
    }
  },

  async startJourney(data: {
    start_location: string;
    destination: string;
    emergency_contact_phone?: string;
    duration_minutes: number;
    license_plate?: string;
    watcher_type?: 'member' | 'circle';
    watcher_id?: number;
  }): Promise<Journey> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/journey/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to start journey');
    }
    return await response.json();
  },

  async detectLicensePlate(photoUri: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        const token = await authStorage.getToken();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}/ocr/detect`);

        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (err) {
              reject(new Error(`Failed to parse OCR response: ${xhr.responseText}`));
            }
          } else {
            reject(new Error(`OCR failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network connection error during license plate scan'));
        };

        const formData = new FormData();
        const filename = photoUri.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        let formattedUri = photoUri;
        if (Platform.OS === 'android' && !photoUri.startsWith('file://') && !photoUri.startsWith('content://')) {
          formattedUri = `file://${photoUri}`;
        }

        formData.append('photo', {
          uri: formattedUri,
          name: filename,
          type,
        } as any);

        xhr.send(formData);
      } catch (error) {
        handleRequestError('/ocr/detect', error);
        reject(error);
      }
    });
  },

  async uploadVehiclePhoto(journeyId: number, photoUri: string, licensePlateText?: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        const token = await authStorage.getToken();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}/journey/vehicle-photo?journey_id=${journeyId}`);

        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (err) {
              reject(new Error(`Failed to parse upload response: ${xhr.responseText}`));
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network connection error during file upload'));
        };

        const formData = new FormData();
        const filename = photoUri.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        // Ensure file path is correctly formatted for Android if needed
        let formattedUri = photoUri;
        if (Platform.OS === 'android' && !photoUri.startsWith('file://') && !photoUri.startsWith('content://')) {
          formattedUri = `file://${photoUri}`;
        }

        formData.append('photo', {
          uri: formattedUri,
          name: filename,
          type,
        } as any);

        if (licensePlateText) {
          formData.append('license_plate', licensePlateText);
        }

        xhr.send(formData);
      } catch (error) {
        handleRequestError('/journey/vehicle-photo', error);
        reject(error);
      }
    });
  },

  async updateProfile(data: { full_name?: string; phone_number?: string }): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/user/update`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to update profile');
    }
    return await response.json();
  },

  async deleteAccount(): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/user/delete`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to delete account');
    }
    return await response.json();
  },

  async createCircle(data: { name: string; category: string; role: string }): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/circles/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to create circle');
    }
    return await response.json();
  },

  async joinCircle(data: { invite_code: string; role: string }): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/circles/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to join circle');
    }
    return await response.json();
  },

  async getMyCircles(): Promise<any[]> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/circles/my`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to fetch circles');
    }
    return await response.json();
  },

  async leaveCircle(circleId: number): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/circles/${circleId}/leave`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to leave circle');
    }
    return await response.json();
  },

  async getNotifications(): Promise<any[]> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/notifications`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }
    return await response.json();
  },

  async markNotificationRead(id: number): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to mark notification as read');
    }
    return await response.json();
  },

  async markAllNotificationsRead(): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to mark all notifications as read');
    }
    return await response.json();
  },

  async inviteToCircle(circleId: number, emailOrPhone: string, role: string = 'Member'): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/circles/${circleId}/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        recipient_email_or_phone: emailOrPhone,
        role,
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to send invite');
    }
    return await response.json();
  },

  async getActiveWatchedJourneys(): Promise<any[]> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/journey/active-watched`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to fetch active watched journeys');
    }
    return await response.json();
  },

  async registerPushToken(pushToken: string): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/users/push-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ push_token: pushToken }),
    });
    if (!response.ok) {
      throw new Error('Failed to register push token');
    }
    return await response.json();
  },

  // --- Session State Recovery ---

  async getActiveSOS(): Promise<SOSActiveInfo | null> {
    try {
      const headers = await getAuthHeaders();
      const response = await apiFetch(`${API_BASE_URL}/sos/active`, {
        method: 'GET',
        headers,
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data || null;
    } catch (err) {
      console.warn('[API] getActiveSOS failed:', err);
      return null;
    }
  },

  async resolveSOS(): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/sos/resolve`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to resolve SOS');
    }
    return await response.json();
  },

  async getMyActiveJourney(): Promise<Journey | null> {
    try {
      const headers = await getAuthHeaders();
      const response = await apiFetch(`${API_BASE_URL}/journey/my-active`, {
        method: 'GET',
        headers,
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data || null;
    } catch (err) {
      console.warn('[API] getMyActiveJourney failed:', err);
      return null;
    }
  },

  async endJourney(): Promise<any> {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_BASE_URL}/journey/end`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to end journey');
    }
    return await response.json();
  },
};

