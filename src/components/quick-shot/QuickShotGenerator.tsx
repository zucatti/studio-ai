'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MentionInput } from '@/components/ui/mention-input';
import { Label } from '@/components/ui/label';
import { GeneratingPlaceholder } from '@/components/ui/generating-placeholder';
import { PromptWizard } from './PromptWizard';
import { StorageImg } from '@/components/ui/storage-image';
import { useGeneration } from '@/contexts/generation-context';
import { Sparkles, Loader2, Minus, Plus, ChevronDown, Wand2, Layers, Lock, Check, RefreshCw, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import type { AspectRatio, Shot } from '@/types/database';
import type { GenerationStatus } from '@/lib/sse';

interface PlaceholderState {
  status: GenerationStatus;
  progress?: number;
  shotId?: string;
  imageUrl?: string;
  jobId?: string;
}

interface GeneratedImage {
  jobId: string;
  imageUrl: string;
  selected?: boolean;
}

interface QuickShotGeneratorProps {
  projectId: string;
  defaultAspectRatio: AspectRatio;
  onShotsGenerated: (shots: Shot[]) => void;
  /** Callback when user selects a single image */
  onImageSelected?: (imageUrl: string) => void;
  /** Custom API endpoint (defaults to /api/projects/{projectId}/queue-quick-shot) */
  apiEndpoint?: string;
  /** Custom title for the generator */
  title?: string;
  /** Custom description */
  description?: string;
  /** Lock aspect ratio to project setting (cannot be changed by user) */
  lockAspectRatio?: boolean;
  /** Show placeholder cards during generation (default: true) */
  showPlaceholders?: boolean;
  /** Show serial mode toggle (default: true) */
  showSerialMode?: boolean;
  /** Called when generation starts - useful for switching views */
  onGenerationStart?: () => void;
  /** Mode: 'single' auto-applies first result, 'multi' shows selection UI */
  mode?: 'single' | 'multi';
}

const ASPECT_RATIO_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: '4:5', label: '4:5 Instagram' },
  { value: '2:3', label: '2:3 Portrait' },
  { value: '16:9', label: '16:9 Paysage' },
  { value: '1:1', label: '1:1 Carré' },
  { value: '9:16', label: '9:16 Vertical' },
];

const MODEL_OPTIONS = [
  { value: 'fal-ai/nano-banana-2', label: 'Nano Banana' },
  { value: 'seedream-5', label: 'Seedream 5' },
  { value: 'kling-o1', label: 'Kling O1' },
] as const;

type ModelType = typeof MODEL_OPTIONS[number]['value'];

// Poll interval for job status
const POLL_INTERVAL = 2000; // 2 seconds

export function QuickShotGenerator({
  projectId,
  defaultAspectRatio,
  onShotsGenerated,
  onImageSelected,
  apiEndpoint,
  title = 'Quick Shot Generator',
  description,
  lockAspectRatio = false,
  showPlaceholders = true,
  showSerialMode = true,
  onGenerationStart,
  mode = 'single',
}: QuickShotGeneratorProps) {
  const effectiveApiEndpoint = apiEndpoint || `/api/projects/${projectId}/queue-quick-shot`;
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(defaultAspectRatio);
  const [selectedModel, setSelectedModel] = useState<ModelType>('fal-ai/nano-banana-2');
  const [count, setCount] = useState(mode === 'multi' ? 4 : 1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeholders, setPlaceholders] = useState<PlaceholderState[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [optimizePrompt, setOptimizePrompt] = useState(true);
  const [serialMode, setSerialMode] = useState(false);
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K');

  // Multi-image state
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const { addJob, updateJob } = useGeneration();
  const activeJobsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const jobIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync aspect ratio when defaultAspectRatio changes (e.g., after API fetch)
  useEffect(() => {
    setAspectRatio(defaultAspectRatio);
  }, [defaultAspectRatio]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      // Clear all active job polls
      for (const interval of activeJobsRef.current.values()) {
        clearInterval(interval);
      }
      activeJobsRef.current.clear();
    };
  }, []);

  // Poll job status for a single job (multi-mode)
  const pollSingleJob = useCallback(async (jobId: string, index: number) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch job status');
      }

      const data = await res.json();
      const job = data.job || data;
      console.log(`[QuickShotGenerator] Job ${index + 1} status:`, job.status, job.progress);

      // Update placeholder for this specific job
      setPlaceholders(prev => prev.map((p, i) =>
        i === index ? {
          ...p,
          status: job.status === 'completed' ? 'completed' : 'generating',
          progress: job.progress,
          jobId,
        } : p
      ));

      // Check if completed
      if (job.status === 'completed') {
        // Stop polling this job
        const interval = activeJobsRef.current.get(jobId);
        if (interval) {
          clearInterval(interval);
          activeJobsRef.current.delete(jobId);
        }

        // Get the result
        const result = job.result_data || job.output_data || {};
        const imageUrl = result.imageUrl;

        if (imageUrl) {
          setGeneratedImages(prev => [...prev, { jobId, imageUrl }]);
          setCompletedCount(prev => prev + 1);
        }

        // Update placeholder with image
        setPlaceholders(prev => prev.map((p, i) =>
          i === index ? { ...p, imageUrl, status: 'completed' } : p
        ));

        return;
      }

      // Check if failed
      if (job.status === 'failed') {
        const interval = activeJobsRef.current.get(jobId);
        if (interval) {
          clearInterval(interval);
          activeJobsRef.current.delete(jobId);
        }

        setPlaceholders(prev => prev.map((p, i) =>
          i === index ? { ...p, status: 'error' as GenerationStatus } : p
        ));
        setCompletedCount(prev => prev + 1);
      }
    } catch (err) {
      console.error(`[QuickShotGenerator] Poll error for job ${index}:`, err);
      const interval = activeJobsRef.current.get(jobId);
      if (interval) {
        clearInterval(interval);
        activeJobsRef.current.delete(jobId);
      }
      setCompletedCount(prev => prev + 1);
    }
  }, []);

  // Poll job status (single mode - original behavior)
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch job status');
      }

      const data = await res.json();
      const job = data.job || data; // Handle both { job: {...} } and direct response
      console.log('[QuickShotGenerator] Job status:', job.status, job.progress);

      // Update status message
      setStatusMessage(job.message || 'Génération en cours...');

      // Update placeholder progress
      setPlaceholders(prev => prev.map(p => ({
        ...p,
        status: job.status === 'completed' ? 'completed' : 'generating',
        progress: job.progress,
      })));

      // Update job in global context
      if (jobIdRef.current) {
        updateJob(jobIdRef.current, {
          status: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'error' : 'generating',
        });
      }

      // Check if completed
      if (job.status === 'completed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        // Get the result - can be in result_data or output_data
        const result = job.result_data || job.output_data || {};
        const imageUrl = result.imageUrl;

        if (imageUrl) {
          // Create a shot-like object
          const generatedShot = {
            storyboard_image_url: imageUrl,
            first_frame_url: imageUrl,
          } as Shot;

          onShotsGenerated([generatedShot]);
          setPrompt('');
        }

        setPlaceholders([]);
        setStatusMessage('');
        setIsGenerating(false);
        jobIdRef.current = null;
        return;
      }

      // Check if failed
      if (job.status === 'failed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        throw new Error(job.error_message || 'Generation failed');
      }
    } catch (err) {
      console.error('[QuickShotGenerator] Poll error:', err);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      setError(err instanceof Error ? err.message : 'An error occurred');
      setPlaceholders([]);
      setStatusMessage('');
      setIsGenerating(false);

      if (jobIdRef.current) {
        updateJob(jobIdRef.current, {
          status: 'error',
          error: err instanceof Error ? err.message : 'An error occurred',
        });
        jobIdRef.current = null;
      }
    }
  }, [onShotsGenerated, updateJob]);

  // Check if all jobs completed (for multi-mode)
  useEffect(() => {
    if (mode === 'multi' && isGenerating && completedCount >= count) {
      setIsGenerating(false);
      setStatusMessage('');
    }
  }, [mode, isGenerating, completedCount, count]);

  const handleGenerate = useCallback(async () => {
    console.log('[QuickShotGenerator] handleGenerate called', { prompt: prompt.trim(), effectiveApiEndpoint, mode, count });
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setStatusMessage('En file d\'attente...');
    setGeneratedImages([]);
    setSelectedImageUrl(null);
    setCompletedCount(0);

    // Notify parent that generation started
    onGenerationStart?.();

    // Initialize placeholders
    setPlaceholders(Array(count).fill(null).map(() => ({ status: 'queued' as GenerationStatus })));

    // Track generation in global context
    const localJobId = `quick-shot-${Date.now()}`;
    addJob({
      id: localJobId,
      projectId,
      type: 'quick-shot',
      status: 'generating',
      imageCount: count,
      completedCount: 0,
    });

    if (mode === 'multi') {
      // Multi-mode: queue multiple jobs
      try {
        const jobIds: string[] = [];

        for (let i = 0; i < count; i++) {
          console.log(`[QuickShotGenerator] Queuing job ${i + 1}/${count}`);
          const res = await fetch(effectiveApiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: prompt.trim(),
              aspectRatio,
              model: selectedModel,
              resolution,
              skipOptimization: !optimizePrompt,
            }),
          });

          if (!res.ok) {
            const data = await res.json();
            console.error(`[QuickShotGenerator] Error queuing job ${i + 1}:`, data);
            // Mark this placeholder as failed
            setPlaceholders(prev => prev.map((p, idx) =>
              idx === i ? { ...p, status: 'error' as GenerationStatus } : p
            ));
            setCompletedCount(prev => prev + 1);
            continue;
          }

          const data = await res.json();
          console.log(`[QuickShotGenerator] Job ${i + 1} queued:`, data.jobId);
          jobIds.push(data.jobId);

          // Update placeholder to generating
          setPlaceholders(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'generating' as GenerationStatus, jobId: data.jobId } : p
          ));

          // Start polling for this job
          const pollInterval = setInterval(() => {
            pollSingleJob(data.jobId, i);
          }, POLL_INTERVAL);
          activeJobsRef.current.set(data.jobId, pollInterval);

          // Poll immediately
          pollSingleJob(data.jobId, i);
        }

        setStatusMessage(`Génération de ${count} images...`);

      } catch (err) {
        console.error('[QuickShotGenerator] Multi-mode error:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        setIsGenerating(false);
      }
    } else {
      // Single mode (original behavior)
      try {
        console.log('[QuickShotGenerator] Fetching', effectiveApiEndpoint);
        const res = await fetch(effectiveApiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: prompt.trim(),
            aspectRatio,
            model: selectedModel,
            resolution,
            skipOptimization: !optimizePrompt,
          }),
        });
        console.log('[QuickShotGenerator] Response status', res.status, res.ok);

        if (!res.ok) {
          const data = await res.json();
          console.error('[QuickShotGenerator] Error response', data);
          throw new Error(data.error || 'Failed to queue generation');
        }

        const data = await res.json();
        console.log('[QuickShotGenerator] Job queued:', data.jobId);

        // Store the real job ID
        jobIdRef.current = data.jobId;
        updateJob(localJobId, { id: data.jobId, status: 'generating' });

        // Update placeholders to generating
        setPlaceholders(prev => prev.map(p => ({ ...p, status: 'generating' as GenerationStatus })));
        setStatusMessage('Génération en cours...');

        // Start polling
        pollIntervalRef.current = setInterval(() => {
          pollJobStatus(data.jobId);
        }, POLL_INTERVAL);

        // Poll immediately
        await pollJobStatus(data.jobId);

      } catch (err) {
        console.error('[QuickShotGenerator] Catch error', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        setPlaceholders([]);
        setStatusMessage('');
        setIsGenerating(false);

        updateJob(localJobId, {
          status: 'error',
          error: err instanceof Error ? err.message : 'An error occurred',
        });
      }
    }
  }, [prompt, aspectRatio, selectedModel, count, resolution, optimizePrompt, projectId, addJob, updateJob, effectiveApiEndpoint, onGenerationStart, pollJobStatus, pollSingleJob, mode]);

  return (
    <div className="bg-[#0d1829] border border-white/10 rounded-xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-slate-500">
            {description || (
              <>Utilisez <span className="text-blue-400">@Personnage</span> <span className="text-green-400">#Lieu</span> <span className="text-purple-400">!Référence</span> dans la description</>
            )}
          </p>
        </div>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-slate-300 text-sm">
            Prompt
          </Label>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-md transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Assistant
          </button>
        </div>
        <MentionInput
          value={prompt}
          onChange={setPrompt}
          placeholder="@Morgana regarde le coucher de soleil sur #LaPlage avec !GoldenHour..."
          minHeight="100px"
          projectId={projectId}
        />
      </div>

      {/* Prompt Wizard Dialog */}
      <PromptWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        projectId={projectId}
        onPromptGenerated={(generatedPrompt) => {
          setPrompt(generatedPrompt);
        }}
      />

      {/* Options row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Aspect Ratio - Custom styled select */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Format</span>
          <div className="relative">
            {lockAspectRatio ? (
              <div className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm flex items-center gap-2 opacity-70">
                <span>{ASPECT_RATIO_OPTIONS.find(o => o.value === aspectRatio)?.label || aspectRatio}</span>
                <Lock className="w-3 h-3 text-slate-500" />
              </div>
            ) : (
              <>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                  className="h-9 pl-3 pr-8 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-blue-500/50 focus:outline-none appearance-none cursor-pointer hover:bg-white/10 transition-colors"
                >
                  {ASPECT_RATIO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#1a2433]">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </>
            )}
          </div>
        </div>

        {/* Count selector (multi-mode only) */}
        {mode === 'multi' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Quantité</span>
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => setCount(Math.max(1, count - 1))}
                disabled={count <= 1 || isGenerating}
                className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-white font-medium">{count}</span>
              <button
                type="button"
                onClick={() => setCount(Math.min(8, count + 1))}
                disabled={count >= 8 || isGenerating}
                className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Model toggle */}
        <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-white/10">
          {MODEL_OPTIONS.map((model) => (
            <button
              key={model.value}
              type="button"
              onClick={() => setSelectedModel(model.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded transition-all',
                selectedModel === model.value
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {model.label}
            </button>
          ))}
        </div>

        {/* Resolution toggle */}
        <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-white/10">
          {(['1K', '2K', '4K'] as const).map((res) => (
            <button
              key={res}
              type="button"
              onClick={() => setResolution(res)}
              className={cn(
                'px-2.5 py-1.5 text-xs font-medium rounded transition-all',
                resolution === res
                  ? 'bg-purple-500 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {res}
            </button>
          ))}
        </div>

        {/* Optimize prompt toggle */}
        <button
          type="button"
          onClick={() => setOptimizePrompt(!optimizePrompt)}
          className="flex items-center gap-2 group"
        >
          <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
            Optimiser
          </span>
          <div
            className={cn(
              'relative w-10 h-6 rounded-full transition-colors',
              optimizePrompt ? 'bg-blue-500' : 'bg-white/10'
            )}
          >
            <div
              className={cn(
                'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                optimizePrompt ? 'translate-x-5' : 'translate-x-1'
              )}
            />
          </div>
        </button>

        {/* Generate Button */}
        <div className="flex-1 flex justify-end gap-2">
          {/* Regenerate button (multi-mode, after generation) */}
          {mode === 'multi' && generatedImages.length > 0 && !isGenerating && (
            <Button
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              variant="outline"
              className="border-white/20 text-slate-300 hover:bg-white/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Régénérer
            </Button>
          )}
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25 min-w-[180px]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {mode === 'multi' ? `${completedCount}/${count}` : 'Génération...'}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {mode === 'multi' ? `Générer ${count} images` : "Générer l'image"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Multi-mode: Generated images with selection */}
      {mode === 'multi' && (isGenerating || generatedImages.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{statusMessage || `Génération ${completedCount}/${count}...`}</span>
                </>
              ) : (
                <span className="text-slate-300">
                  {generatedImages.length} image{generatedImages.length > 1 ? 's' : ''} générée{generatedImages.length > 1 ? 's' : ''} - Cliquez pour sélectionner
                </span>
              )}
            </div>
            {selectedImageUrl && !isGenerating && (
              <Button
                onClick={() => {
                  if (onImageSelected) {
                    onImageSelected(selectedImageUrl);
                  } else {
                    onShotsGenerated([{
                      storyboard_image_url: selectedImageUrl,
                      first_frame_url: selectedImageUrl,
                    } as Shot]);
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                Utiliser cette image
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {placeholders.map((placeholder, index) => {
              const generatedImg = generatedImages.find(g => g.jobId === placeholder.jobId);
              const imageUrl = placeholder.imageUrl || generatedImg?.imageUrl;

              if (imageUrl) {
                // Show generated image with selection
                const isSelected = selectedImageUrl === imageUrl;
                // Find the index in generatedImages for lightbox
                const lightboxIdx = generatedImages.findIndex(g => g.imageUrl === imageUrl);
                return (
                  <div
                    key={index}
                    className={cn(
                      'relative aspect-[var(--aspect)] rounded-lg overflow-hidden border-2 transition-all group',
                      isSelected
                        ? 'border-green-500 ring-2 ring-green-500/30'
                        : 'border-white/10 hover:border-white/30'
                    )}
                    style={{
                      '--aspect': aspectRatio === '9:16' ? '9/16' :
                                 aspectRatio === '16:9' ? '16/9' :
                                 aspectRatio === '4:5' ? '4/5' :
                                 aspectRatio === '2:3' ? '2/3' : '1/1'
                    } as React.CSSProperties}
                  >
                    {/* Main clickable area for selection */}
                    <button
                      type="button"
                      onClick={() => setSelectedImageUrl(isSelected ? null : imageUrl)}
                      className="absolute inset-0 w-full h-full"
                    >
                      <StorageImg
                        src={imageUrl}
                        alt={`Generated ${index + 1}`}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      {/* Selection overlay */}
                      <div className={cn(
                        'absolute inset-0 transition-all',
                        isSelected ? 'bg-green-500/20' : 'bg-black/0 group-hover:bg-black/20'
                      )}>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                    {/* Expand button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex(lightboxIdx >= 0 ? lightboxIdx : 0);
                        setLightboxOpen(true);
                      }}
                      className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all z-10"
                      title="Voir en grand"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-white" />
                    </button>
                    {/* Image number */}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-xs text-white">
                      #{index + 1}
                    </div>
                  </div>
                );
              }

              // Show placeholder during generation
              return (
                <GeneratingPlaceholder
                  key={index}
                  aspectRatio={aspectRatio}
                  status={placeholder.status}
                  progress={placeholder.progress}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Single mode: Generation Progress - Placeholder Cards */}
      {mode === 'single' && showPlaceholders && isGenerating && placeholders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{statusMessage}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {placeholders.map((placeholder, index) => (
              <GeneratingPlaceholder
                key={index}
                aspectRatio={aspectRatio}
                status={placeholder.status}
                progress={placeholder.progress}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lightbox for viewing images in fullscreen */}
      {mode === 'multi' && (
        <Lightbox
          images={generatedImages.map((img, idx): LightboxImage => ({
            id: img.jobId,
            url: img.imageUrl,
            description: `Image ${idx + 1}`,
          }))}
          initialIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
