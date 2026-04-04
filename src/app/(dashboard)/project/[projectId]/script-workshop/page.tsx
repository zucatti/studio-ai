'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2,
  Send,
  RotateCcw,
  Sparkles,
  FileText,
  Plus,
  Check,
  X,
  Copy,
  ChevronDown,
  ChevronRight,
  Users,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  suggestion?: ScriptSuggestion | null;
}

interface ScriptSuggestion {
  type: 'scene' | 'dialogue' | 'action' | 'transition' | 'full';
  content: string;
  targetScene?: number; // Scene number to insert into (null = new scene)
  position?: 'start' | 'end' | 'replace';
}

interface ExtractedEntity {
  type: 'character' | 'location';
  name: string;
  description?: string;
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

export default function ScriptWorkshopPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Script state
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [elementsByScene, setElementsByScene] = useState<Record<string, ScriptElement[]>>({});
  const [isLoadingScript, setIsLoadingScript] = useState(true);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());

  // Extracted entities
  const [extractedEntities, setExtractedEntities] = useState<ExtractedEntity[]>([]);
  const [showEntities, setShowEntities] = useState(false);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      if (!projectId) return;

      try {
        // Load scenes
        const scenesRes = await fetch(`/api/projects/${projectId}/scenes`);
        if (scenesRes.ok) {
          const data = await scenesRes.json();
          setScenes(data.scenes || []);
          // Expand all scenes by default
          setExpandedScenes(new Set((data.scenes || []).map((s: Scene) => s.id)));
        }

        // Load script elements
        const elementsRes = await fetch(`/api/projects/${projectId}/script-elements`);
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

        // Load chat history
        const chatRes = await fetch(`/api/projects/${projectId}/script-workshop`);
        if (chatRes.ok) {
          const data = await chatRes.json();
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoadingScript(false);
      }
    };

    loadData();
  }, [projectId]);

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

  // Convert script to Fountain format for display
  const fountainScript = useMemo(() => {
    const lines: string[] = [];

    for (const scene of scenes.sort((a, b) => a.scene_number - b.scene_number)) {
      // Scene heading
      const heading = `${scene.int_ext}. ${scene.location} - ${scene.time_of_day}`;
      lines.push(heading.toUpperCase());
      lines.push('');

      // Scene description
      if (scene.description) {
        lines.push(scene.description);
        lines.push('');
      }

      // Elements
      const elements = (elementsByScene[scene.id] || []).sort((a, b) => a.sort_order - b.sort_order);
      for (const element of elements) {
        switch (element.type) {
          case 'action':
            lines.push(element.content);
            lines.push('');
            break;
          case 'dialogue':
            let charLine = (element.character_name || 'PERSONNAGE').toUpperCase();
            if (element.extension) {
              charLine += ` (${element.extension})`;
            }
            lines.push(charLine);
            if (element.parenthetical) {
              lines.push(`(${element.parenthetical})`);
            }
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

  // Start conversation
  const startChat = async () => {
    setIsChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/script-workshop/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
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

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        suggestion: data.suggestion,
        timestamp: new Date().toISOString(),
      };

      setMessages([assistantMessage]);
      if (data.extractedEntities?.length > 0) {
        setExtractedEntities(data.extractedEntities);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsChatLoading(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!inputValue.trim() || isChatLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    ];
    setMessages(newMessages);
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

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        suggestion: data.suggestion,
        timestamp: new Date().toISOString(),
      };

      setMessages([...newMessages, assistantMessage]);
      if (data.extractedEntities?.length > 0) {
        setExtractedEntities(prev => {
          const existingNames = new Set(prev.map(e => e.name.toLowerCase()));
          const newEntities = data.extractedEntities.filter(
            (e: ExtractedEntity) => !existingNames.has(e.name.toLowerCase())
          );
          return [...prev, ...newEntities];
        });
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsChatLoading(false);
    }
  };

  // Apply suggestion to script
  const applySuggestion = async (suggestion: ScriptSuggestion) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/script-workshop/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur');
      }

      const data = await res.json();

      // Refresh scenes and elements
      if (data.newScene) {
        setScenes(prev => [...prev, data.newScene]);
        setExpandedScenes(prev => new Set([...prev, data.newScene.id]));
      }
      if (data.newElements) {
        setElementsByScene(prev => {
          const updated = { ...prev };
          for (const element of data.newElements) {
            if (!updated[element.scene_id]) {
              updated[element.scene_id] = [];
            }
            updated[element.scene_id] = [...updated[element.scene_id], element];
          }
          return updated;
        });
      }

      // Mark suggestion as applied in the message
      setMessages(prev =>
        prev.map(msg =>
          msg.suggestion === suggestion ? { ...msg, suggestion: null } : msg
        )
      );

      toast.success('Suggestion appliquee au script');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    }
  };

  // Reset chat
  const resetChat = async () => {
    setMessages([]);
    setChatError(null);
    setExtractedEntities([]);

    if (projectId) {
      await fetch(`/api/projects/${projectId}/script-workshop`, {
        method: 'DELETE',
      });
    }
  };

  // Add entity to Bible
  const addEntityToBible = async (entity: ExtractedEntity) => {
    try {
      const endpoint = entity.type === 'character'
        ? `/api/projects/${projectId}/characters`
        : `/api/projects/${projectId}/locations`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: entity.name,
          description: entity.description || '',
        }),
      });

      if (res.ok) {
        toast.success(`${entity.name} ajoute a la Bible`);
        setExtractedEntities(prev => prev.filter(e => e !== entity));
      }
    } catch (error) {
      toast.error('Erreur lors de l\'ajout');
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
                  Discutons de ton histoire. Je t'aide a structurer les scenes, dialogues et actions.
                </p>
                <Button
                  onClick={startChat}
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

                      {/* Suggestion card */}
                      {message.suggestion && (
                        <div className="mt-2 ml-2 bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-green-400" />
                            <span className="text-xs text-green-400 font-medium">
                              Suggestion: {message.suggestion.type === 'scene' ? 'Nouvelle scene' : message.suggestion.type}
                            </span>
                          </div>
                          <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-black/20 p-2 rounded max-h-32 overflow-y-auto">
                            {message.suggestion.content}
                          </pre>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              onClick={() => applySuggestion(message.suggestion!)}
                              className="flex-1 h-7 bg-green-600 hover:bg-green-700"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Appliquer
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(message.suggestion!.content);
                                toast.success('Copie');
                              }}
                              className="h-7 text-slate-400 hover:text-white"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
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

                {/* Extracted entities */}
                {extractedEntities.length > 0 && (
                  <div className="px-3 py-2 border-t border-purple-500/10">
                    <button
                      onClick={() => setShowEntities(!showEntities)}
                      className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"
                    >
                      {showEntities ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      {extractedEntities.length} element(s) detecte(s)
                    </button>
                    {showEntities && (
                      <div className="mt-2 space-y-1">
                        {extractedEntities.map((entity, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs bg-white/5 rounded px-2 py-1"
                          >
                            <div className="flex items-center gap-2">
                              {entity.type === 'character' ? (
                                <Users className="w-3 h-3 text-blue-400" />
                              ) : (
                                <MapPin className="w-3 h-3 text-green-400" />
                              )}
                              <span className="text-white">{entity.name}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => addEntityToBible(entity)}
                              className="h-5 px-2 text-xs text-slate-400 hover:text-white"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Bible
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Input */}
                <div className="flex-shrink-0 p-3 border-t border-purple-500/10">
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Decris la scene, le dialogue..."
                      disabled={isChatLoading}
                      className="flex-1 h-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={isChatLoading || !inputValue.trim()}
                      className="h-9 w-9 p-0 bg-purple-600 hover:bg-purple-700"
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
                {scenes.length} scene{scenes.length > 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-y-auto">
            {scenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <FileText className="w-12 h-12 text-slate-600 mb-4" />
                <p className="text-slate-400">Ton script apparaitra ici</p>
                <p className="text-sm text-slate-600 mt-1">
                  Commence a discuter avec l'assistant pour construire ton histoire
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {scenes
                  .sort((a, b) => a.scene_number - b.scene_number)
                  .map(scene => {
                    const isExpanded = expandedScenes.has(scene.id);
                    const elements = (elementsByScene[scene.id] || []).sort(
                      (a, b) => a.sort_order - b.sort_order
                    );

                    return (
                      <div
                        key={scene.id}
                        className="bg-white/5 rounded-lg border border-white/10"
                      >
                        <button
                          onClick={() => toggleScene(scene.id)}
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                          <span className="font-mono text-sm text-yellow-400">
                            SCENE {scene.scene_number}
                          </span>
                          <span className="font-mono text-sm text-white">
                            {scene.int_ext}. {scene.location} - {scene.time_of_day}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3">
                            {scene.description && (
                              <p className="text-sm text-slate-400 italic pl-8">
                                {scene.description}
                              </p>
                            )}

                            {elements.length > 0 ? (
                              <div className="pl-8 space-y-2 font-mono text-sm">
                                {elements.map(element => (
                                  <div key={element.id}>
                                    {element.type === 'action' && (
                                      <p className="text-white">{element.content}</p>
                                    )}
                                    {element.type === 'dialogue' && (
                                      <div className="pl-8">
                                        <p className="text-blue-400 uppercase">
                                          {element.character_name}
                                          {element.extension && ` (${element.extension})`}
                                        </p>
                                        {element.parenthetical && (
                                          <p className="text-slate-500">
                                            ({element.parenthetical})
                                          </p>
                                        )}
                                        <p className="text-white pl-4">{element.content}</p>
                                      </div>
                                    )}
                                    {element.type === 'transition' && (
                                      <p className="text-purple-400 text-right uppercase">
                                        {element.content}:
                                      </p>
                                    )}
                                    {element.type === 'note' && (
                                      <p className="text-slate-500">[[{element.content}]]</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-600 pl-8 italic">
                                Aucun element dans cette scene
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
