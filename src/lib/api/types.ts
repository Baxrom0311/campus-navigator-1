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
  capacity: number | null;
  building: string | null;
  waypoint_id: string | null;
  floor_id: number;
}

export interface RoomCreate {
  name: string;
  capacity?: number | null;
  building?: string | null;
  waypoint_id?: string | null;
  floor_id: number;
}

export interface RoomUpdate {
  name?: string | null;
  capacity?: number | null;
  building?: string | null;
  waypoint_id?: string | null;
  floor_id?: number | null;
}

export interface NavigationRequest {
  start_waypoint_id?: string | null;
  start_room_id?: number | null;
  end_waypoint_id?: string | null;
  end_room_id?: number | null;
  kiosk_id?: string | null;
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
  waypoint_id: string;
  description?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface KioskCreate {
  name: string;
  floor_id: number;
  waypoint_id: string;
  description?: string | null;
}

export interface KioskUpdate {
  name?: string | null;
  floor_id?: number | null;
  waypoint_id?: string | null;
  description?: string | null;
}

export interface KioskConfig {
  kiosk_id: string;
  waypoint_id: string;
  floor_id: number;
  floor_name: string;
  position: {
    x: number;
    y: number;
  };
  settings: {
    idle_timeout_seconds: number;
    language: string;
    show_room_photos: boolean;
  };
}

export interface StairsConnection {
  id: number;
  stairs_bottom_id: string;
  stairs_top_id: string;
  name: string;
  is_bidirectional: boolean;
  vertical_distance: number;
}

export interface StairsConnectionCreate {
  stairs_bottom_id: string;
  stairs_top_id: string;
  name: string;
  is_bidirectional?: boolean;
  vertical_distance?: number;
}

export interface KioskNavigationRequest {
  kiosk_id: string;
  destination_room_id: number;
}

export interface KioskFloorDisplay {
  floor_id: number;
  floor_name: string;
  image_url: string | null;
  path_coordinates: [number, number][];
  instructions: string[];
  stairs_exit?: {
    waypoint_id: string;
    label: string;
    coordinates: [number, number];
  };
  stairs_entry?: {
    waypoint_id: string;
    label: string;
    coordinates: [number, number];
  };
}

export interface KioskTransitionDisplay {
  floor_type: 'transition';
  floors_passed: number[];
  message: string;
  stairs_name: string;
}

export interface KioskNavigationResponse {
  success: boolean;
  navigation_type: 'same_floor' | 'adjacent_floor' | 'multi_floor';
  floors_to_display: (KioskFloorDisplay | KioskTransitionDisplay)[];
  total_distance: number;
  estimated_time_minutes: number;
  floor_changes: number;
  stairs_used?: string;
}

export interface KioskSearchResult {
  room_id: number;
  name: string;
  floor_id: number;
  floor_name: string;
  building: string | null;
  type: string | null;
  has_waypoint: boolean;
}

export interface ApiError {
  detail: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
  }>;
}