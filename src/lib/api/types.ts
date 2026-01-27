// API Types for University Navigation

export type WaypointType = 'hallway' | 'room' | 'stairs' | 'elevator' | 'hall';

export interface Floor {
  id: number;
  name: string;
  floor_number: number;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  created_at: string;
}

export interface FloorCreate {
  name: string;
  floor_number: number;
  image_url?: string | null;
  image_width?: number | null;
  image_height?: number | null;
}

export interface FloorUpdate {
  name?: string | null;
  floor_number?: number | null;
  image_url?: string | null;
  image_width?: number | null;
  image_height?: number | null;
}

export interface Waypoint {
  id: string;
  floor_id: number;
  x: number;
  y: number;
  type: WaypointType;
  label: string | null;
  connects_to_floor: number | null;
  connects_to_waypoint: string | null;
}

export interface WaypointCreate {
  id: string;
  floor_id: number;
  x: number;
  y: number;
  type: WaypointType;
  label?: string | null;
  connects_to_floor?: number | null;
  connects_to_waypoint?: string | null;
}

export interface WaypointUpdate {
  x?: number | null;
  y?: number | null;
  type?: WaypointType | null;
  label?: string | null;
  connects_to_floor?: number | null;
  connects_to_waypoint?: string | null;
}

export interface Connection {
  id: string;
  from_waypoint_id: string;
  to_waypoint_id: string;
  distance: number;
}

export interface ConnectionCreate {
  id?: string;
  from_waypoint_id: string;
  to_waypoint_id: string;
  distance: number;
}

export interface Room {
  id: number;
  name: string;
  waypoint_id: string | null;
  floor_id: number | null;
}

export interface RoomCreate {
  name: string;
  waypoint_id?: string | null;
  floor_id?: number | null;
}

export interface RoomUpdate {
  name?: string | null;
  waypoint_id?: string | null;
  floor_id?: number | null;
}

export interface NavigationRequest {
  start_waypoint_id?: string | null;
  start_room_id?: number | null;
  end_waypoint_id?: string | null;
  end_room_id?: number | null;
  kiosk_id?: number | null;
}

export interface PathStep {
  waypoint_id: string;
  floor_id: number;
  x: number;
  y: number;
  type: string;
  label: string | null;
  instruction: string | null;
}

export interface NavigationResponse {
  path: PathStep[];
  total_distance: number;
  floor_changes: number;
  estimated_time_minutes: number;
}

// Kiosk Types - Backend model: { id:number, name:string, floor_id:number, waypoint_id:string, description?:string }
export interface Kiosk {
  id: number;
  name: string;
  floor_id: number;
  waypoint_id: string | null;
  description?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface KioskCreate {
  name: string;
  floor_id: number;
  waypoint_id?: string | null;
  description?: string | null;
}

export interface KioskUpdate {
  name?: string | null;
  floor_id?: number | null;
  waypoint_id?: string | null;
  description?: string | null;
}

export interface ApiError {
  detail: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
  }>;
}
