import axios, { AxiosInstance } from 'axios';
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
  Kiosk,
  KioskCreate,
  KioskUpdate,
} from './types';

const API_URL_KEY = 'university_nav_api_url';
const DEFAULT_API_URL = 'http://localhost:8000';

export const getApiUrl = (): string => {
  return localStorage.getItem(API_URL_KEY) || DEFAULT_API_URL;
};

export const setApiUrl = (url: string): void => {
  localStorage.setItem(API_URL_KEY, url);
};

const createClient = (): AxiosInstance => {
  return axios.create({
    baseURL: getApiUrl(),
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

// Floors API
export const floorsApi = {
  getAll: async (skip = 0, limit = 100): Promise<Floor[]> => {
    const { data } = await createClient().get(`/api/floors/`, { params: { skip, limit } });
    return data;
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
    return data;
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
    return data;
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
    return data;
  },

  create: async (connection: ConnectionCreate): Promise<Connection> => {
    const { data } = await createClient().post(`/api/waypoints/connections`, connection);
    return data;
  },

  createBatch: async (connections: ConnectionCreate[]): Promise<Connection[]> => {
    const { data } = await createClient().post(`/api/waypoints/connections/batch`, connections);
    return data;
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
    return data;
  },

  getByFloor: async (floorId: number): Promise<Room[]> => {
    const { data } = await createClient().get(`/api/rooms/floor/${floorId}`);
    return data;
  },

  search: async (query: string): Promise<Room[]> => {
    const { data } = await createClient().get(`/api/rooms/search`, { params: { query } });
    return data;
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
    return data;
  },
};

// Kiosks CRUD API (Admin)
export const kiosksApi = {
  getAll: async (): Promise<Kiosk[]> => {
    const { data } = await createClient().get(`/api/kiosks/`);
    return data;
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
