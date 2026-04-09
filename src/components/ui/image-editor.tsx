'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Crop,
  Paintbrush,
  Expand,
  ZoomIn,
  RotateCcw,
  Camera,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/use-signed-url';
import type { GenerationMetadata } from '@/types/database';

// Tool types
type EditorTool = 'crop' | 'inpaint' | 'extend' | 'upscale' | 'angles' | 'regen';

// Crop aspect ratios
const CROP_RATIOS = [
  { label: 'Libre', value: null },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '1:1', value: 1 },
  { label: '21:9', value: 21 / 9 },
] as const;

// Multi-angle camera movements for Kling
const ANGLE_MOVEMENTS = [
  { id: 'orbit_left', label: 'Orbit gauche', icon: '↺' },
  { id: 'orbit_right', label: 'Orbit droite', icon: '↻' },
  { id: 'arc_up', label: 'Arc haut', icon: '⌒' },
  { id: 'arc_down', label: 'Arc bas', icon: '⌓' },
  { id: 'zoom_in', label: 'Zoom avant', icon: '⊕' },
  { id: 'zoom_out', label: 'Zoom arrière', icon: '⊖' },
  { id: 'pan_left', label: 'Pan gauche', icon: '←' },
  { id: 'pan_right', label: 'Pan droite', icon: '→' },
] as const;

// Parse generation metadata from description
function parseGenerationMetadata(description?: string): GenerationMetadata | null {
  if (!description) return null;
  const match = description.match(/<!-- metadata:([\s\S]*?) -->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

interface ImageEditorProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageId: string;
  description?: string;
  prompt?: string; // Direct prompt (preferred over parsing description)
  projectId: string;
  onRegenerate?: (prompt: string, options?: Record<string, unknown>) => Promise<void>;
  onSave?: (imageUrl: string) => void;
}

export function ImageEditor({
  isOpen,
  onClose,
  imageUrl,
  imageId,
  description,
  prompt: promptProp,
  projectId,
  onRegenerate,
  onSave,
}: ImageEditorProps) {
  // Tool state
  const [activeTool, setActiveTool] = useState<EditorTool>('crop');
  const [isProcessing, setIsProcessing] = useState(false);

  // Prompt state - use promptProp first, then try metadata, fallback to description
  const metadata = parseGenerationMetadata(description);
  const initialPrompt = promptProp || metadata?.original_prompt || description || '';
  const [prompt, setPrompt] = useState(initialPrompt);
  const [copied, setCopied] = useState(false);

  // Crop state
  const [cropRatio, setCropRatio] = useState<number | null>(null);
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [cropDragStart, setCropDragStart] = useState({ x: 0, y: 0 });
  const [cropDragType, setCropDragType] = useState<'move' | 'resize' | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Multi-angles state
  const [selectedMovement, setSelectedMovement] = useState('orbit_left');
  const [angleDuration, setAngleDuration] = useState(3);
  const [extractFrames, setExtractFrames] = useState(true);
  const [frameCount, setFrameCount] = useState(4);

  // Regen state
  const [regenCount, setRegenCount] = useState(4);

  // Signed URL for display
  const { signedUrl } = useSignedUrl(imageUrl);

  // Reset prompt when image changes
  useEffect(() => {
    if (isOpen) {
      const meta = parseGenerationMetadata(description);
      const resolvedPrompt = promptProp || meta?.original_prompt || description || '';
      setPrompt(resolvedPrompt);
    }
  }, [isOpen, description, promptProp, imageId]);

  // Copy prompt
  const copyPrompt = useCallback(async () => {
    if (prompt) {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [prompt]);

  // Handle crop
  const handleCrop = useCallback(async () => {
    if (!imageRef.current || !signedUrl) return;

    setIsProcessing(true);
    try {
      // Fetch image as blob to avoid CORS issues with canvas
      const imgResponse = await fetch(signedUrl);
      const blob = await imgResponse.blob();
      const imageBitmap = await createImageBitmap(blob);

      // Create canvas for cropping
      const displayImg = imageRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      // Calculate actual crop dimensions using natural dimensions
      const scaleX = imageBitmap.width / displayImg.clientWidth;
      const scaleY = imageBitmap.height / displayImg.clientHeight;

      const cropX = (cropArea.x / 100) * displayImg.clientWidth * scaleX;
      const cropY = (cropArea.y / 100) * displayImg.clientHeight * scaleY;
      const cropW = (cropArea.width / 100) * displayImg.clientWidth * scaleX;
      const cropH = (cropArea.height / 100) * displayImg.clientHeight * scaleY;

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(imageBitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      // Convert to base64 data URL
      const dataUrl = canvas.toDataURL('image/png');

      // Upload using upload-frame endpoint
      const response = await fetch(`/api/projects/${projectId}/upload-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl,
          type: 'cropped',
        }),
      });

      if (!response.ok) throw new Error('Upload failed');

      const { url } = await response.json();
      onSave?.(url);
      onClose();
    } catch (error) {
      console.error('Crop failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [cropArea, projectId, signedUrl, onSave, onClose]);

  // Handle multi-angle generation
  const handleGenerateAngles = useCallback(async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/queue-multi-angle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          movement: selectedMovement,
          duration: angleDuration,
          extractFrames,
          frameCount,
          prompt,
        }),
      });

      if (!response.ok) throw new Error('Failed to queue multi-angle generation');

      onClose();
    } catch (error) {
      console.error('Multi-angle generation failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, imageUrl, selectedMovement, angleDuration, extractFrames, frameCount, prompt, onClose]);

  // Handle regeneration
  const handleRegenerate = useCallback(async () => {
    if (!onRegenerate || !prompt.trim()) return;

    setIsProcessing(true);
    try {
      await onRegenerate(prompt, { count: regenCount });
      onClose();
    } catch (error) {
      console.error('Regeneration failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [onRegenerate, prompt, regenCount, onClose]);

  // Crop drag handlers
  const handleCropMouseDown = useCallback((e: React.MouseEvent, type: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCrop(true);
    setCropDragType(type);
    setCropDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCropMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingCrop || !imageContainerRef.current) return;

    const container = imageContainerRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - cropDragStart.x) / container.width) * 100;
    const deltaY = ((e.clientY - cropDragStart.y) / container.height) * 100;

    if (cropDragType === 'move') {
      setCropArea((prev) => ({
        ...prev,
        x: Math.max(0, Math.min(100 - prev.width, prev.x + deltaX)),
        y: Math.max(0, Math.min(100 - prev.height, prev.y + deltaY)),
      }));
    } else if (cropDragType === 'resize') {
      setCropArea((prev) => {
        let newWidth = Math.max(10, Math.min(100 - prev.x, prev.width + deltaX));
        let newHeight = Math.max(10, Math.min(100 - prev.y, prev.height + deltaY));

        // Apply aspect ratio constraint
        if (cropRatio) {
          const containerRatio = container.width / container.height;
          const adjustedRatio = cropRatio / containerRatio;
          newHeight = newWidth / adjustedRatio;
          if (prev.y + newHeight > 100) {
            newHeight = 100 - prev.y;
            newWidth = newHeight * adjustedRatio;
          }
        }

        return { ...prev, width: newWidth, height: newHeight };
      });
    }

    setCropDragStart({ x: e.clientX, y: e.clientY });
  }, [isDraggingCrop, cropDragStart, cropDragType, cropRatio]);

  const handleCropMouseUp = useCallback(() => {
    setIsDraggingCrop(false);
    setCropDragType(null);
  }, []);

  // Tool definitions
  const tools = [
    { id: 'crop' as const, icon: Crop, label: 'Crop' },
    { id: 'inpaint' as const, icon: Paintbrush, label: 'Inpaint', disabled: true },
    { id: 'extend' as const, icon: Expand, label: 'Extend', disabled: true },
    { id: 'upscale' as const, icon: ZoomIn, label: 'Upscale', disabled: true },
    { id: 'angles' as const, icon: Camera, label: 'Angles' },
    { id: 'regen' as const, icon: RotateCcw, label: 'Regen' },
  ];

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0e14]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">Image Editor</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="text-white/70 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left toolbar */}
        <div className="w-20 bg-slate-900/50 border-r border-white/10 p-2 flex flex-col gap-1">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => !tool.disabled && setActiveTool(tool.id)}
              disabled={tool.disabled}
              className={cn(
                'flex flex-col items-center gap-1 p-3 rounded-lg transition-colors',
                activeTool === tool.id
                  ? 'bg-blue-500/20 text-blue-400'
                  : tool.disabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              <tool.icon className="w-5 h-5" />
              <span className="text-[10px]">{tool.label}</span>
            </button>
          ))}
        </div>

        {/* Center - Image */}
        <div
          ref={imageContainerRef}
          className="flex-1 relative flex items-center justify-center p-8 overflow-hidden"
          onMouseMove={handleCropMouseMove}
          onMouseUp={handleCropMouseUp}
          onMouseLeave={handleCropMouseUp}
        >
          <div className="relative max-w-full max-h-full">
            {signedUrl ? (
              <img
                ref={imageRef}
                src={signedUrl}
                alt="Edit"
                className="max-h-[calc(100vh-300px)] max-w-full object-contain rounded-lg"
              />
            ) : (
              <div className="w-96 h-96 bg-slate-800 rounded-lg flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
              </div>
            )}

            {/* Crop overlay */}
            {activeTool === 'crop' && signedUrl && (
              <>
                {/* Darkened areas outside crop */}
                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="absolute bg-black/60"
                    style={{ top: 0, left: 0, right: 0, height: `${cropArea.y}%` }}
                  />
                  <div
                    className="absolute bg-black/60"
                    style={{
                      top: `${cropArea.y}%`,
                      left: 0,
                      width: `${cropArea.x}%`,
                      height: `${cropArea.height}%`,
                    }}
                  />
                  <div
                    className="absolute bg-black/60"
                    style={{
                      top: `${cropArea.y}%`,
                      right: 0,
                      width: `${100 - cropArea.x - cropArea.width}%`,
                      height: `${cropArea.height}%`,
                    }}
                  />
                  <div
                    className="absolute bg-black/60"
                    style={{
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: `${100 - cropArea.y - cropArea.height}%`,
                    }}
                  />
                </div>

                {/* Crop selection box */}
                <div
                  className="absolute border-2 border-blue-500 cursor-move"
                  style={{
                    left: `${cropArea.x}%`,
                    top: `${cropArea.y}%`,
                    width: `${cropArea.width}%`,
                    height: `${cropArea.height}%`,
                  }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'move')}
                >
                  {/* Grid lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="border border-white/20" />
                    ))}
                  </div>

                  {/* Resize handle */}
                  <div
                    className="absolute -right-2 -bottom-2 w-4 h-4 bg-blue-500 rounded-full cursor-se-resize"
                    onMouseDown={(e) => handleCropMouseDown(e, 'resize')}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right panel - Tool options */}
        <div className="w-72 bg-slate-900/50 border-l border-white/10 p-4 overflow-y-auto">
          <h3 className="text-sm font-medium text-white mb-4">
            {tools.find((t) => t.id === activeTool)?.label} Options
          </h3>

          {/* Crop options */}
          {activeTool === 'crop' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide">
                  Ratio
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {CROP_RATIOS.map((ratio) => (
                    <button
                      key={ratio.label}
                      onClick={() => setCropRatio(ratio.value)}
                      className={cn(
                        'px-3 py-2 text-sm rounded-lg transition-colors',
                        cropRatio === ratio.value
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white border border-white/5'
                      )}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleCrop}
                disabled={isProcessing}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Crop className="w-4 h-4 mr-2" />
                )}
                Appliquer le crop
              </Button>
            </div>
          )}

          {/* Multi-angles options */}
          {activeTool === 'angles' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide">
                  Mouvement caméra
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {ANGLE_MOVEMENTS.map((movement) => (
                    <button
                      key={movement.id}
                      onClick={() => setSelectedMovement(movement.id)}
                      className={cn(
                        'px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2',
                        selectedMovement === movement.id
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white border border-white/5'
                      )}
                    >
                      <span className="text-lg">{movement.icon}</span>
                      <span className="text-xs">{movement.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide">
                  Durée: {angleDuration}s
                </label>
                <Slider
                  value={[angleDuration]}
                  onValueChange={([v]) => setAngleDuration(v)}
                  min={2}
                  max={10}
                  step={1}
                  className="mt-2"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-400">Extraire frames</label>
                <button
                  onClick={() => setExtractFrames(!extractFrames)}
                  className={cn(
                    'w-12 h-6 rounded-full transition-colors relative',
                    extractFrames ? 'bg-purple-500' : 'bg-slate-700'
                  )}
                >
                  <div
                    className={cn(
                      'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                      extractFrames ? 'translate-x-7' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {extractFrames && (
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wide">
                    Nombre de frames: {frameCount}
                  </label>
                  <Slider
                    value={[frameCount]}
                    onValueChange={([v]) => setFrameCount(v)}
                    min={2}
                    max={12}
                    step={1}
                    className="mt-2"
                  />
                </div>
              )}

              <Button
                onClick={handleGenerateAngles}
                disabled={isProcessing}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 mr-2" />
                )}
                Générer multi-angles
              </Button>
            </div>
          )}

          {/* Regen options */}
          {activeTool === 'regen' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide">
                  Nombre de variantes: {regenCount}
                </label>
                <Slider
                  value={[regenCount]}
                  onValueChange={([v]) => setRegenCount(v)}
                  min={1}
                  max={8}
                  step={1}
                  className="mt-2"
                />
              </div>

              <div className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                <p className="text-xs text-slate-500 mb-1">Modèle original</p>
                <p className="text-sm text-slate-300">
                  {metadata?.model?.split('/').pop() || 'Inconnu'}
                </p>
              </div>

              <Button
                onClick={handleRegenerate}
                disabled={isProcessing || !prompt.trim()}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Régénérer {regenCount} variante{regenCount > 1 ? 's' : ''}
              </Button>
            </div>
          )}

          {/* Disabled tool placeholder */}
          {(activeTool === 'inpaint' || activeTool === 'extend' || activeTool === 'upscale') && (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm">Bientôt disponible</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom prompt panel */}
      <div className="border-t border-white/10 bg-slate-900/80 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 uppercase tracking-wide">Prompt</span>
            <button
              onClick={copyPrompt}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  <span className="text-green-400">Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prompt de l'image..."
            className="min-h-[80px] bg-slate-800 border-white/10 text-white placeholder:text-slate-600 resize-none"
          />
          {metadata?.references && (
            <div className="flex flex-wrap gap-2 mt-2">
              {metadata.references.characters?.map((char, i) => (
                <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded">
                  @{char}
                </span>
              ))}
              {metadata.references.locations?.map((loc, i) => (
                <span key={i} className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded">
                  #{loc}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
