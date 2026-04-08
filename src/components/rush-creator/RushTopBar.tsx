'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  X,
  Menu,
  Grid3X3,
  Archive,
  BookOpen,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRushCreatorStore } from '@/store/rush-creator-store';
import { RushProjectSelector } from './RushProjectSelector';
import type { SidePanelType } from './RushSidePanel';

const PANEL_ITEMS = [
  { id: 'bible' as const, name: 'Bible', icon: BookOpen, color: 'blue' },
  { id: 'gallery' as const, name: 'Gallery', icon: Grid3X3, color: 'green' },
  { id: 'rush' as const, name: 'Rush', icon: Archive, color: 'orange' },
];

interface RushTopBarProps {
  activePanel: SidePanelType;
  onPanelChange: (panel: SidePanelType) => void;
}

export function RushTopBar({ activePanel, onPanelChange }: RushTopBarProps) {
  const { close, currentProjectId, validationContext } = useRushCreatorStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleNavClick = () => {
    close();
  };

  const togglePanel = (panel: SidePanelType) => {
    onPanelChange(activePanel === panel ? null : panel);
  };

  return (
    <header className="flex items-center h-12 px-3 border-b border-white/10 bg-[#0d1520] flex-shrink-0">
      {/* Left: Menu button + Logo */}
      <div className="flex items-center gap-2">
        {/* Menu dropdown - for navigation outside Rush Creator */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            title="Quitter Rush Creator"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#1a2433] border border-white/10 rounded-lg shadow-xl z-20 py-1">
                <Link
                  href="/projects"
                  onClick={handleNavClick}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <Home className="w-4 h-4" />
                  Mes projets
                </Link>
                {currentProjectId && (
                  <>
                    <div className="h-px bg-white/10 my-1" />
                    <div className="px-3 py-1.5">
                      <span className="text-xs text-slate-500">Quitter vers...</span>
                    </div>
                    {PANEL_ITEMS.map((item) => (
                      <Link
                        key={item.id}
                        href={`/project/${currentProjectId}/${item.id}`}
                        onClick={handleNavClick}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                      >
                        <item.icon className="w-4 h-4" />
                        {item.name}
                      </Link>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Title */}
        <span className="text-base font-semibold text-white">Rush Creator</span>

        {/* Validation context indicator */}
        {validationContext && (
          <div className="ml-3 flex items-center gap-2 px-3 py-1 rounded-lg bg-green-500/20 border border-green-500/30">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-green-400 font-medium">
              Sélection pour {validationContext.type === 'frame-in' ? 'Frame In' : 'Frame Out'}
            </span>
          </div>
        )}
      </div>

      {/* Center: Panel tabs (open panels inside Rush Creator) */}
      {currentProjectId && (
        <nav className="flex items-center gap-1 ml-6">
          {PANEL_ITEMS.map((item) => {
            const isActive = activePanel === item.id;
            const colorClasses = {
              blue: isActive ? 'bg-blue-500/20 text-blue-400' : '',
              green: isActive ? 'bg-green-500/20 text-green-400' : '',
              orange: isActive ? 'bg-orange-500/20 text-orange-400' : '',
            };
            return (
              <button
                key={item.id}
                onClick={() => togglePanel(item.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? colorClasses[item.color as keyof typeof colorClasses]
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.name}
              </button>
            );
          })}
        </nav>
      )}

      {/* Right: Project selector + Close */}
      <div className="flex items-center gap-2 ml-auto">
        <RushProjectSelector />

        <div className="w-px h-6 bg-white/10" />

        <button
          onClick={close}
          className="w-9 h-9 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors text-slate-400"
          title="Fermer (Escape)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
