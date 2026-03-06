'use client';

import { Scene } from '@/types/scene';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ChevronUp, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShotCard } from './shot-card';
import { useState } from 'react';

interface SceneCardProps {
  scene: Scene;
  isExpanded?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  onAddShot?: () => void;
  onEditShot?: (shotId: string) => void;
  onDeleteShot?: (shotId: string) => void;
}

export function SceneCard({
  scene,
  isExpanded = false,
  onToggle,
  onDelete,
  onAddShot,
  onEditShot,
  onDeleteShot,
}: SceneCardProps) {
  const [expanded, setExpanded] = useState(isExpanded);

  const handleToggle = () => {
    setExpanded(!expanded);
    onToggle?.();
  };

  const headingText = `${scene.heading.intExt}. ${scene.heading.location} - ${scene.heading.timeOfDay}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className={cn(
          'cursor-pointer transition-colors hover:bg-muted/50',
          expanded && 'border-b'
        )}
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono">
              {scene.sceneNumber}
            </Badge>
            <div>
              <h3 className="font-mono font-semibold text-sm uppercase">
                {headingText}
              </h3>
              {scene.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                  {scene.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{scene.shots.length} plan(s)</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer la scène
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 space-y-4 bg-muted/30">
          {scene.shots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Aucun plan dans cette scène.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={onAddShot}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un plan
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {scene.shots.map((shot) => (
                  <ShotCard
                    key={shot.id}
                    shot={shot}
                    onEdit={() => onEditShot?.(shot.id)}
                    onDelete={() => onDeleteShot?.(shot.id)}
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onAddShot}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un plan
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
