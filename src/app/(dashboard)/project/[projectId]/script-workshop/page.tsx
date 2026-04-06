'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2,
  Send,
  RotateCcw,
  Sparkles,
  FileText,
  Check,
  X,
  Users,
  MapPin,
  Clapperboard,
  Package,
} from 'lucide-react';
import { ScriptPreview } from '@/components/script/ScriptPreview';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  toolResults?: ToolResult[];
}

interface ToolResult {
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description: string | null;
}

interface ScriptElement {
  id: string;
  scene_id: string;
  type: 'action' | 'dialogue' | 'transition' | 'note';
  content: string;
  character_name?: string;
  parenthetical?: string;
  extension?: string;
  sort_order: number;
}

// Tool display config
const TOOL_CONFIG: Record<string, { icon: typeof Users; label: string; color: string }> = {
  add_character: { icon: Users, label: 'Personnage ajouté', color: 'green' },
  add_figurant: { icon: Users, label: 'Figurant ajouté', color: 'green' },
  add_location: { icon: MapPin, label: 'Lieu ajouté', color: 'green' },
  add_prop: { icon: Package, label: 'Accessoire ajouté', color: 'green' },
  add_scene: { icon: Clapperboard, label: 'Scène ajoutée', color: 'blue' },
  update_scene: { icon: Clapperboard, label: 'Scène modifiée', color: 'yellow' },
  delete_scene: { icon: Clapperboard, label: 'Scène supprimée', color: 'red' },
  add_dialogue: { icon: Users, label: 'Dialogue ajouté', color: 'blue' },
  add_action: { icon: FileText, label: 'Action ajoutée', color: 'blue' },
  add_transition: { icon: FileText, label: 'Transition ajoutée', color: 'blue' },
  delete_element: { icon: X, label: 'Élément supprimé', color: 'red' },
};

export default function ScriptWorkshopPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Script state
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [elementsByScene, setElementsByScene] = useState<Record<string, ScriptElement[]>>({});
  const [isLoadingScript, setIsLoadingScript] = useState(true);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      if (!projectId) return;

      try {
        await Promise.all([loadScriptData(), loadChatHistory()]);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoadingScript(false);
      }
    };

    loadData();
  }, [projectId]);

  const loadScriptData = async () => {
    const [scenesRes, elementsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/scenes`),
      fetch(`/api/projects/${projectId}/script-elements`),
    ]);

    if (scenesRes.ok) {
      const data = await scenesRes.json();
      setScenes(data.scenes || []);
      setExpandedScenes(new Set((data.scenes || []).map((s: Scene) => s.id)));
    }

    if (elementsRes.ok) {
      const data = await elementsRes.json();
      const grouped: Record<string, ScriptElement[]> = {};
      for (const element of data.elements || []) {
        if (!grouped[element.scene_id]) {
          grouped[element.scene_id] = [];
        }
        grouped[element.scene_id].push(element);
      }
      setElementsByScene(grouped);
    }
  };

  const loadChatHistory = async () => {
    const chatRes = await fetch(`/api/projects/${projectId}/script-workshop`);
    if (chatRes.ok) {
      const data = await chatRes.json();
      setMessages(data.messages || []);
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input after response
  useEffect(() => {
    if (!isChatLoading && messages.length > 0) {
      inputRef.current?.focus();
    }
  }, [isChatLoading, messages.length]);

  // Convert script to Fountain format
  const fountainScript = useMemo(() => {
    const lines: string[] = [];

    for (const scene of scenes.sort((a, b) => a.scene_number - b.scene_number)) {
      const heading = `${scene.int_ext}. ${scene.location} - ${scene.time_of_day}`;
      lines.push(heading.toUpperCase());
      lines.push('');

      if (scene.description) {
        lines.push(scene.description);
        lines.push('');
      }

      const elements = (elementsByScene[scene.id] || []).sort((a, b) => a.sort_order - b.sort_order);
      for (const element of elements) {
        switch (element.type) {
          case 'action':
            lines.push(element.content);
            lines.push('');
            break;
          case 'dialogue':
            let charLine = (element.character_name || 'PERSONNAGE').toUpperCase();
            if (element.extension) charLine += ` (${element.extension})`;
            lines.push(charLine);
            if (element.parenthetical) lines.push(`(${element.parenthetical})`);
            lines.push(element.content);
            lines.push('');
            break;
          case 'transition':
            lines.push(element.content.toUpperCase() + ':');
            lines.push('');
            break;
          case 'note':
            lines.push(`[[${element.content}]]`);
            lines.push('');
            break;
        }
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }, [scenes, elementsByScene]);

  // Send message (handles both start and continue)
  const sendMessage = async (userMessage?: string) => {
    const messageToSend = userMessage || inputValue.trim();
    if (!messageToSend && messages.length > 0) return;

    if (inputValue) setInputValue('');

    const newMessages: ChatMessage[] = messageToSend
      ? [...messages, { role: 'user', content: messageToSend, timestamp: new Date().toISOString() }]
      : messages;

    if (messageToSend) setMessages(newMessages);
    setIsChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/script-workshop/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          currentScript: fountainScript,
          scenes: scenes.map(s => ({
            number: s.scene_number,
            heading: `${s.int_ext}. ${s.location} - ${s.time_of_day}`,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      }

      // Show tool results as toasts
      const toolResults: ToolResult[] = data.toolResults || [];
      for (const tr of toolResults) {
        const config = TOOL_CONFIG[tr.tool];
        if (tr.success) {
          toast.success(config?.label || tr.tool);
        } else {
          toast.error(`Échec: ${tr.error}`);
        }
      }

      // Refresh script data if any tools were executed
      if (toolResults.length > 0) {
        await loadScriptData();
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        toolResults,
        timestamp: new Date().toISOString(),
      };

      setMessages(messageToSend ? [...newMessages, assistantMessage] : [assistantMessage]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      setChatError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Reset chat
  const resetChat = async () => {
    setMessages([]);
    setChatError(null);

    if (projectId) {
      await fetch(`/api/projects/${projectId}/script-workshop`, { method: 'DELETE' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleScene = (sceneId: string) => {
    setExpandedScenes(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  const chatStarted = messages.length > 0;

  if (isLoadingScript) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-12rem)]">
      {/* Left: Chat Interface */}
      <div className="w-[450px] flex-shrink-0 flex flex-col">
        <Card className="flex-1 flex flex-col bg-gradient-to-br from-purple-900/20 to-[#1a3048] border-purple-500/20 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-purple-500/10 flex-shrink-0 py-3">
            <CardTitle className="flex items-center gap-2 text-white text-base">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Script Workshop
            </CardTitle>
            {chatStarted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetChat}
                className="h-8 text-slate-400 hover:text-white"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            )}
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            {!chatStarted ? (
              /* Start screen */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center mb-3">
                  <Sparkles className="w-7 h-7 text-purple-400" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">
                  Construisons ton script
                </h3>
                <p className="text-sm text-slate-400 mb-4 max-w-[320px]">
                  Discutons de ton histoire. Je peux ajouter des personnages à la Bible, créer des scènes, et écrire des dialogues.
                </p>
                <Button
                  onClick={() => sendMessage()}
                  disabled={isChatLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isChatLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Commencer
                </Button>
              </div>
            ) : (
              /* Chat interface */
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.map((message, index) => (
                    <div key={index}>
                      <div
                        className={cn(
                          'flex',
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[90%] rounded-2xl px-3 py-2',
                            message.role === 'user'
                              ? 'bg-blue-600 text-white rounded-br-sm'
                              : 'bg-white/10 text-slate-200 rounded-bl-sm'
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>

                      {/* Tool Results */}
                      {message.toolResults && message.toolResults.length > 0 && (
                        <div className="mt-2 ml-2 space-y-1">
                          {message.toolResults.map((tr, idx) => {
                            const config = TOOL_CONFIG[tr.tool] || {
                              icon: Check,
                              label: tr.tool,
                              color: 'gray',
                            };
                            const Icon = config.icon;
                            const colorClass = tr.success
                              ? config.color === 'green'
                                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                : config.color === 'blue'
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                : config.color === 'yellow'
                                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                                : config.color === 'red'
                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
                              : 'bg-red-500/10 border-red-500/30 text-red-400';

                            return (
                              <div
                                key={idx}
                                className={cn(
                                  'flex items-center gap-2 px-2 py-1 rounded border text-xs',
                                  colorClass
                                )}
                              >
                                {tr.success ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <X className="w-3 h-3" />
                                )}
                                <Icon className="w-3 h-3" />
                                <span>{config.label}</span>
                                {tr.error && (
                                  <span className="text-red-400">: {tr.error}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          <span className="text-sm text-slate-400">...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {chatError && (
                    <div className="flex justify-center">
                      <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
                        {chatError}
                      </p>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="flex-shrink-0 p-3 border-t border-purple-500/10">
                  <div className="flex gap-2 items-end">
                    <Textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Décris une scène, demande d'ajouter un personnage... (Shift+Enter pour saut de ligne)"
                      disabled={isChatLoading}
                      rows={3}
                      className="flex-1 min-h-[80px] max-h-[200px] resize-y bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                    />
                    <Button
                      onClick={() => sendMessage()}
                      disabled={isChatLoading || !inputValue.trim()}
                      className="h-10 w-10 p-0 bg-purple-600 hover:bg-purple-700 flex-shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: Script Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 flex-shrink-0 py-3">
            <CardTitle className="flex items-center gap-2 text-white text-base">
              <FileText className="w-5 h-5 text-blue-400" />
              Script
              <span className="text-sm text-slate-400 font-normal ml-2">
                {scenes.length} scène{scenes.length > 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-y-auto">
            <ScriptPreview
              projectId={projectId}
              scenes={scenes}
              elementsByScene={elementsByScene}
              expandedScenes={expandedScenes}
              onToggleScene={toggleScene}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
