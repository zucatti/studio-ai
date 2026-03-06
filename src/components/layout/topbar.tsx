'use client';

import { useUser } from '@auth0/nextjs-auth0';
import { Bell, Search, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TopbarProps {
  title?: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user } = useUser();

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-white/5 bg-[#162a41]/80 backdrop-blur-xl">
      <div className="flex items-center gap-6">
        {title && (
          <h1 className="text-xl font-semibold text-white">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Rechercher..."
            className="w-64 pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:bg-white/10 focus:border-blue-500/50 rounded-xl"
          />
        </div>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative text-slate-400 hover:text-white hover:bg-white/5 rounded-xl"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-400 rounded-full" />
          <span className="sr-only">Notifications</span>
        </Button>

        {/* User Menu */}
        <div className="pl-3 border-l border-white/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                <Avatar className="h-9 w-9 ring-2 ring-white/10 hover:ring-blue-500/50 transition-all">
                  <AvatarImage src={user?.picture || ''} alt={user?.name || ''} />
                  <AvatarFallback className="bg-blue-500/20 text-blue-400">
                    {initials || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#1e3a52] border-white/10">
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
      </div>
    </header>
  );
}
