import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Canvas as FabricCanvas, Circle, Line, FabricImage } from 'fabric';
import { 
  ArrowLeft, 
  MousePointer, 
  MapPin, 
  Link2, 
  Trash2,
  Save,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { floorsApi, waypointsApi, connectionsApi, roomsApi, kiosksApi, getApiUrl } from '@/lib/api/client';
import { Floor, Waypoint, Connection, Room, WaypointType, WaypointCreate, ConnectionCreate, Kiosk } from '@/lib/api/types';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const WAYPOINT_COLORS: Record<WaypointType, string> = {
  hallway: '#4A90D9',
  room: '#22C55E',
  stairs: '#F59E0B',
  elevator: '#A855F7',
  hall: '#EF4444',
};

const KIOSK_COLOR = '#EC4899'; // Pink for kiosk points

const WAYPOINT_LABELS: Record<WaypointType, string> = {
  hallway: 'Koridor',
  room: 'Xona',
  stairs: 'Zina',
  elevator: 'Lift',
  hall: 'Zal',
};

export default function FloorEditorPage() {
  const { floorId } = useParams<{ floorId: string }>();
  const navigate = useNavigate();
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  
  const [floor, setFloor] = useState<Floor | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    editorMode,
    setEditorMode,
    selectedWaypointType,
    setSelectedWaypointType,
    connectionStartWaypoint,
    setConnectionStartWaypoint,
    selectedWaypoint,
    setSelectedWaypoint,
  } = useAppStore();

  const [zoom, setZoom] = useState(1);
  const [editingWaypoint, setEditingWaypoint] = useState<Waypoint | null>(null);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      if (!floorId) return;
      
      try {
        const [floorData, waypointsData, connectionsData, roomsData, kiosksData] = await Promise.all([
          floorsApi.getOne(parseInt(floorId)),
          waypointsApi.getByFloor(parseInt(floorId)),
          connectionsApi.getByFloor(parseInt(floorId)),
          roomsApi.getByFloor(parseInt(floorId)),
          kiosksApi.getAll().then(all => all.filter(k => k.floor_id === parseInt(floorId!))).catch(() => []),
        ]);
        
        setFloor(floorData);
        setWaypoints(waypointsData);
        setConnections(connectionsData);
        setRooms(roomsData);
        setKiosks(kiosksData);
      } catch (error) {
        toast.error("Ma'lumotlarni yuklashda xato");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [floorId]);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !floor) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: '#1a1a2e',
      selection: false,
    });

    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
    };
  }, [floor]);

  // Load floor image
  useEffect(() => {
    if (!fabricCanvas || !floor?.image_url) return;

    const resolveMediaUrl = (url: string) => {
      if (/^https?:\/\//i.test(url)) return url;
      const base = getApiUrl().replace(/\/$/, '');
      const path = url.startsWith('/') ? url : `/${url}`;
      return `${base}${path}`;
    };

    const imageUrl = resolveMediaUrl(floor.image_url);

    FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then((img) => {
      // Scale image to fit canvas
      const canvasWidth = fabricCanvas.width || 1200;
      const canvasHeight = fabricCanvas.height || 800;

      const scale =
        Math.min(canvasWidth / (img.width || 1), canvasHeight / (img.height || 1)) * 0.9;

      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (canvasWidth - (img.width || 0) * scale) / 2,
        top: (canvasHeight - (img.height || 0) * scale) / 2,
        selectable: false,
        evented: false,
      });

      fabricCanvas.add(img);
      fabricCanvas.sendObjectToBack(img);
      fabricCanvas.renderAll();
    });
  }, [fabricCanvas, floor?.image_url]);

  // Draw connections
  const drawConnections = useCallback(() => {
    if (!fabricCanvas) return;

    // Remove existing connection lines
    fabricCanvas.getObjects('line').forEach((obj) => {
      fabricCanvas.remove(obj);
    });

    connections.forEach((conn) => {
      const fromWp = waypoints.find((w) => w.id === conn.from_waypoint_id);
      const toWp = waypoints.find((w) => w.id === conn.to_waypoint_id);
      
      if (fromWp && toWp) {
        const line = new Line([fromWp.x, fromWp.y, toWp.x, toWp.y], {
          stroke: '#4A90D9',
          strokeWidth: 2,
          selectable: false,
          evented: false,
          opacity: 0.6,
        });
        
        fabricCanvas.add(line);
        // Move line behind other objects
        const objects = fabricCanvas.getObjects();
        const lineIndex = objects.indexOf(line);
        if (lineIndex > 0) {
          fabricCanvas.moveObjectTo(line, 0);
        }
      }
    });

    fabricCanvas.renderAll();
  }, [fabricCanvas, connections, waypoints]);

  // Draw waypoints
  const WAYPOINT_RADIUS = 10;
  
  const drawWaypoints = useCallback(() => {
    if (!fabricCanvas) return;

    // Remove existing circles
    fabricCanvas.getObjects('circle').forEach((obj) => {
      fabricCanvas.remove(obj);
    });

    // Get kiosk waypoint IDs for highlighting
    const kioskWaypointIds = new Set(kiosks.map(k => k.waypoint_id));

    waypoints.forEach((wp) => {
      const isKiosk = kioskWaypointIds.has(wp.id);
      const color = isKiosk ? KIOSK_COLOR : WAYPOINT_COLORS[wp.type];
      const radius = isKiosk ? WAYPOINT_RADIUS + 3 : WAYPOINT_RADIUS;

      const circle = new Circle({
        left: wp.x,
        top: wp.y,
        radius: radius,
        fill: color,
        stroke: selectedWaypoint?.id === wp.id ? '#fff' : isKiosk ? '#fff' : 'rgba(0,0,0,0.3)',
        strokeWidth: selectedWaypoint?.id === wp.id ? 3 : isKiosk ? 2 : 1,
        selectable: editorMode === 'select',
        evented: true, // Always evented for click detection
        hasControls: false,
        hasBorders: false,
        originX: 'center',
        originY: 'center',
        data: { waypoint: wp, isKiosk },
        // Increase hit area for easier clicking
        padding: 5,
      });

      fabricCanvas.add(circle);
    });

    fabricCanvas.renderAll();
  }, [fabricCanvas, waypoints, selectedWaypoint, editorMode, kiosks]);

  // Update canvas when data changes
  useEffect(() => {
    drawConnections();
    drawWaypoints();
  }, [drawConnections, drawWaypoints]);

  // Handle canvas click
  useEffect(() => {
    if (!fabricCanvas) return;

    const handleMouseDown = async (e: any) => {
      const pointer = fabricCanvas.getPointer(e.e);
      const target = fabricCanvas.findTarget(e.e);

      if (editorMode === 'waypoint') {
        // Create new waypoint
        const newWaypoint: WaypointCreate = {
          id: `wp_${Date.now()}`,
          floor_id: parseInt(floorId!),
          x: Math.round(pointer.x),
          y: Math.round(pointer.y),
          type: selectedWaypointType,
        };

        try {
          const created = await waypointsApi.create(newWaypoint);
          setWaypoints((prev) => [...prev, created]);
          toast.success('Nuqta yaratildi');
          
          // If it's a room type, show room creation dialog
          if (selectedWaypointType === 'room') {
            setEditingWaypoint(created);
          }
        } catch (error) {
          toast.error('Nuqta yaratishda xato');
        }
      } else if (editorMode === 'connection' && target) {
        const wpData = (target as any).data?.waypoint as Waypoint | undefined;
        
        if (wpData) {
          if (!connectionStartWaypoint) {
            setConnectionStartWaypoint(wpData);
            toast.info(`Boshlanish nuqtasi: ${wpData.label || wpData.id}`);
          } else if (connectionStartWaypoint.id !== wpData.id) {
            // Create connection
            const distance = Math.sqrt(
              Math.pow(wpData.x - connectionStartWaypoint.x, 2) +
              Math.pow(wpData.y - connectionStartWaypoint.y, 2)
            );

            const newConnection: ConnectionCreate = {
              id: `conn_${Date.now()}`,
              from_waypoint_id: connectionStartWaypoint.id,
              to_waypoint_id: wpData.id,
              distance: Math.round(distance),
            };

            try {
              const created = await connectionsApi.create(newConnection);
              setConnections((prev) => [...prev, created]);
              toast.success("Bog'lanish yaratildi");
            } catch (error) {
              toast.error("Bog'lanish yaratishda xato");
            }

            setConnectionStartWaypoint(null);
          }
        }
      } else if (editorMode === 'select' && target) {
        const wpData = (target as any).data?.waypoint as Waypoint | undefined;
        if (wpData) {
          setSelectedWaypoint(wpData);
          setEditingWaypoint(wpData);
        }
      } else if (editorMode === 'delete' && target) {
        const wpData = (target as any).data?.waypoint as Waypoint | undefined;
        if (wpData) {
          try {
            await waypointsApi.delete(wpData.id);
            setWaypoints((prev) => prev.filter((w) => w.id !== wpData.id));
            setConnections((prev) => 
              prev.filter((c) => c.from_waypoint_id !== wpData.id && c.to_waypoint_id !== wpData.id)
            );
            toast.success("Nuqta o'chirildi");
          } catch (error) {
            toast.error("Nuqta o'chirishda xato");
          }
        }
      }
    };

    fabricCanvas.on('mouse:down', handleMouseDown);

    return () => {
      fabricCanvas.off('mouse:down', handleMouseDown);
    };
  }, [fabricCanvas, editorMode, selectedWaypointType, connectionStartWaypoint, floorId]);

  // Handle object moving (drag waypoint)
  useEffect(() => {
    if (!fabricCanvas) return;

    const handleObjectMoving = (e: any) => {
      if (editorMode !== 'select') return;
      
      const target = e.target;
      const wpData = target?.data?.waypoint as Waypoint | undefined;
      
      if (wpData) {
        // Using center origin, so position is the center
        wpData.x = Math.round(target.left);
        wpData.y = Math.round(target.top);
      }
    };

    const handleObjectModified = async (e: any) => {
      const target = e.target;
      const wpData = target?.data?.waypoint as Waypoint | undefined;
      
      if (wpData) {
        try {
          const newX = Math.round(target.left);
          const newY = Math.round(target.top);
          
          await waypointsApi.update(wpData.id, {
            x: newX,
            y: newY,
          });
          
          setWaypoints((prev) =>
            prev.map((w) =>
              w.id === wpData.id
                ? { ...w, x: newX, y: newY }
                : w
            )
          );
        } catch (error) {
          toast.error('Nuqta yangilashda xato');
        }
      }
    };

    fabricCanvas.on('object:moving', handleObjectMoving);
    fabricCanvas.on('object:modified', handleObjectModified);

    return () => {
      fabricCanvas.off('object:moving', handleObjectMoving);
      fabricCanvas.off('object:modified', handleObjectModified);
    };
  }, [fabricCanvas, editorMode]);

  // Zoom functions
  const handleZoomIn = () => {
    if (!fabricCanvas) return;
    const newZoom = Math.min(zoom * 1.2, 3);
    setZoom(newZoom);
    fabricCanvas.setZoom(newZoom);
    fabricCanvas.renderAll();
  };

  const handleZoomOut = () => {
    if (!fabricCanvas) return;
    const newZoom = Math.max(zoom / 1.2, 0.5);
    setZoom(newZoom);
    fabricCanvas.setZoom(newZoom);
    fabricCanvas.renderAll();
  };

  const handleResetZoom = () => {
    if (!fabricCanvas) return;
    setZoom(1);
    fabricCanvas.setZoom(1);
    fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fabricCanvas.renderAll();
  };

  // Update waypoint with room
  const handleUpdateWaypoint = async () => {
    if (!editingWaypoint) return;

    try {
      await waypointsApi.update(editingWaypoint.id, {
        label: editingWaypoint.label,
        type: editingWaypoint.type,
      });
      
      setWaypoints((prev) =>
        prev.map((w) => (w.id === editingWaypoint.id ? editingWaypoint : w))
      );
      
      toast.success('Nuqta yangilandi');
      setEditingWaypoint(null);
    } catch (error) {
      toast.error('Nuqta yangilashda xato');
    }
  };

  // Link room to waypoint
  const handleLinkRoom = async (roomId: string) => {
    if (!editingWaypoint) return;

    // Backend id string yoki integer bo'lishi mumkin; requestni har ikki holatda yuboramiz
    const room = rooms.find((r) => String(r.id) === roomId);
    if (!room) return;

    try {
      await roomsApi.update(roomId, { waypoint_id: editingWaypoint.id });

      setRooms((prev) =>
        prev.map((r) =>
          String(r.id) === roomId ? { ...r, waypoint_id: editingWaypoint.id } : r
        )
      );

      toast.success(`"${room.name}" xonasi bog'landi`);
    } catch (error) {
      toast.error("Xonani bog'lashda xato");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Yuklanmoqda...</div>
      </div>
    );
  }

  if (!floor) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Qavat topilmadi</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/floors')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{floor.name}</h1>
            <p className="text-sm text-muted-foreground">
              {waypoints.length} nuqta • {connections.length} bog'lanish
            </p>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleZoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground w-16 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="outline" size="icon" onClick={handleZoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleResetZoom}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Toolbar */}
        <div className="w-72 border-r border-border p-4 space-y-6 overflow-y-auto">
          {/* Mode Selection */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Asboblar
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={editorMode === 'select' ? 'default' : 'outline'}
                className="justify-start gap-2"
                onClick={() => setEditorMode('select')}
              >
                <MousePointer className="w-4 h-4" />
                Tanlash
              </Button>
              <Button
                variant={editorMode === 'waypoint' ? 'default' : 'outline'}
                className="justify-start gap-2"
                onClick={() => setEditorMode('waypoint')}
              >
                <MapPin className="w-4 h-4" />
                Nuqta
              </Button>
              <Button
                variant={editorMode === 'connection' ? 'default' : 'outline'}
                className="justify-start gap-2"
                onClick={() => setEditorMode('connection')}
              >
                <Link2 className="w-4 h-4" />
                Bog'lash
              </Button>
              <Button
                variant={editorMode === 'delete' ? 'destructive' : 'outline'}
                className="justify-start gap-2"
                onClick={() => setEditorMode('delete')}
              >
                <Trash2 className="w-4 h-4" />
                O'chirish
              </Button>
            </div>
          </div>

          {/* Waypoint Type Selection */}
          {editorMode === 'waypoint' && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Nuqta turi
              </Label>
              <div className="space-y-2">
                {(Object.keys(WAYPOINT_COLORS) as WaypointType[]).map((type) => (
                  <Button
                    key={type}
                    variant={selectedWaypointType === type ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-3"
                    onClick={() => setSelectedWaypointType(type)}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: WAYPOINT_COLORS[type] }}
                    />
                    {WAYPOINT_LABELS[type]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Connection Mode Info */}
          {editorMode === 'connection' && (
            <Card className="p-4 bg-primary/10 border-primary/20">
              <p className="text-sm">
                {connectionStartWaypoint
                  ? `Tugash nuqtasini tanlang`
                  : 'Boshlanish nuqtasini tanlang'}
              </p>
              {connectionStartWaypoint && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setConnectionStartWaypoint(null)}
                >
                  Bekor qilish
                </Button>
              )}
            </Card>
          )}

          {/* Waypoint Legend */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Nuqta turlari
            </Label>
            <div className="space-y-2">
              {(Object.keys(WAYPOINT_COLORS) as WaypointType[]).map((type) => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: WAYPOINT_COLORS[type] }}
                  />
                  <span className="text-muted-foreground">{WAYPOINT_LABELS[type]}</span>
                  <span className="ml-auto text-muted-foreground">
                    {waypoints.filter((w) => w.type === type).length}
                  </span>
                </div>
              ))}
              {/* Kiosk indicator */}
              <div className="flex items-center gap-2 text-sm pt-2 border-t border-border">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: KIOSK_COLOR }}
                />
                <span className="text-muted-foreground">Kiosk</span>
                <span className="ml-auto text-muted-foreground">
                  {kiosks.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Canvas Container */}
        <div className="flex-1 p-4 overflow-auto bg-muted/30">
          <div className="canvas-container inline-block">
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Properties Panel */}
        {editingWaypoint && (
          <div className="w-80 border-l border-border p-4 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Nuqta sozlamalari</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingWaypoint(null)}
              >
                ✕
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Yorliq</Label>
                <Input
                  value={editingWaypoint.label || ''}
                  onChange={(e) =>
                    setEditingWaypoint({ ...editingWaypoint, label: e.target.value })
                  }
                  placeholder="Nuqta nomi"
                />
              </div>

              <div className="space-y-2">
                <Label>Turi</Label>
                <Select
                  value={editingWaypoint.type}
                  onValueChange={(value: WaypointType) =>
                    setEditingWaypoint({ ...editingWaypoint, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(WAYPOINT_COLORS) as WaypointType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: WAYPOINT_COLORS[type] }}
                          />
                          {WAYPOINT_LABELS[type]}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>X</Label>
                  <Input value={editingWaypoint.x} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Y</Label>
                  <Input value={editingWaypoint.y} disabled />
                </div>
              </div>

              {/* Room linking for room-type waypoints */}
              {editingWaypoint.type === 'room' && (
                <div className="space-y-2">
                  <Label>Xonani bog'lash</Label>
                  <Select onValueChange={handleLinkRoom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Xonani tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms
                        .filter((r) => !r.waypoint_id || r.waypoint_id === editingWaypoint.id)
                        .map((room) => (
                          <SelectItem key={room.id} value={room.id.toString()}>
                            {room.name} {room.waypoint_id === editingWaypoint.id ? "(bog'langan)" : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleUpdateWaypoint} className="w-full gap-2">
                <Save className="w-4 h-4" />
                Saqlash
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}