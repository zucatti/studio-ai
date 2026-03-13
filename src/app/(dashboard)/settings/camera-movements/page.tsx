'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Camera,
  Play,
  Loader2,
  Image as ImageIcon,
  Wand2,
  Download,
  RefreshCw,
  Upload,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  CAMERA_MOVEMENTS,
  CAMERA_MOVEMENT_CATEGORIES,
  getMovementsByCategory,
  CameraMovementCategory,
  CameraMovementDefinition,
} from '@/types/shot';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const REFERENCE_IMAGE_KEY = 'camera-movements-reference-image';

export default function CameraMovementsPage() {
  const [activeCategory, setActiveCategory] = useState<CameraMovementCategory>('dolly');
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<CameraMovementDefinition | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load reference image from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(REFERENCE_IMAGE_KEY);
    if (saved) {
      setReferenceImage(saved);
      console.log('Loaded reference image from localStorage:', saved);
    }
  }, []);

  // Save reference image to localStorage when it changes
  useEffect(() => {
    if (referenceImage) {
      localStorage.setItem(REFERENCE_IMAGE_KEY, referenceImage);
      console.log('Saved reference image to localStorage:', referenceImage);
    } else {
      localStorage.removeItem(REFERENCE_IMAGE_KEY);
    }
  }, [referenceImage]);

  // Check which previews exist
  useEffect(() => {
    checkExistingPreviews();
  }, []);

  const checkExistingPreviews = async () => {
    const status: Record<string, boolean> = {};
    for (const movement of CAMERA_MOVEMENTS) {
      try {
        const res = await fetch(`/camera-movements/${movement.value}.mp4`, { method: 'HEAD' });
        status[movement.value] = res.ok;
      } catch {
        status[movement.value] = false;
      }
    }
    setPreviewStatus(status);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setReferenceImage(data.url);
        toast.success('Image de référence uploadée');
      } else {
        toast.error('Erreur lors de l\'upload');
      }
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors de l\'upload');
    }
  };

  const handleGeneratePreview = async (movementKey: string) => {
    setGenerating(movementKey);
    try {
      const res = await fetch('/api/camera-movements/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movementKey,
          referenceImageUrl: referenceImage,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate preview');
      }

      await res.json();
      setPreviewStatus(prev => ({ ...prev, [movementKey]: true }));
      toast.success(`Aperçu généré pour ${movementKey}`);
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error(String(error));
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    const movements = CAMERA_MOVEMENTS.filter(m => m.value !== 'static' && !previewStatus[m.value]);

    for (const movement of movements) {
      setGenerating(movement.value);
      try {
        const res = await fetch('/api/camera-movements/generate-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            movementKey: movement.value,
            referenceImageUrl: referenceImage,
          }),
        });

        if (res.ok) {
          setPreviewStatus(prev => ({ ...prev, [movement.value]: true }));
        }
      } catch (error) {
        console.error(`Error generating ${movement.value}:`, error);
      }
    }

    setGenerating(null);
    setGeneratingAll(false);
    toast.success('Génération terminée');
  };

  const completedCount = Object.values(previewStatus).filter(Boolean).length;
  const totalCount = CAMERA_MOVEMENTS.length - 1; // Exclude static

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <h2 className="text-xl font-semibold">Mouvements de Caméra</h2>
          <Badge variant="secondary">{CAMERA_MOVEMENTS.length} mouvements</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {completedCount}/{totalCount} aperçus
          </Badge>
        </div>
      </div>

      {/* Reference Image Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Image de référence</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="w-48 aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
              {referenceImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={referenceImage}
                  alt="Reference"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                  <span className="text-xs">Aucune image</span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-sm text-muted-foreground">
                Uploadez une image de référence qui sera utilisée pour tous les aperçus de mouvements de caméra.
                Si aucune image n&apos;est fournie, une image par défaut sera générée.
              </p>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Uploader une image
                </Button>
                {referenceImage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReferenceImage(null)}
                  >
                    Supprimer
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generate All Button */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Générez des aperçus vidéo pour visualiser chaque mouvement de caméra.
        </p>
        <Button
          onClick={handleGenerateAll}
          disabled={generatingAll || generating !== null}
        >
          {generatingAll ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4 mr-2" />
          )}
          Générer tous les aperçus manquants
        </Button>
      </div>

      {/* Movements Grid */}
      <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as CameraMovementCategory)}>
        <TabsList className="flex flex-wrap gap-1 h-auto p-1">
          {CAMERA_MOVEMENT_CATEGORIES.map((cat) => {
            const movements = getMovementsByCategory(cat.value);
            const completed = movements.filter(m => previewStatus[m.value]).length;
            return (
              <TabsTrigger
                key={cat.value}
                value={cat.value}
                className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {cat.label}
                <span className="ml-1 text-[10px] opacity-60">
                  ({completed}/{movements.length})
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {CAMERA_MOVEMENT_CATEGORIES.map((cat) => (
          <TabsContent key={cat.value} value={cat.value} className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {getMovementsByCategory(cat.value).map((movement) => {
                const hasPreview = previewStatus[movement.value];
                const isGenerating = generating === movement.value;

                return (
                  <Card
                    key={movement.value}
                    className={cn(
                      'overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary/50',
                      selectedMovement?.value === movement.value && 'ring-2 ring-primary'
                    )}
                    onClick={() => setSelectedMovement(movement)}
                  >
                    {/* Preview area */}
                    <div className="aspect-video bg-muted relative">
                      {isGenerating ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted">
                          <div className="text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                            <p className="text-xs text-muted-foreground mt-2">Génération...</p>
                          </div>
                        </div>
                      ) : hasPreview ? (
                        <video
                          src={`/camera-movements/${movement.value}.mp4`}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          autoPlay
                          playsInline
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                          <Play className="w-8 h-8 mb-2" />
                          <span className="text-xs">Pas d&apos;aperçu</span>
                        </div>
                      )}

                      {/* Status indicator */}
                      <div className="absolute top-2 right-2">
                        {hasPreview ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-muted-foreground/50" />
                        )}
                      </div>

                      {/* Generate button overlay */}
                      {!isGenerating && (
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGeneratePreview(movement.value);
                            }}
                          >
                            {hasPreview ? (
                              <RefreshCw className="w-4 h-4 mr-1" />
                            ) : (
                              <Wand2 className="w-4 h-4 mr-1" />
                            )}
                            {hasPreview ? 'Regénérer' : 'Générer'}
                          </Button>
                        </div>
                      )}
                    </div>

                    <CardContent className="p-3">
                      <h3 className="font-medium text-sm mb-1">{movement.label}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {movement.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Detail modal */}
      <Dialog open={!!selectedMovement} onOpenChange={() => setSelectedMovement(null)}>
        <DialogContent className="max-w-3xl">
          {selectedMovement && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedMovement.label}
                  <Badge variant="outline">
                    {CAMERA_MOVEMENT_CATEGORIES.find(c => c.value === selectedMovement.category)?.label}
                  </Badge>
                  {previewStatus[selectedMovement.value] && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-6">
                {/* Preview */}
                <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
                  {previewStatus[selectedMovement.value] ? (
                    <video
                      src={`/camera-movements/${selectedMovement.value}.mp4`}
                      className="w-full h-full object-cover"
                      controls
                      autoPlay
                      loop
                      muted
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-12 h-12 mb-2" />
                      <span className="text-sm">Pas d&apos;aperçu disponible</span>
                      <Button
                        className="mt-4"
                        onClick={() => handleGeneratePreview(selectedMovement.value)}
                        disabled={generating === selectedMovement.value}
                      >
                        {generating === selectedMovement.value ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4 mr-2" />
                        )}
                        Générer l&apos;aperçu
                      </Button>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                    <p className="text-sm">{selectedMovement.description}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Modèle de prompt</h4>
                    <div className="bg-muted rounded-lg p-3">
                      <code className="text-xs font-mono whitespace-pre-wrap">
                        {selectedMovement.promptTemplate}
                      </code>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleGeneratePreview(selectedMovement.value)}
                      disabled={generating === selectedMovement.value}
                    >
                      {generating === selectedMovement.value ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {previewStatus[selectedMovement.value] ? 'Regénérer' : 'Générer'}
                    </Button>
                    {previewStatus[selectedMovement.value] && (
                      <Button variant="outline" asChild>
                        <a
                          href={`/camera-movements/${selectedMovement.value}.mp4`}
                          download
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Télécharger
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
