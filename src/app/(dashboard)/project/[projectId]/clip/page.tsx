'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '@/hooks/use-project';
import { useSections } from '@/hooks/use-sections';
import { ClipTimeline } from '@/components/clip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Music, Loader2, AlertCircle, Upload } from 'lucide-react';
import type { MusicSection } from '@/types/database';

interface AudioData {
  fileUrl: string;
  duration?: number;
  title?: string;
  artist?: string;
}

export default function ClipPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { project, isLoading: projectLoading } = useProject();

  const {
    sections,
    isLoading: sectionsLoading,
    createSection,
    updateSection,
    deleteSection,
    setSections,
    refetch: refetchSections,
  } = useSections(projectId);

  const [masterAudio, setMasterAudio] = useState<{
    id: string;
    name: string;
    data: AudioData;
  } | null>(null);
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(true);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Fetch master audio for this project
  useEffect(() => {
    const fetchMasterAudio = async () => {
      if (!projectId) return;

      setAudioLoading(true);
      try {
        // Fetch project assets to find master audio
        const res = await fetch(`/api/projects/${projectId}/assets`);
        if (!res.ok) throw new Error('Failed to fetch assets');

        const data = await res.json();
        const assets = data.assets || [];

        console.log('[Clip] All project assets:', assets);

        // Find the master audio - check both is_master_audio flag and audio type
        let masterAsset = assets.find(
          (a: { asset_type: string; data?: { is_master_audio?: boolean } }) =>
            a.asset_type === 'audio' && a.data?.is_master_audio
        );

        // Fallback: if no master flag, take the first audio asset
        if (!masterAsset) {
          masterAsset = assets.find(
            (a: { asset_type: string }) => a.asset_type === 'audio'
          );
          console.log('[Clip] No master audio flag found, using first audio:', masterAsset);
        }

        if (masterAsset) {
          console.log('[Clip] Master audio found:', masterAsset);
          console.log('[Clip] Master audio data:', masterAsset.data);
          console.log('[Clip] Master audio fileUrl:', masterAsset.data?.fileUrl);
          setMasterAudio({
            id: masterAsset.id,
            name: masterAsset.name,
            data: masterAsset.data as AudioData,
          });
        } else {
          console.log('[Clip] No audio asset found in project');
        }
      } catch (error) {
        console.error('Error fetching master audio:', error);
      } finally {
        setAudioLoading(false);
      }
    };

    fetchMasterAudio();
  }, [projectId]);

  // Build audio URL - temporary proxy while B2 CORS propagates
  // TODO: Once CORS works, switch back to getSignedUrl()
  useEffect(() => {
    if (!masterAudio?.data?.fileUrl) {
      setSignedAudioUrl(null);
      return;
    }

    const fileUrl = masterAudio.data.fileUrl;

    if (fileUrl.startsWith('b2://')) {
      // Use proxy temporarily
      setSignedAudioUrl(`/api/storage/proxy?url=${encodeURIComponent(fileUrl)}`);
    } else {
      setSignedAudioUrl(fileUrl);
    }
  }, [masterAudio?.data?.fileUrl]);

  // Handle sections change from timeline
  const handleSectionsChange = useCallback((updatedSections: MusicSection[]) => {
    setSections(updatedSections);
  }, [setSections]);

  // Handle section selection
  const handleSectionSelect = useCallback((section: MusicSection | null) => {
    setSelectedSectionId(section?.id || null);
  }, []);

  // Loading state
  if (projectLoading || audioLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          <p className="text-slate-400">Chargement du clip...</p>
        </div>
      </div>
    );
  }

  // No master audio attached
  if (!masterAudio) {
    return (
      <div className="p-6">
        <Card className="border-white/10 bg-slate-900/50">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                <Music className="w-8 h-8 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Aucune musique attachée
                </h3>
                <p className="text-slate-400 max-w-md">
                  Ce projet n&apos;a pas encore de musique principale. Attachez un fichier audio
                  depuis la Bible pour commencer à créer vos sections.
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-4 border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
              >
                <Upload className="w-4 h-4 mr-2" />
                Ajouter depuis la Bible
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Audio URL not ready or invalid
  if (!signedAudioUrl) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="w-8 h-8 text-amber-500" />
          <p className="text-slate-400">Impossible de charger l&apos;audio</p>
          <p className="text-xs text-slate-500 max-w-md text-center">
            URL source: {masterAudio?.data?.fileUrl || 'non définie'}
          </p>
          <p className="text-xs text-slate-500 max-w-md text-center">
            URL signée: {signedAudioUrl || 'non disponible'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Music className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">
              {project?.name || 'Clip'}
            </h1>
            <p className="text-sm text-slate-400">
              {masterAudio.data.title || masterAudio.name}
              {masterAudio.data.artist && ` - ${masterAudio.data.artist}`}
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <ClipTimeline
        projectId={projectId}
        audioUrl={signedAudioUrl}
        audioDuration={masterAudio.data.duration}
        sections={sections}
        onSectionsChange={handleSectionsChange}
        onSectionSelect={handleSectionSelect}
        selectedSectionId={selectedSectionId}
        aspectRatio={project?.aspect_ratio}
      />

      {/* Selected section details */}
      {selectedSectionId && (
        <SectionDetails
          section={sections.find((s) => s.id === selectedSectionId) || null}
          onUpdate={(data) => {
            if (selectedSectionId) {
              updateSection(selectedSectionId, data);
            }
          }}
          onClose={() => setSelectedSectionId(null)}
        />
      )}
    </div>
  );
}

// Section details panel
function SectionDetails({
  section,
  onUpdate,
  onClose,
}: {
  section: MusicSection | null;
  onUpdate: (data: Partial<MusicSection>) => void;
  onClose: () => void;
}) {
  if (!section) return null;

  const duration = section.end_time - section.start_time;
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="border-white/10 bg-slate-900/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: section.color }}
            />
            {section.name}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-slate-400">Type</span>
            <p className="text-white capitalize">{section.section_type}</p>
          </div>
          <div>
            <span className="text-slate-400">Durée</span>
            <p className="text-white">{formatTime(duration)}</p>
          </div>
          <div>
            <span className="text-slate-400">Position</span>
            <p className="text-white">
              {formatTime(section.start_time)} - {formatTime(section.end_time)}
            </p>
          </div>
        </div>
        {section.mood && (
          <div className="mt-4">
            <span className="text-sm text-slate-400">Mood</span>
            <p className="text-white">{section.mood}</p>
          </div>
        )}
        {section.notes && (
          <div className="mt-4">
            <span className="text-sm text-slate-400">Notes</span>
            <p className="text-white text-sm">{section.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
