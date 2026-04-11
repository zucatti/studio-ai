'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Sparkles, ChevronLeft, Copy, Check, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StorageImg } from '@/components/ui/storage-image';
import { generateReferenceName, generateLookReferenceName } from '@/lib/reference-name';
import type { Segment } from '@/types/cinematic';
import type { ProjectAssetFlat } from '@/types/database';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  segments?: Segment[];
}

interface PlanAIPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  frameInUrl?: string | null;
  frameOutUrl?: string | null;
  projectAssets: ProjectAssetFlat[];
  currentSegments: Segment[];
  onApplySegments: (segments: Segment[]) => void;
  planDuration: number;
}

// Resize image to max dimension for Claude Vision (saves tokens)
async function resizeImageForVision(url: string, maxSize = 768): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      if (scale >= 1) {
        // Image is already small enough, but we need base64
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failed'));
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

// Sign B2 URL if needed
async function getSignedUrl(url: string): Promise<string> {
  if (!url.startsWith('b2://')) return url;
  const res = await fetch(`/api/storage/sign?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('Failed to sign URL');
  const data = await res.json();
  return data.signedUrl;
}

// Build compact bible context
function buildBibleContext(assets: ProjectAssetFlat[]): string {
  const characters = assets.filter(a => a.asset_type === 'character');
  const locations = assets.filter(a => a.asset_type === 'location');
  const props = assets.filter(a => a.asset_type === 'prop');

  const lines: string[] = [];

  if (characters.length > 0) {
    const charList = characters.map(c => {
      const ref = generateReferenceName(c.name, '@');
      const looks = (c.data as { looks?: Array<{ name: string }> })?.looks || [];
      if (looks.length > 0) {
        const lookRefs = looks.map(l => generateLookReferenceName(l.name)).join(', ');
        return `${ref} (looks: ${lookRefs})`;
      }
      return ref;
    }).join(', ');
    lines.push(`Personnages: ${charList}`);
  }

  if (locations.length > 0) {
    const locList = locations.map(l => generateReferenceName(l.name, '#')).join(', ');
    lines.push(`Lieux: ${locList}`);
  }

  if (props.length > 0) {
    const propList = props.map(p => generateReferenceName(p.name, '#')).join(', ');
    lines.push(`Props: ${propList}`);
  }

  return lines.join('\n');
}

export function PlanAIPanel({
  open,
  onClose,
  projectId,
  frameInUrl,
  frameOutUrl,
  projectAssets,
  currentSegments,
  onApplySegments,
  planDuration,
}: PlanAIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingSegments, setPendingSegments] = useState<Segment[] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setPendingSegments(null);

    try {
      // Prepare images (resize for vision)
      let frameInBase64: string | undefined;
      let frameOutBase64: string | undefined;

      if (frameInUrl) {
        try {
          const signedUrl = await getSignedUrl(frameInUrl);
          frameInBase64 = await resizeImageForVision(signedUrl);
        } catch (e) {
          console.warn('[PlanAI] Failed to process frame in:', e);
        }
      }

      if (frameOutUrl) {
        try {
          const signedUrl = await getSignedUrl(frameOutUrl);
          frameOutBase64 = await resizeImageForVision(signedUrl);
        } catch (e) {
          console.warn('[PlanAI] Failed to process frame out:', e);
        }
      }

      // Build context
      const bibleContext = buildBibleContext(projectAssets);

      // Call API
      const res = await fetch('/api/plan-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          frameInBase64,
          frameOutBase64,
          bibleContext,
          currentSegments,
          planDuration,
        }),
      });

      if (!res.ok) {
        throw new Error('API request failed');
      }

      const data = await res.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        segments: data.segments,
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (data.segments && data.segments.length > 0) {
        setPendingSegments(data.segments);
      }
    } catch (error) {
      console.error('[PlanAI] Error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Désolé, une erreur est survenue. Réessayez.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, frameInUrl, frameOutUrl, projectAssets, projectId, currentSegments, planDuration]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApplySegments = () => {
    if (pendingSegments) {
      onApplySegments(pendingSegments);
      setPendingSegments(null);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[400px] bg-[#0d1520] border-l border-white/10 flex flex-col z-50 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Assistant IA</h3>
            <p className="text-xs text-slate-500">Créez vos segments</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Context preview */}
      <div className="px-4 py-2 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2">
          {frameInUrl && (
            <div className="relative">
              <StorageImg
                src={frameInUrl}
                alt="Frame In"
                className="w-12 h-12 rounded object-cover"
              />
              <span className="absolute -bottom-1 -right-1 text-[8px] bg-blue-500 text-white px-1 rounded">IN</span>
            </div>
          )}
          {frameOutUrl && (
            <div className="relative">
              <StorageImg
                src={frameOutUrl}
                alt="Frame Out"
                className="w-12 h-12 rounded object-cover"
              />
              <span className="absolute -bottom-1 -right-1 text-[8px] bg-green-500 text-white px-1 rounded">OUT</span>
            </div>
          )}
          <div className="flex-1 text-xs text-slate-400">
            {projectAssets.length} éléments Bible
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Wand2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm mb-2">
              Décrivez ce qui se passe dans ce plan
            </p>
            <p className="text-slate-500 text-xs">
              Ex: "Noah entre dans la forêt et découvre un grimoire"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/10 text-slate-200'
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

              {/* Segment preview */}
              {msg.segments && msg.segments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/20 space-y-1">
                  <p className="text-xs text-slate-400 mb-1">
                    {msg.segments.length} segment{msg.segments.length > 1 ? 's' : ''} suggéré{msg.segments.length > 1 ? 's' : ''}
                  </p>
                  {msg.segments.map((seg, idx) => {
                    const duration = seg.end_time - seg.start_time;
                    const hasDialogue = seg.elements?.some(e => e.type === 'dialogue');
                    return (
                      <div
                        key={seg.id || idx}
                        className="text-xs bg-black/30 rounded px-2 py-1"
                      >
                        <span className="text-purple-400 font-medium">
                          {hasDialogue ? '💬' : '🎬'}
                        </span>{' '}
                        <span className="text-slate-300">
                          {seg.description?.slice(0, 40) || seg.elements?.[0]?.content?.slice(0, 40)}...
                        </span>
                        <span className="text-slate-500 ml-1">({duration.toFixed(1)}s)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Réflexion...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Apply segments button */}
      {pendingSegments && pendingSegments.length > 0 && (
        <div className="px-4 py-2 border-t border-white/10 bg-purple-500/10">
          <Button
            onClick={handleApplySegments}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            <Check className="w-4 h-4 mr-2" />
            Appliquer {pendingSegments.length} segment{pendingSegments.length > 1 ? 's' : ''}
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez l'action du plan..."
            rows={2}
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 resize-none"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="self-end bg-purple-600 hover:bg-purple-700 h-10 w-10 p-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Entrée pour envoyer • Shift+Entrée pour nouvelle ligne
        </p>
      </div>
    </div>
  );
}
