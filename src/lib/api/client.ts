import axios, { AxiosInstance, type AxiosError } from 'axios';
import { toast } from 'sonner';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import {
  Floor,
  FloorCreate,
  FloorUpdate,
  Waypoint,
  WaypointCreate,
  WaypointUpdate,
  Connection,
  ConnectionCreate,
  Room,
  RoomCreate,
  RoomUpdate,
  NavigationRequest,
  NavigationResponse,
  MapAuditResponse,
  Kiosk,
  KioskCreate,
  KioskUpdate,
} from './types';

const API_URL_KEY = 'university_nav_api_url';
const ADMIN_TOKEN_KEY = 'university_nav_admin_token';

const normalizeApiUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return config.apiUrl;
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/api$/, '');
  return url;
};

const ensureArray = <T>(data: unknown, label: string): T[] => {
  if (Array.isArray(data)) return data as T[];
  const error = new Error(`Invalid ${label} response: expected array`);
  logger.apiError(label, error);
  throw error;
};

/**
 * Get API URL from storage or use default from config
 */
export const getApiUrl = (): string => {
  const stored = sessionStorage.getItem(API_URL_KEY) || localStorage.getItem(API_URL_KEY);
  return normalizeApiUrl(stored || config.apiUrl);
};

/**
 * Set API URL in storage
 */
export const setApiUrl = (url: string): void => {
  const normalized = normalizeApiUrl(url);
  sessionStorage.setItem(API_URL_KEY, normalized);
  localStorage.setItem(API_URL_KEY, normalized);
};

/**
 * Get admin token from sessionStorage (more secure than localStorage)
 * TODO: Move to httpOnly cookies for production
 */
export const getAdminToken = (): string => {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
};

/**
 * Set admin token in sessionStorage
 * Note: sessionStorage is cleared when tab closes (better security)
 */
export const setAdminToken = (token: string): void => {
  const trimmed = token.trim();
  if (!trimmed) {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    return;
  }
  sessionStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
};

const createClient = (): AxiosInstance => {
  const adminToken = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  const client = axios.create({
    baseURL: getApiUrl(),
    headers,
    timeout: 30000,
  });

  // Response interceptor for centralized error handling
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const status = error.response?.status;
      logger.apiError(error.config?.url || 'unknown', error);

      if (status === 401) {
        toast.error('Autentifikatsiya xatosi');
        setAdminToken('');
      } else if (status === 403) {
        toast.error('Ruxsat yo\'q');
      } else if (status === 404) {
        toast.error('Topilmadi');
      } else if (status && status >= 500) {
        toast.error('Server xatosi');
      } else if (error.message === 'Network Error') {
        toast.error('Internet ulanishi yo\'q');
      }

      return Promise.reject(error);
    }
  );

  return client;
};

// Floors API
export const floorsApi = {
  getAll: async (skip = 0, limit = 100): Promise<Floor[]> => {
    const { data } = await createClient().get(`/api/floors/`, { params: { skip, limit } });
    return ensureArray<Floor>(data, 'floors.getAll');
  },

  getOne: async (id: number): Promise<Floor> => {
    const { data } = await createClient().get(`/api/floors/${id}`);
    return data;
  },

  create: async (floor: FloorCreate): Promise<Floor> => {
    const { data } = await createClient().post(`/api/floors/`, floor);
    return data;
  },

  update: async (id: number, floor: FloorUpdate): Promise<Floor> => {
    const { data } = await createClient().put(`/api/floors/${id}`, floor);
    return data;
  },

  delete: async (id: number): Promise<string> => {
    const { data } = await createClient().delete(`/api/floors/${id}`);
    return data;
  },

  uploadImage: async (id: number, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await createClient().post(`/api/floors/${id}/upload-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};

// Waypoints API
export const waypointsApi = {
  getByFloor: async (floorId: number): Promise<Waypoint[]> => {
    const { data } = await createClient().get(`/api/waypoints/floor/${floorId}`);
    return ensureArray<Waypoint>(data, 'waypoints.getByFloor');
  },

  getOne: async (id: string): Promise<Waypoint> => {
    const { data } = await createClient().get(`/api/waypoints/${id}`);
    return data;
  },

  create: async (waypoint: WaypointCreate): Promise<Waypoint> => {
    const { data } = await createClient().post(`/api/waypoints/`, waypoint);
    return data;
  },

  createBatch: async (waypoints: WaypointCreate[]): Promise<Waypoint[]> => {
    const { data } = await createClient().post(`/api/waypoints/batch`, waypoints);
    return ensureArray<Waypoint>(data, 'waypoints.createBatch');
  },

  update: async (id: string, waypoint: WaypointUpdate): Promise<Waypoint> => {
    const { data } = await createClient().put(`/api/waypoints/${id}`, waypoint);
    return data;
  },

  delete: async (id: string): Promise<string> => {
    const { data } = await createClient().delete(`/api/waypoints/${id}`);
    return data;
  },
};

// Connections API
export const connectionsApi = {
  getByFloor: async (floorId: number): Promise<Connection[]> => {
    const { data } = await createClient().get(`/api/waypoints/connections/floor/${floorId}`);
    return ensureArray<Connection>(data, 'connections.getByFloor');
  },

  create: async (connection: ConnectionCreate): Promise<Connection> => {
    const { data } = await createClient().post(`/api/waypoints/connections`, connection);
    return data;
  },

  createBatch: async (connections: ConnectionCreate[]): Promise<Connection[]> => {
    const { data } = await createClient().post(`/api/waypoints/connections/batch`, connections);
    return ensureArray<Connection>(data, 'connections.createBatch');
  },

  delete: async (id: string): Promise<string> => {
    const { data } = await createClient().delete(`/api/waypoints/connections/${id}`);
    return data;
  },
};

// Rooms API
export const roomsApi = {
  getAll: async (skip = 0, limit = 1000): Promise<Room[]> => {
    const { data } = await createClient().get(`/api/rooms/`, { params: { skip, limit } });
    return ensureArray<Room>(data, 'rooms.getAll');
  },

  getByFloor: async (floorId: number): Promise<Room[]> => {
    const { data } = await createClient().get(`/api/rooms/floor/${floorId}`);
    return ensureArray<Room>(data, 'rooms.getByFloor');
  },

  search: async (query: string): Promise<Room[]> => {
    const { data } = await createClient().get(`/api/rooms/search`, { params: { query } });
    return ensureArray<Room>(data, 'rooms.search');
  },

  getOne: async (id: number): Promise<Room> => {
    const { data } = await createClient().get(`/api/rooms/${id}`);
    return data;
  },

  create: async (room: RoomCreate): Promise<Room> => {
    const { data } = await createClient().post(`/api/rooms/`, room);
    return data;
  },

  update: async (id: number | string, room: RoomUpdate): Promise<Room> => {
    const { data } = await createClient().put(`/api/rooms/${id}`, room);
    return data;
  },

  delete: async (id: number): Promise<string> => {
    const { data } = await createClient().delete(`/api/rooms/${id}`);
    return data;
  },
};

// Navigation API
export const navigationApi = {
  findPath: async (request: NavigationRequest): Promise<NavigationResponse> => {
    const { data } = await createClient().post(`/api/navigation/find-path`, request);
    return data;
  },

  getNearbyRooms: async (waypointId: string, radius = 100): Promise<Room[]> => {
    const { data } = await createClient().get(`/api/navigation/nearby-rooms/${waypointId}`, {
      params: { radius },
    });
    return ensureArray<Room>(data, 'navigation.getNearbyRooms');
  },

  audit: async (): Promise<MapAuditResponse> => {
    const { data } = await createClient().get(`/api/navigation/audit`);
    return data;
  },
};

// Kiosks CRUD API (Admin)
export const kiosksApi = {
  getAll: async (): Promise<Kiosk[]> => {
    const { data } = await createClient().get(`/api/kiosks/`);
    return ensureArray<Kiosk>(data, 'kiosks.getAll');
  },

  getById: async (id: number): Promise<Kiosk> => {
    const { data } = await createClient().get(`/api/kiosks/${id}`);
    return data;
  },

  create: async (kiosk: KioskCreate): Promise<Kiosk> => {
    const { data } = await createClient().post(`/api/kiosks/`, kiosk);
    return data;
  },

  update: async (id: number, kiosk: KioskUpdate): Promise<Kiosk> => {
    const { data } = await createClient().put(`/api/kiosks/${id}`, kiosk);
    return data;
  },

  delete: async (id: number): Promise<string> => {
    const { data } = await createClient().delete(`/api/kiosks/${id}`);
    return data;
  },
};

// Health check
export const healthCheck = async (): Promise<boolean> => {
  try {
    await createClient().get('/health');
    return true;
  } catch {
    return false;
  }
};
