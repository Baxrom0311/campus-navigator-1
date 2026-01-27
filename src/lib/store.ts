import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Floor, Waypoint, Connection, Room } from './api/types';

interface AppState {
  // API Settings
  apiUrl: string;
  setApiUrl: (url: string) => void;

  // Kiosk Settings
  kioskWaypointId: string | null;
  setKioskWaypointId: (id: string | null) => void;

  // Selected Floor
  selectedFloorId: number | null;
  setSelectedFloorId: (id: number | null) => void;

  // Editor State
  editorMode: 'select' | 'waypoint' | 'connection' | 'delete';
  setEditorMode: (mode: 'select' | 'waypoint' | 'connection' | 'delete') => void;

  selectedWaypointType: 'hallway' | 'room' | 'stairs' | 'elevator' | 'hall';
  setSelectedWaypointType: (type: 'hallway' | 'room' | 'stairs' | 'elevator' | 'hall') => void;

  // Connection drawing
  connectionStartWaypoint: Waypoint | null;
  setConnectionStartWaypoint: (waypoint: Waypoint | null) => void;

  // Selected items for editing
  selectedWaypoint: Waypoint | null;
  setSelectedWaypoint: (waypoint: Waypoint | null) => void;

  // API health
  isApiConnected: boolean;
  setIsApiConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // API Settings
      apiUrl: 'http://localhost:8000',
      setApiUrl: (url) => set({ apiUrl: url }),

      // Kiosk Settings
      kioskWaypointId: null,
      setKioskWaypointId: (id) => set({ kioskWaypointId: id }),

      // Selected Floor
      selectedFloorId: null,
      setSelectedFloorId: (id) => set({ selectedFloorId: id }),

      // Editor State
      editorMode: 'select',
      setEditorMode: (mode) => set({ editorMode: mode, connectionStartWaypoint: null }),

      selectedWaypointType: 'hallway',
      setSelectedWaypointType: (type) => set({ selectedWaypointType: type }),

      // Connection drawing
      connectionStartWaypoint: null,
      setConnectionStartWaypoint: (waypoint) => set({ connectionStartWaypoint: waypoint }),

      // Selected items
      selectedWaypoint: null,
      setSelectedWaypoint: (waypoint) => set({ selectedWaypoint: waypoint }),

      // API health
      isApiConnected: false,
      setIsApiConnected: (connected) => set({ isApiConnected: connected }),
    }),
    {
      name: 'university-nav-storage',
      partialize: (state) => ({
        apiUrl: state.apiUrl,
        kioskWaypointId: state.kioskWaypointId,
      }),
    }
  )
);
