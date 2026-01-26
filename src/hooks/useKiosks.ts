import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kiosksApi } from '@/lib/api/client';
import { KioskCreate, KioskUpdate } from '@/lib/api/types';
import { toast } from 'sonner';

export function useKiosks() {
  return useQuery({
    queryKey: ['kiosks'],
    queryFn: () => kiosksApi.getAll(),
  });
}

export function useKiosk(id: number) {
  return useQuery({
    queryKey: ['kiosk', id],
    queryFn: () => kiosksApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateKiosk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: KioskCreate) => kiosksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kiosks'] });
      toast.success('Kiosk yaratildi');
    },
    onError: () => {
      toast.error('Kiosk yaratishda xato');
    },
  });
}

export function useUpdateKiosk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: KioskUpdate }) =>
      kiosksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kiosks'] });
      toast.success('Kiosk yangilandi');
    },
    onError: () => {
      toast.error('Kiosk yangilashda xato');
    },
  });
}

export function useDeleteKiosk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => kiosksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kiosks'] });
      toast.success("Kiosk o'chirildi");
    },
    onError: () => {
      toast.error("Kiosk o'chirishda xato");
    },
  });
}
