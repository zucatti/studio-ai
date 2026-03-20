'use client';

import { useEffect, useState } from 'react';
import { Book, User, Users, MapPin, Package, Plus, Loader2, AlertCircle, AtSign, Hash, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StorageThumbnail } from '@/components/ui/storage-image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBibleStore } from '@/store/bible-store';
import { GENERIC_CHARACTERS, type GenericCharacter } from '@/lib/generic-characters';
import { generateReferenceName } from '@/lib/reference-name';
import { cn } from '@/lib/utils';

const GENERIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crowd: Users,
  voice: User,
  person: User,
  child: User,
  announcer: User,
  narrator: Book,
};

interface ProjectBibleProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectBible({ projectId, open, onOpenChange }: ProjectBibleProps) {
  const {
    projectAssets,
    projectGenericAssets,
    isLoading,
    fetchProjectAssets,
    fetchProjectGenericAssets,
    removeProjectAsset,
    removeGenericAsset,
    isGenericAssetInProject,
    setOpen: openGlobalBible,
  } = useBibleStore();

  const [usedCharacterIds, setUsedCharacterIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && projectId) {
      fetchProjectAssets(projectId);
      fetchProjectGenericAssets(projectId);
      fetchUsedCharacters(projectId).then(setUsedCharacterIds);
    }
  }, [open, projectId, fetchProjectAssets, fetchProjectGenericAssets]);

  const characters = projectAssets.filter(a => a.asset_type === 'character');
  const locations = projectAssets.filter(a => a.asset_type === 'location');
  const props = projectAssets.filter(a => a.asset_type === 'prop');
  const genericCharacters = GENERIC_CHARACTERS.filter(g => isGenericAssetInProject(g.id));

  const isCharacterUsed = (id: string) => usedCharacterIds.has(id);

  const handleRemoveAsset = async (projectAssetId: string) => {
    await removeProjectAsset(projectId, projectAssetId);
  };

  const handleRemoveGeneric = async (projectGenericAssetId: string) => {
    await removeGenericAsset(projectId, projectGenericAssetId);
  };

  const handleOpenGlobalBible = () => {
    onOpenChange(false);
    openGlobalBible(true);
  };

  const totalAssets = characters.length + locations.length + props.length + genericCharacters.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 bg-[#0d1520] border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Book className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-white">Bible du Projet</DialogTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  {totalAssets} élément{totalAssets > 1 ? 's' : ''} importé{totalAssets > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenGlobalBible}
              className="mr-12 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Bible générale
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-green-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Characters */}
              {(characters.length > 0 || genericCharacters.length > 0) && (
                <Section
                  icon={User}
                  title="Personnages"
                  count={characters.length + genericCharacters.length}
                  color="blue"
                >
                  <div className="grid grid-cols-2 gap-3">
                    {characters.map((char) => (
                      <AssetCard
                        key={char.id}
                        name={char.name}
                        reference={generateReferenceName(char.name)}
                        image={char.reference_images?.[0]}
                        isUsed={isCharacterUsed(char.id)}
                        onRemove={!isCharacterUsed(char.id) ? () => handleRemoveAsset(char.project_asset_id) : undefined}
                      />
                    ))}
                    {genericCharacters.map((char) => {
                      const projectAsset = projectGenericAssets.find(pa => pa.id === char.id);
                      const Icon = GENERIC_ICONS[char.icon] || User;
                      return (
                        <GenericCard
                          key={char.id}
                          name={char.name}
                          description={char.description}
                          reference={generateReferenceName(char.name)}
                          icon={Icon}
                          isUsed={isCharacterUsed(char.id)}
                          onRemove={!isCharacterUsed(char.id) && projectAsset ? () => handleRemoveGeneric(projectAsset.project_generic_asset_id) : undefined}
                        />
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Locations */}
              {locations.length > 0 && (
                <Section icon={MapPin} title="Lieux" count={locations.length} color="green">
                  <div className="grid grid-cols-2 gap-3">
                    {locations.map((loc) => (
                      <AssetCard
                        key={loc.id}
                        name={loc.name}
                        reference={generateReferenceName(loc.name, '#')}
                        prefix="#"
                        onRemove={() => handleRemoveAsset(loc.project_asset_id)}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Props */}
              {props.length > 0 && (
                <Section icon={Package} title="Accessoires" count={props.length} color="orange">
                  <div className="grid grid-cols-2 gap-3">
                    {props.map((prop) => (
                      <AssetCard
                        key={prop.id}
                        name={prop.name}
                        reference={generateReferenceName(prop.name, '#')}
                        prefix="#"
                        onRemove={() => handleRemoveAsset(prop.project_asset_id)}
                      />
                    ))}
                  </div>
                </Section>
              )}

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Section component
function Section({
  icon: Icon,
  title,
  count,
  color,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  color: 'blue' | 'green' | 'orange' | 'purple';
  children: React.ReactNode;
}) {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-500/20',
    green: 'text-green-400 bg-green-500/20',
    orange: 'text-orange-400 bg-orange-500/20',
    purple: 'text-purple-400 bg-purple-500/20',
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('p-1.5 rounded-md', colorClasses[color])}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-slate-500">({count})</span>
      </div>
      {children}
    </div>
  );
}

// Asset card
function AssetCard({
  name,
  reference,
  image,
  isUsed,
  prefix = '@',
  onRemove,
}: {
  name: string;
  reference: string;
  image?: string;
  isUsed?: boolean;
  prefix?: '@' | '#';
  onRemove?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const PrefixIcon = prefix === '@' ? AtSign : Hash;
  const colorClass = prefix === '@' ? 'text-blue-400 hover:text-blue-300' : 'text-green-400 hover:text-green-300';

  return (
    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
      <div className="flex items-start gap-3">
        {image ? (
          <StorageThumbnail
            src={image}
            alt={name}
            size={56}
            className="rounded-lg flex-shrink-0"
            objectPosition="center top"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-slate-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{name}</p>
          <button
            onClick={handleCopy}
            className={cn('flex items-center gap-1 mt-0.5 text-xs', colorClass)}
          >
            <PrefixIcon className="w-3 h-3" />
            <span className="font-mono">{reference.slice(1)}</span>
            {copied && <Check className="w-3 h-3 text-green-400" />}
          </button>
        </div>
        {isUsed ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span className="text-[10px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Utilisé dans le script</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : onRemove ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onRemove}
                  className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Retirer du projet</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}

// Generic character card
function GenericCard({
  name,
  description,
  reference,
  icon: Icon,
  isUsed,
  onRemove,
}: {
  name: string;
  description: string;
  reference: string;
  icon: React.ComponentType<{ className?: string }>;
  isUsed?: boolean;
  onRemove?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{name}</p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 mt-0.5 text-xs text-purple-400 hover:text-purple-300"
          >
            <AtSign className="w-3 h-3" />
            <span className="font-mono">{reference.slice(1)}</span>
            {copied && <Check className="w-3 h-3 text-green-400" />}
          </button>
        </div>
        {isUsed ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span className="text-[10px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Utilisé dans le script</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : onRemove ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onRemove}
                  className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Retirer du projet</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}

// Helper function
async function fetchUsedCharacters(projectId: string): Promise<Set<string>> {
  try {
    const res = await fetch(`/api/projects/${projectId}/used-characters`);
    if (res.ok) {
      const data = await res.json();
      return new Set(data.characterIds || []);
    }
  } catch (error) {
    console.error('Error fetching used characters:', error);
  }
  return new Set();
}

// Button to open Project Bible
export function ProjectBibleButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-green-500/30 text-green-400 hover:bg-green-500/10"
      >
        <Book className="w-4 h-4 mr-2" />
        Bible du projet
      </Button>
      <ProjectBible projectId={projectId} open={open} onOpenChange={setOpen} />
    </>
  );
}
