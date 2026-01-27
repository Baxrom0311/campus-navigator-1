import { useState } from 'react';
import { Plus, Trash2, MapPin, Monitor, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useKiosks, useCreateKiosk, useDeleteKiosk, useUpdateKiosk } from '@/hooks/useKiosks';
import { useQuery } from '@tanstack/react-query';
import { floorsApi, waypointsApi } from '@/lib/api/client';
import { Kiosk } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export default function KiosksPage() {
  const { data: kiosks, isLoading } = useKiosks();
  const { data: floors } = useQuery({ queryKey: ['floors'], queryFn: () => floorsApi.getAll() });
  const createKiosk = useCreateKiosk();
  const deleteKiosk = useDeleteKiosk();
  const updateKiosk = useUpdateKiosk();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    floor_id: '',
    waypoint_id: '',
    description: '',
  });

  // Fetch waypoints for selected floor
  const [selectedFloorForWaypoints, setSelectedFloorForWaypoints] = useState<number | null>(null);
  const { data: waypoints } = useQuery({
    queryKey: ['waypoints', selectedFloorForWaypoints],
    queryFn: () => waypointsApi.getByFloor(selectedFloorForWaypoints!),
    enabled: !!selectedFloorForWaypoints,
  });

  const resetForm = () => {
    setFormData({ name: '', floor_id: '', waypoint_id: '', description: '' });
    setSelectedFloorForWaypoints(null);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.floor_id) return;

    if (editingId) {
      await updateKiosk.mutateAsync({
        id: editingId,
        data: {
          name: formData.name,
          floor_id: parseInt(formData.floor_id),
          waypoint_id: formData.waypoint_id || null,
          description: formData.description || null,
        },
      });
    } else {
      await createKiosk.mutateAsync({
        name: formData.name,
        floor_id: parseInt(formData.floor_id),
        waypoint_id: formData.waypoint_id || null,
        description: formData.description || null,
      });
    }
    setDialogOpen(false);
    resetForm();
  };

  const handleEdit = (kiosk: Kiosk) => {
    setEditingId(kiosk.id);
    setFormData({
      name: kiosk.name,
      floor_id: kiosk.floor_id.toString(),
      waypoint_id: kiosk.waypoint_id || '',
      description: kiosk.description || '',
    });
    setSelectedFloorForWaypoints(kiosk.floor_id);
    setDialogOpen(true);
  };

  const getFloorName = (floorId: number) => {
    return floors?.find((f) => f.id === floorId)?.name || `Qavat ${floorId}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Yuklanmoqda...</div>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kiosklar</h1>
          <p className="text-muted-foreground mt-1">
            Kiosk qurilmalarini boshqaring
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Yangi kiosk
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Kioskni tahrirlash' : 'Yangi kiosk'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Nomi</Label>
                <Input
                  placeholder="Kiosk nomi"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Qavat</Label>
                <Select
                  value={formData.floor_id}
                  onValueChange={(value) => {
                    setFormData({ ...formData, floor_id: value, waypoint_id: '' });
                    setSelectedFloorForWaypoints(parseInt(value));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Qavatni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {floors?.map((floor) => (
                      <SelectItem key={floor.id} value={floor.id.toString()}>
                        {floor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nuqta</Label>
                <Select
                  value={formData.waypoint_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, waypoint_id: value === 'none' ? '' : value })
                  }
                  disabled={!selectedFloorForWaypoints}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nuqtani tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Biriktirilmasin</SelectItem>
                    {waypoints?.map((wp) => (
                      <SelectItem key={wp.id} value={wp.id}>
                        {wp.label || wp.id} ({wp.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tavsif (ixtiyoriy)</Label>
                <Input
                  placeholder="Kiosk haqida ma'lumot"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Bekor qilish
                </Button>
                <Button onClick={handleSubmit} disabled={createKiosk.isPending || updateKiosk.isPending}>
                  {editingId ? 'Saqlash' : 'Yaratish'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kiosks Grid */}
      {!kiosks?.length ? (
        <Card className="p-12 text-center border-dashed">
          <Monitor className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Kiosklar yo'q</h3>
          <p className="text-muted-foreground mb-4">
            Birinchi kioskni yarating
          </p>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Yangi kiosk
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kiosks.map((kiosk) => (
            <Card key={kiosk.id} className="p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Monitor className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{kiosk.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {getFloorName(kiosk.floor_id)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(kiosk)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Kioskni o'chirish</AlertDialogTitle>
                        <AlertDialogDescription>
                          "{kiosk.name}" kioskini o'chirishni xohlaysizmi?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteKiosk.mutate(kiosk.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          O'chirish
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>Nuqta: {kiosk.waypoint_id || 'Belgilanmagan'}</span>
                </div>
                {kiosk.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {kiosk.description}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
