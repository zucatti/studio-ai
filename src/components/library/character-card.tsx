'use client';

import { Character } from '@/types/character';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Edit, Trash2, User } from 'lucide-react';

interface CharacterCardProps {
  character: Character;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function CharacterCard({ character, onEdit, onDelete }: CharacterCardProps) {
  const initials = character.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16 flex-shrink-0">
            <AvatarImage
              src={character.referenceImages[0]}
              alt={character.name}
            />
            <AvatarFallback className="text-lg">
              {initials || <User className="w-6 h-6" />}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-lg truncate">{character.name}</h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onEdit}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {character.age && (
                <Badge variant="outline" className="text-xs">
                  {character.age} ans
                </Badge>
              )}
              {character.gender && (
                <Badge variant="outline" className="text-xs">
                  {character.gender === 'male'
                    ? 'Homme'
                    : character.gender === 'female'
                    ? 'Femme'
                    : 'Autre'}
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {character.description}
            </p>
          </div>
        </div>

        {character.visualDescription && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Visuel:</span>{' '}
              {character.visualDescription}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
