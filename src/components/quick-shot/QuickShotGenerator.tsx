'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { MentionInput } from '@/components/ui/mention-input';
import { Label } from '@/components/ui/label';
import { GeneratingPlaceholder } from '@/components/ui/generating-placeholder';
import { PromptWizard } from './PromptWizard';
import { useGeneration } from '@/contexts/generation-context';
import { Sparkles, Loader2, Minus, Plus, ChevronDown, Wand2, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AspectRatio, Shot } from '@/types/database';
import type { GenerationProgressEvent, GenerationStatus } from '@/lib/sse';

interface PlaceholderState {
  status: GenerationStatus;
  progress?: number;
  shotId?: string;
  imageUrl?: string;
}

interface QuickShotGeneratorProps {
  projectId: string;
  defaultAspectRatio: AspectRatio;
  onShotsGenerated: (shots: Shot[]) => void;
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

export function QuickShotGenerator({
  projectId,
  defaultAspectRatio,
  onShotsGenerated,
}: QuickShotGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(defaultAspectRatio);
  const [selectedModel, setSelectedModel] = useState<ModelType>('fal-ai/nano-banana-2');
  const [count, setCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeholders, setPlaceholders] = useState<PlaceholderState[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [optimizePrompt, setOptimizePrompt] = useState(true);
  const [serialMode, setSerialMode] = useState(false);
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K');

  const { addJob, updateJob } = useGeneration();
  const jobIdRef = useRef<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setStatusMessage('Demarrage...');

    // Initialize placeholders
    setPlaceholders(Array(count).fill(null).map(() => ({ status: 'queued' as GenerationStatus })));

    // Track generation in global context
    const jobId = `quick-shot-${Date.now()}`;
    jobIdRef.current = jobId;
    addJob({
      id: jobId,
      projectId,
      type: 'quick-shot',
      status: 'pending',
      imageCount: count,
      completedCount: 0,
    });

    try {
      const res = await fetch(`/api/projects/${projectId}/quick-shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          model: selectedModel,
          count,
          resolution,
          stream: true, // Enable SSE streaming
          skipOptimization: !optimizePrompt,
          serialMode, // Generate varied prompts for each image
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate images');
      }

      // Handle SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      const completedShots: Shot[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: GenerationProgressEvent = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'init':
                  // Placeholders already initialized
                  break;

                case 'progress':
                  if (event.message) {
                    setStatusMessage(event.message);
                  }
                  if (event.imageIndex !== undefined && event.status) {
                    setPlaceholders(prev => {
                      const next = [...prev];
                      if (next[event.imageIndex!]) {
                        next[event.imageIndex!] = {
                          ...next[event.imageIndex!],
                          status: event.status!,
                          progress: event.progress,
                        };
                      }
                      return next;
                    });
                  } else if (event.status === 'generating') {
                    // Update all placeholders to generating
                    setPlaceholders(prev => prev.map(p =>
                      p.status === 'queued' ? { ...p, status: 'generating', progress: event.progress } : p
                    ));
                    // Update job status
                    if (jobIdRef.current) {
                      updateJob(jobIdRef.current, { status: 'generating' });
                    }
                  }
                  break;

                case 'image':
                  // Mark specific image as completed
                  if (event.imageIndex !== undefined) {
                    setPlaceholders(prev => {
                      const next = [...prev];
                      if (next[event.imageIndex!]) {
                        next[event.imageIndex!] = {
                          status: 'completed',
                          shotId: event.shotId,
                          imageUrl: event.imageUrl,
                        };
                      }
                      return next;
                    });
                  }
                  break;

                case 'complete':
                  if (event.shots) {
                    completedShots.push(...event.shots);
                  }
                  break;

                case 'error':
                  throw new Error(event.error || 'Generation failed');
              }
            } catch (parseErr) {
              // Ignore JSON parse errors for incomplete chunks
              if (line.trim() !== '') {
                console.error('SSE parse error:', parseErr, 'Line:', line);
              }
            }
          }
        }
      }

      // Generation complete - always update job status
      if (jobIdRef.current) {
        updateJob(jobIdRef.current, {
          status: 'completed',
          completedCount: completedShots.length,
        });
      }

      if (completedShots.length > 0) {
        onShotsGenerated(completedShots);
        setPrompt('');
      }
      setPlaceholders([]);
      setStatusMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setPlaceholders([]);
      // Update job as error
      if (jobIdRef.current) {
        updateJob(jobIdRef.current, {
          status: 'error',
          error: err instanceof Error ? err.message : 'An error occurred',
        });
      }
    } finally {
      setIsGenerating(false);
      jobIdRef.current = null;
    }
  }, [prompt, aspectRatio, selectedModel, count, resolution, optimizePrompt, serialMode, projectId, onShotsGenerated, addJob, updateJob]);

  return (
    <div className="bg-[#0d1829] border border-white/10 rounded-xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Quick Shot Generator</h2>
          <p className="text-sm text-slate-500">
            Utilisez <span className="text-blue-400">@Personnage</span> <span className="text-green-400">#Lieu</span> <span className="text-purple-400">!Référence</span> dans la description
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
          </div>
        </div>

        {/* Count - Compact spinner */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Nombre</span>
          <div className="flex items-center h-9 rounded-lg bg-white/5 border border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setCount(Math.max(1, count - 1))}
              disabled={count <= 1}
              className="w-9 h-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-white text-sm font-medium tabular-nums">{count}</span>
            <button
              type="button"
              onClick={() => setCount(Math.min(8, count + 1))}
              disabled={count >= 8}
              className="w-9 h-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

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

        {/* Serial Mode toggle */}
        <button
          type="button"
          onClick={() => setSerialMode(!serialMode)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all',
            serialMode
              ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
              : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-300 hover:border-white/20'
          )}
        >
          <Layers className="w-4 h-4" />
          <span className="text-sm font-medium">Série</span>
        </button>

        {/* Generate Button */}
        <div className="flex-1 flex justify-end">
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25 min-w-[180px]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generation...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generer {count} image{count > 1 ? 's' : ''}
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

      {/* Generation Progress - Placeholder Cards */}
      {isGenerating && placeholders.length > 0 && (
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
    </div>
  );
}
