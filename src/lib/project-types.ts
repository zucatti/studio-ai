import type { ProjectType, AspectRatio } from '@/types/database';

export interface ProjectTypeConfig {
  value: ProjectType;
  label: string;
  description: string;
  defaultRatio: AspectRatio;
  simplified: boolean;
}

export const PROJECT_TYPES: ProjectTypeConfig[] = [
  {
    value: 'movie',
    label: 'Film',
    description: 'Long-métrage avec pipeline complet',
    defaultRatio: '16:9',
    simplified: false,
  },
  {
    value: 'short',
    label: 'Court-métrage',
    description: 'Court-métrage ou vidéo narrative',
    defaultRatio: '16:9',
    simplified: false,
  },
  {
    value: 'music_video',
    label: 'Clip musical',
    description: 'Clip vidéo ou contenu vertical',
    defaultRatio: '9:16',
    simplified: false,
  },
  {
    value: 'portfolio',
    label: 'Portfolio',
    description: 'Collection d\'images pour portfolio',
    defaultRatio: '4:5',
    simplified: true,
  },
  {
    value: 'photo_series',
    label: 'Série photo',
    description: 'Série photo thématique',
    defaultRatio: '16:9',
    simplified: true,
  },
];

export function getProjectTypeConfig(type: ProjectType): ProjectTypeConfig {
  return PROJECT_TYPES.find((t) => t.value === type) ?? PROJECT_TYPES[1]; // Default to 'short'
}

export function isSimplifiedProject(type: ProjectType): boolean {
  const config = getProjectTypeConfig(type);
  return config.simplified;
}

export type NavigationItem = {
  name: string;
  href: string;
  icon: string;
};

// Full pipeline navigation for movie/short/music_video
const FULL_PIPELINE_NAVIGATION: NavigationItem[] = [
  { name: 'Brainstorming', href: '/brainstorming', icon: 'Lightbulb' },
  { name: 'Script', href: '/script', icon: 'Clapperboard' },
  { name: 'Storyboard', href: '/storyboard', icon: 'ImageIcon' },
  { name: 'Preprod', href: '/preprod', icon: 'Frame' },
  { name: 'Production', href: '/production', icon: 'PlayCircle' },
];

// Simplified navigation for portfolio/photo_series
const SIMPLIFIED_NAVIGATION: NavigationItem[] = [
  { name: 'Quick Shot', href: '/quick-shot', icon: 'Zap' },
  { name: 'Gallery', href: '/gallery', icon: 'Grid3X3' },
  { name: 'Rushes', href: '/rushes', icon: 'Archive' },
];

export function getNavigationForType(type: ProjectType): NavigationItem[] {
  return isSimplifiedProject(type) ? SIMPLIFIED_NAVIGATION : FULL_PIPELINE_NAVIGATION;
}

// Get the default landing page for a project type
export function getDefaultPageForType(type: ProjectType): string {
  return isSimplifiedProject(type) ? '/quick-shot' : '/brainstorming';
}

// Get aspect ratios available for a project type
export function getAspectRatiosForType(type: ProjectType): AspectRatio[] {
  const config = getProjectTypeConfig(type);
  if (config.simplified) {
    // Portfolio/photo projects can use portrait and landscape formats
    return ['4:5', '2:3', '16:9', '1:1', '9:16'];
  }
  // Video projects use standard video formats
  return ['16:9', '9:16', '1:1', '21:9'];
}
