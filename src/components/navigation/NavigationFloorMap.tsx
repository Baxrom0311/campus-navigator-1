import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas as FabricCanvas, FabricImage, Line, Circle, Polyline } from 'fabric';
import { getApiUrl } from '@/lib/api/client';
import { Waypoint, PathStep, Floor } from '@/lib/api/types';

interface NavigationFloorMapProps {
  floor: Floor;
  waypoints: Waypoint[];
  pathSteps: PathStep[];
  isCurrentFloor?: boolean;
}

const WAYPOINT_COLORS: Record<string, string> = {
  hallway: '#4A90D9',
  room: '#22C55E',
  stairs: '#F59E0B',
  elevator: '#A855F7',
  hall: '#EF4444',
  kiosk: '#EC4899', // Pink for kiosk
};

export function NavigationFloorMap({
  floor,
  waypoints,
  pathSteps,
  isCurrentFloor = false,
}: NavigationFloorMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 600,
      height: 400,
      backgroundColor: '#1a1a2e',
      selection: false,
    });

    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
    };
  }, []);

  // Resolve media URL helper
  const resolveMediaUrl = useCallback((url: string) => {
    if (/^https?:\/\//i.test(url)) return url;
    const base = getApiUrl().replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }, []);

  // Load floor image and draw path
  useEffect(() => {
    if (!fabricCanvas || !floor?.image_url) return;

    const imageUrl = resolveMediaUrl(floor.image_url);

    FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then((img) => {
      const canvasWidth = fabricCanvas.width || 600;
      const canvasHeight = fabricCanvas.height || 400;

      const scale = Math.min(canvasWidth / (img.width || 1), canvasHeight / (img.height || 1)) * 0.95;

      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (canvasWidth - (img.width || 0) * scale) / 2,
        top: (canvasHeight - (img.height || 0) * scale) / 2,
        selectable: false,
        evented: false,
        opacity: 0.8,
      });

      fabricCanvas.add(img);
      fabricCanvas.sendObjectToBack(img);

      // Draw path after image loads
      drawPath(scale, img.left || 0, img.top || 0);
      drawWaypoints(scale, img.left || 0, img.top || 0);
    });
  }, [fabricCanvas, floor?.image_url, pathSteps, waypoints]);

  const drawPath = (scale: number, offsetX: number, offsetY: number) => {
    if (!fabricCanvas || pathSteps.length < 2) return;

    // Remove existing path lines
    fabricCanvas.getObjects('polyline').forEach((obj) => {
      fabricCanvas.remove(obj);
    });

    // Create path coordinates
    const points = pathSteps.map((step) => ({
      x: step.x * scale + offsetX,
      y: step.y * scale + offsetY,
    }));

    // Draw animated path
    const pathLine = new Polyline(points, {
      stroke: '#22C55E',
      strokeWidth: 4,
      fill: 'transparent',
      selectable: false,
      evented: false,
      strokeDashArray: [10, 5],
    });

    fabricCanvas.add(pathLine);

    // Start and end markers
    if (points.length >= 2) {
      // Start marker (blue circle)
      const startMarker = new Circle({
        left: points[0].x,
        top: points[0].y,
        radius: 8,
        fill: '#3B82F6',
        stroke: '#fff',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      });

      // End marker (green circle)
      const endMarker = new Circle({
        left: points[points.length - 1].x,
        top: points[points.length - 1].y,
        radius: 8,
        fill: '#22C55E',
        stroke: '#fff',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      });

      fabricCanvas.add(startMarker);
      fabricCanvas.add(endMarker);
    }

    fabricCanvas.renderAll();
  };

  const drawWaypoints = (scale: number, offsetX: number, offsetY: number) => {
    if (!fabricCanvas) return;

    // Draw waypoints that are not in the path
    waypoints.forEach((wp) => {
      const isInPath = pathSteps.some((step) => step.waypoint_id === wp.id);
      if (isInPath) return; // Skip waypoints already in path

      const circle = new Circle({
        left: wp.x * scale + offsetX,
        top: wp.y * scale + offsetY,
        radius: 5,
        fill: WAYPOINT_COLORS[wp.type] || '#4A90D9',
        stroke: 'rgba(0,0,0,0.3)',
        strokeWidth: 1,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
        opacity: 0.5,
      });

      fabricCanvas.add(circle);
    });

    fabricCanvas.renderAll();
  };

  return (
    <div className={`rounded-lg border overflow-hidden ${isCurrentFloor ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
      <div className="bg-muted px-3 py-2 text-sm font-medium flex items-center justify-between">
        <span>{floor.name}</span>
        {isCurrentFloor && (
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
            Joriy qavat
          </span>
        )}
      </div>
      <canvas ref={canvasRef} />
    </div>
  );
}
