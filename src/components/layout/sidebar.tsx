'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Film,
  FolderOpen,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const navigation = [
  { name: 'Projets', href: '/projects', icon: FolderOpen },
];

const secondaryNavigation = [
  { name: 'Paramètres', href: '/settings', icon: Settings },
  { name: 'Aide', href: '/help', icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        'flex flex-col h-full transition-all duration-300 ease-out',
        'bg-gradient-to-b from-[#1a3550] to-[#162a41]',
        'border-r border-white/5',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/5">
        <Link href="/projects" className="flex items-center gap-3 group">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-shadow">
            <Film className="w-5 h-5" />
            <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-white">Studio</span>
              <span className="text-[10px] text-blue-400 font-medium tracking-wider uppercase">Production IA</span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-gradient-to-r from-blue-500/20 to-blue-500/5 text-blue-400 shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              <item.icon className={cn(
                'w-5 h-5 flex-shrink-0 transition-colors',
                isActive && 'text-blue-400'
              )} />
              {!collapsed && <span>{item.name}</span>}
              {isActive && !collapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Secondary Navigation */}
      <div className="px-3 py-4 border-t border-white/5 space-y-1">
        {secondaryNavigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </div>

      {/* Collapse button */}
      <div className="px-3 py-3 border-t border-white/5">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'w-full justify-center text-slate-500 hover:text-white hover:bg-white/5 rounded-xl',
            collapsed && 'px-0'
          )}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span>Réduire</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
