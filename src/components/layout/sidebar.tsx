'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Film,
  FolderOpen,
  Settings,
  Home,
  ImageIcon,
  PlayCircle,
  Lock,
  Unlock,
  Search,
  Sun,
  Moon,
  X,
  Frame,
  Clapperboard,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { useTheme } from 'next-themes';
import { useSidebarStore } from '@/store/sidebar-store';

interface NavSection {
  title: string;
  items: {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

const mainNavigation: NavSection[] = [
  {
    title: 'PROJETS',
    items: [
      { name: 'Mes projets', href: '/projects', icon: FolderOpen },
      { name: 'Configuration', href: '/settings', icon: Settings },
    ],
  },
];

const projectNavigation: NavSection = {
  title: 'PROJET',
  items: [
    { name: 'Brainstorming', href: '/brainstorming', icon: Lightbulb },
    { name: 'Script', href: '/script', icon: Clapperboard },
    { name: 'Storyboard', href: '/storyboard', icon: ImageIcon },
    { name: 'Preprod', href: '/preprod', icon: Frame },
    { name: 'Production', href: '/production', icon: PlayCircle },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const { theme, setTheme } = useTheme();
  const { isLocked, isVisible, toggleLock, hide, _hasHydrated } = useSidebarStore();
  const [mounted, setMounted] = useState(false);

  // Wait for client-side hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  const projectMatch = pathname.match(/\/project\/([^/]+)/);
  const projectId = projectMatch?.[1];
  const isInProject = !!projectId;

  // Use default (locked) state until hydrated to avoid mismatch
  const effectiveIsLocked = _hasHydrated ? isLocked : true;

  return (
    <>
      {/* Overlay backdrop (only in overlay mode when visible) */}
      {!effectiveIsLocked && isVisible && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={hide}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'flex flex-col h-full w-64 bg-[#0d1520] border-r border-white/5 transition-transform duration-300 ease-in-out',
          // Overlay mode styles
          !effectiveIsLocked && 'fixed top-0 left-0 z-50 shadow-2xl',
          // Show/hide based on mode
          !effectiveIsLocked && !isVisible && '-translate-x-full',
          !effectiveIsLocked && isVisible && 'translate-x-0',
          // Fixed mode - normal flow
          effectiveIsLocked && 'relative'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 h-14 px-4 border-b border-white/5">
          <Link href="/projects" className="flex items-center gap-3" onClick={() => !effectiveIsLocked && hide()}>
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white">
              <Film className="w-4 h-4" />
            </div>
            <span className="text-base font-semibold text-white whitespace-nowrap">Studio</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {/* Close button (only in overlay mode) */}
            {!effectiveIsLocked && (
              <button
                onClick={hide}
                className="flex items-center justify-center w-7 h-7 rounded hover:bg-white/10 transition-colors"
                title="Fermer"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
            {/* Lock toggle */}
            <button
              onClick={toggleLock}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded transition-colors',
                effectiveIsLocked
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-white/5 hover:bg-white/10 text-slate-400'
              )}
              title={effectiveIsLocked ? 'Menu fixe (cliquez pour passer en overlay)' : 'Menu overlay (cliquez pour fixer)'}
            >
              {effectiveIsLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Unlock className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 bg-[#1a2433] border-0 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-blue-500/50 rounded-lg"
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {mainNavigation.map((section) => (
            <div key={section.title} className="mb-4">
              <h3 className="px-3 mb-2 text-[11px] font-medium text-slate-500 tracking-wider">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => !effectiveIsLocked && hide()}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="whitespace-nowrap">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {isInProject && (
            <div className="mb-4">
              <h3 className="px-3 mb-2 text-[11px] font-medium text-slate-500 tracking-wider">
                {projectNavigation.title}
              </h3>
              <div className="space-y-0.5">
                {projectNavigation.items.map((item) => {
                  const fullHref = `/project/${projectId}${item.href}`;
                  const isActive = pathname === fullHref;
                  return (
                    <Link
                      key={item.name}
                      href={fullHref}
                      onClick={() => !effectiveIsLocked && hide()}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="whitespace-nowrap">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-white/5 flex items-center justify-between">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
          >
            {/* Show consistent icon until mounted to avoid hydration mismatch */}
            {!mounted ? (
              <Sun className="w-4 h-4" />
            ) : theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
          <span className="text-xs text-slate-600">v1.0.0</span>
        </div>
      </div>
    </>
  );
}
