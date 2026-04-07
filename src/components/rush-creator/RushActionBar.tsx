'use client';

import { useState } from 'react';
import { FolderOpen, Film, Trash2, Download, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useRushCreatorStore } from '@/store/rush-creator-store';

export function RushActionBar() {
  const {
    selectedIds,
    moveToGallery,
    moveToRush,
    deleteSelected,
    importToBible,
    clearSelection,
    selectAll,
    media,
  } = useRushCreatorStore();

  const [isDeleting, setIsDeleting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importType, setImportType] = useState<'location' | 'prop'>('location');

  const selectionCount = selectedIds.size;
  const hasSelection = selectionCount > 0;

  const handleDelete = async () => {
    if (!hasSelection) return;
    setIsDeleting(true);
    try {
      await deleteSelected();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImport = async (type: 'location' | 'prop') => {
    const name = prompt(`Nom ${type === 'location' ? 'du lieu' : 'de l\'accessoire'}:`);
    if (!name) return;

    try {
      await importToBible(type, name);
    } catch (error) {
      console.error('[RushActionBar] Import error:', error);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-[#0d1520]">
      {/* Left side - Selection info */}
      <div className="flex items-center gap-3">
        {hasSelection ? (
          <>
            <span className="text-sm text-white">
              {selectionCount} sélectionné{selectionCount > 1 ? 's' : ''}
            </span>
            <button
              onClick={clearSelection}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Désélectionner
            </button>
          </>
        ) : (
          <span className="text-sm text-slate-500">
            {media.length} élément{media.length > 1 ? 's' : ''}
          </span>
        )}
        {media.length > 0 && !hasSelection && (
          <button
            onClick={selectAll}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Tout sélectionner
          </button>
        )}
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Move to Gallery */}
        <Button
          variant="outline"
          size="sm"
          onClick={moveToGallery}
          disabled={!hasSelection}
          className={cn(
            'border-white/10 text-slate-300 hover:bg-white/5',
            !hasSelection && 'opacity-50 cursor-not-allowed'
          )}
        >
          <FolderOpen className="w-4 h-4 mr-2" />
          Gallery
        </Button>

        {/* Move to Rush */}
        <Button
          variant="outline"
          size="sm"
          onClick={moveToRush}
          disabled={!hasSelection}
          className={cn(
            'border-white/10 text-slate-300 hover:bg-white/5',
            !hasSelection && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Film className="w-4 h-4 mr-2" />
          Rush
        </Button>

        {/* Import dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasSelection || selectionCount > 1}
              className={cn(
                'border-white/10 text-slate-300 hover:bg-white/5',
                (!hasSelection || selectionCount > 1) && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Download className="w-4 h-4 mr-2" />
              Import
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
            <DropdownMenuItem
              onClick={() => handleImport('location')}
              className="text-slate-300 focus:text-white focus:bg-white/5"
            >
              Importer comme Lieu
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleImport('prop')}
              className="text-slate-300 focus:text-white focus:bg-white/5"
            >
              Importer comme Accessoire
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={!hasSelection || isDeleting}
          className={cn(
            'border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300',
            !hasSelection && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
