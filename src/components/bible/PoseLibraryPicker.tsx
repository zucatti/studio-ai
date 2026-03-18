'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { POSE_LIBRARY, POSE_CATEGORIES, type PoseEntry } from '@/data/pose-library';

interface PoseLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (pose: PoseEntry) => void;
}

export function PoseLibraryPicker({
  open,
  onOpenChange,
  onSelect,
}: PoseLibraryPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPoses = POSE_LIBRARY.filter(pose => {
    const matchesCategory = !selectedCategory || pose.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      pose.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pose.prompt.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSelect = (pose: PoseEntry) => {
    onSelect(pose);
    onOpenChange(false);
    setSelectedCategory(null);
    setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1520] border-white/10 text-white max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">🕺</span>
            Bibliothèque de Poses
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une pose..."
            className="pl-9 bg-white/5 border-white/10 text-white"
          />
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              !selectedCategory
                ? 'bg-purple-500 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            )}
          >
            Toutes
          </button>
          {POSE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1',
                selectedCategory === cat.id
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              )}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Poses grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-4 gap-3 p-1">
            {filteredPoses.map((pose) => (
              <button
                key={pose.id}
                onClick={() => handleSelect(pose)}
                className="group relative flex flex-col items-center p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-purple-500/20 hover:border-purple-500/50 transition-all"
              >
                <span className="text-4xl mb-2">{pose.icon}</span>
                <span className="text-xs font-medium text-white text-center">
                  {pose.name}
                </span>

                {/* Tooltip with prompt preview */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-lg bg-slate-900 border border-white/10 text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                  {pose.prompt}
                </div>
              </button>
            ))}
          </div>

          {filteredPoses.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              Aucune pose trouvée
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-white/10">
          <span className="text-xs text-slate-500">
            {filteredPoses.length} pose{filteredPoses.length > 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-slate-400"
          >
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
