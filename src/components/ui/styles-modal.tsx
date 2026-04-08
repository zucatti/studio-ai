'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Video, Layout, Scissors, Film, Sun, Sparkles, BookOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  loadAllStyles,
  type StyleCategory,
  type StyleTechnique,
  STYLE_CATEGORIES,
  VIDEO_ONLY_CATEGORIES,
  generateStyleReference,
} from '@/lib/styles';

interface StylesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (technique: StyleTechnique) => void;
  mediaType: 'image' | 'video';
}

// Icon mapping
const CATEGORY_ICONS: Record<string, typeof Video> = {
  camera_work: Video,
  composition: Layout,
  editing: Scissors,
  genres: Film,
  lightning: Sun,
  sfx: Sparkles,
  storytelling: BookOpen,
};

export function StylesModal({ isOpen, onClose, onSelect, mediaType }: StylesModalProps) {
  const [categories, setCategories] = useState<StyleCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredTechnique, setHoveredTechnique] = useState<StyleTechnique | null>(null);

  // Load styles on mount
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      loadAllStyles()
        .then((allCategories) => {
          // Filter categories based on media type
          const filtered =
            mediaType === 'video'
              ? allCategories
              : allCategories.filter((cat) => !VIDEO_ONLY_CATEGORIES.includes(cat.id));

          setCategories(filtered);

          // Set initial active category
          if (filtered.length > 0 && !activeCategory) {
            setActiveCategory(filtered[0].id);
          } else if (filtered.length > 0 && !filtered.find((c) => c.id === activeCategory)) {
            setActiveCategory(filtered[0].id);
          }
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, mediaType, activeCategory]);

  // Reset search when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHoveredTechnique(null);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter techniques based on search
  const filteredTechniques = useMemo(() => {
    if (!searchQuery) {
      // No search: show techniques from active category
      const activeCat = categories.find((c) => c.id === activeCategory);
      return activeCat?.techniques || [];
    }

    // Search across all visible categories
    const query = searchQuery.toLowerCase();
    const results: StyleTechnique[] = [];

    for (const cat of categories) {
      for (const tech of cat.techniques) {
        if (
          tech.name.toLowerCase().includes(query) ||
          tech.slug.toLowerCase().includes(query) ||
          tech.utility.toLowerCase().includes(query)
        ) {
          results.push(tech);
        }
      }
    }

    return results;
  }, [categories, activeCategory, searchQuery]);

  // Handle technique selection
  const handleSelect = useCallback(
    (technique: StyleTechnique) => {
      onSelect(technique);
      onClose();
    },
    [onSelect, onClose]
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[90vw] max-w-5xl h-[85vh] max-h-[800px] bg-[#0f1419] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Film className="w-6 h-6 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Cinematic Styles</h2>
            <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded">
              {mediaType === 'video' ? 'Video' : 'Image'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-white/10 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une technique..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Category tabs (vertical) */}
          {!searchQuery && (
            <div className="w-48 border-r border-white/10 py-2 flex-shrink-0 overflow-y-auto">
              {categories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.id] || Film;
                const isActive = cat.id === activeCategory;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      isActive
                        ? 'bg-amber-500/20 text-amber-400 border-r-2 border-amber-400'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{cat.label}</span>
                    <span className="ml-auto text-xs opacity-60">{cat.techniques.length}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Techniques grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
              </div>
            ) : filteredTechniques.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Search className="w-12 h-12 mb-3 opacity-50" />
                <p>Aucune technique trouvée</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredTechniques.map((tech) => (
                  <TechniqueCard
                    key={`${tech.category}-${tech.slug}`}
                    technique={tech}
                    onClick={() => handleSelect(tech)}
                    onHover={setHoveredTechnique}
                    isHovered={hoveredTechnique?.slug === tech.slug}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer: Hovered technique details */}
        <div className="h-24 border-t border-white/10 px-6 py-3 flex-shrink-0 bg-black/30">
          {hoveredTechnique ? (
            <div className="flex items-start gap-4 h-full">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-white">{hoveredTechnique.name}</span>
                  <code className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    {generateStyleReference(hoveredTechnique)}
                  </code>
                  <span className="text-xs text-slate-500">{hoveredTechnique.categoryLabel}</span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 mb-1">{hoveredTechnique.utility}</p>
                <p className="text-xs text-slate-600 line-clamp-1 font-mono">
                  {hoveredTechnique.prompt}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-600 text-sm">
              Survolez une technique pour voir les détails
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Individual technique card
function TechniqueCard({
  technique,
  onClick,
  onHover,
  isHovered,
}: {
  technique: StyleTechnique;
  onClick: () => void;
  onHover: (tech: StyleTechnique | null) => void;
  isHovered: boolean;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Check if this is an animated webp (camera_work category)
  const isAnimated = technique.category === 'camera_work';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => onHover(technique)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'group relative aspect-video rounded-lg overflow-hidden border transition-all',
        isHovered
          ? 'border-amber-500 ring-2 ring-amber-500/30 scale-105 z-10'
          : 'border-white/10 hover:border-white/30'
      )}
    >
      {/* Preview image */}
      <div className="absolute inset-0 bg-slate-800">
        {!imageError ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/styles/${technique.preview}`}
              alt={technique.name}
              className={cn(
                'w-full h-full object-cover transition-opacity',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
            <Film className="w-6 h-6 text-slate-700" />
          </div>
        )}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Animated badge */}
      {isAnimated && (
        <div className="absolute top-1.5 right-1.5 bg-amber-500/90 text-black text-[9px] font-bold px-1 py-0.5 rounded">
          ANIM
        </div>
      )}

      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-xs font-medium text-white truncate">{technique.name}</p>
      </div>
    </button>
  );
}
