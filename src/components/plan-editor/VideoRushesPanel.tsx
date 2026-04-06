'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Check,
  Trash2,
  Play,
  MoreVertical,
  History,
  Download,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { VideoRush } from '@/types/shot';

interface VideoRushesPanelProps {
  projectId: string;
  shotId: string;
  rushes: VideoRush[];
  onRushSelected: (rush: VideoRush) => void;
  onRushDeleted: (rushId: string) => void;
}

// Helper to sign B2 URLs
async function signUrl(url: string): Promise<string> {
  if (!url || !url.startsWith('b2://')) return url;
  try {
    const res = await fetch('/api/storage/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] }),
    });
    if (!res.ok) return url;
    const data = await res.json();
    return data.signedUrls?.[url] || url;
  } catch {
    return url;
  }
}

// Video thumbnail component with URL signing
function VideoThumbnail({
  url,
  className,
  onClick,
}: {
  url: string;
  className?: string;
  onClick?: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    signUrl(url).then(setSignedUrl);
  }, [url]);

  if (!signedUrl) {
    return <div className={cn('bg-slate-800 animate-pulse', className)} />;
  }

  return (
    <div className={cn('relative cursor-pointer group', className)} onClick={onClick}>
      <video
        src={signedUrl}
        className="w-full h-full object-cover rounded-t-lg"
        muted
        preload="metadata"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-t-lg">
        <Play className="w-8 h-8 text-white drop-shadow-lg" />
      </div>
    </div>
  );
}

// Video player component with URL signing
function VideoPlayer({
  url,
  className,
  controls = true,
  autoPlay = false,
}: {
  url: string;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    signUrl(url).then(setSignedUrl);
  }, [url]);

  if (!signedUrl) {
    return <div className={cn('bg-slate-800 animate-pulse', className)} />;
  }

  return (
    <video
      src={signedUrl}
      className={className}
      controls={controls}
      autoPlay={autoPlay}
    />
  );
}

const MODEL_LABELS: Record<string, string> = {
  'kling-omni': 'Kling 3.0',
  'seedance-2': 'Seedance 2.0',
  'seedance-2-fast': 'Seedance Fast',
  'veo-3': 'Veo 3',
  'omnihuman': 'OmniHuman',
};

const MODEL_COLORS: Record<string, string> = {
  'kling-omni': 'bg-purple-500',
  'seedance-2': 'bg-blue-500',
  'seedance-2-fast': 'bg-cyan-500',
  'veo-3': 'bg-green-500',
  'omnihuman': 'bg-orange-500',
};

export function VideoRushesPanel({
  projectId,
  shotId,
  rushes,
  onRushSelected,
  onRushDeleted,
}: VideoRushesPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewRush, setPreviewRush] = useState<VideoRush | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Get unique models for filter
  const models = useMemo(() => {
    const modelSet = new Set(rushes.map(r => r.model));
    return Array.from(modelSet).sort();
  }, [rushes]);

  // Filter and sort rushes
  const filteredRushes = useMemo(() => {
    let filtered = [...rushes];
    if (selectedModel) {
      filtered = filtered.filter(r => r.model === selectedModel);
    }
    return filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [rushes, selectedModel]);

  const handleSelect = async (rush: VideoRush) => {
    if (rush.isSelected) return;

    setLoadingAction(`select-${rush.id}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}/rushes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rushId: rush.id }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to select rush');
      }

      onRushSelected(rush);
      toast.success('Rush sélectionné');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async (rush: VideoRush) => {
    if (rushes.length === 1) {
      toast.error('Impossible de supprimer le dernier rush');
      return;
    }

    setLoadingAction(`delete-${rush.id}`);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/shots/${shotId}/rushes/${rush.id}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete rush');
      }

      onRushDeleted(rush.id);
      toast.success('Rush supprimé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingAction(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getModelLabel = (model: string) => MODEL_LABELS[model] || model;
  const getModelColor = (model: string) => MODEL_COLORS[model] || 'bg-slate-500';

  if (rushes.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2 bg-black/50 border-orange-500 text-white hover:bg-orange-500 backdrop-blur"
      >
        <History className="w-4 h-4" />
        <span>{rushes.length} rush{rushes.length > 1 ? 'es' : ''}</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl bg-slate-900 border-slate-700" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center justify-between">
              <span>Rushes vidéo ({rushes.length})</span>
            </DialogTitle>
          </DialogHeader>

          {/* Model filters - only show if models have valid names (not timestamps) */}
          {models.length > 1 && models.some(m => MODEL_LABELS[m]) && (
            <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-700">
              {models.filter(m => MODEL_LABELS[m]).map(model => {
                const count = rushes.filter(r => r.model === model).length;
                const isSelected = selectedModel === model;
                const isShowingAll = selectedModel === null;
                return (
                  <Button
                    key={model}
                    variant={isSelected || isShowingAll ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedModel(isSelected ? null : model)}
                    className={cn(
                      'h-7 text-xs gap-1.5',
                      isSelected
                        ? `${getModelColor(model)} text-white border-transparent`
                        : isShowingAll
                          ? 'bg-slate-700 text-white border-transparent'
                          : 'border-slate-600 text-slate-400 hover:bg-slate-800'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', getModelColor(model))} />
                    {getModelLabel(model)} ({count})
                  </Button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-2 max-h-[65vh] overflow-y-auto pr-1">
            {filteredRushes.map((rush) => (
              <div
                key={rush.id}
                className={cn(
                  'relative rounded-lg overflow-hidden transition-all',
                  rush.isSelected
                    ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-slate-900'
                    : 'hover:ring-1 hover:ring-slate-500'
                )}
              >
                {/* Selected badge */}
                {rush.isSelected && (
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-medium flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Actif
                  </div>
                )}

                {/* Video thumbnail */}
                <VideoThumbnail
                  url={rush.url}
                  className="aspect-video bg-black"
                  onClick={() => setPreviewRush(rush)}
                />

                {/* Info bar */}
                <div className="px-2 py-1.5 bg-slate-800 rounded-b-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                      {MODEL_LABELS[rush.model] && (
                        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', getModelColor(rush.model))} />
                      )}
                      <span>{rush.duration}s</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400">{formatDate(rush.createdAt)}</span>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-white flex-shrink-0"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                        {!rush.isSelected && (
                          <DropdownMenuItem
                            onClick={() => handleSelect(rush)}
                            disabled={loadingAction === `select-${rush.id}`}
                            className="text-white hover:bg-slate-700"
                          >
                            {loadingAction === `select-${rush.id}` ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4 mr-2" />
                            )}
                            Sélectionner
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setPreviewRush(rush)}
                          className="text-white hover:bg-slate-700"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Prévisualiser
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            window.open(`/api/storage/sign?url=${encodeURIComponent(rush.url)}&download=true`, '_blank');
                          }}
                          className="text-white hover:bg-slate-700"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Télécharger
                        </DropdownMenuItem>
                        {rushes.length > 1 && (
                          <DropdownMenuItem
                            onClick={() => handleDelete(rush)}
                            disabled={loadingAction === `delete-${rush.id}`}
                            className="text-red-400 hover:bg-red-900/30 hover:text-red-300"
                          >
                            {loadingAction === `delete-${rush.id}` ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 mr-2" />
                            )}
                            Supprimer
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewRush} onOpenChange={() => setPreviewRush(null)}>
        <DialogContent className="max-w-4xl bg-slate-900 border-slate-700 p-0" aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>Prévisualisation du rush</DialogTitle>
          </DialogHeader>
          {previewRush && (
            <div className="relative">
              <VideoPlayer
                url={previewRush.url}
                className="w-full aspect-video"
                controls
                autoPlay
              />
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={cn('w-3 h-3 rounded-full', getModelColor(previewRush.model))} />
                    <div>
                      <div className="text-white font-medium">
                        {getModelLabel(previewRush.model)}
                      </div>
                      <div className="text-sm text-slate-300">
                        {previewRush.duration}s • {formatDate(previewRush.createdAt)}
                      </div>
                    </div>
                  </div>
                  {!previewRush.isSelected && (
                    <Button
                      onClick={() => {
                        handleSelect(previewRush);
                        setPreviewRush(null);
                      }}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Sélectionner
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
