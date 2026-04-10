# Timeline Editor - Architecture

## Vue d'ensemble

Le Timeline Editor est l'écran central de composition vidéo. Il unifie tous les workflows (shorts, music videos, films) en un seul paradigme NLE (Non-Linear Editing).

```
┌─────────────────────────────────────────────────────────────────┐
│                        TIMELINE EDITOR                          │
├─────────────────────────────────────────────────────────────────┤
│  Entrées:                    Sortie:                            │
│  ├── Sequences (Plans)       └── Vidéo assemblée (Editly)       │
│  ├── Rush (vidéos/images)                                       │
│  ├── Audio (musique, VO)                                        │
│  └── Assets (bible)                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Modèle de données

### 1.1 Hiérarchie conceptuelle

```
Project
└── Scene (Short / Music Video / Film Scene)
    ├── Sequences[] (blocs de contenu réutilisables)
    │   └── Plans[] (unités de génération)
    │       └── Segments[] (shots détaillés)
    │
    └── Timeline (composition)
        ├── Tracks[] (pistes audio/vidéo)
        └── Clips[] (placements sur la timeline)
```

### 1.2 Types TypeScript

```typescript
// ============================================
// SEQUENCES (Blocs de contenu - Mode Édition)
// ============================================

interface Sequence {
  id: string;
  scene_id: string;
  title: string;
  order: number;

  // Style partagé par tous les plans
  cinematic_header: CinematicHeaderConfig | null;

  // Transitions entre séquences (utilisé lors de l'assembly)
  transition_in: TransitionType | null;
  transition_out: TransitionType | null;
  transition_duration: number;

  // Calculé
  duration: number;  // Somme des plans
  thumbnail_url: string | null;  // Premier frame du premier plan
}

interface Plan {
  id: string;
  sequence_id: string;
  order: number;
  duration: number;  // 5-15 secondes

  segments: Segment[];

  // Génération
  generated_video_url: string | null;
  storyboard_image_url: string | null;
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
}

interface Segment {
  id: string;
  plan_id: string;
  order: number;

  // Contenu
  description: string;
  dialogue: string | null;

  // Technique
  shot_type: ShotType;
  camera_movement: CameraMovement;
  duration: number;
}

// ============================================
// TIMELINE (Composition - Mode Timeline)
// ============================================

interface Timeline {
  id: string;
  scene_id: string;

  // Configuration
  duration: number;  // Calculé depuis les clips
  fps: number;
  width: number;
  height: number;

  // Contenu
  tracks: Track[];
  clips: Record<string, TimelineClip>;

  // Audio global (optionnel)
  master_audio_url: string | null;
  master_audio_volume: number;
}

interface Track {
  id: string;
  type: 'video' | 'audio' | 'image' | 'transition';
  name: string;
  order: number;  // 0 = bottom

  muted: boolean;    // Pour audio
  locked: boolean;
  visible: boolean;
}

// Track types:
// - 'video': Séquences et rush vidéo
// - 'audio': Musique, VO, SFX (avec waveform)
// - 'image': Images fixes (avec Ken Burns optionnel)
// - 'transition': Transitions entre clips (fadeblack, dissolve, etc.)

interface TimelineClip {
  id: string;
  track_id: string;

  // Position sur la timeline
  start: number;      // Timestamp de début (secondes)
  duration: number;   // Durée sur la timeline

  // Type et source
  type: 'sequence' | 'video' | 'image' | 'audio' | 'transition';

  // Référence selon le type
  sequence_id?: string;       // Si type = 'sequence'
  asset_url?: string;         // Si type = 'video' | 'image' | 'audio'
  rush_id?: string;           // Référence optionnelle au rush
  transition_type?: TransitionType;  // Si type = 'transition'

  // Trim (pour vidéo/audio)
  source_start?: number;      // Point d'entrée dans la source
  source_end?: number;        // Point de sortie dans la source
  source_duration?: number;   // Durée totale de la source

  // Audio
  volume?: number;            // Volume (0-1)
  waveform_data?: number[];   // Données waveform pré-calculées (optionnel, pour perf)

  // Image
  ken_burns?: 'in' | 'out' | 'left' | 'right' | 'none';  // Effet Ken Burns
}

// Clip de transition (sur track 'transition')
// S'applique au point de coupe entre les clips vidéo au-dessus
interface TransitionClip {
  type: 'transition';
  start: number;              // Position = point de coupe
  duration: number;           // Durée de la transition
  transition_type: TransitionType;
}

// ============================================
// TYPES PARTAGÉS
// ============================================

type TransitionType =
  | 'none'
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'dissolve'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'wipe'
  | 'zoom';

interface CinematicHeaderConfig {
  style: string;
  aspect_ratio: string;
  color_grade: string;
  lighting: string;
  // ... autres paramètres
}
```

### 1.3 Schéma Base de données

```sql
-- Timeline stockée en JSONB sur la scene
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS timeline_data JSONB;

-- Index pour requêtes rapides
CREATE INDEX IF NOT EXISTS idx_scenes_timeline
ON scenes USING GIN (timeline_data);

-- Les sequences restent dans leur table existante
-- Pas de changement structurel
```

---

## 2. Architecture des composants

### 2.1 Structure des fichiers

```
src/
├── components/
│   └── timeline/
│       ├── TimelineEditor.tsx      # Container principal
│       ├── TimelineToolbar.tsx     # Contrôles (play, zoom, save, render)
│       ├── TimelineTracks.tsx      # Zone des pistes
│       ├── TimelineTrack.tsx       # Une piste individuelle
│       ├── TimelineClip.tsx        # Un clip sur la timeline
│       ├── TimelineRuler.tsx       # Règle temporelle + playhead
│       ├── TimelinePlayhead.tsx    # Curseur de lecture
│       ├── TimelineSidebar.tsx     # Panneau assets (sequences, rush, audio)
│       ├── TimelinePreview.tsx     # Preview vidéo
│       ├── TimelineWaveform.tsx    # Waveform audio (si master audio)
│       └── hooks/
│           ├── useTimelinePlayback.ts
│           ├── useTimelineDrag.ts
│           ├── useTimelineZoom.ts
│           └── useTimelineKeyboard.ts
│
├── store/
│   └── timeline-store.ts           # Zustand store
│
└── app/api/projects/[projectId]/
    └── scenes/[sceneId]/
        └── timeline/
            ├── route.ts            # GET/PUT timeline data
            └── render/
                └── route.ts        # POST déclenche le rendu
```

### 2.2 Layout UI

```
┌─────────────────────────────────────────────────────────────────────┐
│ Toolbar: [◀][▶][⏸] [🔊] | Zoom [━━━●━━] | [💾 Save] [🎬 Render]    │
├────────────┬────────────────────────────────────────────────────────┤
│            │  Ruler: |0:00|-------|0:30|-------|1:00|-------|1:30|  │
│            │         ▼ (playhead)                                   │
│  Sidebar   ├────────────────────────────────────────────────────────┤
│            │  🎬 Video   [Seq1]          [Seq2]          [Seq3]     │
│ ┌────────┐ ├────────────────────────────────────────────────────────┤
│ │Séquences│ │  ⚡ Trans        [fadeblack]    [dissolve]             │
│ │ Seq 1  │ ├────────────────────────────────────────────────────────┤
│ │ Seq 2  │ │  🖼️ Images            [img1]              [img2]       │
│ │ Seq 3  │ ├────────────────────────────────────────────────────────┤
│ ├────────┤ │  🎵 Music  [▁▂▃▅▇▅▃▂▁▂▄▆▇▆▄▂▁▃▅▇▅▃▁▂▄▆▇▅▃▁▂▄▆▇▆▄▂▁]   │
│ │ Rush   │ ├────────────────────────────────────────────────────────┤
│ │ vid1   │ │  🎤 VO              [▂▄▆▇▆▄▂▁▂▄▆▇▆▄▂]                  │
│ │ img1   │ └────────────────────────────────────────────────────────┘
│ ├────────┤                                                          │
│ │ Audio  │ ┌────────────────────────────────────────────────────────┐
│ │ music  │ │                                                        │
│ │ vo.mp3 │ │                    PREVIEW                             │
│ └────────┘ │                    (Video)                             │
│            │                                                        │
│            └────────────────────────────────────────────────────────┘
└────────────┴────────────────────────────────────────────────────────┘
```

**Note**: Les clips audio affichent leur waveform réelle (via WaveSurfer.js), pas un simple placeholder.

### 2.3 Composants clés

```tsx
// TimelineEditor.tsx - Container principal
interface TimelineEditorProps {
  sceneId: string;
  projectId: string;

  // Mode (affecte la sidebar et les options)
  mode: 'short' | 'musicvideo' | 'film';

  // Audio master (optionnel, pour music videos)
  masterAudioUrl?: string;
}

// TimelineClip.tsx - Rendu d'un clip
interface TimelineClipProps {
  clip: TimelineClip;
  track: Track;
  scale: number;  // pixels par seconde

  // Pour les séquences
  sequence?: Sequence;

  // Callbacks
  onMove: (clipId: string, newStart: number) => void;
  onResize: (clipId: string, newDuration: number, edge: 'left' | 'right') => void;
  onSelect: (clipId: string) => void;
  onDelete: (clipId: string) => void;
}

// TimelineSidebar.tsx - Panneau des assets
interface TimelineSidebarProps {
  sequences: Sequence[];
  rushItems: RushMedia[];
  audioAssets: AudioAsset[];

  onDragStart: (item: DraggableItem) => void;
}
```

---

## 3. State Management (Zustand)

### 3.1 Timeline Store

```typescript
// store/timeline-store.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface TimelineState {
  // Data
  sceneId: string | null;
  tracks: Track[];
  clips: Record<string, TimelineClip>;

  // Playback
  currentTime: number;
  duration: number;
  isPlaying: boolean;

  // UI State
  scale: number;  // pixels per second (10-200)
  scrollX: number;
  scrollY: number;
  selectedClipIds: Set<string>;

  // Drag state
  draggedItem: DraggableItem | null;
  dropTarget: DropTarget | null;

  // Master audio
  masterAudioUrl: string | null;
  masterAudioVolume: number;
}

interface TimelineActions {
  // Initialization
  loadTimeline: (sceneId: string, data: TimelineData) => void;
  resetTimeline: () => void;

  // Tracks
  addTrack: (type: Track['type'], name?: string) => string;
  removeTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, newOrder: number) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;

  // Clips
  addClip: (clip: Omit<TimelineClip, 'id'>) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  moveClip: (clipId: string, newStart: number, newTrackId?: string) => void;
  resizeClip: (clipId: string, newDuration: number, edge: 'left' | 'right') => void;

  // Sequences → Clips
  addSequenceToTimeline: (sequenceId: string, trackId: string, start: number) => string;

  // Selection
  selectClip: (clipId: string, additive?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  clearSelection: () => void;
  deleteSelectedClips: () => void;

  // Playback
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  seekTo: (time: number) => void;

  // Zoom & Scroll
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: () => void;
  setScroll: (x: number, y: number) => void;

  // Drag & Drop
  startDrag: (item: DraggableItem) => void;
  updateDropTarget: (target: DropTarget | null) => void;
  endDrag: () => void;

  // Persistence
  toJSON: () => TimelineData;

  // Duration
  recalculateDuration: () => void;
}

type TimelineStore = TimelineState & TimelineActions;

export const useTimelineStore = create<TimelineStore>()(
  immer((set, get) => ({
    // Initial state
    sceneId: null,
    tracks: [],
    clips: {},
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    scale: 50,  // 50px per second
    scrollX: 0,
    scrollY: 0,
    selectedClipIds: new Set(),
    draggedItem: null,
    dropTarget: null,
    masterAudioUrl: null,
    masterAudioVolume: 0.8,

    // Actions implementation...
  }))
);
```

### 3.2 Intégration avec les stores existants

```typescript
// Le timeline-store utilise les données de:
// - shorts-store: pour les séquences
// - rush-store: pour les rush items (à créer ou adapter)
// - montage-store: DEPRECATED - remplacé par timeline-store

// Exemple d'ajout de séquence
addSequenceToTimeline: (sequenceId, trackId, start) => {
  const sequence = useShortsStore.getState().sequences.find(s => s.id === sequenceId);
  if (!sequence) return '';

  const clipId = nanoid();
  set((state) => {
    state.clips[clipId] = {
      id: clipId,
      track_id: trackId,
      type: 'sequence',
      sequence_id: sequenceId,
      start,
      duration: sequence.duration,
    };
  });

  get().recalculateDuration();
  return clipId;
}
```

---

## 4. Pipeline de rendu

### 4.1 Flow de rendu

```
Timeline Store
      │
      ▼
┌─────────────┐
│ buildSpec() │  Convertit timeline → Editly spec
└─────────────┘
      │
      ▼
┌─────────────┐
│ BullMQ Job  │  Queue 'editly'
└─────────────┘
      │
      ▼
┌─────────────┐
│ Editly      │  Génère la vidéo
│ Processor   │
└─────────────┘
      │
      ▼
┌─────────────┐
│ B2 Storage  │  Upload final
└─────────────┘
```

### 4.2 Spec Builder v2

```typescript
// worker/src/lib/editly/timeline-spec-builder.ts

interface TimelineRenderInput {
  timeline: TimelineData;
  sequences: Map<string, SequenceWithPlans>;
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
}

export function buildTimelineSpec(input: TimelineRenderInput): EditlySpec {
  const { timeline, sequences, outputPath, width = 1920, height = 1080, fps = 30 } = input;

  const allClips = Object.values(timeline.clips);

  // 1. Collecter les clips visuels (video, sequence, image), triés par start
  const visualClips = allClips
    .filter(c => c.type === 'sequence' || c.type === 'video' || c.type === 'image')
    .sort((a, b) => a.start - b.start);

  // 2. Collecter les transitions, indexées par leur position
  const transitionClips = allClips.filter(c => c.type === 'transition');
  const transitionMap = new Map<number, TimelineClip>();
  for (const t of transitionClips) {
    transitionMap.set(t.start, t);
  }

  // 3. Construire les clips Editly avec gaps et transitions
  const editlyClips: EditlyClip[] = [];
  let currentTime = 0;

  for (let i = 0; i < visualClips.length; i++) {
    const clip = visualClips[i];

    // Insérer un gap (black) si nécessaire
    if (clip.start > currentTime + 0.01) {  // Tolérance 10ms
      const gapDuration = clip.start - currentTime;
      editlyClips.push({
        duration: gapDuration,
        layers: [{ type: 'fill-color', color: '#000000' }],
      });
      currentTime = clip.start;
    }

    // Chercher une transition à ce point de coupe
    const transition = transitionMap.get(clip.start);
    const transitionConfig = transition ? {
      name: mapTransition(transition.transition_type!),
      duration: transition.duration,
    } : undefined;

    // Construire le clip selon son type
    if (clip.type === 'sequence') {
      const sequence = sequences.get(clip.sequence_id!);
      if (sequence) {
        for (let j = 0; j < sequence.plans.length; j++) {
          const plan = sequence.plans[j];
          if (plan.generated_video_url) {
            editlyClips.push({
              duration: plan.duration,
              layers: [{
                type: 'video',
                path: plan.generated_video_url,
                resizeMode: 'cover',
              }],
              // Transition seulement sur le premier plan de la séquence
              transition: j === 0 ? transitionConfig : undefined,
            });
          }
        }
      }
    } else if (clip.type === 'video') {
      editlyClips.push({
        duration: clip.duration,
        layers: [{
          type: 'video',
          path: clip.asset_url!,
          cutFrom: clip.source_start,
          cutTo: clip.source_end,
          resizeMode: 'cover',
        }],
        transition: transitionConfig,
      });
    } else if (clip.type === 'image') {
      editlyClips.push({
        duration: clip.duration,
        layers: [{
          type: 'image',
          path: clip.asset_url!,
          zoomDirection: clip.ken_burns || 'in',
        }],
        transition: transitionConfig,
      });
    }

    currentTime = clip.start + clip.duration;
  }

  // 4. Construire les audio tracks avec waveform timing
  const audioTracks: EditlyAudioTrack[] = [];

  // Master audio (si présent)
  if (timeline.masterAudioUrl) {
    audioTracks.push({
      path: timeline.masterAudioUrl,
      mixVolume: timeline.masterAudioVolume,
    });
  }

  // Audio clips additionnels
  const audioClips = allClips.filter(c => c.type === 'audio');
  for (const clip of audioClips) {
    audioTracks.push({
      path: clip.asset_url!,
      start: clip.start,
      cutFrom: clip.source_start,
      cutTo: clip.source_end,
      mixVolume: clip.volume ?? 1,
    });
  }

  // 5. Assembler le spec final
  return {
    outPath: outputPath,
    width,
    height,
    fps,
    clips: editlyClips,
    audioTracks,
    keepSourceAudio: true,
    allowRemoteRequests: true,
  };
}
```

---

## 5. Fonctionnalités clés

### 5.1 Waveform dans les clips audio

Chaque clip audio affiche sa waveform réelle, pas un placeholder.

```tsx
// components/timeline/TimelineAudioClip.tsx

import WaveSurfer from 'wavesurfer.js';

interface TimelineAudioClipProps {
  clip: TimelineClip;
  scale: number;  // pixels par seconde
}

export function TimelineAudioClip({ clip, scale }: TimelineAudioClipProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current || !clip.asset_url) return;

    wavesurferRef.current = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4ade80',
      progressColor: '#22c55e',
      height: 48,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      interact: false,  // Lecture seule
      cursorWidth: 0,
      normalize: true,
    });

    // Charger l'audio (URL signée)
    wavesurferRef.current.load(clip.asset_url);

    return () => wavesurferRef.current?.destroy();
  }, [clip.asset_url]);

  // Ajuster la région visible selon le trim
  useEffect(() => {
    if (!wavesurferRef.current) return;

    const ws = wavesurferRef.current;
    const duration = ws.getDuration();

    if (duration > 0 && clip.source_start !== undefined) {
      const startRatio = clip.source_start / duration;
      const endRatio = (clip.source_end ?? duration) / duration;
      // Zoomer sur la région trimmée
      ws.zoom(scale * (1 / (endRatio - startRatio)));
      ws.seekTo(startRatio);
    }
  }, [scale, clip.source_start, clip.source_end]);

  const width = clip.duration * scale;

  return (
    <div
      ref={containerRef}
      className="h-12 rounded-md overflow-hidden bg-green-950/50"
      style={{ width }}
    />
  );
}
```

### 5.2 Track de transitions

Les transitions sont sur une track séparée, positionnées aux points de coupe.

```
Video:      [Clip A]          [Clip B]          [Clip C]
                   ↓                  ↓
Transition:    [fadeblack]       [dissolve]
                 @ 4.0s            @ 9.5s
```

**Comportement:**
- Un clip transition se place au point de coupe entre deux clips vidéo
- `start` = timestamp du point de coupe
- `duration` = durée de la transition (0.3s - 2s typiquement)
- Snap automatique aux bords des clips vidéo

```tsx
// components/timeline/TimelineTransitionClip.tsx

const TRANSITION_ICONS: Record<TransitionType, string> = {
  fade: '◐',
  fadeblack: '◑',
  fadewhite: '◒',
  dissolve: '◓',
  slideleft: '←',
  slideright: '→',
  slideup: '↑',
  slidedown: '↓',
  wipe: '▮',
  zoom: '⊙',
  none: '|',
};

export function TimelineTransitionClip({ clip, scale }: Props) {
  const width = Math.max(clip.duration * scale, 24);  // Min 24px

  return (
    <div
      className="h-8 bg-purple-600 rounded flex items-center justify-center text-white text-xs font-medium"
      style={{ width }}
    >
      <span className="mr-1">{TRANSITION_ICONS[clip.transition_type!]}</span>
      {clip.transition_type}
    </div>
  );
}
```

### 5.3 Rendu des séquences

Les clips de type `sequence` affichent un aperçu des plans qu'ils contiennent.

```tsx
// components/timeline/TimelineSequenceClip.tsx

export function TimelineSequenceClip({ clip, sequence, scale }: Props) {
  const width = clip.duration * scale;

  return (
    <div
      className="h-16 bg-blue-900 rounded-md overflow-hidden flex"
      style={{ width }}
    >
      {/* Thumbnails des plans */}
      {sequence.plans.map((plan, i) => (
        <div
          key={plan.id}
          className="h-full border-r border-blue-700 last:border-0"
          style={{ width: (plan.duration / clip.duration) * width }}
        >
          {plan.storyboard_image_url && (
            <img
              src={plan.storyboard_image_url}
              className="h-full w-full object-cover opacity-80"
              alt=""
            />
          )}
        </div>
      ))}

      {/* Label */}
      <div className="absolute inset-0 flex items-end p-1">
        <span className="text-xs text-white bg-black/50 px-1 rounded">
          {sequence.title || 'Séquence'}
        </span>
      </div>
    </div>
  );
}
```

---

## 6. Interactions utilisateur

### 6.1 Drag & Drop

```typescript
// Depuis la sidebar vers la timeline
interface DraggableItem {
  type: 'sequence' | 'rush-video' | 'rush-image' | 'audio';
  id: string;
  duration: number;
  thumbnail?: string;
}

// Zone de drop sur la timeline
interface DropTarget {
  trackId: string;
  time: number;  // Snappé à la grille
  valid: boolean;
}
```

### 6.2 Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Space` | Play/Pause |
| `Delete` / `Backspace` | Supprimer clips sélectionnés |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+A` | Sélectionner tout |
| `Cmd+D` | Dupliquer |
| `Cmd+S` | Sauvegarder |
| `Cmd++` / `Cmd+-` | Zoom in/out |
| `←` / `→` | Déplacer playhead (1 frame) |
| `Shift+←` / `Shift+→` | Déplacer playhead (1 seconde) |
| `Home` | Aller au début |
| `End` | Aller à la fin |
| `I` | Set In point (trim) |
| `O` | Set Out point (trim) |

### 6.3 Snapping

```typescript
interface SnapConfig {
  enabled: boolean;
  snapToClips: boolean;      // Snap aux bords des autres clips
  snapToPlayhead: boolean;   // Snap au playhead
  snapToMarkers: boolean;    // Snap aux marqueurs (beats, etc.)
  snapThreshold: number;     // Pixels (défaut: 10)
}

function calculateSnapPosition(
  time: number,
  clips: TimelineClip[],
  config: SnapConfig
): number {
  if (!config.enabled) return time;

  const snapPoints: number[] = [];

  // Collecter les points de snap
  for (const clip of clips) {
    snapPoints.push(clip.start);
    snapPoints.push(clip.start + clip.duration);
  }

  // Trouver le point le plus proche
  for (const point of snapPoints) {
    if (Math.abs(time - point) < config.snapThreshold / scale) {
      return point;
    }
  }

  return time;
}
```

---

## 7. Intégration avec les pages existantes

### 7.1 Page Short unifiée

```tsx
// app/(dashboard)/project/[projectId]/shorts/[shortId]/page.tsx

export default function ShortPage() {
  const [mode, setMode] = useState<'edition' | 'timeline'>('edition');

  return (
    <div>
      {/* Toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === 'edition' ? 'default' : 'ghost'}
          onClick={() => setMode('edition')}
        >
          <Pencil className="w-4 h-4 mr-2" />
          Édition
        </Button>
        <Button
          variant={mode === 'timeline' ? 'default' : 'ghost'}
          onClick={() => setMode('timeline')}
        >
          <Film className="w-4 h-4 mr-2" />
          Timeline
        </Button>
      </div>

      {/* Content */}
      {mode === 'edition' ? (
        <SequenceEditor sceneId={shortId} />
      ) : (
        <TimelineEditor
          sceneId={shortId}
          projectId={projectId}
          mode="short"
        />
      )}
    </div>
  );
}
```

### 7.2 Page Music Video

```tsx
// app/(dashboard)/project/[projectId]/clip/page.tsx

export default function MusicVideoPage() {
  const [mode, setMode] = useState<'edition' | 'timeline'>('timeline');
  const { masterAudio } = useMusicVideoStore();

  return (
    <div>
      {/* Toggle - même UI que shorts */}
      <ModeToggle mode={mode} onModeChange={setMode} />

      {/* Content */}
      {mode === 'edition' ? (
        <SequenceEditor sceneId={sceneId} />
      ) : (
        <TimelineEditor
          sceneId={sceneId}
          projectId={projectId}
          mode="musicvideo"
          masterAudioUrl={masterAudio?.url}
        />
      )}
    </div>
  );
}
```

### 7.3 Suppression du système Montage actuel

Le `montage-store.ts` actuel sera déprécié au profit de `timeline-store.ts`. Migration:
- Même concepts (tracks, clips)
- Ajout du type `sequence`
- Meilleure intégration avec le reste du système

---

## 8. Phases d'implémentation

### Phase 1: Foundation (2-3 jours)
- [ ] `timeline-store.ts` avec types et actions de base
- [ ] `TimelineEditor.tsx` container
- [ ] `TimelineTracks.tsx` et `TimelineTrack.tsx`
- [ ] `TimelineClip.tsx` (rendu basique)
- [ ] `TimelineRuler.tsx` et `TimelinePlayhead.tsx`

### Phase 2: Interactions (2-3 jours)
- [ ] Drag & drop depuis sidebar
- [ ] Move/resize clips sur timeline
- [ ] Sélection (simple et multiple)
- [ ] Raccourcis clavier
- [ ] Snapping

### Phase 3: Playback (1-2 jours)
- [ ] Preview vidéo synchronisé
- [ ] Playback audio (master + clips)
- [ ] Waveform pour master audio

### Phase 4: Persistence & Render (1-2 jours)
- [ ] API routes (GET/PUT timeline)
- [ ] `timeline-spec-builder.ts`
- [ ] Job render via BullMQ
- [ ] Intégration avec Editly processor

### Phase 5: Polish (1-2 jours)
- [ ] Transitions UI
- [ ] Undo/Redo
- [ ] Templates de timeline
- [ ] Tests E2E

---

## 9. Décisions prises

| Feature | Statut | Notes |
|---------|--------|-------|
| Multi-track video/audio/image | ✅ V1 | Pas d'overlay pour l'instant |
| Track transitions séparée | ✅ V1 | Plus visuel et flexible |
| Waveform dans clips audio | ✅ V1 | Via WaveSurfer.js |
| Overlays (texte, logo) | ❌ Plus tard | Post-V1 |
| Beat detection | ❌ Plus tard | Nice-to-have |

## 10. Questions ouvertes

1. **Export formats**: Seulement MP4 ou aussi GIF, WebM?
2. **Collaboration**: Temps réel ou pas?
3. **Undo/Redo**: Stack locale ou persistée?

---

## Annexes

### A. Comparaison avec l'ancien système Montage

| Aspect | Ancien Montage | Nouveau Timeline |
|--------|----------------|------------------|
| Scope | Par short seulement | Unifié (short, music, film) |
| Types | video, image, audio | + sequence |
| Store | montage-store.ts | timeline-store.ts |
| Persistence | scenes.montage_data | scenes.timeline_data |
| Spec builder | Pas intégré | timeline-spec-builder.ts |

### B. Ressources

- [Editly Documentation](https://github.com/mifi/editly)
- [gl-transitions Gallery](https://gl-transitions.com/gallery)
- [WaveSurfer.js](https://wavesurfer-js.org/)
