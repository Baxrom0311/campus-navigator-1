import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Navigation, MapPin, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Canvas as FabricCanvas, FabricImage, Circle, Polyline } from 'fabric';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { roomsApi, navigationApi, floorsApi, waypointsApi, getApiUrl } from '@/lib/api/client';
import { Room, Floor, NavigationResponse, PathStep, Waypoint } from '@/lib/api/types';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function NavigationPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [navigationResult, setNavigationResult] = useState<NavigationResponse | null>(null);
  const [navigating, setNavigating] = useState(false);
  
  // Floor visualization state
  const [currentFloorIndex, setCurrentFloorIndex] = useState(0);
  const [floorsInPath, setFloorsInPath] = useState<number[]>([]);
  const [floorWaypoints, setFloorWaypoints] = useState<Record<number, Waypoint[]>>({});
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  
  const { kioskWaypointId } = useAppStore();

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [roomsData, floorsData] = await Promise.all([
          roomsApi.getAll(),
          floorsApi.getAll(),
        ]);
        setRooms(roomsData);
        setFloors(floorsData);
      } catch (error) {
        toast.error("Ma'lumotlarni yuklashda xato");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 700,
      height: 500,
      backgroundColor: '#1a1a2e',
      selection: false,
    });

    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
    };
  }, []);

  // Search effect
  useEffect(() => {
    if (searchQuery.length > 0) {
      const results = rooms.filter((room) =>
        room.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(results.slice(0, 10));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, rooms]);

  // Resolve media URL helper
  const resolveMediaUrl = useCallback((url: string) => {
    if (/^https?:\/\//i.test(url)) return url;
    const base = getApiUrl().replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }, []);

  // Get unique floors from path
  const getFloorsInPath = useCallback((path: PathStep[]): number[] => {
    const floorIds = [...new Set(path.map((step) => step.floor_id))];
    return floorIds.sort((a, b) => a - b);
  }, []);

  // Fetch waypoints for all floors in path
  const fetchFloorWaypoints = useCallback(async (floorIds: number[]) => {
    const waypointsMap: Record<number, Waypoint[]> = {};
    await Promise.all(
      floorIds.map(async (floorId) => {
        try {
          waypointsMap[floorId] = await waypointsApi.getByFloor(floorId);
        } catch {
          waypointsMap[floorId] = [];
        }
      })
    );
    setFloorWaypoints(waypointsMap);
  }, []);

  // Draw the current floor with path
  const drawFloorWithPath = useCallback(async () => {
    if (!fabricCanvas || !navigationResult || floorsInPath.length === 0) return;

    const currentFloorId = floorsInPath[currentFloorIndex];
    const floor = floors.find((f) => f.id === currentFloorId);
    if (!floor) return;

    // Clear canvas
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#1a1a2e';

    // Get path steps for this floor
    const floorPathSteps = navigationResult.path.filter(
      (step) => step.floor_id === currentFloorId
    );

    // Load floor image
    if (floor.image_url) {
      const imageUrl = resolveMediaUrl(floor.image_url);
      
      try {
        const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });
        const canvasWidth = fabricCanvas.width || 700;
        const canvasHeight = fabricCanvas.height || 500;
        
        const scale = Math.min(
          canvasWidth / (img.width || 1),
          canvasHeight / (img.height || 1)
        ) * 0.95;

        const offsetX = (canvasWidth - (img.width || 0) * scale) / 2;
        const offsetY = (canvasHeight - (img.height || 0) * scale) / 2;

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

        // Draw path on this floor
        if (floorPathSteps.length >= 2) {
          const points = floorPathSteps.map((step) => ({
            x: step.x * scale + offsetX,
            y: step.y * scale + offsetY,
          }));

          const pathLine = new Polyline(points, {
            stroke: '#22C55E',
            strokeWidth: 4,
            fill: 'transparent',
            selectable: false,
            evented: false,
            strokeDashArray: [10, 5],
          });

          fabricCanvas.add(pathLine);

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
        } else if (floorPathSteps.length === 1) {
          // Single point on floor
          const point = floorPathSteps[0];
          const marker = new Circle({
            left: point.x * scale + offsetX,
            top: point.y * scale + offsetY,
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

        fabricCanvas.renderAll();
      } catch (error) {
        console.error('Error loading floor image:', error);
      }
    }
  }, [fabricCanvas, navigationResult, floorsInPath, currentFloorIndex, floors, resolveMediaUrl]);

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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const results = await roomsApi.search(searchQuery);
      setSearchResults(results);
    } catch (error) {
      toast.error('Qidirishda xato');
    }
  };

  const handleNavigate = async (room: Room) => {
    if (!kioskWaypointId) {
      toast.error('Kiosk joylashuvi sozlanmagan. Sozlamalar sahifasida belgilang.');
      return;
    }

    setSelectedRoom(room);
    setNavigating(true);

    try {
      const result = await navigationApi.findPath({
        start_waypoint_id: kioskWaypointId,
        end_room_id: room.id,
      });
      setNavigationResult(result);

      // Get floors in path
      const floorIds = getFloorsInPath(result.path);
      setFloorsInPath(floorIds);
      setCurrentFloorIndex(0);

      // Fetch waypoints for these floors
      await fetchFloorWaypoints(floorIds);
    } catch (error) {
      toast.error("Yo'l topilmadi");
      setNavigationResult(null);
      setFloorsInPath([]);
    } finally {
      setNavigating(false);
    }
  };

  const getFloorName = (floorId: number) => {
    const floor = floors.find((f) => f.id === floorId);
    return floor?.name || `Qavat ${floorId}`;
  };

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
    <div className="p-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Navigatsiya</h1>
        <p className="text-muted-foreground mt-1">
          Xonani qidiring va yo'lni ko'ring
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Search Section */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Xona qidirish</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Xona raqami yoki nomi..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="pl-10"
                    />
                  </div>
                  <Button onClick={handleSearch}>
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Natijalar
                  </Label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {searchResults.map((room) => (
                      <Card
                        key={room.id}
                        className={cn(
                          'p-4 cursor-pointer hover:border-primary/50 transition-all',
                          selectedRoom?.id === room.id && 'border-primary bg-primary/5'
                        )}
                        onClick={() => handleNavigate(room)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-foreground">{room.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {getFloorName(room.floor_id)}
                              {room.building && ` • ${room.building}`}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon">
                            <Navigation className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {searchQuery && searchResults.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Xonalar topilmadi</p>
                </div>
              )}
            </div>
          </Card>

          {/* Navigation Stats */}
          {navigationResult && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-success" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Yo'l: {selectedRoom?.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {getFloorName(selectedRoom?.floor_id || 0)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {Math.round(navigationResult.total_distance)}
                  </p>
                  <p className="text-xs text-muted-foreground">metr</p>
                </div>
                <div className="p-4 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {navigationResult.floor_changes}
                  </p>
                  <p className="text-xs text-muted-foreground">qavat o'zgarish</p>
                </div>
                <div className="p-4 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {Math.round(navigationResult.estimated_time_minutes)}
                  </p>
                  <p className="text-xs text-muted-foreground">daqiqa</p>
                </div>
              </div>
            </Card>
          )}

          {/* Kiosk Status */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-3 h-3 rounded-full',
                kioskWaypointId ? 'bg-success' : 'bg-warning'
              )} />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {kioskWaypointId ? 'Kiosk joylashuvi belgilangan' : 'Kiosk joylashuvi belgilanmagan'}
                </p>
                {kioskWaypointId && (
                  <p className="text-xs text-muted-foreground">ID: {kioskWaypointId}</p>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Map Visualization */}
        <div>
          {navigating ? (
            <Card className="p-12 text-center">
              <div className="animate-pulse">
                <Navigation className="w-12 h-12 mx-auto text-primary mb-4" />
                <p className="text-muted-foreground">Yo'l hisoblanmoqda...</p>
              </div>
            </Card>
          ) : navigationResult ? (
            <Card className="p-4">
              {/* Floor Navigation Controls */}
              {floorsInPath.length > 1 && (
                <div className="mb-4 space-y-3">
                  <div className="flex items-center justify-between">
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
                    <div className="flex justify-between mt-1 text-xs text-muted-foreground">
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
              <div className="rounded-lg overflow-hidden border border-border">
                <canvas ref={canvasRef} />
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
                        key={index}
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
            <Card className="p-12 text-center border-dashed">
              <Navigation className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Navigatsiya xaritasi
              </h3>
              <p className="text-muted-foreground">
                Yo'l ko'rsatish uchun xonani tanlang
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
