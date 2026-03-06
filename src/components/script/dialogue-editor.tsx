'use client';

import { Dialogue } from '@/types/shot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface DialogueEditorProps {
  dialogues: Dialogue[];
  onChange: (dialogues: Dialogue[]) => void;
}

export function DialogueEditor({ dialogues, onChange }: DialogueEditorProps) {
  const addDialogue = () => {
    const newDialogue: Dialogue = {
      id: crypto.randomUUID(),
      characterName: '',
      text: '',
      order: dialogues.length,
    };
    onChange([...dialogues, newDialogue]);
  };

  const updateDialogue = (id: string, data: Partial<Dialogue>) => {
    onChange(
      dialogues.map((d) => (d.id === id ? { ...d, ...data } : d))
    );
  };

  const removeDialogue = (id: string) => {
    onChange(dialogues.filter((d) => d.id !== id));
  };

  return (
    <div className="space-y-3">
      <Label>Dialogues</Label>

      {dialogues.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded-md">
          Aucun dialogue. Ajoutez-en un ci-dessous.
        </div>
      ) : (
        <div className="space-y-3">
          {dialogues.map((dialogue, index) => (
            <Card key={dialogue.id} className="relative">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  <span className="text-xs text-muted-foreground">
                    Dialogue {index + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-auto text-destructive"
                    onClick={() => removeDialogue(dialogue.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Personnage</Label>
                    <Input
                      value={dialogue.characterName}
                      onChange={(e) =>
                        updateDialogue(dialogue.id, {
                          characterName: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="NOM"
                      className="uppercase text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Parenthétique (optionnel)</Label>
                    <Input
                      value={dialogue.parenthetical || ''}
                      onChange={(e) =>
                        updateDialogue(dialogue.id, {
                          parenthetical: e.target.value,
                        })
                      }
                      placeholder="chuchotant"
                      className="text-sm"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Texte</Label>
                  <Textarea
                    value={dialogue.text}
                    onChange={(e) =>
                      updateDialogue(dialogue.id, { text: e.target.value })
                    }
                    placeholder="Ce que dit le personnage..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={addDialogue}>
        <Plus className="w-4 h-4 mr-2" />
        Ajouter un dialogue
      </Button>
    </div>
  );
}
