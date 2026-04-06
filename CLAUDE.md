# Studio IA - Context for Claude Code

## Vue d'ensemble

Application web de pré-production vidéo assistée par IA. Pipeline complète : brainstorming → script → découpage → storyboard → production vidéo.

**Stack**: Next.js 16 + React 19 + TypeScript + Tailwind CSS + Supabase + BullMQ

## Structure du projet

```
studio/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth routes (sign-in, sign-up)
│   │   ├── (dashboard)/        # Protected routes
│   │   │   └── project/[projectId]/
│   │   │       ├── brainstorming/  # Idéation IA
│   │   │       ├── script/         # Éditeur de script
│   │   │       ├── storyboard/     # Storyboards générés
│   │   │       ├── decoupage/      # Découpage technique
│   │   │       ├── preprod/        # Préparation frames
│   │   │       ├── production/     # Génération vidéos
│   │   │       ├── shorts/         # Shorts musicaux
│   │   │       ├── quick-shot/     # Quick shots (mode rapide)
│   │   │       ├── clip/           # Timeline clips musicaux
│   │   │       ├── gallery/        # Galerie ressources
│   │   │       ├── bible/          # Personnages/lieux/props
│   │   │       └── rush/           # Rushes (footages)
│   │   └── api/                # 96+ API routes
│   ├── components/             # React Components
│   │   ├── ui/                 # Base shadcn/ui
│   │   ├── bible/              # Character/Location/Prop
│   │   ├── script/             # Script editor
│   │   ├── storyboard/         # Storyboard viewer
│   │   ├── decoupage/          # Shot breakdown
│   │   ├── production/         # Video generation
│   │   ├── shorts/             # Shorts & cinematic
│   │   ├── clip/               # Audio timeline
│   │   └── quick-shot/         # Quick shot generator
│   ├── hooks/                  # Custom hooks (use-project, use-scenes, etc.)
│   ├── store/                  # Zustand stores
│   ├── lib/                    # Utilities & services
│   │   ├── ai/                 # AI wrappers (claude, fal, runway, elevenlabs)
│   │   ├── bullmq/             # Job queue types & helpers
│   │   └── storage/            # B2 storage utils
│   └── types/                  # TypeScript types
├── worker/                     # Separate Node.js worker
│   ├── src/
│   │   ├── processors/         # Job processors (video, image, audio, ffmpeg)
│   │   ├── providers/          # Video providers (fal, wavespeed)
│   │   └── services/           # Generation services
│   └── package.json
├── supabase/                   # DB migrations
└── k8s/                        # Kubernetes deployment
```

## Providers IA

### Images
- **Nano Banana 2** (`fal-ai/nano-banana-2`) - Text-to-image rapide
- **Seedream 5** (`seedream-5`) - Alternative text-to-image
- **Kling O1** (`kling-o1` / `fal-ai/kling-image/o1`) - Avec images de référence

### Vidéos
- **Kling Omni** (`kling-omni`) - Video generation via fal.ai
- **Sora 2** (`sora-2`) - OpenAI video
- **Veo 3** (`veo-3`) - Google cinematic
- **OmniHuman** (`omnihuman`) - Character animation

### Audio
- **ElevenLabs** - TTS avec voix personnalisées

### Texte
- **Claude** (Anthropic) - Scripts, prompts, brainstorming

## Base de données (Supabase)

Tables principales:
- `projects` - Projets utilisateur
- `scenes` - Scènes/Shorts (music_asset_id, music_volume, music_fade_in/out)
- `sequences` - Groupes de plans contigus (transition_in/out, transition_duration)
- `shots` - Plans avec descriptions (sequence_id)
- `characters`, `locations`, `props` - Bible du projet
- `global_assets` - Assets réutilisables
- `music_sections` - Sections musicales (clips)
- `generation_jobs` - Jobs en cours/terminés
- `credit_allocations` - Budgets par provider
- `api_usage_logs` - Logs d'utilisation

## Storage

**Backblaze B2** via API S3-compatible
- Format URLs: `b2://bucket-name/path/file.jpg`
- Conversion: `/api/storage/sign` → HTTPS signées

## Authentification

**Auth0** OAuth2/OIDC
- Middleware: `src/middleware.ts`
- Wrapper: `src/lib/auth0.ts`

## Worker (BullMQ)

6 queues:
- `video-gen` - Génération vidéo (3 concurrent, 7min timeout)
- `image-gen` - Génération image (5 concurrent, 90s timeout)
- `audio-gen` - Génération audio (5 concurrent, 30s timeout)
- `ffmpeg` - Processing vidéo (2 concurrent, 2min timeout)
- `quick-shot-gen` - Quick shots (4 concurrent, 2min timeout)
- `editly` - Assemblage Editly (1 concurrent, 5min timeout)

## Conventions de code

### Fichiers
- Components: `PascalCase.tsx`
- Utilities: `kebab-case.ts`
- Hooks: `use-kebab-case.ts`
- Stores: `kebab-case-store.ts`

### API Routes
```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // 1. Auth check
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Access check (project ownership)
  // 3. Business logic
  // 4. Response
}
```

### Storage URLs
```typescript
// B2 URL → Signed HTTPS
const signedUrl = useSignedUrl(b2Url);
// ou
const response = await fetch(`/api/storage/sign?url=${encodeURIComponent(b2Url)}`);
```

## Scripts NPM

### Frontend (studio/)
```bash
npm run dev          # Start Next.js (port 3001)
npm run build        # Build production
npm run lint         # ESLint
```

### Worker (worker/)
```bash
npm run dev          # Start workers (tsx watch)
npm run build        # Compile TypeScript
npm start            # Start compiled workers
```

## Environment Variables

```env
# Auth0
AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL
AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET

# Supabase
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Storage (B2 via S3)
S3_ENDPOINT, S3_BUCKET, S3_KEY, S3_SECRET

# AI Providers
AI_FAL_KEY, AI_ELEVEN_LABS, ANTHROPIC_API_KEY

# Redis (BullMQ)
REDIS_HOST, REDIS_PORT
```

## Fonctionnalités principales

1. **Brainstorming** - Chat IA pour idéation
2. **Script Editor** - Markdown avec parsing Fountain
3. **Bible** - Personnages avec 5 types d'images, lieux, props
4. **Storyboard** - Génération d'images via fal.ai
5. **Découpage** - Plans avec mouvements caméra (38+ options)
6. **Production** - Génération vidéo multi-provider
7. **Clips** - Timeline audio avec WaveSurfer.js
8. **Shorts** - Cinematic presets avec génération automatique
9. **Quick Shots** - Génération rapide avec références (@Character, #Location, !Look)

## Références dans les prompts

- `@Character` - Mention personnage
- `#Location` ou `#Prop` - Mention lieu ou accessoire
- `!Look` - Variation de costume/style d'un personnage

Ces mentions sont parsées et les images de référence sont envoyées aux providers qui les supportent.

## Editly Video Assembly

Architecture d'assemblage vidéo déclaratif avec transitions et musique.

### Hiérarchie

```
Short (conteneur global)
├── music_asset_id, music_volume, music_fade_in/out  # Musique globale
│
└── Sequences[] (groupes de plans contigus)
    ├── transition_in: Transition à l'entrée
    ├── transition_out: Transition à la sortie
    └── plans[] (color matched + cuts)
```

### Fichiers clés

```
worker/src/lib/editly/
├── index.ts          # assembleWithEditly()
├── types.ts          # EditlySpec, EditlyClip
├── spec-builder.ts   # buildEditlySpec()
└── transitions.ts    # Mapping DB → Editly

worker/src/processors/
└── editly.processor.ts  # Processeur queue 'editly'

src/app/api/.../shorts/[shortId]/
├── assemble-v2/      # API Editly assembly
└── sequences/        # CRUD séquences

src/components/shorts/
├── SequenceCard.tsx  # UI séquence avec transitions
└── MusicSelector.tsx # Sélecteur musique
```

### Transitions disponibles

| Type | Editly Mapping |
|------|----------------|
| dissolve | fade |
| fadeblack | fadeblack |
| fadewhite | fadewhite |
| slideleft/right/up/down | directional-* |
| crosszoom, zoomin, zoomout | fade (fallback) |
| circleopen, circleclose, radial | fade (fallback) |
| cube | fade (fallback) |

### Usage

```typescript
// API assemble-v2 endpoint
POST /api/projects/{projectId}/shorts/{shortId}/assemble-v2

// Returns job ID for polling
{ jobId: "...", status: "queued", sequenceCount: 2, clipCount: 5 }
```

---

## TODO

### Color Matching per Sequence

Appliquer le color matching FFmpeg PAR SÉQUENCE avant l'assemblage Editly (plans d'une même séquence = même colorimétrie).

### Ken Burns pour images

Utiliser le layer `image` avec `zoomDirection` pour les plans sans vidéo générée.

---

## Architecture Notes

### BullMQ Queues (TOUT passe par là, sauf Claude chat)

| Queue | Concurrency | Timeout | Usage |
|-------|-------------|---------|-------|
| `video-gen` | 3 | 7min | Video generation (Kling, Sora, Veo) |
| `image-gen` | 5 | 90s | Character/location reference images |
| `audio-gen` | 5 | 30s | TTS dialogue |
| `ffmpeg` | 2 | 2min | Video processing |
| `quick-shot-gen` | 4 | 2min | Quick shots + Rush images |
| `editly` | 1 | 5min | Video assembly |

### Endpoints Pattern

- **Queue**: `/api/.../queue-{action}` → Returns `{ jobId }` for polling
- **Polling**: `/api/jobs/[jobId]` → Returns job status/progress/result
- **Legacy sync**: `/api/.../` → Direct response (for simple operations)

### Redis

**IMPORTANT**: Redis est une application Mac native, PAS Docker.
- Host: `localhost`
- Port: `6379`
- Pas de password en dev local

---

## Session Notes

### 2026-04-03 - Editly Integration

**Réalisé**:
1. **Migration DB** - Table `sequences` + colonnes music_* sur scenes
2. **Types TS** - Interface Sequence, TransitionType (16 types)
3. **API Routes** - CRUD séquences + assemble-v2 endpoint
4. **Worker Editly** - Module complet avec spec-builder et processeur
5. **Store Zustand** - Gestion séquences et musique dans shorts-store
6. **UI Components** - SequenceCard avec transitions, MusicSelector

**Fichiers créés**:
- `supabase/migrations/20260404000001_sequences_music_transitions.sql`
- `worker/src/lib/editly/` (index, types, transitions, spec-builder)
- `worker/src/processors/editly.processor.ts`
- `src/app/api/.../sequences/` (route, [sequenceId]/route, reorder/route)
- `src/app/api/.../assemble-v2/route.ts`
- `src/components/shorts/SequenceCard.tsx`
- `src/components/shorts/MusicSelector.tsx`

**Fichiers modifiés**:
- `src/types/cinematic.ts` - TransitionType, Sequence, ShortMusicSettings
- `src/store/shorts-store.ts` - sequences, music, sequence_id on Plan
- `src/lib/bullmq/types.ts` - EditlyJobData, EDITLY queue
- `src/lib/bullmq/queues.ts` - enqueueEditly()
- `worker/src/config.ts` - EDITLY queue config
- `worker/src/queues/index.ts` - Editly worker registration
- `worker/package.json` - editly dependency

---

### 2025-04-03 - Mentions dans shots + Editly research

**Réalisé**:
1. **MentionInput dans SegmentEditor** - La description du shot supporte maintenant @character, #location, !look, &in, &out
2. **MentionInput dans CinematicHeaderWizard** - Notes additionnelles avec mentions
3. **Réduction colonne gauche** - Camera preview 40% → 60% pour édition
4. **Bible locations** - Passage des locations du store vers PlanEditor (pour le wizard)
5. **Research Editly** - Trouvé comme solution idéale pour JSON-to-video

**Commits**:
- `01e69ee` - Add mention support to shot description and additional notes

**Fichiers modifiés**:
- `src/components/shorts/SegmentEditor.tsx` - MentionInput + layout
- `src/components/shorts/CinematicHeaderWizard.tsx` - MentionInput notes
- `src/components/plan-editor/PlanEditor.tsx` - Prop locations
- `src/components/plan-editor/types.ts` - Type locations
- `src/app/(dashboard)/project/[projectId]/shorts/[shortId]/page.tsx` - Bible store integration

---

### 2026-04-03 - SSE Removal + BullMQ Migration

**IMPORTANT**: Tout passe par BullMQ, PLUS de SSE (sauf Claude chat).

**Redis**: Application native Mac sur localhost:6379 (PAS Docker)

**Réalisé**:
1. **Suppression SSE** - Plus de streaming dans les API routes de génération
2. **cinematic_header héritage** - Déplacé du Plan vers la Sequence (plans héritent du parent)
3. **Copy from Sequence** - Dropdown dans CinematicHeaderWizard pour copier les styles
4. **Elapsed time** - Affichage du temps écoulé pendant génération vidéo
5. **Queue endpoints** - Nouveaux endpoints BullMQ pour quick-shots et rush

**Routes SSE supprimées**:
- `DELETE /api/projects/[projectId]/shots/[shotId]/generate-video/` - Remplacé par queue-video
- `DELETE /api/projects/[projectId]/shorts/[shortId]/assemble/` - Remplacé par queue-assemble
- `MODIFIÉ /api/projects/[projectId]/quick-shots/route.ts` - SSE retiré, stream=true → erreur
- `MODIFIÉ /api/projects/[projectId]/rush/route.ts` - SSE retiré, stream=true → erreur

**Nouveaux endpoints BullMQ**:
- `/api/projects/[projectId]/queue-quick-shot` - Quick shots via BullMQ (existait déjà)
- `/api/projects/[projectId]/queue-rush` - Rush images via BullMQ (NOUVEAU)
- `/api/projects/[projectId]/shots/[shotId]/queue-video` - Video via BullMQ
- `/api/projects/[projectId]/shorts/[shortId]/queue-assemble` - Assembly via BullMQ

**Cinematic Header Changes**:
- `shorts-store.ts` - Retiré `cinematic_header` du Plan, ajouté à Sequence
- `CinematicHeaderWizard.tsx` - Props `otherSequences`, `readOnly`, `defaultViewMode`
- `queue-video/route.ts` - Héritage cinematic_header depuis sequence
- `generate-cinematic/route.ts` - Population cinematic_header pour tous les plans

**VideoGenerationProgress**:
- Ajout champ `startedAt?: string | number` pour calcul elapsed time
- `VideoGenerationCard.tsx` - Affichage temps écoulé "Xm Ys"

**Fichiers créés**:
- `src/app/api/projects/[projectId]/queue-rush/route.ts`

**Fichiers modifiés**:
- `src/app/api/projects/[projectId]/quick-shots/route.ts` - SSE supprimé
- `src/app/api/projects/[projectId]/rush/route.ts` - SSE supprimé
- `src/components/shorts/CinematicHeaderWizard.tsx` - Copy from sequence + readonly
- `src/components/shorts/VideoGenerationCard.tsx` - Elapsed time display
- `src/components/plan-editor/types.ts` - sequenceCinematicHeader, sequenceTitle, startedAt
- `src/store/shorts-store.ts` - cinematic_header moved to Sequence
- `src/lib/ai/cinematic-prompt-builder.ts` - CinematicPlan type update

---

### 2026-04-04 - Montage Timeline Editor

**Vue d'ensemble**: Éditeur de timeline vidéo/audio style NLE (Non-Linear Editor) pour assembler des clips sur plusieurs pistes.

#### Architecture

```
src/
├── store/
│   └── montage-store.ts          # Zustand + immer store
├── components/montage/
│   ├── TimelineEditor.tsx        # Container principal
│   ├── MontageTimeline.tsx       # Timeline avec pistes et clips
│   ├── MontagePreview.tsx        # Preview vidéo avec playback
│   ├── MontageToolbar.tsx        # Contrôles (play, zoom, save)
│   ├── MontageSidebar.tsx        # Browser d'assets (rushes, audio)
│   └── AudioPlayback.tsx         # Gestion audio (invisible)
└── app/api/.../montage/
    └── route.ts                  # GET/PUT montage data
```

#### Store (montage-store.ts)

**State**:
- `tracks: MontageTrack[]` - Pistes (video, audio, text)
- `clips: Record<string, MontageClip>` - Clips indexés par ID
- `currentTime`, `duration`, `isPlaying` - Playback state
- `scale`, `scrollLeft`, `scrollTop` - UI zoom/scroll
- `selectedClipIds`, `draggedClip` - Selection state
- `assets: MontageAsset[]` - Assets disponibles

**Types clés**:
```typescript
interface MontageClip {
  id: string;
  type: 'video' | 'image' | 'audio' | 'text';
  trackId: string;
  start: number;           // Position sur timeline (seconds)
  duration: number;        // Durée sur timeline
  sourceStart?: number;    // Trim début dans la source
  sourceEnd?: number;      // Trim fin dans la source
  sourceDuration?: number; // Durée totale source
  assetUrl?: string;       // URL B2 ou signée
}

interface MontageTrack {
  id: string;
  type: 'video' | 'audio' | 'text';
  muted: boolean;          // Toggle audio
  locked: boolean;
  visible: boolean;
}
```

**Actions principales**:
- `addClip`, `removeClip`, `updateClip`, `moveClip`, `resizeClip`
- `selectClip`, `clearSelection`
- `play`, `pause`, `togglePlayback`, `seekTo`
- `zoomIn`, `zoomOut`, `fitToView`
- `exportToJSON`, `importFromJSON` - Sauvegarde/chargement

#### Persistance

**Migration DB**: `supabase/migrations/20260405100000_montage_timeline.sql`
```sql
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS montage_data JSONB;
```

**API Route**: `/api/projects/[projectId]/shorts/[shortId]/montage`
- `GET` - Charge `montage_data` depuis la scene
- `PUT` - Sauvegarde `{ montageData: MontageExport }`

#### Playback Audio

**AudioPlayback.tsx** - Composant invisible qui gère les éléments `<audio>`:
- Signe les URLs B2 via POST `/api/storage/sign`
- Utilise `setInterval` à 200ms (pas RAF - évite le stuttering)
- Respecte le mute par piste
- Sync automatique à la position timeline

```typescript
// Pattern: laisser l'audio jouer naturellement
const intervalId = setInterval(() => {
  const activeClips = findActiveAudioClips(currentTime);
  // Start/stop clips selon leur position
}, 200);
```

#### Playback Vidéo

**MontagePreview.tsx**:
- `requestAnimationFrame` pour le tick principal
- Change de clip quand `currentTime` passe dans un nouveau clip
- Sync `video.currentTime` avec `sourceStart + clipTime`
- Respecte `track.muted` pour l'audio de la vidéo

#### Resize avec Trim Source

Quand on resize depuis la poignée gauche, on trim le début de la source:
```typescript
// Dans MontageTimeline.tsx
const trimAmount = newStart - dragStart.start;
const newSourceStart = Math.max(0, dragStart.sourceStart + trimAmount);

updateClip(clip.id, {
  start: newStart,
  duration: newDuration,
  sourceStart: newSourceStart,  // Trim source
});
```

#### Recalcul Duration

La durée totale du montage se recalcule automatiquement:
```typescript
// Dans montage-store.ts - appelé par updateClip, moveClip, resizeClip
calculateDuration: () => {
  let maxEnd = 0;
  Object.values(clips).forEach((clip) => {
    const end = clip.start + clip.duration;
    if (end > maxEnd) maxEnd = end;
  });
  return maxEnd;
}
```

#### UI Features

- **Sticky headers** - Les headers de pistes restent visibles au scroll horizontal
- **Zoom** - `Cmd++` / `Cmd+-` ou slider
- **Keyboard shortcuts** - Space (play/pause), Delete (supprimer), Cmd+S (save), Cmd+D (dupliquer)
- **Drag & drop** - Depuis sidebar vers timeline
- **Multi-selection** - Shift+click ou rectangle de sélection

#### Fichiers créés

- `supabase/migrations/20260405100000_montage_timeline.sql`
- `src/store/montage-store.ts`
- `src/components/montage/TimelineEditor.tsx`
- `src/components/montage/MontageTimeline.tsx`
- `src/components/montage/MontagePreview.tsx`
- `src/components/montage/MontageToolbar.tsx`
- `src/components/montage/MontageSidebar.tsx`
- `src/components/montage/AudioPlayback.tsx`
- `src/app/api/projects/[projectId]/shorts/[shortId]/montage/route.ts`

#### Problèmes résolus

1. **Audio stuttering** - Passage de RAF à setInterval 200ms
2. **Left resize ne trim pas** - Ajout tracking de `sourceStart` dans le drag state
3. **Duration ne shrink pas** - Appel systématique de `calculateDuration()` dans toutes les actions
4. **Headers qui scrollent** - CSS `sticky left-0` sur les headers de pistes
5. **Audio lag (~1s delay)** - Préchargement eager des clips audio au mount avec batch URL signing
6. **Plans flickering** - Passage de `allClips` object à TrackRow + `useMemo` pour filtrer par piste
7. **Focus ring sur sliders** - Ajout `focus:outline-none focus:ring-0` sur les sliders
8. **Erreurs polling bruyantes** - Silenced "Failed to fetch" dans `jobs-store.ts` refreshJob

---

### 2026-04-04 - Prompt Builder Fixes

**Problème**: La description du shot ("He plays guitar") n'apparaissait pas dans le prompt vidéo.

**Cause**: `buildSegmentsPrompt()` lisait `plan.description` (vide) au lieu de `segment.description` (où vit la data).

**Fix** dans `src/lib/ai/cinematic-prompt-builder.ts`:
```typescript
// Segment description (this is the main content!)
if (segment.description) {
  visualParts.push(segment.description);
}
```

**Fichiers modifiés**:
- `src/lib/ai/cinematic-prompt-builder.ts` - Ajout lecture de `segment.description`
- `src/store/jobs-store.ts` - Silenced polling errors
- `src/components/plan-editor/PlanEditor.tsx` - Focus ring removal on duration slider
- `src/components/montage/AudioPlayback.tsx` - Eager preloading avec subscription
- `src/components/montage/MontageTimeline.tsx` - Pass allClips + useMemo pattern

---

### 2026-04-06 - Generic Characters in Video Prompts

**Problème**: Les personnages génériques (ex: OldWoman#1) n'apparaissaient pas dans les prompts vidéo Kling Omni. Seuls les personnages globaux (Noah) étaient référencés.

**Cause racine**: Les routes `queue-video` et `prompt-preview` tentaient de faire un JOIN avec une table `generic_assets` inexistante. En réalité, `project_generic_assets.generic_asset_id` est un champ TEXT (ex: "generic:woman"), pas une FK.

#### Architecture des personnages

| Type | Table | ID unique | Données |
|------|-------|-----------|---------|
| Global | `project_assets` → `global_assets` | UUID (`global_assets.id`) | Stockées en DB |
| Generic | `project_generic_assets` | UUID (`project_generic_assets.id`) | `GENERIC_CHARACTERS` in-memory + `local_overrides` |

**Important**: `generic_asset_id` (TEXT comme "generic:woman") n'est PAS unique - plusieurs variantes peuvent exister (FEMME #1, FEMME #2). Utiliser `project_generic_assets.id` (UUID) comme identifiant unique.

#### Fix appliqué

**Pattern pour charger les personnages génériques**:
```typescript
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';

const { data: projectGenericAssets } = await supabase
  .from('project_generic_assets')
  .select('*')  // Pas de JOIN - generic_asset_id est TEXT
  .eq('project_id', projectId);

const genericCharacters = (projectGenericAssets || [])
  .map(pga => {
    const genericChar = GENERIC_CHARACTERS.find(g => g.id === pga.generic_asset_id);
    if (!genericChar) return null;
    const localOverrides = (pga.local_overrides || {}) as {...};
    return {
      id: pga.id,  // UUID unique per imported character
      name: pga.name_override || genericChar.name,
      asset_type: 'character' as const,
      reference_images: (localOverrides.reference_images_metadata || []).map(img => img.url),
      data: {
        visual_description: localOverrides.visual_description || genericChar.description,
        fal_voice_id: localOverrides.fal_voice_id,
      },
    } as unknown as GlobalAsset;
  })
  .filter((a): a is GlobalAsset => a !== null);

// Merge avec les personnages globaux
const allCharacters = [...globalCharacters, ...genericCharacters];
```

#### Optimisation prompt (character introduction)

**Avant**: Les figurants (sans images) répétaient leur description à chaque mention:
```
OldWoman#1 (Femme finlandaise de 70 ans...) says: "Hello"
OldWoman#1 (Femme finlandaise de 70 ans...) says: "Goodbye"
```

**Après**: Introduction unique dans la légende, puis nom seul (convention script cinéma):
```
Additional characters (no reference images):
- OldWoman#1: Femme finlandaise de 70 ans...

Shot 1: OldWoman#1 says: "Hello"
Shot 2: OldWoman#1 says: "Goodbye"
```

#### Fichiers modifiés

- `src/app/api/projects/[projectId]/shots/[shotId]/queue-video/route.ts` - Chargement generic characters via GENERIC_CHARACTERS
- `src/app/api/projects/[projectId]/shots/[shotId]/prompt-preview/route.ts` - Même fix
- `src/app/(dashboard)/project/[projectId]/shorts/[shortId]/page.tsx` - Chargement generic characters pour SegmentEditor dropdown
- `src/components/ui/mention-input.tsx` - Utilise `project_generic_asset_id` (UUID) pour les suggestions
- `src/lib/ai/cinematic-prompt-builder.ts` - Figurants utilisent juste le nom (description dans la légende)
- `worker/src/processors/video-gen.processor.ts` - Logs améliorés pour debug
