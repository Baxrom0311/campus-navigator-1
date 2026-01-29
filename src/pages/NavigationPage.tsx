import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  Navigation,
  ChevronLeft,
  ChevronRight,
  List,
  Map as MapIcon,
  Monitor,
} from 'lucide-react';
import { Canvas as FabricCanvas, FabricImage, Circle, Polyline, Group, Rect, Text } from 'fabric';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { roomsApi, navigationApi, floorsApi, kiosksApi, waypointsApi, getApiUrl } from '@/lib/api/client';
import { Room, Floor, NavigationResponse, PathStep, Kiosk, Waypoint } from '@/lib/api/types';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

export default function NavigationPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [floorWaypoints, setFloorWaypoints] = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [startMode, setStartMode] = useState<'kiosk' | 'room'>('kiosk');
  const [selectedKioskId, setSelectedKioskId] = useState<number | null>(null);
  const [startRoomQuery, setStartRoomQuery] = useState('');
  const [startRoomResults, setStartRoomResults] = useState<Room[]>([]);
  const [startRoom, setStartRoom] = useState<Room | null>(null);
  const [endRoomQuery, setEndRoomQuery] = useState('');
  const [endRoomResults, setEndRoomResults] = useState<Room[]>([]);
  const [endRoom, setEndRoom] = useState<Room | null>(null);
  const [navigationResult, setNavigationResult] = useState<NavigationResponse | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  // Floor visualization state
  const [currentFloorIndex, setCurrentFloorIndex] = useState(0);
  const [floorsInPath, setFloorsInPath] = useState<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dashOffsetRef = useRef(0);
  const moverRef = useRef<Group | null>(null);
  const pathLineRef = useRef<Polyline | null>(null);
  const kioskPulseRefs = useRef<Circle[]>([]);
  const pathPointsRef = useRef<{ x: number; y: number }[]>([]);
  const segmentLengthsRef = useRef<number[]>([]);
  const totalLengthRef = useRef(0);
  const progressRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [roomsData, floorsData, kiosksData] = await Promise.all([
          roomsApi.getAll(),
          floorsApi.getAll(),
          kiosksApi.getAll().catch(() => [] as Kiosk[]),
        ]);
        setRooms(roomsData);
        setFloors(floorsData);
        setKiosks(kiosksData);
      } catch (error) {
        toast.error("Ma'lumotlarni yuklashda xato");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Default start mode when kiosks are missing
  useEffect(() => {
    if (kiosks.length === 0) {
      setStartMode('room');
    }
  }, [kiosks.length]);

  useEffect(() => {
    if (!navigationResult || floorsInPath.length === 0) {
      setFloorWaypoints([]);
      return;
    }
    const floorId = floorsInPath[currentFloorIndex];
    if (!floorId) return;
    let isActive = true;
    waypointsApi
      .getByFloor(floorId)
      .then((data) => {
        if (isActive) setFloorWaypoints(data);
      })
      .catch(() => {
        if (isActive) setFloorWaypoints([]);
      });
    return () => {
      isActive = false;
    };
  }, [navigationResult, floorsInPath, currentFloorIndex]);

  // Initialize canvas when map view is visible
  useEffect(() => {
    const shouldShowMap = viewMode === 'map' && Boolean(navigationResult);
    if (!shouldShowMap) {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
      if (fabricCanvas) setFabricCanvas(null);
      return;
    }
    if (!canvasRef.current || fabricCanvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 700,
      height: 500,
      backgroundColor: '#1a1a2e',
      selection: false,
    });

    fabricCanvasRef.current = canvas;
    setFabricCanvas(canvas);
  }, [viewMode, navigationResult, fabricCanvas]);

  // Resolve media URL helper
  const resolveMediaUrl = useCallback((url: string) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) {
      try {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith('/api/uploads/')) {
          const base = getApiUrl().replace(/\/$/, '').replace(/\/api$/, '');
          return `${base}${parsed.pathname.replace(/^\/api/, '')}`;
        }
        if (parsed.pathname.startsWith('/uploads/')) {
          const base = getApiUrl().replace(/\/$/, '').replace(/\/api$/, '');
          return `${base}${parsed.pathname}`;
        }
      } catch {
        // ignore parse errors
      }
      return url;
    }
    const base = getApiUrl().replace(/\/$/, '').replace(/\/api$/, '');
    const rawPath = url.startsWith('/') ? url : `/${url}`;
    const path = rawPath.startsWith('/api/uploads/')
      ? rawPath.replace(/^\/api/, '')
      : rawPath;
    return `${base}${path}`;
  }, []);

  const stopPathAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastTimeRef.current = null;
    progressRef.current = 0;
  }, []);

  const computePathMetrics = useCallback((points: { x: number; y: number }[]) => {
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.hypot(dx, dy);
      lengths.push(len);
      total += len;
    }
    return { lengths, total };
  }, []);

  const getPointAtDistance = useCallback(
    (distance: number) => {
      const points = pathPointsRef.current;
      const lengths = segmentLengthsRef.current;
      if (points.length === 0 || lengths.length === 0) return points[0] || null;
      let remaining = Math.max(0, distance);
      for (let i = 0; i < lengths.length; i += 1) {
        const len = lengths[i];
        if (len === 0) continue;
        if (remaining <= len) {
          const start = points[i];
          const end = points[i + 1];
          const t = remaining / len;
          return {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t,
          };
        }
        remaining -= len;
      }
      return points[points.length - 1] || null;
    },
    []
  );

  // Keep canvas responsive to container size
  const drawFloorWithPath = useCallback(async () => {
    if (!fabricCanvas || !navigationResult || floorsInPath.length === 0) return;

    const currentFloorId = floorsInPath[currentFloorIndex];
    const floor = floors.find((f) => f.id === currentFloorId) || null;

    stopPathAnimation();
    moverRef.current = null;
    pathLineRef.current = null;
    pathPointsRef.current = [];
    segmentLengthsRef.current = [];
    totalLengthRef.current = 0;

    // Clear canvas
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#1a1a2e';

    // Get path steps for this floor
    const floorPathSteps = navigationResult.path.filter(
      (step) => step.floor_id === currentFloorId
    );

    const getSourceFrame = (img?: FabricImage | null) => {
      if (img?.width && img.height) {
        return { width: img.width, height: img.height, offsetX: 0, offsetY: 0 };
      }
      if (floor?.image_width && floor.image_height) {
        return { width: floor.image_width, height: floor.image_height, offsetX: 0, offsetY: 0 };
      }
      if (floorPathSteps.length > 0) {
        const xs = floorPathSteps.map((step) => step.x);
        const ys = floorPathSteps.map((step) => step.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return {
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          offsetX: minX,
          offsetY: minY,
        };
      }
      return { width: 1000, height: 800, offsetX: 0, offsetY: 0 };
    };

    const renderScene = (img?: FabricImage | null) => {
      const canvasWidth = fabricCanvas.width || 700;
      const canvasHeight = fabricCanvas.height || 500;
      const frame = getSourceFrame(img);

      const scale = Math.min(canvasWidth / frame.width, canvasHeight / frame.height) * 0.95;
      const offsetX = (canvasWidth - frame.width * scale) / 2;
      const offsetY = (canvasHeight - frame.height * scale) / 2;

      if (img) {
        img.set({
          scaleX: scale,
          scaleY: scale,
          left: offsetX,
          top: offsetY,
          selectable: false,
          evented: false,
          opacity: 0.7,
        });

        fabricCanvas.add(img);
        fabricCanvas.sendObjectToBack(img);
      }

      const toCanvasPoint = (point: { x: number; y: number }) => ({
        x: (point.x - frame.offsetX) * scale + offsetX,
        y: (point.y - frame.offsetY) * scale + offsetY,
      });

      // Draw path on this floor
      if (floorPathSteps.length >= 2) {
        const points = floorPathSteps.map((step) => toCanvasPoint(step));
        pathPointsRef.current = points;

        const pathLine = new Polyline(points, {
          stroke: '#22C55E',
          strokeWidth: 4,
          fill: 'transparent',
          selectable: false,
          evented: false,
          strokeDashArray: [2, 10],
          strokeLineCap: 'round',
        });

        fabricCanvas.add(pathLine);
        pathLineRef.current = pathLine;

        const { lengths, total } = computePathMetrics(points);
        segmentLengthsRef.current = lengths;
        totalLengthRef.current = total;
        dashOffsetRef.current = 0;
        progressRef.current = 0;
        lastTimeRef.current = null;

        const maxDots = 60;
        const step = Math.max(1, Math.ceil(points.length / maxDots));
        points.forEach((point, index) => {
          if (index === 0 || index === points.length - 1) return;
          if (index % step !== 0) return;
          const dot = new Circle({
            left: point.x,
            top: point.y,
            radius: 3,
            fill: '#a7f3d0',
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false,
          });
          fabricCanvas.add(dot);
        });

        // Start marker
        const startMarker = new Circle({
          left: points[0].x,
          top: points[0].y,
          radius: 10,
          fill: '#3B82F6',
          stroke: '#fff',
          strokeWidth: 3,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });

        // End marker
        const endMarker = new Circle({
          left: points[points.length - 1].x,
          top: points[points.length - 1].y,
          radius: 10,
          fill: '#22C55E',
          stroke: '#fff',
          strokeWidth: 3,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });

        fabricCanvas.add(startMarker);
        fabricCanvas.add(endMarker);

        const head = new Circle({
          left: 0,
          top: -6,
          radius: 4,
          fill: '#f8fafc',
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });
        const body = new Rect({
          left: 0,
          top: 4,
          width: 9,
          height: 12,
          rx: 4,
          ry: 4,
          fill: '#38bdf8',
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });
        const mover = new Group([body, head], {
          left: points[0].x,
          top: points[0].y,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });
        mover.set('shadow', {
          color: 'rgba(56,189,248,0.6)',
          blur: 12,
          offsetX: 0,
          offsetY: 0,
        });
        fabricCanvas.add(mover);
        moverRef.current = mover;

        const animate = (time: number) => {
          const totalLength = totalLengthRef.current;
          if (!totalLength || !pathLineRef.current || !moverRef.current) {
            stopPathAnimation();
            return;
          }
          if (!lastTimeRef.current) lastTimeRef.current = time;
          const elapsed = (time - lastTimeRef.current) / 1000;
          lastTimeRef.current = time;

          const speed = 70;
          progressRef.current = Math.min(totalLength, progressRef.current + speed * elapsed);
          if (progressRef.current < totalLength) {
            dashOffsetRef.current -= speed * elapsed * 0.25;
            pathLineRef.current.set('strokeDashOffset', dashOffsetRef.current);
          }

          const nextPoint = getPointAtDistance(progressRef.current);
          if (nextPoint) {
            moverRef.current.set({
              left: nextPoint.x,
              top: nextPoint.y,
            });
            moverRef.current.setCoords();
          }

          if (kioskPulseRefs.current.length > 0) {
            const pulse = (Math.sin(time / 250) + 1) / 2;
            kioskPulseRefs.current.forEach((ring) => {
              ring.set({
                radius: 10 + pulse * 6,
                opacity: 0.35 + pulse * 0.35,
              });
            });
          }

          fabricCanvas.requestRenderAll();

          if (progressRef.current >= totalLength && kioskPulseRefs.current.length === 0) {
            stopPathAnimation();
            return;
          }
          animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);
      } else if (floorPathSteps.length === 1) {
        // Single point on floor
        const point = toCanvasPoint(floorPathSteps[0]);
        const marker = new Circle({
          left: point.x,
          top: point.y,
          radius: 10,
          fill: '#F59E0B',
          stroke: '#fff',
          strokeWidth: 3,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });
        fabricCanvas.add(marker);
      }

      kioskPulseRefs.current = [];

      if (floorWaypoints.length > 0) {
        const waypointMap = new Map(floorWaypoints.map((wp) => [wp.id, wp]));
        const floorRooms = rooms.filter(
          (room) => room.floor_id === currentFloorId && room.waypoint_id
        );

        floorRooms.forEach((room) => {
          const wp = room.waypoint_id ? waypointMap.get(room.waypoint_id) : null;
          if (!wp) return;
          const point = toCanvasPoint({ x: wp.x, y: wp.y });
          const labelText = new Text(room.name, {
            left: 0,
            top: 0,
            fontSize: 12,
            fontWeight: '600',
            fill: '#f8fafc',
            fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
            selectable: false,
            evented: false,
          });
          const pad = 4;
          const textWidth = Math.ceil(labelText.width ?? labelText.getScaledWidth() ?? 0);
          const textHeight = Math.ceil(labelText.height ?? labelText.getScaledHeight() ?? 0);
          const bg = new Rect({
            left: -pad,
            top: -pad,
            width: textWidth + pad * 2,
            height: textHeight + pad * 2,
            rx: 4,
            ry: 4,
            fill: 'rgba(15,23,42,0.65)',
            stroke: 'rgba(255,255,255,0.12)',
            strokeWidth: 1,
            selectable: false,
            evented: false,
          });
          const labelGroup = new Group([bg, labelText], {
            left: point.x + 8,
            top: point.y - textHeight - 10,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false,
          });
          fabricCanvas.add(labelGroup);
        });

        kiosks
          .filter((kiosk) => kiosk.floor_id === currentFloorId && kiosk.waypoint_id)
          .forEach((kiosk) => {
            const wp = kiosk.waypoint_id ? waypointMap.get(kiosk.waypoint_id) : null;
            if (!wp) return;
            const point = toCanvasPoint({ x: wp.x, y: wp.y });

            const ring = new Circle({
              left: point.x,
              top: point.y,
              radius: 10,
              fill: 'rgba(14,165,233,0.15)',
              stroke: 'rgba(14,165,233,0.8)',
              strokeWidth: 2,
              originX: 'center',
              originY: 'center',
              selectable: false,
              evented: false,
            });
            const core = new Circle({
              left: point.x,
              top: point.y,
              radius: 5,
              fill: '#0ea5e9',
              stroke: '#f8fafc',
              strokeWidth: 2,
              originX: 'center',
              originY: 'center',
              selectable: false,
              evented: false,
            });
            const label = new Text('Kiosk', {
              left: point.x + 10,
              top: point.y + 8,
              fontSize: 11,
              fontWeight: '600',
              fill: '#bae6fd',
              fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
              selectable: false,
              evented: false,
            });
            fabricCanvas.add(ring);
            fabricCanvas.add(core);
            fabricCanvas.add(label);
            kioskPulseRefs.current.push(ring);
          });
      }

      fabricCanvas.renderAll();
    };

    // Load floor image (optional)
    if (floor?.image_url) {
      const imageUrl = resolveMediaUrl(floor.image_url);

      const loadImage = async (withCors: boolean) => {
        const options = withCors ? { crossOrigin: 'anonymous' as const } : undefined;
        return await FabricImage.fromURL(imageUrl, options);
      };

      try {
        const img = await loadImage(true);
        renderScene(img);
      } catch (error) {
        try {
          const img = await loadImage(false);
          renderScene(img);
        } catch (fallbackError) {
          logger.error('Error loading floor image', fallbackError);
          renderScene(null);
        }
      }
    } else {
      renderScene(null);
    }
  }, [
    fabricCanvas,
    navigationResult,
    floorsInPath,
    currentFloorIndex,
    floors,
    resolveMediaUrl,
    computePathMetrics,
    getPointAtDistance,
    stopPathAnimation,
    rooms,
    kiosks,
    floorWaypoints,
  ]);

  useEffect(() => {
    if (!fabricCanvas) return;
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        fabricCanvas.setWidth(width);
        fabricCanvas.setHeight(height);
        fabricCanvas.calcOffset();
        drawFloorWithPath();
      }
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      stopPathAnimation();
    };
  }, [fabricCanvas, drawFloorWithPath]);

  // Auto-select first kiosk for convenience
  useEffect(() => {
    if (startMode !== 'kiosk') return;
    if (selectedKioskId || kiosks.length === 0) return;
    setSelectedKioskId(kiosks[0].id);
  }, [startMode, selectedKioskId, kiosks]);

  const filterRooms = useCallback(
    (query: string) =>
      rooms
        .filter((room) => room.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10),
    [rooms]
  );

  // Start room search
  useEffect(() => {
    if (startRoomQuery.trim().length > 0) {
      setStartRoomResults(filterRooms(startRoomQuery.trim()));
    } else {
      setStartRoomResults([]);
    }
  }, [startRoomQuery, filterRooms]);

  // End room search
  useEffect(() => {
    if (endRoomQuery.trim().length > 0) {
      const results = filterRooms(endRoomQuery.trim());
      setEndRoomResults(startRoom ? results.filter((room) => room.id !== startRoom.id) : results);
    } else {
      setEndRoomResults([]);
    }
  }, [endRoomQuery, filterRooms, startRoom]);

  // Get unique floors from path in order
  const getFloorsInPath = useCallback((path: PathStep[]): number[] => {
    const ordered: number[] = [];
    path.forEach((step) => {
      if (!ordered.includes(step.floor_id)) {
        ordered.push(step.floor_id);
      }
    });
    return ordered;
  }, []);

  const resetNavigation = useCallback(() => {
    setNavigationResult(null);
    setFloorsInPath([]);
    setCurrentFloorIndex(0);
  }, []);

  const handleStartRoomSelect = useCallback((room: Room) => {
    setStartRoom(room);
    setStartRoomQuery(room.name);
    setStartRoomResults([]);
    resetNavigation();
  }, [resetNavigation]);

  const handleEndRoomSelect = useCallback((room: Room) => {
    setEndRoom(room);
    setEndRoomQuery(room.name);
    setEndRoomResults([]);
    resetNavigation();
  }, [resetNavigation]);

  // Update canvas when floor changes
  useEffect(() => {
    drawFloorWithPath();
  }, [drawFloorWithPath]);

  // Auto-advance floors
  useEffect(() => {
    if (!navigationResult || floorsInPath.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentFloorIndex((prev) => (prev + 1) % floorsInPath.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [navigationResult, floorsInPath.length]);

  const handleNavigate = async () => {
    if (!endRoom) {
      toast.error("Boradigan xonani tanlang");
      return;
    }

    if (startMode === 'room' && !startRoom) {
      toast.error("Boshlanish xonasini tanlang");
      return;
    }

    if (startMode === 'room' && startRoom?.id === endRoom.id) {
      toast.error("Boshlanish va manzil bir xil bo'lmasligi kerak");
      return;
    }

    if (startMode === 'kiosk' && !selectedKioskId) {
      toast.error('Kiosk tanlang.');
      return;
    }

    setNavigating(true);
    setNavigationResult(null);

    try {
      const request =
        startMode === 'room' && startRoom
          ? { start_room_id: startRoom.id, end_room_id: endRoom.id }
          : { kiosk_id: selectedKioskId as number, end_room_id: endRoom.id };

      const result = await navigationApi.findPath(request);
      setNavigationResult(result);

      const floorIds = getFloorsInPath(result.path);
      setFloorsInPath(floorIds);
      setCurrentFloorIndex(0);
      setViewMode('map');
    } catch (error) {
      const startName =
        startMode === 'room'
          ? startRoom?.name || 'Boshlanish'
          : activeKiosk?.name || 'Kiosk';
      const endName = endRoom?.name || 'manzil';
      toast.error(`${startName} dan ${endName} ga yo'l topilmadi. Iltimos, boshqa xonani tanlang.`);
      setNavigationResult(null);
      setFloorsInPath([]);
    } finally {
      setNavigating(false);
    }
  };

  const getFloorName = useCallback((floorId: number | null) => {
    if (!floorId) return 'Qavat belgilanmagan';
    const floor = floors.find((f) => f.id === floorId);
    return floor?.name || `Qavat ${floorId}`;
  }, [floors]);

  const activeKiosk = useMemo(
    () => kiosks.find((kiosk) => kiosk.id === selectedKioskId) || null,
    [kiosks, selectedKioskId]
  );

  const startLabel = useMemo(() => {
    if (startMode === 'room') {
      return startRoom ? `${startRoom.name} - ${getFloorName(startRoom.floor_id)}` : 'Tanlanmagan';
    }
    if (activeKiosk) {
      return `${activeKiosk.name} - ${getFloorName(activeKiosk.floor_id)}`;
    }
    return 'Tanlanmagan';
  }, [startMode, startRoom, activeKiosk, getFloorName]);

  const endLabel = useMemo(() => {
    if (!endRoom) return 'Tanlanmagan';
    return `${endRoom.name} - ${getFloorName(endRoom.floor_id)}`;
  }, [endRoom, getFloorName]);

  const instructionGroups = useMemo(() => {
    if (!navigationResult) return [] as Array<{ floorId: number; steps: Array<{ step: PathStep; index: number }> }>;
    const groups: Array<{ floorId: number; steps: Array<{ step: PathStep; index: number }> }> = [];
    navigationResult.path.forEach((step, index) => {
      const last = groups[groups.length - 1];
      if (!last || last.floorId !== step.floor_id) {
        groups.push({ floorId: step.floor_id, steps: [{ step, index: index + 1 }] });
      } else {
        last.steps.push({ step, index: index + 1 });
      }
    });
    return groups;
  }, [navigationResult]);

  const handlePrevFloor = () => {
    setCurrentFloorIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextFloor = () => {
    setCurrentFloorIndex((prev) => Math.min(floorsInPath.length - 1, prev + 1));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Yuklanmoqda...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Navigatsiya</h1>
        <p className="text-muted-foreground mt-1">
          Boshlanish va manzilni tanlab yo'l ko'rsatishni oling
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6">
        {/* Controls */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Yo'l topish</h3>
                <p className="text-sm text-muted-foreground">
                  Boshlanish nuqtasi va manzilni belgilang
                </p>
              </div>

              <div className="space-y-3">
                <Label>Boshlanish turi</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={startMode === 'kiosk' ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2"
                    onClick={() => setStartMode('kiosk')}
                  >
                    <Monitor className="w-4 h-4" />
                    Kiosk
                  </Button>
                  <Button
                    type="button"
                    variant={startMode === 'room' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStartMode('room')}
                  >
                    Xona
                  </Button>
                </div>
              </div>

              {startMode === 'kiosk' ? (
                <div className="space-y-2">
                  <Label>Kiosk tanlash</Label>
                  <Select
                    value={selectedKioskId ? String(selectedKioskId) : ''}
                    onValueChange={(value) => {
                      setSelectedKioskId(Number(value));
                      resetNavigation();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Kiosk tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {kiosks.length === 0 && (
                        <SelectItem value="" disabled>
                          Kiosklar topilmadi
                        </SelectItem>
                      )}
                      {kiosks.map((kiosk) => (
                        <SelectItem key={kiosk.id} value={String(kiosk.id)}>
                          {kiosk.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeKiosk && (
                    <div className="text-xs text-muted-foreground">
                      {getFloorName(activeKiosk.floor_id)} qavat
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Boshlanish xonasi</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Boshlanish xonasi..."
                      aria-label="Boshlanish xonasi"
                      value={startRoomQuery}
                      onChange={(e) => {
                        setStartRoomQuery(e.target.value);
                        if (startRoom) setStartRoom(null);
                      }}
                      className="pl-10"
                    />
                  </div>
                  {startRoom && (
                    <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                      <span>{startRoom.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStartRoom(null);
                          setStartRoomQuery('');
                          setStartRoomResults([]);
                          resetNavigation();
                        }}
                      >
                        Tozalash
                      </Button>
                    </div>
                  )}
                  {startRoomResults.length > 0 && (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {startRoomResults.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => handleStartRoomSelect(room)}
                          className={cn(
                            'w-full text-left p-3 rounded-md border border-border hover:border-primary/50 transition',
                            startRoom?.id === room.id && 'border-primary bg-primary/5'
                          )}
                        >
                          <div className="font-medium text-foreground">{room.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {getFloorName(room.floor_id)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {startRoomQuery && startRoomResults.length === 0 && (
                    <div className="text-xs text-muted-foreground">Xonalar topilmadi</div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Boradigan joy</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Manzil xonasini kiriting..."
                    aria-label="Manzil xonasi"
                    value={endRoomQuery}
                    onChange={(e) => {
                      setEndRoomQuery(e.target.value);
                      if (endRoom) setEndRoom(null);
                    }}
                    className="pl-10"
                  />
                </div>
                {endRoom && (
                  <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                    <span>{endRoom.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEndRoom(null);
                        setEndRoomQuery('');
                        setEndRoomResults([]);
                        resetNavigation();
                      }}
                    >
                      Tozalash
                    </Button>
                  </div>
                )}
                {endRoomResults.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {endRoomResults.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => handleEndRoomSelect(room)}
                        className={cn(
                          'w-full text-left p-3 rounded-md border border-border hover:border-primary/50 transition',
                          endRoom?.id === room.id && 'border-primary bg-primary/5'
                        )}
                      >
                        <div className="font-medium text-foreground">{room.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {getFloorName(room.floor_id)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {endRoomQuery && endRoomResults.length === 0 && (
                  <div className="text-xs text-muted-foreground">Xonalar topilmadi</div>
                )}
              </div>

              <Button onClick={handleNavigate} disabled={navigating} className="w-full gap-2">
                <Navigation className="w-4 h-4" />
                {navigating ? "Yo'l hisoblanmoqda..." : "Yo'l topish"}
              </Button>
            </div>
          </Card>

          {navigationResult && (
            <Card className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">Yo'l ma'lumotlari</h3>
                <p className="text-xs text-muted-foreground">{startLabel} {'->'} {endLabel}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-xl font-bold text-foreground">
                    {Math.round(navigationResult.total_distance)}
                  </p>
                  <p className="text-xs text-muted-foreground">metr</p>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-xl font-bold text-foreground">
                    {navigationResult.floor_changes}
                  </p>
                  <p className="text-xs text-muted-foreground">qavat</p>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-xl font-bold text-foreground">
                    {Math.round(navigationResult.estimated_time_minutes)}
                  </p>
                  <p className="text-xs text-muted-foreground">daqiqa</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Boshlanish</span>
                <span className="text-right">{startLabel}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Manzil</span>
                <span className="text-right">{endLabel}</span>
              </div>
            </Card>
          )}

        </div>

        {/* Result view */}
        <div className="space-y-4">
          {navigating ? (
            <Card className="p-12 text-center">
              <div className="animate-pulse">
                <Navigation className="w-12 h-12 mx-auto text-primary mb-4" />
                <p className="text-muted-foreground">Yo'l hisoblanmoqda...</p>
              </div>
            </Card>
          ) : navigationResult ? (
            viewMode === 'map' ? (
              <Card className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Xaritada ko'rish</h3>
                    <p className="text-xs text-muted-foreground">Yo'l xaritada ko'rsatiladi</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="w-4 h-4" />
                    Matnli yo'lga qaytish
                  </Button>
                </div>

                {/* Floor Navigation Controls */}
                {floorsInPath.length > 1 && (
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevFloor}
                        disabled={currentFloorIndex === 0}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Oldingi
                      </Button>
                      <span className="text-sm font-medium">
                        {getFloorName(floorsInPath[currentFloorIndex])}
                        <span className="text-muted-foreground ml-2">
                          ({currentFloorIndex + 1}/{floorsInPath.length})
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextFloor}
                        disabled={currentFloorIndex === floorsInPath.length - 1}
                      >
                        Keyingi
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>

                    {/* Floor Slider */}
                    <div className="px-2">
                      <Slider
                        value={[currentFloorIndex]}
                        min={0}
                        max={floorsInPath.length - 1}
                        step={1}
                        onValueChange={([value]) => setCurrentFloorIndex(value)}
                      />
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground flex-wrap gap-2">
                        {floorsInPath.map((floorId, idx) => (
                          <span
                            key={floorId}
                            className={cn(
                              'cursor-pointer hover:text-foreground transition-colors',
                              idx === currentFloorIndex && 'text-primary font-medium'
                            )}
                            onClick={() => setCurrentFloorIndex(idx)}
                          >
                            {getFloorName(floorId)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Canvas */}
                <div
                  ref={canvasContainerRef}
                  className="rounded-lg overflow-hidden border border-border w-full aspect-[7/5]"
                >
                  <canvas ref={canvasRef} className="w-full h-full" />
                </div>

                {/* Path Steps for Current Floor */}
                <div className="mt-4 max-h-48 overflow-y-auto">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {getFloorName(floorsInPath[currentFloorIndex])} - Yo'l bosqichlari
                  </Label>
                  <div className="space-y-1 mt-2">
                    {navigationResult.path
                      .filter((step) => step.floor_id === floorsInPath[currentFloorIndex])
                      .map((step, index) => (
                        <div
                          key={`${step.waypoint_id}-${index}`}
                          className="flex items-center gap-2 p-2 rounded bg-muted text-sm"
                        >
                          <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                            {index + 1}
                          </div>
                          <span>{step.instruction || step.label || step.type}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Matnli yo'l</h3>
                    <p className="text-xs text-muted-foreground">Bosqichma-bosqich ko'rsatma</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setViewMode('map')}
                  >
                    <MapIcon className="w-4 h-4" />
                    Xaritada ko'rish
                  </Button>
                </div>

                <div className="space-y-4">
                  {instructionGroups.map((group) => (
                    <div key={group.floorId} className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        {getFloorName(group.floorId)}
                      </Label>
                      <div className="space-y-2">
                        {group.steps.map(({ step, index }) => (
                          <div
                            key={`${step.waypoint_id}-${index}`}
                            className="flex items-start gap-3 rounded-md border border-border p-3"
                          >
                            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                              {index}
                            </div>
                            <div className="text-sm text-foreground">
                              {step.instruction || step.label || step.type}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          ) : (
            <Card className="p-12 text-center border-dashed">
              <Navigation className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Navigatsiya xaritasi</h3>
              <p className="text-muted-foreground">
                Yo'l ko'rsatish uchun boshlanish va manzilni tanlang
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
