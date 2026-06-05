import { Platform } from 'react-native';
import { authStorage } from './auth';

// --- CONNECTION CONFIGURATION FOR PHYSICAL DEVICES ---
// If running on a physical iPhone/Android device via Expo Go, replace 'localhost'
// with your computer's local IP address (e.g., '192.168.1.50') and make sure both
// devices are connected to the same Wi-Fi network.
const LOCALHOST = Platform.OS === 'web' ? 'localhost' : '192.168.43.78';
export const API_BASE_URL = `http://${LOCALHOST}:8000`;

type UnauthorizedCallback = () => void;
let unauthorizedCallback: UnauthorizedCallback | null = null;

export function registerUnauthorizedCallback(cb: UnauthorizedCallback) {
  unauthorizedCallback = cb;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, options);
  if (response.status === 401) {
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
  is_active: boolean;
  started_at: string;
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
      throw new Error('Failed to add contact');
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
    emergency_contact_phone: string;
    duration_minutes: number;
    license_plate?: string;
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

  async uploadVehiclePhoto(journeyId: number, photoUri: string, licensePlateText?: string): Promise<any> {
    try {
      const headers = await getAuthHeaders(null); // Let fetch set boundary for multipart/form-data
      const formData = new FormData();
      formData.append('journey_id', String(journeyId));

      const filename = photoUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      formData.append('photo', {
        uri: photoUri,
        name: filename,
        type,
      } as any);

      if (licensePlateText) {
        formData.append('license_plate', licensePlateText);
      }

      const response = await apiFetch(`${API_BASE_URL}/journey/vehicle-photo?journey_id=${journeyId}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Photo upload failed');
      }
      return await response.json();
    } catch (error) {
      handleRequestError('/journey/vehicle-photo', error);
      throw error;
    }
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
  }
};
