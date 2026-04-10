import type { ProjectType } from '@/types/database';

interface IconProps {
  className?: string;
}

// Film - Pellicule simplifiée
const MovieIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <line x1="6" y1="4" x2="6" y2="20" />
    <line x1="18" y1="4" x2="18" y2="20" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// Court-métrage - Clap
const ShortIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16a2 2 0 0 0 2-2V8H2v10a2 2 0 0 0 2 2Z" />
    <path d="M2 8l3-5h14l3 5" />
    <line x1="7" y1="3" x2="10" y2="8" />
    <line x1="14" y1="3" x2="17" y2="8" />
  </svg>
);

// Clip musical - Note de musique
const MusicVideoIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

// Portfolio - Appareil photo
const PortfolioIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

// Série photo - Grille d'images
const PhotoSeriesIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// Shorts - Play button vertical
const ShortsProjectIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <polygon points="10,8 16,12 10,16" />
  </svg>
);

// Book - Open book with pages
const BookIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    <path d="M8 7h6" />
    <path d="M8 11h8" />
  </svg>
);

export const PROJECT_TYPE_ICONS: Record<ProjectType, React.FC<IconProps>> = {
  movie: MovieIcon,
  short: ShortIcon,
  music_video: MusicVideoIcon,
  portfolio: PortfolioIcon,
  photo_series: PhotoSeriesIcon,
  shorts_project: ShortsProjectIcon,
  book: BookIcon,
};

// Fallback icon for unknown types
const DefaultIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="10,8 16,12 10,16" />
  </svg>
);

export function ProjectTypeIcon({ type, className }: { type: ProjectType | string; className?: string }) {
  const Icon = PROJECT_TYPE_ICONS[type as ProjectType] || DefaultIcon;
  return <Icon className={className} />;
}
