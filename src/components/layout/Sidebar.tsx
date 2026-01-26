import { NavLink, useLocation } from 'react-router-dom';
import { 
  Layers, 
  MapPin, 
  DoorOpen, 
  Settings, 
  Navigation,
  Monitor
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';

const navItems = [
  { path: '/floors', label: 'Qavatlar', icon: Layers },
  { path: '/waypoints', label: 'Nuqtalar', icon: MapPin },
  { path: '/rooms', label: 'Xonalar', icon: DoorOpen },
  { path: '/kiosks', label: 'Kiosklar', icon: Monitor },
  { path: '/navigation', label: 'Navigatsiya', icon: Navigation },
  { path: '/settings', label: 'Sozlamalar', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const isApiConnected = useAppStore((s) => s.isApiConnected);

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground">UniNav</h1>
            <p className="text-xs text-muted-foreground">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === '/floors' && location.pathname === '/');
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'nav-item',
                isActive && 'nav-item-active'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className={cn(
            'status-indicator',
            isApiConnected ? 'status-online' : 'status-offline'
          )} />
          <span className="text-sm text-muted-foreground">
            {isApiConnected ? 'API ulangan' : 'API ulanmagan'}
          </span>
        </div>
      </div>
    </aside>
  );
}