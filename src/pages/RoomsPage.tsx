import { useEffect, useState } from 'react';
import { Plus, Trash2, Search, DoorOpen, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { roomsApi, floorsApi, waypointsApi } from '@/lib/api/client';
import { Room, RoomCreate, Floor, Waypoint } from '@/lib/api/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  
  const [newRoom, setNewRoom] = useState<Partial<RoomCreate>>({
    name: '',
    waypoint_id: null,
    floor_id: 0,
  });

  const fetchData = async () => {
    try {
      const [roomsData, floorsData] = await Promise.all([
        roomsApi.getAll(),
        floorsApi.getAll(),
      ]);
      setRooms(roomsData);
      setFloors(floorsData.sort((a, b) => a.floor_number - b.floor_number));
    } catch (error) {
      toast.error("Ma'lumotlarni yuklashda xato");
    } finally {
      setLoading(false);
    }
  };

  // Fetch waypoints when floor is selected
  const fetchWaypoints = async (floorId: number) => {
    try {
      const data = await waypointsApi.getByFloor(floorId);
      // Filter only room-type waypoints that are not linked
      setWaypoints(data.filter((w) => w.type === 'room'));
    } catch (error) {
      console.error('Error fetching waypoints:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (newRoom.floor_id) {
      fetchWaypoints(newRoom.floor_id);
    }
  }, [newRoom.floor_id]);

  const handleCreate = async () => {
    if (!newRoom.name?.trim() || !newRoom.floor_id) {
      toast.error("Xona nomini va qavatni kiriting");
      return;
    }

    try {
      const roomToCreate: RoomCreate = {
        name: newRoom.name,
        waypoint_id: newRoom.waypoint_id || null,
        floor_id: newRoom.floor_id,
      };

      await roomsApi.create(roomToCreate);
      toast.success('Xona yaratildi');
      setIsCreateOpen(false);
      setNewRoom({
        name: '',
        waypoint_id: null,
        floor_id: 0,
      });
      fetchData();
    } catch (error) {
      toast.error('Xona yaratishda xato');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Xonani o'chirishni xohlaysizmi?")) return;

    try {
      await roomsApi.delete(id);
      toast.success("Xona o'chirildi");
      fetchData();
    } catch (error) {
      toast.error("Xona o'chirishda xato");
    }
  };

  const filteredRooms = rooms.filter((room) => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFloor = !selectedFloorId || room.floor_id === selectedFloorId;
    return matchesSearch && matchesFloor;
  });

  const getFloorName = (floorId: number | null) => {
    if (!floorId) return '—';
    const floor = floors.find((f) => f.id === floorId);
    return floor?.name || `Qavat ${floorId}`;
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Xonalar</h1>
          <p className="text-muted-foreground mt-1">Xonalarni boshqaring va nuqtalarga bog'lang</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Yangi xona
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yangi xona yaratish</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Xona nomi *</Label>
                <Input
                  placeholder="Masalan: 101-xona"
                  value={newRoom.name || ''}
                  onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Qavat *</Label>
                <Select
                  value={newRoom.floor_id?.toString() || ''}
                  onValueChange={(value) => setNewRoom({ ...newRoom, floor_id: parseInt(value), waypoint_id: null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Qavatni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map((floor) => (
                      <SelectItem key={floor.id} value={floor.id.toString()}>
                        {floor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newRoom.floor_id && waypoints.length > 0 && (
                <div className="space-y-2">
                  <Label>Nuqtaga bog'lash</Label>
                  <Select
                    value={newRoom.waypoint_id || ''}
                    onValueChange={(value) => setNewRoom({ ...newRoom, waypoint_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nuqtani tanlang (ixtiyoriy)" />
                    </SelectTrigger>
                    <SelectContent>
                      {waypoints.map((wp) => (
                        <SelectItem key={wp.id} value={wp.id}>
                          {wp.label || wp.id} ({wp.x}, {wp.y})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleCreate} className="w-full">
                Yaratish
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Xonalarni qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={selectedFloorId?.toString() || 'all'}
          onValueChange={(value) => setSelectedFloorId(value === 'all' ? null : parseInt(value))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Barcha qavatlar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha qavatlar</SelectItem>
            {floors.map((floor) => (
              <SelectItem key={floor.id} value={floor.id.toString()}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredRooms.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <DoorOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            {searchQuery ? 'Xonalar topilmadi' : "Xonalar yo'q"}
          </h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery ? "Qidiruv so'rovini o'zgartiring" : "Boshlash uchun yangi xona qo'shing"}
          </p>
          {!searchQuery && (
            <Button onClick={() => setIsCreateOpen(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Xona qo'shish
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRooms.map((room, index) => (
            <Card
              key={room.id}
              className={cn(
                'p-4 hover:border-primary/50 transition-all group animate-fade-in'
              )}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{room.name}</h3>
                  <p className="text-sm text-muted-foreground">{getFloorName(room.floor_id)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={() => handleDelete(room.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {room.waypoint_id ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                  <Link2 className="w-3 h-3" />
                  <span>Nuqtaga bog'langan</span>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="w-3 h-3" />
                  <span>Bog'lanmagan</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
