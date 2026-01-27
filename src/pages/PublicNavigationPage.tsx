import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Navigation, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { roomsApi, floorsApi, kiosksApi, navigationApi, waypointsApi, getApiUrl } from '@/lib/api/client';
import type { Floor, Kiosk, NavigationResponse, PathStep, Room, Waypoint } from '@/lib/api/types';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ANIMATION_SPEED = 90; // px per second in canvas space
type AnimationState = 'active' | 'pending' | 'completed';

const resolveMediaUrl = (url: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = getApiUrl().replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
};

type FloorRun = {
  floorId: number;
  steps: PathStep[];
};

const buildFloorRuns = (path: PathStep[]) => {
  const runs: FloorRun[] = [];
  path.forEach((step) => {
    const last = runs[runs.length - 1];
    if (!last || last.floorId !== step.floor_id) {
      runs.push({ floorId: step.floor_id, steps: [step] });
      return;
    }
    last.steps.push(step);
  });
  return runs;
};

const computeLength = (points: { x: number; y: number }[]) => {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len;
};

const getPointAtLength = (points: { x: number; y: number }[], length: number) => {
  let remaining = length;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;
    if (remaining <= segLen) {
      const t = remaining / segLen;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    }
    remaining -= segLen;
  }
  return points[points.length - 1];
};

type CanvasPoint = {
  x: number;
  y: number;
};

type TransitionMarker = {
  x: number;
  y: number;
  direction: 'up' | 'down';
};

type Poi = {
  x: number;
  y: number;
  label: string;
  type: 'room' | 'stairs';
};

const EMPTY_POI: Poi[] = [];

const AnimatedPathCanvas = ({
  floor,
  steps,
  title,
  markers,
  startPoint,
  endPoint,
  showEmptyState = true,
  animationState = 'active',
  showMover = true,
  poi = EMPTY_POI,
  animateStatic = false,
  onComplete,
}: {
  floor: Floor | null;
  steps: PathStep[];
  title: string;
  markers?: { entry: TransitionMarker[]; exit: TransitionMarker[] };
  startPoint?: CanvasPoint | null;
  endPoint?: CanvasPoint | null;
  showEmptyState?: boolean;
  animationState?: AnimationState;
  showMover?: boolean;
  poi?: Poi[];
  animateStatic?: boolean;
  onComplete?: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const moverIconRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTimeRef.current = null;
    progressRef.current = 0;
    completedRef.current = false;
  }, []);

  const draw = useCallback(
    (progress: number | null, pulse: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const image = imageRef.current;
      if (!canvas || !container) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (!image) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, height / 2 - 12);
        ctx.fillText('Rasm yuklanmagan', width / 2, height / 2 + 12);
        return;
      }

      const scale = Math.min(width / image.width, height / image.height) * 0.92;
      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;
      const offsetX = (width - imageWidth) / 2;
      const offsetY = (height - imageHeight) / 2;

      ctx.drawImage(image, offsetX, offsetY, imageWidth, imageHeight);

      const hasPoi = poi.length > 0;
      const hasOverlayContent = steps.length > 0 || hasPoi || startPoint || endPoint;

      if (steps.length === 0 && showEmptyState && !hasOverlayContent) {
        ctx.fillStyle = 'rgba(3, 25, 79, 0.65)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Bu qavatda yo‘l yo‘q', width / 2, height / 2);
        return;
      }

      const toCanvas = (point: CanvasPoint) => ({
        x: offsetX + point.x * scale,
        y: offsetY + point.y * scale,
      });

      const points = steps.map((step) => toCanvas({ x: step.x, y: step.y }));
      const startCanvas = startPoint ? toCanvas(startPoint) : null;
      const endCanvas = endPoint ? toCanvas(endPoint) : null;
      const poiPoints = poi.map((item) => ({
        ...item,
        ...toCanvas({ x: item.x, y: item.y }),
      }));

      const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      };

      const drawKioskMarker = (point: CanvasPoint) => {
        const width = 30;
        const height = 20;
        ctx.save();
        const ringRadius = 16 + pulse * 6;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.45 - pulse * 0.2})`;
        ctx.lineWidth = 2;
        ctx.arc(point.x, point.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(34, 197, 94, 0.8)';
        ctx.shadowBlur = 12;
        drawRoundedRect(point.x - width / 2, point.y - height / 2, width, height, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };

      const drawDestinationMarker = (point: CanvasPoint, pulseValue: number) => {
        const scalePulse = 1 + pulseValue * 0.18;
        const radius = 8 * scalePulse;
        const stem = 16 * scalePulse;

        ctx.save();
        ctx.translate(point.x, point.y);

        const ringRadius = 10 + pulseValue * 10;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.35 - pulseValue * 0.15})`;
        ctx.lineWidth = 2;
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowColor = 'rgba(239, 68, 68, 0.85)';
        ctx.shadowBlur = 12 + pulseValue * 10;
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-radius * 0.9, -stem * 0.55);
        ctx.lineTo(radius * 0.9, -stem * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -stem * 0.75, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fee2e2';
        ctx.beginPath();
        ctx.arc(0, -stem * 0.75, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      };

      let drawLength = 0;
      if (points.length > 0) {
        // Path background (soft glow base)
        ctx.save();
        ctx.strokeStyle = 'rgba(64, 82, 90, 0.25)';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();

        const totalLength = computeLength(points);
        drawLength = progress === null ? totalLength : Math.min(progress, totalLength);

        // Foreground path (animated, glowing)
        ctx.save();
        ctx.strokeStyle = '#7DD3FC';
        ctx.lineWidth = 6;
        ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
        ctx.shadowBlur = 16;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        if (points.length > 0) {
          ctx.moveTo(points[0].x, points[0].y);
          let remaining = drawLength;
          for (let i = 1; i < points.length; i += 1) {
            const a = points[i - 1];
            const b = points[i];
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen === 0) continue;
            if (remaining <= segLen) {
              const t = remaining / segLen;
              ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
              break;
            }
            ctx.lineTo(b.x, b.y);
            remaining -= segLen;
          }
        }
        ctx.stroke();
        ctx.restore();

        // Step points
        points.forEach((p) => {
          ctx.beginPath();
          ctx.fillStyle = '#0ea5e9';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }

      // Stairs markers
      const drawMarker = (marker: TransitionMarker, color: string, label: string) => {
        const pos = { x: offsetX + marker.x * scale, y: offsetY + marker.y * scale };
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.arc(pos.x, pos.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, pos.x, pos.y);
      };

      markers?.exit?.forEach((marker) =>
        drawMarker(marker, '#F59E0B', marker.direction === 'up' ? '↑' : '↓')
      );
      markers?.entry?.forEach((marker) =>
        drawMarker(marker, '#A855F7', marker.direction === 'up' ? '↑' : '↓')
      );

      if (startCanvas) drawKioskMarker(startCanvas);
      if (endCanvas) drawDestinationMarker(endCanvas, pulse);

      if (poiPoints.length > 0) {
        poiPoints.forEach((point) => {
          const baseRadius = point.type === 'stairs' ? 6 : 5;
          const pulseRadius = baseRadius + pulse * 2.5;
          const color = point.type === 'stairs' ? '#F59E0B' : '#38BDF8';
          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.arc(point.x, point.y, pulseRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.save();
          ctx.fillStyle = '#E2E8F0';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
          ctx.shadowBlur = 4;
          ctx.fillText(point.label, point.x, point.y - 10);
          ctx.restore();
        });
      }

      // Moving person icon
      if (showMover && points.length >= 2 && progress !== null) {
        const mover = getPointAtLength(points, drawLength);
        const icon = moverIconRef.current;
        const size = 26;
        if (icon && icon.complete) {
          ctx.drawImage(icon, mover.x - size / 2, mover.y - size / 2, size, size);
        } else {
          ctx.beginPath();
          ctx.fillStyle = '#f97316';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2;
          ctx.arc(mover.x, mover.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    },
    [endPoint, markers, poi, showEmptyState, showMover, startPoint, steps, title]
  );

  useEffect(() => {
    const svg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <circle cx="32" cy="16" r="8" fill="#f97316"/>
        <path d="M20 58c0-10 6-18 12-18s12 8 12 18" fill="#f97316"/>
        <path d="M24 34h16l6 18h-8l-4-10-4 10h-8z" fill="#1f2937"/>
      </svg>`
    );
    const img = new Image();
    img.src = `data:image/svg+xml;utf8,${svg}`;
    moverIconRef.current = img;
  }, []);

  const animate = useCallback(
    (time: number) => {
      const pulse = (Math.sin(time / 320) + 1) / 2;
      const points = steps.map((step) => ({ x: step.x, y: step.y }));
      const canAnimateStatic = animateStatic && (poi.length > 0 || startPoint || endPoint);
      if (points.length < 2 && !canAnimateStatic) {
        draw(null, 0);
        stopAnimation();
        return;
      }

      const canvas = canvasRef.current;
      const container = containerRef.current;
      const image = imageRef.current;
      if (!canvas || !container || !image) {
        draw(null, 0);
        stopAnimation();
        return;
      }

      const scale = Math.min(
        container.clientWidth / image.width,
        container.clientHeight / image.height
      ) * 0.92;
      const scaledPoints = points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
      const totalLength = computeLength(scaledPoints);

      if (!Number.isFinite(totalLength) || totalLength === 0) {
        draw(null, pulse);
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      let progress = progressRef.current || 0;

      if (animationState === 'pending') {
        progress = 0;
        progressRef.current = 0;
        lastTimeRef.current = time;
        completedRef.current = false;
        draw(0, pulse);
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (animationState === 'completed') {
        progress = totalLength;
        progressRef.current = totalLength;
        lastTimeRef.current = time;
        completedRef.current = true;
        draw(totalLength, pulse);
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (!lastTimeRef.current) lastTimeRef.current = time;
      const elapsed = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      progress += elapsed * ANIMATION_SPEED;
      if (progress >= totalLength) {
        progress = totalLength;
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      }
      draw(progress, pulse);
      progressRef.current = progress;
      rafRef.current = requestAnimationFrame(animate);
    },
    [animateStatic, animationState, draw, endPoint, onComplete, poi.length, startPoint, steps, stopAnimation]
  );

  useEffect(() => {
    stopAnimation();
    if (!floor?.image_url) {
      imageRef.current = null;
      draw(null, 0);
      return;
    }
    const imageUrl = resolveMediaUrl(floor.image_url);
    if (!imageUrl) return;

    const loadImage = (withCors: boolean) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (withCors) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = imageUrl;
      });

    loadImage(true)
      .then((img) => {
        imageRef.current = img;
        draw(null, 0);
        rafRef.current = requestAnimationFrame(animate);
      })
      .catch(() => {
        loadImage(false)
          .then((img) => {
            imageRef.current = img;
            draw(null, 0);
            rafRef.current = requestAnimationFrame(animate);
          })
          .catch(() => {
            imageRef.current = null;
            draw(null, 0);
          });
      });

    return () => stopAnimation();
  }, [floor?.image_url, steps, draw, animate, stopAnimation]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => draw(null, 0));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    progressRef.current = 0;
    lastTimeRef.current = null;
    completedRef.current = false;
  }, [animationState, steps]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

export default function PublicNavigationPage() {
  const { kioskWaypointId } = useAppStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [kioskWaypoints, setKioskWaypoints] = useState<Waypoint[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [navigationResult, setNavigationResult] = useState<NavigationResponse | null>(null);
  const [activeRunIndex, setActiveRunIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [kioskFloorId, setKioskFloorId] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [roomsData, floorsData, kiosksData] = await Promise.all([
          roomsApi.getAll(),
          floorsApi.getAll(),
          kiosksApi.getAll(),
        ]);
        setRooms(roomsData);
        setFloors(floorsData);
        setKiosks(kiosksData);
      } catch (error) {
        toast.error('Maʼlumotlarni yuklashda xato');
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!kioskWaypointId) {
      setKioskFloorId(null);
      return;
    }
    const match = kiosks.find((kiosk) => kiosk.waypoint_id === kioskWaypointId);
    setKioskFloorId(match?.floor_id ?? null);
  }, [kioskWaypointId, kiosks]);

  useEffect(() => {
    if (!kioskFloorId) {
      setKioskWaypoints([]);
      return;
    }
    let isActive = true;
    waypointsApi
      .getByFloor(kioskFloorId)
      .then((data) => {
        if (isActive) setKioskWaypoints(data);
      })
      .catch(() => {
        if (isActive) setKioskWaypoints([]);
      });
    return () => {
      isActive = false;
    };
  }, [kioskFloorId]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await roomsApi.search(query.trim());
        setSearchResults(results.slice(0, 12));
      } catch {
        setSearchResults(
          rooms.filter((room) =>
            room.name.toLowerCase().includes(query.trim().toLowerCase())
          ).slice(0, 12)
        );
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, rooms]);

  const floorRuns = useMemo(() => {
    return navigationResult ? buildFloorRuns(navigationResult.path) : [];
  }, [navigationResult]);

  const splitView = Boolean(navigationResult && floorRuns.length > 1);

  const transitionMarkers = useMemo(() => {
    const map = new Map<number, { entry: TransitionMarker[]; exit: TransitionMarker[] }>();
    if (!navigationResult) return map;
    const floorIndex = new Map(floors.map((f) => [f.id, f.floor_number]));
    const path = navigationResult.path;
    for (let i = 0; i < path.length - 1; i += 1) {
      const current = path[i];
      const next = path[i + 1];
      if (current.floor_id === next.floor_id) continue;
      const currentNumber = floorIndex.get(current.floor_id) ?? current.floor_id;
      const nextNumber = floorIndex.get(next.floor_id) ?? next.floor_id;
      const direction = nextNumber > currentNumber ? 'up' : 'down';

      if (!map.has(current.floor_id)) {
        map.set(current.floor_id, { entry: [], exit: [] });
      }
      if (!map.has(next.floor_id)) {
        map.set(next.floor_id, { entry: [], exit: [] });
      }
      map.get(current.floor_id)!.exit.push({
        x: current.x,
        y: current.y,
        direction,
      });
      map.get(next.floor_id)!.entry.push({
        x: next.x,
        y: next.y,
        direction,
      });
    }
    return map;
  }, [navigationResult, floors]);

  useEffect(() => {
    setActiveRunIndex(0);
  }, [navigationResult]);

  const handleRunComplete = useCallback(
    (runIndex: number) => {
      setActiveRunIndex((prev) => {
        if (runIndex !== prev) return prev;
        const next = prev + 1;
        return next < floorRuns.length ? next : prev;
      });
    },
    [floorRuns.length]
  );

  const displayRuns = useMemo(() => {
    if (!splitView) {
      if (floorRuns.length === 1) {
        return [{ run: floorRuns[0], runIndex: 0 }];
      }
      const fallbackFloorId = kioskFloorId ?? floors[0]?.id ?? null;
      const fallbackRun = fallbackFloorId ? { floorId: fallbackFloorId, steps: [] } : null;
      return [{ run: fallbackRun, runIndex: -1 }];
    }
    if (floorRuns.length === 2) {
      return [
        { run: floorRuns[0], runIndex: 0 },
        { run: floorRuns[1], runIndex: 1 },
      ];
    }
    return [
      { run: floorRuns[activeRunIndex] ?? null, runIndex: activeRunIndex },
      { run: floorRuns[activeRunIndex + 1] ?? null, runIndex: activeRunIndex + 1 },
    ];
  }, [splitView, floorRuns, activeRunIndex, kioskFloorId, floors]);

  const startStep = navigationResult?.path?.[0] ?? null;
  const endStep = navigationResult?.path?.length
    ? navigationResult.path[navigationResult.path.length - 1]
    : null;

  const waypointMap = useMemo(() => {
    return new Map(kioskWaypoints.map((wp) => [wp.id, wp]));
  }, [kioskWaypoints]);

  const kioskPoint = useMemo(() => {
    if (!kioskWaypointId) return null;
    const wp = waypointMap.get(kioskWaypointId);
    return wp ? { x: wp.x, y: wp.y } : null;
  }, [kioskWaypointId, waypointMap]);

  const defaultPoi = useMemo(() => {
    if (!kioskFloorId) return [];
    const poiList: Poi[] = [];
    rooms
      .filter((room) => room.floor_id === kioskFloorId && room.waypoint_id)
      .forEach((room) => {
        const wp = room.waypoint_id ? waypointMap.get(room.waypoint_id) : null;
        if (!wp) return;
        poiList.push({ x: wp.x, y: wp.y, label: room.name, type: 'room' });
      });
    kioskWaypoints
      .filter((wp) => wp.type === 'stairs')
      .forEach((wp) => {
        poiList.push({ x: wp.x, y: wp.y, label: 'Zina', type: 'stairs' });
      });
    return poiList;
  }, [kioskFloorId, rooms, waypointMap, kioskWaypoints]);

  const handleSelectRoom = async (room: Room) => {
    if (!kioskWaypointId) {
      toast.error('Kiosk joylashuvi sozlanmagan. Admin panelda belgilang.');
      return;
    }
    setSelectedRoom(room);
    setIsLoading(true);
    try {
      const response = await navigationApi.findPath({
        start_waypoint_id: kioskWaypointId,
        end_room_id: room.id,
      });
      setNavigationResult(response);
    } catch {
      toast.error('Yo‘l topilmadi');
      setNavigationResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedRoom(null);
    setNavigationResult(null);
    setQuery('');
    setSearchResults([]);
  };

  return (
    <div className="min-h-screen bg-black text-white relative">
      <div
        className={cn(
          'absolute inset-0 grid h-full gap-4 p-4',
          splitView ? 'grid-cols-2 grid-rows-1' : 'grid-cols-1 grid-rows-1'
        )}
      >
        {displayRuns.map(({ run, runIndex }, slotIndex) => {
          if (!run) {
            return (
              <div
                key={`empty-${slotIndex}`}
                className="relative h-full min-h-0 rounded-2xl border border-white/10 bg-black/80 flex items-center justify-center"
              >
                <div className="text-sm text-white/60">Keyingi qavat yo‘q</div>
              </div>
            );
          }
          const floorId = run.floorId;
          const floor = floors.find((item) => item.id === floorId) || null;
          const steps = run.steps;
          const markers = transitionMarkers.get(floorId) || { entry: [], exit: [] };
          const startPoint = navigationResult
            ? startStep && startStep.floor_id === floorId
              ? { x: startStep.x, y: startStep.y }
              : null
            : floorId === kioskFloorId
              ? kioskPoint
              : null;
          const endPoint =
            navigationResult && endStep && endStep.floor_id === floorId
              ? { x: endStep.x, y: endStep.y }
              : null;
          const showDefaultPoi = !navigationResult && floorId === kioskFloorId;
          const animationState: AnimationState = navigationResult
            ? splitView
              ? runIndex < activeRunIndex
                ? 'completed'
                : runIndex === activeRunIndex
                  ? 'active'
                  : 'pending'
              : 'active'
            : 'completed';
          return (
            <div
              key={`${floorId}-${runIndex}`}
              className="relative h-full min-h-0 rounded-2xl overflow-hidden border border-white/10 bg-black/80"
            >
              <AnimatedPathCanvas
                floor={floor}
                steps={steps}
                title={floor?.name || 'Xarita'}
                markers={markers}
                startPoint={startPoint}
                endPoint={endPoint}
                showEmptyState={Boolean(navigationResult)}
                animationState={animationState}
                showMover={animationState === 'active'}
                poi={showDefaultPoi ? defaultPoi : EMPTY_POI}
                animateStatic={showDefaultPoi}
                onComplete={
                  splitView && animationState === 'active' && runIndex >= 0
                    ? () => handleRunComplete(runIndex)
                    : undefined
                }
              />
              <div className="absolute top-3 left-3 bg-black/60 px-3 py-1 rounded-full text-xs">
                {floor?.name || 'Qavat'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative z-10 flex items-start justify-between p-6 gap-6">
        <Card className="w-full max-w-sm bg-black/70 border-white/10 text-white">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Navigation className="w-5 h-5 text-cyan-300" />
              Yo‘l topish
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
              <Input
                placeholder="Xonani tanlang..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="max-h-72 overflow-auto space-y-1">
                {searchResults.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => handleSelectRoom(room)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md transition',
                      selectedRoom?.id === room.id
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'bg-white/5 hover:bg-white/10'
                    )}
                  >
                    <div className="text-sm font-medium">{room.name}</div>
                    <div className="text-xs text-white/60">
                      {floors.find((f) => f.id === room.floor_id)?.name || 'Qavat'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedRoom && (
              <Button onClick={handleReset} variant="outline" className="w-full border-white/30 text-white">
                <RotateCcw className="w-4 h-4 mr-2" />
                Qayta tanlash
              </Button>
            )}
          </div>
        </Card>

        <Card className="bg-black/70 border-white/10 text-white min-w-[220px]">
          <div className="p-4 space-y-2">
            <div className="text-xs text-white/60">Qavatlar</div>
            <div className="text-lg font-semibold">
              {displayRuns
                .map(({ run }) => (run ? floors.find((f) => f.id === run.floorId)?.name || 'Qavat' : '—'))
                .join(' + ')}
            </div>
            {navigationResult && (
              <div className="text-xs text-white/60">
                {Math.min(activeRunIndex + 1, floorRuns.length)} / {floorRuns.length}
              </div>
            )}
            {isLoading && <div className="text-xs text-cyan-200">Yo‘l hisoblanmoqda...</div>}
          </div>
        </Card>
      </div>

      {!kioskWaypointId && (
        <div className="absolute bottom-6 left-6 z-10">
          <Card className="bg-amber-500/20 border-amber-300/30 text-amber-100">
            <div className="p-3 text-sm">
              Kiosk joylashuvi belgilanmagan. Admin panelda sozlang.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
