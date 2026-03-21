'use client';

import { useUser } from '@auth0/nextjs-auth0';
import { usePathname } from 'next/navigation';
import { Menu, LogOut, User, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { useSidebarStore } from '@/store/sidebar-store';
import { BibleToggleButton } from '@/components/bible/BibleSidebar';
import { GalleryToggleButton } from '@/components/gallery/GlobalGallery';
import { QueueBadge } from '@/components/queue/QueuePanel';

interface Project {
  id: string;
  name: string;
}

export function Topbar() {
  const { user } = useUser();
  const pathname = usePathname();
  const [project, setProject] = useState<Project | null>(null);
  const { isLocked, show, _hasHydrated } = useSidebarStore();
  const effectiveIsLocked = _hasHydrated ? isLocked : true;

  // Check if we're in a project context
  const projectMatch = pathname.match(/\/project\/([^/]+)/);
  const projectId = projectMatch?.[1];

  useEffect(() => {
    if (projectId) {
      fetch(`/api/projects/${projectId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.project) {
            setProject(data.project);
          }
        })
        .catch(console.error);
    } else {
      setProject(null);
    }
  }, [projectId]);

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Get current step from pathname
  const getCurrentStep = () => {
    if (pathname.includes('/brainstorming')) return 'Brainstorming';
    if (pathname.includes('/script')) return 'Script';
    if (pathname.includes('/decoupage')) return 'Decoupage';
    if (pathname.includes('/storyboard')) return 'Storyboard';
    if (pathname.includes('/preprod')) return 'Preprod';
    if (pathname.includes('/production')) return 'Production';
    return null;
  };

  const currentStep = getCurrentStep();

  return (
    <header className="flex items-center h-14 px-4 border-b border-white/5 bg-[#0d1520]">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {!effectiveIsLocked && (
          <Button
            variant="ghost"
            size="icon"
            onClick={show}
            className="w-8 h-8 text-slate-400 hover:text-white hover:bg-white/5"
            title="Afficher le menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        {project && (
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700">
              <span className="text-white text-xs font-bold">
                {project.name.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="text-white font-medium">{project.name}</span>
          </div>
        )}
      </div>

      {/* Center - Current step tabs */}
      {project && currentStep && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5">
            <span className="text-sm text-slate-400">{currentStep}</span>
          </div>
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Queue badge */}
        <QueueBadge />

        {/* Bible toggle - always available for global library */}
        <BibleToggleButton />

        {/* Gallery/Rushes toggle */}
        <GalleryToggleButton />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              suppressHydrationWarning
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.picture || ''} alt={user?.name || ''} />
                <AvatarFallback className="bg-blue-500/20 text-blue-400 text-xs">
                  {initials || <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-white hidden sm:block">{user?.name?.split(' ')[0]}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#1a2433] border-white/10">
            <div className="flex items-center gap-3 p-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.picture || ''} />
                <AvatarFallback className="bg-blue-500/20 text-blue-400">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">{user?.name}</span>
                <span className="text-xs text-slate-400">{user?.email}</span>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem asChild className="text-slate-300 focus:text-white focus:bg-white/5">
              <a href="/auth/logout" className="flex items-center cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
