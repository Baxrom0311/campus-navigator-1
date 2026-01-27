import { useState, useEffect } from 'react';
import { Server, MapPin, Save, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
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
import { useAppStore } from '@/lib/store';
import { setApiUrl, getApiUrl, healthCheck, kiosksApi } from '@/lib/api/client';
import type { Kiosk } from '@/lib/api/types';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { 
    apiUrl, 
    setApiUrl: setStoreApiUrl, 
    kioskWaypointId, 
    setKioskWaypointId,
    isApiConnected,
    setIsApiConnected,
  } = useAppStore();

  const [localApiUrl, setLocalApiUrl] = useState(apiUrl || getApiUrl());
  const [testing, setTesting] = useState(false);
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [selectedKioskId, setSelectedKioskId] = useState<number | null>(null);

  const fetchKiosks = async () => {
    try {
      const data = await kiosksApi.getAll();
      setKiosks(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Error fetching kiosks:', error);
    }
  };

  useEffect(() => {
    if (isApiConnected) {
      fetchKiosks();
    }
  }, [isApiConnected]);

  useEffect(() => {
    if (!kioskWaypointId) {
      setSelectedKioskId(null);
      return;
    }
    const match = kiosks.find((kiosk) => kiosk.waypoint_id === kioskWaypointId);
    if (match) setSelectedKioskId(match.id);
  }, [kioskWaypointId, kiosks]);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      // Temporarily set the URL
      setApiUrl(localApiUrl);
      const result = await healthCheck();
      setIsApiConnected(result);
      
      if (result) {
        toast.success('API ulanishi muvaffaqiyatli');
      } else {
        toast.error('API bilan ulanib bo\'lmadi');
      }
    } catch (error) {
      toast.error('Ulanishda xato');
      setIsApiConnected(false);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveApiUrl = () => {
    setApiUrl(localApiUrl);
    setStoreApiUrl(localApiUrl);
    toast.success('API manzili saqlandi');
    handleTestConnection();
  };

  const handleSaveKioskLocation = () => {
    toast.success('Kiosk joylashuvi saqlandi');
  };

  const handleSelectKiosk = (value: string) => {
    const kioskId = parseInt(value, 10);
    setSelectedKioskId(kioskId);
    const kiosk = kiosks.find((item) => item.id === kioskId);
    if (!kiosk) {
      setKioskWaypointId(null);
      return;
    }
    if (kiosk.waypoint_id) {
      setKioskWaypointId(kiosk.waypoint_id);
    } else {
      setKioskWaypointId(null);
      toast.error('Tanlangan kiosk uchun nuqta belgilanmagan');
    }
  };

  return (
    <div className="p-8 max-w-2xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Sozlamalar</h1>
        <p className="text-muted-foreground mt-1">API va qurilma sozlamalari</p>
      </div>

      <div className="space-y-6">
        {/* API Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">API sozlamalari</h2>
              <p className="text-sm text-muted-foreground">Backend server manzili</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>API manzili</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="http://localhost:8000"
                  value={localApiUrl}
                  onChange={(e) => setLocalApiUrl(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  variant="outline" 
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </Button>
              </div>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              {isApiConnected ? (
                <>
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="text-sm text-success">Ulangan</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive">Ulanmagan</span>
                </>
              )}
            </div>

            <Button onClick={handleSaveApiUrl} className="w-full gap-2">
              <Save className="w-4 h-4" />
              Saqlash
            </Button>
          </div>
        </Card>

        {/* Kiosk Location Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Kiosk joylashuvi</h2>
              <p className="text-sm text-muted-foreground">Navigatsiya boshlanish nuqtasi</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kiosk</Label>
              <Select
                value={selectedKioskId?.toString() || ''}
                onValueChange={handleSelectKiosk}
                disabled={!isApiConnected || kiosks.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kioskni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {kiosks.map((kiosk) => (
                    <SelectItem key={kiosk.id} value={kiosk.id.toString()}>
                      {kiosk.name} — Qavat {kiosk.floor_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleSaveKioskLocation} 
              className="w-full gap-2"
              disabled={!selectedKioskId || !kioskWaypointId}
            >
              <Save className="w-4 h-4" />
              Saqlash
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
