'use client';

/**
 * Timeline Sidebar
 *
 * Asset browser for sequences, rush media, and audio.
 * Items can be dragged onto the timeline.
 */

import { useState } from 'react';
import { Film, Image, Music, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimelineStore, DraggableItem } from '@/store/timeline-store';

interface SequenceItem {
  id: string;
  title: string;
  duration: number;
  thumbnailUrl?: string;
}

interface RushItem {
  id: string;
  type: 'video' | 'image';
  url: string;
  duration?: number;
  thumbnailUrl?: string;
  label?: string;
}

interface AudioItem {
  id: string;
  url: string;
  duration: number;
  label: string;
}

interface TimelineSidebarProps {
  sequences?: SequenceItem[];
  rushItems?: RushItem[];
  audioAssets?: AudioItem[];
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, icon, count, defaultOpen = true, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800/50 text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-500" />
        )}
        {icon}
        <span className="text-sm font-medium flex-1">{title}</span>
        <span className="text-xs text-zinc-500">{count}</span>
      </button>

      {isOpen && (
        <div className="pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

interface DraggableItemCardProps {
  item: DraggableItem;
  icon?: React.ReactNode;
}

function DraggableItemCard({ item, icon }: DraggableItemCardProps) {
  const { startDrag, endDrag } = useTimelineStore();

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    startDrag(item);
  };

  const handleDragEnd = () => {
    endDrag();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 mx-2 rounded cursor-grab',
        'hover:bg-zinc-800 active:cursor-grabbing',
        'border border-transparent hover:border-zinc-700'
      )}
    >
      <GripVertical className="h-3 w-3 text-zinc-600" />

      {item.thumbnailUrl ? (
        <div className="w-10 h-6 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
          <img
            src={item.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-10 h-6 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      )}

      <span className="text-sm truncate flex-1">{item.label}</span>

      <span className="text-xs text-zinc-500">
        {formatDuration(item.duration)}
      </span>
    </div>
  );
}

export function TimelineSidebar({
  sequences = [],
  rushItems = [],
  audioAssets = [],
}: TimelineSidebarProps) {
  const videos = rushItems.filter((r) => r.type === 'video');
  const images = rushItems.filter((r) => r.type === 'image');

  return (
    <div className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Sequences */}
        <Section
          title="Séquences"
          icon={<Film className="h-4 w-4 text-blue-400" />}
          count={sequences.length}
        >
          {sequences.length === 0 ? (
            <p className="text-xs text-zinc-500 px-3 py-2">
              Aucune séquence
            </p>
          ) : (
            sequences.map((seq) => (
              <DraggableItemCard
                key={seq.id}
                item={{
                  type: 'sequence',
                  id: seq.id,
                  duration: seq.duration,
                  label: seq.title,
                  thumbnailUrl: seq.thumbnailUrl,
                }}
                icon={<Film className="h-3 w-3 text-blue-400" />}
              />
            ))
          )}
        </Section>

        {/* Rush Videos */}
        <Section
          title="Vidéos"
          icon={<Film className="h-4 w-4 text-green-400" />}
          count={videos.length}
          defaultOpen={false}
        >
          {videos.length === 0 ? (
            <p className="text-xs text-zinc-500 px-3 py-2">
              Aucune vidéo
            </p>
          ) : (
            videos.map((item) => (
              <DraggableItemCard
                key={item.id}
                item={{
                  type: 'rush-video',
                  id: item.id,
                  duration: item.duration || 5,
                  label: item.label || 'Video',
                  thumbnailUrl: item.thumbnailUrl,
                  assetUrl: item.url,
                }}
                icon={<Film className="h-3 w-3 text-green-400" />}
              />
            ))
          )}
        </Section>

        {/* Rush Images */}
        <Section
          title="Images"
          icon={<Image className="h-4 w-4 text-purple-400" />}
          count={images.length}
          defaultOpen={false}
        >
          {images.length === 0 ? (
            <p className="text-xs text-zinc-500 px-3 py-2">
              Aucune image
            </p>
          ) : (
            images.map((item) => (
              <DraggableItemCard
                key={item.id}
                item={{
                  type: 'rush-image',
                  id: item.id,
                  duration: 3, // Default 3s for images
                  label: item.label || 'Image',
                  thumbnailUrl: item.thumbnailUrl || item.url,
                  assetUrl: item.url,
                }}
                icon={<Image className="h-3 w-3 text-purple-400" />}
              />
            ))
          )}
        </Section>

        {/* Audio */}
        <Section
          title="Audio"
          icon={<Music className="h-4 w-4 text-yellow-400" />}
          count={audioAssets.length}
          defaultOpen={false}
        >
          {audioAssets.length === 0 ? (
            <p className="text-xs text-zinc-500 px-3 py-2">
              Aucun audio
            </p>
          ) : (
            audioAssets.map((item) => (
              <DraggableItemCard
                key={item.id}
                item={{
                  type: 'audio',
                  id: item.id,
                  duration: item.duration,
                  label: item.label,
                  assetUrl: item.url,
                }}
                icon={<Music className="h-3 w-3 text-yellow-400" />}
              />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
