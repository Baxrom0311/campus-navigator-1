import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import FloorsPage from "./pages/FloorsPage";
import FloorEditorPage from "./pages/FloorEditorPage";
import WaypointsPage from "./pages/WaypointsPage";
import RoomsPage from "./pages/RoomsPage";
import NavigationPage from "./pages/NavigationPage";
import SettingsPage from "./pages/SettingsPage";
import KioskDisplayPage from "./pages/KioskDisplayPage";
import KiosksPage from "./pages/KiosksPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Admin Routes */}
          <Route element={<AdminLayout />}>
            <Route path="/" element={<Navigate to="/floors" replace />} />
            <Route path="/floors" element={<FloorsPage />} />
            <Route path="/floors/:floorId/edit" element={<FloorEditorPage />} />
            <Route path="/waypoints" element={<WaypointsPage />} />
            <Route path="/rooms" element={<RoomsPage />} />
            <Route path="/kiosks" element={<KiosksPage />} />
            <Route path="/navigation" element={<NavigationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          
          {/* Kiosk Display (Public - White Theme) */}
          <Route path="/kiosk" element={<KioskDisplayPage />} />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;