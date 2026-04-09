'use client';

import { useState, useCallback } from 'react';
import { Layers, Loader2, Download, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';
import type { Sequence } from '@/types/cinematic';
import type { Plan } from '@/store/shorts-store';

interface SequenceClipProps {
  sequence: Sequence;
  plans: Plan[];
  aspectRatio?: string; // '9:16', '1:1', '16:9'
  assembledVideoUrl?: string | null;
  assemblyProgress?: number; // 0-100, undefined = not assembling
  isSelected?: boolean;
  onSelect?: () => void;
  onOpenGallery?: () => void; // Open in gallery viewer
  isDragging?: boolean;
}

export function SequenceClip({
  sequence,
  plans,
  aspectRatio = '9:16',
  assembledVideoUrl,
  assemblyProgress,
  isSelected,
  onSelect,
  onOpenGallery,
  isDragging,
}: SequenceClipProps) {
  // Calculate dimensions based on aspect ratio - BIGGER sizes for better viewing
  const getClipDimensions = () => {
    switch (aspectRatio) {
      case '16:9':
        return { width: 320, height: 180 }; // 16:9 - bigger
      case '1:1':
        return { width: 240, height: 240 }; // 1:1 - bigger
      case '9:16':
      default:
        return { width: 180, height: 320 }; // 9:16 - bigger
    }
  };
  const clipDimensions = getClipDimensions();

  const [isHovered, setIsHovered] = useState(false);

  // Sign B2 URL if needed
  const { signedUrl } = useSignedUrl(assembledVideoUrl || null);
  const finalVideoUrl = signedUrl || (assembledVideoUrl && !isB2Url(assembledVideoUrl) ? assembledVideoUrl : null);

  const totalDuration = plans.reduce((sum, p) => sum + p.duration, 0);
  const isAssembling = assemblyProgress !== undefined && assemblyProgress < 100;
  const hasAssembledVideo = !!finalVideoUrl;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  // Open gallery viewer
  const handleOpenGallery = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenGallery?.();
  }, [onOpenGallery]);

  // Download video
  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assembledVideoUrl) return;
    const filename = `${sequence.title || 'sequence'}.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(assembledVideoUrl)}&filename=${encodeURIComponent(filename)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
  }, [assembledVideoUrl, sequence.title]);

  return (
    <div
      className={cn(
          "relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer flex flex-col group",
          "bg-[#0d1218] flex-shrink-0",
          isSelected
            ? "border-blue-500 ring-2 ring-blue-500/30"
            : "border-white/10 hover:border-white/20",
          isDragging && "opacity-50 scale-95"
        )}
        style={{
          width: `${clipDimensions.width}px`,
          height: `${clipDimensions.height}px`,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Video/Thumbnail area */}
        <div className="relative bg-black flex-1 min-h-0">
          {hasAssembledVideo ? (
            <>
              {/* Video with NATIVE controls */}
              <video
                key={assembledVideoUrl}
                src={finalVideoUrl}
                className="w-full h-full object-cover"
                controls
                muted
                loop
                playsInline
                onClick={(e) => e.stopPropagation()}
              />

              {/* Top controls - Download, Fullscreen */}
              {isHovered && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 z-30">
                  {/* Download button */}
                  {assembledVideoUrl && (
                    <button
                      onClick={handleDownload}
                      className="w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                      title="Télécharger"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                  {/* Gallery button */}
                  {onOpenGallery && (
                    <button
                      onClick={handleOpenGallery}
                      className="w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                      title="Agrandir"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                </div>
              )}
            </>
          ) : isAssembling ? (
            /* Assembling state */
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin mb-2" />
              <span className="text-xs text-slate-400">Assemblage...</span>
              <span className="text-lg font-bold text-white">{Math.round(assemblyProgress)}%</span>
              {/* Assembly progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${assemblyProgress}%` }} />
              </div>
            </div>
          ) : (
            /* Thumbnails grid fallback */
            <div className="absolute inset-0 grid grid-cols-2 gap-0.5 p-0.5">
              {plans.slice(0, 4).map((plan, i) => (
                <ThumbnailCell key={plan.id} plan={plan} index={i} total={Math.min(plans.length, 4)} />
              ))}
              {plans.length === 0 && (
                <div className="col-span-2 flex items-center justify-center text-slate-600 text-xs">
                  Aucun plan
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info bar */}
        <div
          className={cn(
            "px-2 py-1.5 bg-[#151d28] border-t border-white/5",
            onSelect && "cursor-pointer hover:bg-[#1a2433]"
          )}
          onClick={onSelect}
        >
          <div className="flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-purple-400 flex-shrink-0" />
            <span className="text-xs font-medium text-white truncate flex-1">
              {sequence.title || `Séquence ${sequence.sort_order + 1}`}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-slate-500">
              {plans.length} plan{plans.length > 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-slate-400 tabular-nums">
              {formatDuration(totalDuration)}
            </span>
          </div>
        </div>
      </div>
  );
}

// Thumbnail cell for plans grid
function ThumbnailCell({ plan, index, total }: { plan: Plan; index: number; total: number }) {
  const imageUrl = plan.storyboard_image_url || plan.first_frame_url;
  const { signedUrl } = useSignedUrl(imageUrl || null);

  // If only 1 plan, span full width
  const spanFull = total === 1;

  return (
    <div className={cn("relative bg-slate-900 overflow-hidden", spanFull && "col-span-2 row-span-2")}>
      {signedUrl ? (
        <img
          src={signedUrl}
          alt={`Plan ${plan.shot_number}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[10px] text-slate-600">P{plan.shot_number}</span>
        </div>
      )}
      {/* Plan number overlay */}
      {!spanFull && (
        <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 bg-black/60 rounded text-[8px] text-white">
          P{plan.shot_number}
        </div>
      )}
    </div>
  );
}
