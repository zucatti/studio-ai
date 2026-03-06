'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/hooks/use-project';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, Upload, Sparkles, FileText, Loader2, Wand2 } from 'lucide-react';

export default function BrainstormingPage() {
  const router = useRouter();
  const { projectId, brainstorming, setBrainstorming, isLoading } = useProject();
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setContent(brainstorming || '');
  }, [brainstorming]);

  const handleSave = async () => {
    setIsSaving(true);
    await setBrainstorming(content);
    setIsSaving(false);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setContent((prev) => prev + (prev ? '\n\n' : '') + text);
      };
      reader.readAsText(file);
    }
  };

  const handleGenerateScript = async () => {
    if (!projectId || !content.trim()) {
      setGenerationError('Ajoutez du contenu au brainstorming avant de générer le script.');
      return;
    }

    // Save content first
    setIsSaving(true);
    await setBrainstorming(content);
    setIsSaving(false);

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/generate-script`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la génération');
      }

      // Redirect to script page
      router.push(`/project/${projectId}/script`);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card className="h-full bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/5">
            <CardTitle className="flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Zone de brainstorming
            </CardTitle>
            <div className="flex items-center gap-2">
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
                className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
              >
                <Upload className="w-4 h-4 mr-2" />
                Importer
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-blue-500 hover:bg-blue-600"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Notez vos idées ici...

## Concept
Décrivez le concept principal de votre projet.

## Thèmes
Quels thèmes voulez-vous explorer ?

## Personnages
Listez vos personnages principaux.

## Notes visuelles
Quel style visuel souhaitez-vous ?"
              className="min-h-[500px] resize-none font-mono text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <FileText className="w-4 h-4 text-blue-400" />
              Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-400">
            <div>
              <h4 className="font-medium text-slate-200 mb-1">Concept</h4>
              <p>Décrivez l&apos;idée principale de votre vidéo en quelques phrases.</p>
            </div>
            <div>
              <h4 className="font-medium text-slate-200 mb-1">Thèmes</h4>
              <p>Identifiez les thèmes et émotions que vous voulez transmettre.</p>
            </div>
            <div>
              <h4 className="font-medium text-slate-200 mb-1">Personnages</h4>
              <p>Listez vos personnages avec une brève description.</p>
            </div>
            <div>
              <h4 className="font-medium text-slate-200 mb-1">Style visuel</h4>
              <p>Décrivez l&apos;esthétique, les couleurs, les références.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#151d28] border-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-blue-400" />
              Génération IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-300">
              Transformez votre brainstorming en script professionnel formaté avec Claude AI.
            </p>
            <p className="text-xs text-slate-400">
              Le script sera automatiquement découpé en scènes et plans, prêt pour le storyboard.
            </p>
            {generationError && (
              <p className="text-sm text-red-400 bg-red-500/10 p-2 rounded">
                {generationError}
              </p>
            )}
            <Button
              onClick={handleGenerateScript}
              disabled={isGenerating || !content.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Générer le script
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-white">Conseils</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-400 space-y-2">
            <p>
              Utilisez le format Markdown pour structurer vos notes.
            </p>
            <p>
              Vous pouvez importer un fichier .txt ou .md existant.
            </p>
            <p>
              Cliquez sur Sauvegarder pour enregistrer dans la base de données.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
