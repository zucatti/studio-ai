'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Save,
  Upload,
  Sparkles,
  Loader2,
  Wand2,
  Send,
  RotateCcw,
  Plus,
  Undo2,
  Redo2,
  Check,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface QuestionTopic {
  id: string;
  question: string;
  keywords: string[];
}

interface BrainstormingData {
  content: string;
  chat_messages: ChatMessage[];
  versions: Array<{ content: string; timestamp: string; source: string }>;
  version_index: number;
}

export default function BrainstormingPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  // Brainstorming state
  const [content, setContent] = useState('');
  const [versions, setVersions] = useState<BrainstormingData['versions']>([]);
  const [versionIndex, setVersionIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);
  const [coveredTopics, setCoveredTopics] = useState<string[]>([]);
  const [questionCanvas, setQuestionCanvas] = useState<QuestionTopic[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      if (!projectId) return;

      try {
        const res = await fetch(`/api/projects/${projectId}/brainstorming`);
        if (res.ok) {
          const data = await res.json();
          const bs = data.brainstorming as BrainstormingData;
          setContent(bs.content || '');
          setMessages(bs.chat_messages || []);
          setVersions(bs.versions || []);
          setVersionIndex(bs.version_index ?? -1);
        }
      } catch (error) {
        console.error('Error loading brainstorming:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [projectId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingSuggestion]);

  // Focus input after assistant responds
  useEffect(() => {
    if (!isChatLoading && messages.length > 0) {
      inputRef.current?.focus();
    }
  }, [isChatLoading, messages.length]);

  const saveContent = useCallback(async (newContent: string, createVersion = true) => {
    if (!projectId) return;

    setIsSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/brainstorming`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          createVersion,
          source: 'user',
        }),
      });
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  }, [projectId]);

  const handleSave = () => saveContent(content, true);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const newContent = content + (content ? '\n\n' : '') + text;
        setContent(newContent);
        saveContent(newContent, true);
      };
      reader.readAsText(file);
    }
  };

  const handleUndo = async () => {
    if (!projectId || versions.length === 0) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorming`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo' }),
      });

      if (res.ok) {
        const data = await res.json();
        const bs = data.brainstorming;
        setContent(bs.content || '');
        setVersions(bs.versions || []);
        setVersionIndex(bs.version_index ?? -1);
      }
    } catch (error) {
      console.error('Error undoing:', error);
    }
  };

  const handleRedo = async () => {
    if (!projectId || versionIndex < 0) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorming`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redo' }),
      });

      if (res.ok) {
        const data = await res.json();
        const bs = data.brainstorming;
        setContent(bs.content || '');
        setVersions(bs.versions || []);
        setVersionIndex(bs.version_index ?? -1);
      }
    } catch (error) {
      console.error('Error redoing:', error);
    }
  };

  const handleGenerateSynopsis = async () => {
    if (!projectId || !content.trim()) {
      setGenerationError('Ajoutez du contenu au brainstorming avant de générer le synopsis.');
      return;
    }

    await saveContent(content, true);
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/generate-synopsis`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la génération');
      }

      router.push(`/project/${projectId}/synopsis`);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsGenerating(false);
    }
  };

  const startChat = async () => {
    setIsChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorming/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
          brainstormingContent: content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      }

      setMessages([{ role: 'assistant', content: data.message }]);
      setCoveredTopics(data.coveredTopics || []);
      setQuestionCanvas(data.questionCanvas || []);
      if (data.suggestion) {
        setPendingSuggestion(data.suggestion);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsChatLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isChatLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsChatLoading(true);
    setChatError(null);
    setPendingSuggestion(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorming/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          brainstormingContent: content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      }

      setMessages([...newMessages, { role: 'assistant', content: data.message }]);
      setCoveredTopics(data.coveredTopics || []);
      if (data.suggestion) {
        setPendingSuggestion(data.suggestion);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsChatLoading(false);
    }
  };

  const resetChat = async () => {
    setMessages([]);
    setChatError(null);
    setPendingSuggestion(null);
    setCoveredTopics([]);

    // Clear chat in database
    if (projectId) {
      await fetch(`/api/projects/${projectId}/brainstorming`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_messages: [] }),
      });
    }
  };

  const acceptSuggestion = () => {
    if (!pendingSuggestion) return;
    const newContent = content + (content ? '\n\n' : '') + pendingSuggestion;
    setContent(newContent);
    saveContent(newContent, true);
    setPendingSuggestion(null);
  };

  const rejectSuggestion = () => {
    setPendingSuggestion(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const chatStarted = messages.length > 0;
  const canUndo = versions.length > 0;
  const canRedo = versionIndex >= 0;

  return (
    <div className="flex gap-6 h-[calc(100vh-12rem)]">
      {/* Left: Brainstorming zone */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 flex-shrink-0 py-3">
            <CardTitle className="flex items-center gap-2 text-white text-base">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Brainstorming
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 mr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                  title="Annuler"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                  title="Refaire"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                accept=".txt,.md"
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
              >
                <Upload className="w-4 h-4 mr-2" />
                Importer
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="h-8 bg-blue-500 hover:bg-blue-600"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? '...' : 'Sauver'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <MarkdownEditor
              content={content}
              onChange={setContent}
              className="h-full bg-white/5 border-0 rounded-none"
            />
          </CardContent>
        </Card>

        {/* Generate Synopsis Button */}
        <div className="mt-3 flex-shrink-0">
          {generationError && (
            <p className="text-sm text-red-400 bg-red-500/10 p-2 rounded mb-2">
              {generationError}
            </p>
          )}
          <Button
            onClick={handleGenerateSynopsis}
            disabled={isGenerating || !content.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Générer le synopsis
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Right: Chat Interface */}
      <div className="w-[400px] flex-shrink-0 flex flex-col">
        <Card className="flex-1 flex flex-col bg-gradient-to-br from-purple-900/20 to-[#1a3048] border-purple-500/20 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-purple-500/10 flex-shrink-0 py-3">
            <CardTitle className="flex items-center gap-2 text-white text-base">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Assistant
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
              <div className="flex-1 flex flex-col p-4">
                {/* Question Canvas */}
                <div className="mb-4">
                  <p className="text-xs text-slate-500 mb-2">Sujets à explorer :</p>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: 'pitch', label: 'Concept' },
                      { id: 'emotion', label: 'Émotion' },
                      { id: 'audience', label: 'Public' },
                      { id: 'format', label: 'Format' },
                      { id: 'characters', label: 'Personnages' },
                      { id: 'visual', label: 'Visuel' },
                      { id: 'tone', label: 'Ton' },
                      { id: 'constraints', label: 'Contraintes' },
                    ].map((topic) => (
                      <div
                        key={topic.id}
                        className="flex items-center gap-1.5 text-xs text-slate-400"
                      >
                        <Circle className="w-2.5 h-2.5 text-slate-600" />
                        {topic.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center mb-3">
                    <Sparkles className="w-7 h-7 text-purple-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">
                    Développons ton projet
                  </h3>
                  <p className="text-sm text-slate-400 mb-4 max-w-[280px]">
                    Je vais te poser des questions pour structurer tes idées.
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
              </div>
            ) : (
              /* Chat interface */
              <>
                {/* Question Progress */}
                {questionCanvas.length > 0 && (
                  <div className="px-3 py-2 border-b border-purple-500/10 flex-shrink-0">
                    <div className="flex flex-wrap gap-1">
                      {[
                        { id: 'pitch', label: 'Concept' },
                        { id: 'emotion', label: 'Émotion' },
                        { id: 'audience', label: 'Public' },
                        { id: 'format', label: 'Format' },
                        { id: 'characters', label: 'Personnages' },
                        { id: 'visual', label: 'Visuel' },
                        { id: 'tone', label: 'Ton' },
                        { id: 'constraints', label: 'Contraintes' },
                      ].map((topic) => {
                        const isCovered = coveredTopics.includes(topic.id);
                        return (
                          <span
                            key={topic.id}
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1',
                              isCovered
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-white/5 text-slate-500'
                            )}
                          >
                            {isCovered && <Check className="w-2.5 h-2.5" />}
                            {topic.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.map((message, index) => (
                    <div
                      key={index}
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
                  ))}

                  {/* Pending suggestion */}
                  {pendingSuggestion && (
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                      <p className="text-xs text-purple-400 font-medium mb-2">
                        Ajouter au brainstorming ?
                      </p>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap mb-3 max-h-32 overflow-y-auto">
                        {pendingSuggestion}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={acceptSuggestion}
                          className="flex-1 h-7 bg-purple-600 hover:bg-purple-700"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Ajouter
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={rejectSuggestion}
                          className="h-7 border-white/10 text-slate-400 hover:text-white"
                        >
                          Ignorer
                        </Button>
                      </div>
                    </div>
                  )}

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
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ta réponse..."
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
    </div>
  );
}
