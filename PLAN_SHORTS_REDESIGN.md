# Plan: Shorts System Redesign

## Vision

Un système de création vidéo unifié pour **shorts**, **music videos**, et **films** basé sur une hiérarchie intuitive et un workflow cinématique par défaut.

---

## Architecture

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                   SHORT                                        ║
║                         "Ma première scène de thriller"                        ║
║                                                                                ║
║   Un conteneur qui regroupe plusieurs PLANS pour former une séquence          ║
║   ┌─────────────────────────────────────────────────────────────────────────┐  ║
║   │  Langue dialogue: FR  │  Durée totale: 42s  │  3 plans                 │  ║
║   └─────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                ║
║   ╔═══════════════════╗  ╔═══════════════════╗  ╔═══════════════════╗        ║
║   ║      PLAN 1       ║  ║      PLAN 2       ║  ║      PLAN 3       ║        ║
║   ║     "Tension"     ║  ║   "Révélation"    ║  ║     "Chute"       ║        ║
║   ║       12.5s       ║  ║       15s         ║  ║       14.5s       ║        ║
║   ║                   ║  ║                   ║  ║                   ║        ║
║   ║  ┌─────┬─────┐   ║  ║  ┌─────┬─────┐   ║  ║  ┌─────────────┐  ║        ║
║   ║  │Shot1│Shot2│   ║  ║  │Shot1│Shot2│   ║  ║  │   Shot 1    │  ║        ║
║   ║  │ 3s  │9.5s │   ║  ║  │ 7s  │ 8s  │   ║  ║  │   14.5s     │  ║        ║
║   ║  └─────┴─────┘   ║  ║  └─────┴─────┘   ║  ║  └─────────────┘  ║        ║
║   ╚═══════════════════╝  ╚═══════════════════╝  ╚═══════════════════╝        ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Définitions

| Concept | Description | Limite |
|---------|-------------|--------|
| **SHORT** | Conteneur/séquence vidéo complète | Illimité |
| **PLAN** | Unité de génération Kling Omni | ≤ 15 secondes |
| **SHOT** | Segment temporel dans un plan | 1-15 secondes |

---

## Workflow de Génération

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           WORKFLOW DE GÉNÉRATION                                │
└─────────────────────────────────────────────────────────────────────────────────┘

     CRÉATION                    GÉNÉRATION                    POST-PROD
         │                            │                            │
         ▼                            ▼                            ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│                 │          │                 │          │                 │
│  Dialogue FR    │──────────│  Claude API    │          │   Vidéo EN      │
│  "Tu savais."   │  traduit │  Translation    │          │   (Kling)       │
│                 │          │                 │          │                 │
└─────────────────┘          └────────┬────────┘          └────────┬────────┘
                                      │                            │
                                      ▼                            │
                             ┌─────────────────┐                   │
                             │                 │                   │
                             │  "You knew."    │                   │
                             │  (EN prompt)    │                   │
                             │                 │                   │
                             └────────┬────────┘                   │
                                      │                            │
                                      ▼                            │
                             ┌─────────────────┐                   │
                             │                 │                   │
                             │   Kling Omni    │───────────────────┘
                             │   + Lip-sync EN │
                             │                 │
                             └────────┬────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │         TRADUCTION OPTIONNELLE       │
                    │                                      │
                    │  ┌──────────┐      ┌──────────────┐ │
                    │  │ElevenLabs│      │ Sync Lipsync │ │
                    │  │ Audio FR │ ───▶ │  mode remap  │ │
                    │  └──────────┘      └──────────────┘ │
                    │                           │         │
                    │                           ▼         │
                    │                    ┌────────────┐   │
                    │                    │ Vidéo FR   │   │
                    │                    └────────────┘   │
                    └─────────────────────────────────────┘
```

---

## UI Design

### Vue Short (Liste des Plans)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Projet    SHORT: Confrontation Cuisine                              [⚙️] [▶️] │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Dialogue: 🇫🇷 Français        Durée: 42s        Versions: [EN ✓] [FR ✓]       │
│                                                                                  │
│ ═════════════════════════════════════════════════════════════════════════════════│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │ PLAN 1 · Tension                                              12.5s   [≡]  │ │
│  │ ┌─────────────────────────────────────────────────────────────────────────┐ │ │
│  │ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│              │ │ │
│  │ │    Shot 1     │              Shot 2                    │              │ │ │
│  │ │   CLOSE-UP    │             MEDIUM                     │              │ │ │
│  │ │   @Morgana    │             @Kael                      │              │ │ │
│  │ │     3.0s      │             9.5s                       │              │ │ │
│  │ └───────────────┴────────────────────────────────────────┴──────────────┘ │ │
│  │                                                                            │ │
│  │ 🎬 Généré EN ✓   🇫🇷 Traduit ✓                          [▶️] [✏️] [🗑️]  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │ PLAN 2 · Révélation                                           15.0s   [≡]  │ │
│  │ ┌─────────────────────────────────────────────────────────────────────────┐ │ │
│  │ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│              │ │ │
│  │ │         Shot 1             │           Shot 2            │              │ │ │
│  │ │        OVER-SHOULDER       │          CLOSE-UP           │              │ │ │
│  │ │         @Morgana           │           @Kael             │              │ │ │
│  │ │           7.0s             │            8.0s             │              │ │ │
│  │ └────────────────────────────┴─────────────────────────────┴──────────────┘ │ │
│  │                                                                            │ │
│  │ 🎬 Généré EN ✓   🇫🇷 En cours...                         [▶️] [✏️] [🗑️]  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │ PLAN 3 · Chute                                                14.5s   [≡]  │ │
│  │ ┌─────────────────────────────────────────────────────────────────────────┐ │ │
│  │ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│              │ │ │
│  │ │                         Shot 1                            │              │ │ │
│  │ │                          WIDE                             │              │ │ │
│  │ │                        Ensemble                           │              │ │ │
│  │ │                         14.5s                             │              │ │ │
│  │ └───────────────────────────────────────────────────────────┴──────────────┘ │ │
│  │                                                                            │ │
│  │ ⏳ Non généré                                               [▶️] [✏️] [🗑️]  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│                              [+ Ajouter un plan]                                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Éditeur de Plan (Modal/Page)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Short    PLAN: Tension                                    [💾 Sauver] [▶️ Générer]│
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─ STYLE CINÉMATIQUE ──────────────────────────────────────────── [✏️ Modifier]│
│  │  🎬 Thriller Nocturne · Low-key · Handheld · Désaturé froid · Tension       │
│  └──────────────────────────────────────────────────────────────────────────────┘
│                                                                                  │
│  ┌─ RÉFÉRENCES ─────────────────────────────────────────────────────────────────┐
│  │                                                                               │
│  │  ┌──────────────┐                              ┌──────────────┐              │
│  │  │              │                              │              │              │
│  │  │   Frame In   │  ─────────────────────────▶  │  Frame Out   │              │
│  │  │  (optionnel) │                              │  (optionnel) │              │
│  │  │              │                              │              │              │
│  │  │  [+ Image]   │                              │  [+ Image]   │              │
│  │  └──────────────┘                              └──────────────┘              │
│  └───────────────────────────────────────────────────────────────────────────────┘
│                                                                                  │
│ ═════════════════════════════════════════════════════════════════════════════════│
│  TIMELINE                                                        12.5s / 15s max │
│ ┌────────────────────────────────────────────────────────────────────────────────┤
│ │                                                                                │
│ │  0s              3s                                            12.5s     15s  │
│ │  ├───────────────┼──────────────────────────────────────────────┤             │
│ │  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│             │
│ │  │    SHOT 1     │                 SHOT 2                      │             │
│ │  │   CLOSE-UP    │                MEDIUM                       │  [+ Shot]   │
│ │  │   @Morgana    │                @Kael                        │             │
│ │  │    ● actif    │                                             │             │
│ │  └───────────────┴─────────────────────────────────────────────┘             │
│ │                  ↔ drag                                                       │
│ └────────────────────────────────────────────────────────────────────────────────┘
│                                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  SHOT 1                                                          0:00 → 0:03    │
│                                                                                  │
│  ┌─ Identification ─────────────────────────────────────────────────────────────┐
│  │                                                                               │
│  │  Type    [▼ Close-up           ]      Sujet   [@Morgana________________]     │
│  │                                                                               │
│  └───────────────────────────────────────────────────────────────────────────────┘
│                                                                                  │
│  ┌─ Description du shot ────────────────────────────────────────────────────────┐
│  │                                                                               │
│  │  ┌─ Cadrage ───────────────────────────────────────────────────────────────┐ │
│  │  │ Tight close-up from nose up, shallow depth of field                     │ │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │
│  │                                                                               │
│  │  ┌─ Action ────────────────────────────────────────────────────────────────┐ │
│  │  │ Her eyes widen slightly with fear as she processes his words            │ │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │
│  │                                                                               │
│  │  ┌─ Dialogue ──────────────────────────────────────────────────────────────┐ │
│  │  │                                                                          │ │
│  │  │  👤 [@Morgana ▼]          Ton: [▼ flatly        ]                       │ │
│  │  │                                                                          │ │
│  │  │  🇫🇷 ┌─────────────────────────────────────────────────────────────┐    │ │
│  │  │     │ Tu savais. Depuis le début.                                  │    │ │
│  │  │     └─────────────────────────────────────────────────────────────┘    │ │
│  │  │                                                                          │ │
│  │  │  🇬🇧 "You knew. From the very beginning."                    [✏️]      │ │
│  │  │     └─ Claude translation                                               │ │
│  │  │                                                                          │ │
│  │  └──────────────────────────────────────────────────────────────────────────┘ │
│  │                                                                               │
│  │  ┌─ Environnement ─────────────────────────────────────────────────────────┐ │
│  │  │ Kitchen background softly blurred, pendant light rim                    │ │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │
│  │                                                                               │
│  │  ┌─ Caméra ────────────────────────────────────────────────────────────────┐ │
│  │  │ [▼ Slow dolly in    ]     Notes: Approche lente pour tension____       │ │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │
│  │                                                                               │
│  └───────────────────────────────────────────────────────────────────────────────┘
│                                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  📄 PROMPT GÉNÉRÉ                                                     [✏️ Edit] │
│  ┌───────────────────────────────────────────────────────────────────────────────┐
│  │ CINEMATIC STYLE: Dark, moody kitchen with dramatic low-key lighting from     │
│  │ single overhead pendant. Handheld camera, shallow depth of field.            │
│  │ Desaturated with cold blue-green tones. Tense, intimate thriller.            │
│  │                                                                               │
│  │ SHOT 1 (0:00–0:03) — CLOSE-UP, @Morgana's face:                              │
│  │ Tight close-up from nose up, shallow depth of field.                         │
│  │ Her eyes widen slightly with fear as she processes his words.                │
│  │ @Element1 says flatly <<<voice_1>>>: "You knew. From the very beginning."   │
│  │ Kitchen background softly blurred, pendant light creates rim lighting.       │
│  │ Slow dolly in.                                                                │
│  │                                                                               │
│  │ SHOT 2 (0:03–0:12.5) — MEDIUM, @Kael:                                        │
│  │ ...                                                                           │
│  └───────────────────────────────────────────────────────────────────────────────┘
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Tables

```sql
-- Table: scenes (= shorts)
-- Déjà existante, pas de changement majeur

-- Table: shots (= plans) - MISE À JOUR
ALTER TABLE shots ADD COLUMN segments JSONB DEFAULT '[]';
ALTER TABLE shots ADD COLUMN style_preset_id UUID REFERENCES cinematic_presets(id);

-- Les anciennes colonnes (shot_type, framing, action, etc.) restent pour
-- rétro-compatibilité mais seront migrées vers segments
```

### Types TypeScript

```typescript
// ============================================================================
// SHORT (conteneur simple)
// ============================================================================
interface Short {
  id: string;
  project_id: string;
  title: string;
  description?: string;

  // Settings
  dialogue_language: 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt' | 'zh' | 'ja' | 'ko';

  // Plans (le style cinématique est sur chaque plan, pas sur le short)
  plans: Plan[];

  // Computed
  total_duration: number;

  // Assembled video (tous les plans assemblés)
  assembled_video_url?: string;
  assembled_video_status?: 'pending' | 'assembling' | 'completed' | 'failed';
}

// ============================================================================
// PLAN (unité de génération ≤15s)
// ============================================================================
interface Plan {
  id: string;
  short_id: string;
  sort_order: number;
  title?: string;  // Optionnel, fallback: "Plan 1", "Plan 2", etc.

  // Style cinématique (propre au plan, avec défaut si non configuré)
  cinematic_header: CinematicHeaderConfig;  // Toujours présent (défaut appliqué)

  // Références visuelles
  frame_in_url?: string;
  frame_out_url?: string;

  // Shots (segments temporels)
  segments: Shot[];

  // Computed
  duration: number;  // sum of segments

  // Generation
  generation_status: 'not_started' | 'generating' | 'completed' | 'failed';
  generated_video_url?: string;  // Version EN (source)

  // Translations
  translations: {
    language: string;
    audio_url: string;      // ElevenLabs audio
    video_url: string;      // Sync Lipsync result
    status: 'pending' | 'generating' | 'completed' | 'failed';
  }[];
}

// ============================================================================
// SHOT (segment temporel dans un plan)
// ============================================================================
interface Shot {
  id: string;

  // Timing (en secondes)
  start_time: number;
  end_time: number;

  // Identification
  shot_type: ShotType;
  subject: string;  // "@Morgana", "the knife", "both characters"

  // Description (tous optionnels)
  framing?: string;
  action?: string;
  dialogue?: Dialogue;
  environment?: string;
  camera_movement?: CameraMovement;
  camera_notes?: string;

  // Override (pour utilisateurs avancés)
  custom_prompt?: string;
}

type ShotType =
  | 'extreme_wide'
  | 'wide'
  | 'medium_wide'
  | 'medium'
  | 'medium_close_up'
  | 'close_up'
  | 'extreme_close_up'
  | 'over_shoulder'
  | 'pov'
  | 'insert'
  | 'two_shot';

interface Dialogue {
  character_id: string;
  character_name: string;  // Pour affichage
  tone?: DialogueTone;
  text: string;            // Langue originale
  text_en?: string;        // Traduction Claude (auto-générée)
}

type DialogueTone =
  | 'neutral'
  | 'flatly'
  | 'coldly'
  | 'warmly'
  | 'angrily'
  | 'sadly'
  | 'whispers'
  | 'shouts'
  | 'sarcastically'
  | 'nervously'
  | 'seductively';

type CameraMovement =
  | 'static'
  | 'slow_dolly_in'
  | 'slow_dolly_out'
  | 'dolly_left'
  | 'dolly_right'
  | 'tracking_forward'
  | 'tracking_backward'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'crane_up'
  | 'crane_down'
  | 'orbit_cw'
  | 'orbit_ccw'
  | 'handheld'
  | 'zoom_in'
  | 'zoom_out';
```

---

## Migration

```sql
-- 1. Ajouter la colonne segments aux shots (plans)
ALTER TABLE shots ADD COLUMN IF NOT EXISTS segments JSONB DEFAULT '[]';

-- 2. Migrer les données existantes vers le format segment
UPDATE shots
SET segments = jsonb_build_array(
  jsonb_strip_nulls(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'start_time', 0,
    'end_time', COALESCE(duration, 5),
    'shot_type', COALESCE(shot_type, 'medium'),
    'subject', COALESCE(shot_subject, ''),
    'framing', framing,
    'action', COALESCE(action, animation_prompt),
    'dialogue', CASE
      WHEN dialogue_text IS NOT NULL THEN jsonb_build_object(
        'character_id', dialogue_character_id,
        'character_name', '',
        'tone', dialogue_tone,
        'text', dialogue_text
      )
      ELSE NULL
    END,
    'environment', environment,
    'camera_movement', camera_movement,
    'camera_notes', NULL
  ))
)
WHERE segments = '[]' OR segments IS NULL;

-- 3. Ajouter colonne translations pour les versions traduites
ALTER TABLE shots ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '[]';

-- 4. Ajouter style_preset_id
ALTER TABLE shots ADD COLUMN IF NOT EXISTS style_preset_id UUID;
```

---

## Composants React

### Nouveaux Composants

| Fichier | Description |
|---------|-------------|
| `src/components/shorts/ShortOverview.tsx` | Vue liste des plans d'un short |
| `src/components/shorts/PlanCard.tsx` | Card compacte avec timeline mini |
| `src/components/shorts/PlanEditor.tsx` | Éditeur complet d'un plan |
| `src/components/shorts/TimelineSlider.tsx` | Slider avec segments draggables |
| `src/components/shorts/ShotEditor.tsx` | Formulaire d'édition d'un shot |
| `src/components/shorts/DialogueInput.tsx` | Input dialogue avec traduction |
| `src/components/shorts/PromptPreview.tsx` | Aperçu du mega-prompt généré |
| `src/components/shorts/TranslationStatus.tsx` | Statut des versions traduites |

### Composants Existants à Modifier

| Fichier | Modification |
|---------|--------------|
| `src/components/shorts/CinematicHeaderWizard.tsx` | Garder tel quel |
| `src/store/shorts-store.ts` | Ajouter gestion segments |

---

## API Routes

### Nouvelles Routes

| Route | Description |
|-------|-------------|
| `POST /api/translate-dialogue` | Traduit dialogue via Claude |
| `POST /api/projects/[id]/shorts/[id]/plans/[id]/generate` | Génère un plan (Kling) |
| `POST /api/projects/[id]/shorts/[id]/plans/[id]/translate` | Traduit un plan (Sync Lipsync) |

### Workflow API

```typescript
// 1. Traduction dialogue (appelé à la volée ou avant génération)
POST /api/translate-dialogue
{
  text: "Tu savais. Depuis le début.",
  from: "fr",
  to: "en",
  context: {
    characterName: "Morgana",
    tone: "flatly",
    sceneContext: "Tense kitchen confrontation"
  }
}
// Response: { translation: "You knew. From the very beginning." }

// 2. Génération plan
POST /api/projects/{pid}/shorts/{sid}/plans/{planId}/generate
// - Construit le mega-prompt avec dialogues EN
// - Auto-détecte personnages depuis @mentions
// - Appelle Kling Omni
// - Stocke vidéo EN

// 3. Traduction plan (optionnel)
POST /api/projects/{pid}/shorts/{sid}/plans/{planId}/translate
{
  target_language: "fr"
}
// - Génère audio FR via ElevenLabs (voix du personnage)
// - Appelle Sync Lipsync avec mode remap
// - Stocke vidéo FR
```

---

## Coûts Estimés

| Étape | Service | Coût (15s) |
|-------|---------|------------|
| Traduction | Claude API | ~$0.01 |
| Génération | Kling Omni | ~$0.50 |
| Audio FR | ElevenLabs | ~$0.02 |
| Lip-sync FR | Sync Lipsync | ~$0.18 |
| **TOTAL EN** | | **~$0.51** |
| **TOTAL EN+FR** | | **~$0.71** |

---

## Priorités d'Implémentation

### Phase 1: Core (Data Model + API)
1. Migration DB (segments JSONB)
2. Types TypeScript
3. API translate-dialogue
4. Update generate-cinematic pour segments

### Phase 2: UI Plan Editor
1. TimelineSlider component
2. ShotEditor component
3. DialogueInput avec traduction
4. PlanEditor (assemblage)

### Phase 3: UI Short Overview
1. ShortOverview avec PlanCards
2. Drag & drop réordonner plans
3. Statuts de génération

### Phase 4: Traduction
1. Intégration Sync Lipsync dans fal-wrapper
2. API translate plan
3. UI TranslationStatus
4. Multi-version playback

---

## Décisions Prises

1. **Nom du Plan** - Optionnel avec fallback "Plan 1", "Plan 2", etc.
2. **Style cinématique** - Appartient au plan uniquement (pas d'héritage depuis le short)
3. **Frame in/out** - Optionnels comme références visuelles
