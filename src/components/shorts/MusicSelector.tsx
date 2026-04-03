'use client';

import { useState, useEffect } from 'react';
import { Music, Volume2, X, ChevronDown, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface MusicAsset {
  id: string;
  name: string;
  file_url: string;
  duration?: number;
}

interface MusicSelectorProps {
  projectId: string;
  selectedAssetId: string | null;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  onSelect: (assetId: string | null) => void;
  onVolumeChange: (volume: number) => void;
  onFadeInChange: (fadeIn: number) => void;
  onFadeOutChange: (fadeOut: number) => void;
  className?: string;
}

export function MusicSelector({
  projectId,
  selectedAssetId,
  volume,
  fadeIn,
  fadeOut,
  onSelect,
  onVolumeChange,
  onFadeInChange,
  onFadeOutChange,
  className,
}: MusicSelectorProps) {
  const [assets, setAssets] = useState<MusicAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch audio assets when popover opens
  useEffect(() => {
    if (isOpen && assets.length === 0) {
      fetchAudioAssets();
    }
  }, [isOpen, projectId]);

  const fetchAudioAssets = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/global-assets?type=audio`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (error) {
      console.error('Error fetching audio assets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-8 gap-2 bg-[#151d28] border-white/10 hover:bg-[#1a2433] hover:border-white/20',
            selectedAssetId ? 'text-purple-400' : 'text-slate-400',
            className
          )}
        >
          <Music className="w-3.5 h-3.5" />
          <span className="text-xs truncate max-w-[120px]">
            {selectedAsset?.name || 'Add Music'}
          </span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-80 p-0 bg-[#1a2433] border-white/10"
      >
        <div className="p-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">Background Music</h4>
            {selectedAssetId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-400 hover:text-red-400"
                onClick={() => onSelect(null)}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Asset Selection */}
        <div className="p-3 border-b border-white/5">
          <Label className="text-xs text-slate-400">Select Track</Label>
          <Select
            value={selectedAssetId || 'none'}
            onValueChange={(value) => onSelect(value === 'none' ? null : value)}
          >
            <SelectTrigger className="mt-1 h-8 bg-[#0d1218] border-white/10 text-sm">
              <SelectValue placeholder="Choose a track..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2433] border-white/10">
              <SelectItem value="none" className="text-slate-400">
                No music
              </SelectItem>
              {isLoading ? (
                <SelectItem value="loading" disabled className="text-slate-500">
                  Loading...
                </SelectItem>
              ) : (
                assets.map((asset) => (
                  <SelectItem
                    key={asset.id}
                    value={asset.id}
                    className="text-slate-300"
                  >
                    {asset.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Volume & Fades */}
        {selectedAssetId && (
          <div className="p-3 space-y-4">
            {/* Volume */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  Volume
                </Label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <Slider
                value={[volume]}
                onValueChange={([v]) => onVolumeChange(v)}
                min={0}
                max={1}
                step={0.01}
                className="w-full"
              />
            </div>

            {/* Fade In/Out */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Fade In</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={fadeIn}
                    onChange={(e) => onFadeInChange(parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs bg-[#0d1218] border-white/10"
                    min={0}
                    max={10}
                    step={0.5}
                  />
                  <span className="text-[10px] text-slate-500">s</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Fade Out</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={fadeOut}
                    onChange={(e) => onFadeOutChange(parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs bg-[#0d1218] border-white/10"
                    min={0}
                    max={10}
                    step={0.5}
                  />
                  <span className="text-[10px] text-slate-500">s</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload hint */}
        <div className="px-3 py-2 bg-[#0d1218] border-t border-white/5">
          <p className="text-[10px] text-slate-500">
            Upload audio files in the Gallery to use them here.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
