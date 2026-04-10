'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StorageImg } from '@/components/ui/storage-image';
import { Loader2, BookOpen, Target, Upload, X, Image as ImageIcon, Plus, Quote, Pencil, Trash2 } from 'lucide-react';
import type { Book } from '@/types/database';

interface CreateBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBook?: Book | null;
  onSubmit: (title: string, summary?: string, wordCountGoal?: number, coverImageUrl?: string | null, isbn?: string, year?: number, mentions?: string) => Promise<void>;
}

// Parse mentions from JSON string or return empty array
function parseMentions(mentionsStr: string | null | undefined): string[] {
  if (!mentionsStr) return [];
  try {
    const parsed = JSON.parse(mentionsStr);
    return Array.isArray(parsed) ? parsed : [mentionsStr];
  } catch {
    // Legacy: single string mention
    return mentionsStr.trim() ? [mentionsStr] : [];
  }
}

// Serialize mentions array to JSON string
function serializeMentions(mentions: string[]): string {
  const filtered = mentions.filter(m => m.trim());
  if (filtered.length === 0) return '';
  return JSON.stringify(filtered);
}

type TabType = 'information' | 'mentions';

const WORD_COUNT_PRESETS = [
  { label: 'Nouvelle', value: 7500, description: '~30 pages' },
  { label: 'Novella', value: 25000, description: '~100 pages' },
  { label: 'Roman court', value: 50000, description: '~200 pages' },
  { label: 'Roman', value: 80000, description: '~320 pages' },
  { label: 'Roman long', value: 120000, description: '~480 pages' },
];

export function CreateBookDialog({
  open,
  onOpenChange,
  editBook,
  onSubmit,
}: CreateBookDialogProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [wordCountGoal, setWordCountGoal] = useState(50000);
  const [isbn, setIsbn] = useState('');
  const [year, setYear] = useState<number | ''>(new Date().getFullYear());
  const [mentionsList, setMentionsList] = useState<string[]>([]);
  const [editingMentionIndex, setEditingMentionIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('information');
  const [isLoading, setIsLoading] = useState(false);

  // Cover image state
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editBook;

  useEffect(() => {
    if (open && editBook) {
      setTitle(editBook.title);
      setSummary(editBook.summary || '');
      setWordCountGoal(editBook.word_count_goal);
      setIsbn(editBook.isbn || '');
      setYear(editBook.year || new Date().getFullYear());
      setMentionsList(parseMentions(editBook.mentions));
      setEditingMentionIndex(null);
      setExistingCoverUrl(editBook.cover_image_url || null);
      setCoverPreview(editBook.cover_image_url || null);
      setCoverFile(null);
      setActiveTab('information');
    } else if (!open) {
      setTitle('');
      setSummary('');
      setWordCountGoal(50000);
      setIsbn('');
      setYear(new Date().getFullYear());
      setMentionsList([]);
      setEditingMentionIndex(null);
      setActiveTab('information');
      setCoverFile(null);
      setCoverPreview(null);
      setExistingCoverUrl(null);
    }
  }, [open, editBook]);

  const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not create blob'));
            }
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileChange = async (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) {
        alert('L\'image est trop volumineuse. Maximum: 5MB');
        return;
      }

      try {
        // Resize to book cover dimensions (2:3 ratio, max 800x1200)
        const resizedBlob = await resizeImage(file, 800, 1200);
        const resizedFile = new File([resizedBlob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
          type: 'image/jpeg',
        });

        setCoverFile(resizedFile);
        const reader = new FileReader();
        reader.onload = (e) => {
          setCoverPreview(e.target?.result as string);
        };
        reader.readAsDataURL(resizedBlob);
      } catch (error) {
        console.error('Error resizing image:', error);
        setCoverFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          setCoverPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    void handleFileChange(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeCover = () => {
    setCoverPreview(null);
    setCoverFile(null);
    setExistingCoverUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', 'book-covers');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await res.json();
      return data.url;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);

    try {
      let coverImageUrl: string | null | undefined = existingCoverUrl;

      // Upload new cover if selected
      if (coverFile) {
        setIsUploading(true);
        const uploadedUrl = await uploadImage(coverFile);
        setIsUploading(false);

        if (uploadedUrl) {
          coverImageUrl = uploadedUrl;
        }
      } else if (!coverPreview && existingCoverUrl) {
        // Cover was removed
        coverImageUrl = null;
      }

      await onSubmit(
        title.trim(),
        summary.trim() || undefined,
        wordCountGoal,
        coverImageUrl,
        isbn.trim() || undefined,
        year || undefined,
        serializeMentions(mentionsList) || undefined
      );
      setTitle('');
      setSummary('');
      setWordCountGoal(50000);
      setIsbn('');
      setYear(new Date().getFullYear());
      setMentionsList([]);
      setEditingMentionIndex(null);
      setActiveTab('information');
      setCoverFile(null);
      setCoverPreview(null);
      setExistingCoverUrl(null);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  const displayPreview = coverPreview;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] bg-gradient-to-br from-[#1a2e44] to-[#152238] border-white/10">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              {isEditing ? 'Modifier le livre' : 'Nouveau livre'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {isEditing
                ? 'Modifiez les informations de votre livre.'
                : 'Créez un nouveau livre et définissez votre objectif de mots.'}
            </DialogDescription>
          </DialogHeader>

          {/* Button Group Tabs */}
          <div className="flex justify-center mt-4 mb-4">
            <div className="inline-flex rounded-lg bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('information')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'information'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                Informations
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mentions')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'mentions'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Quote className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                Mentions
              </button>
            </div>
          </div>

          {activeTab === 'information' && (
          <div className="grid grid-cols-[160px_1fr] gap-6 py-4">
            {/* Cover Image - Left column */}
            <div className="space-y-2">
              <Label className="text-slate-300">
                Couverture
              </Label>

              {displayPreview ? (
                <div className="relative group">
                  <div className="aspect-[2/3] rounded-lg overflow-hidden border border-white/10 bg-[#0d1829]">
                    <StorageImg
                      src={displayPreview}
                      alt="Couverture"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="bg-black/60 hover:bg-black/80 text-white border-0 h-7 w-7 p-0 backdrop-blur-sm"
                    >
                      <Upload className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); removeCover(); }}
                      className="bg-red-500/60 hover:bg-red-500/80 text-white border-0 h-7 w-7 p-0 backdrop-blur-sm"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`
                    aspect-[2/3] rounded-lg border-2 border-dashed cursor-pointer
                    flex flex-col items-center justify-center gap-2 transition-all duration-200
                    ${isDragging
                      ? 'border-amber-400 bg-amber-500/10'
                      : 'border-white/10 hover:border-amber-400/50 hover:bg-white/5 bg-[#0d1829]/50'
                    }
                  `}
                >
                  <ImageIcon className={`w-8 h-8 ${isDragging ? 'text-amber-400' : 'text-slate-500'}`} />
                  <div className="text-center px-2">
                    <p className={`text-xs ${isDragging ? 'text-amber-400' : 'text-slate-400'}`}>
                      {isDragging ? 'Déposez' : 'Ajouter'}
                    </p>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />
              <p className="text-[10px] text-slate-500 text-center">
                Format 2:3 recommandé
              </p>
            </div>

            {/* Form fields - Right column */}
            <div className="space-y-4">
              {/* Title */}
              <div className="grid gap-2">
                <Label htmlFor="title" className="text-slate-300">
                  Titre du livre
                </Label>
                <Input
                  id="title"
                  placeholder="Mon roman"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:bg-white/10"
                />
              </div>

              {/* Summary */}
              <div className="grid gap-2">
                <Label htmlFor="summary" className="text-slate-300">
                  Synopsis{' '}
                  <span className="text-slate-500 font-normal">(optionnel)</span>
                </Label>
                <Textarea
                  id="summary"
                  placeholder="Une brève description de votre histoire..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:bg-white/10 resize-none"
                />
              </div>

              {/* Word Count Goal */}
              <div className="grid gap-2">
                <Label className="text-slate-300 flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  Objectif de mots
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {WORD_COUNT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setWordCountGoal(preset.value)}
                      className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                        wordCountGoal === preset.value
                          ? 'bg-amber-500 text-white'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={wordCountGoal}
                    onChange={(e) => setWordCountGoal(parseInt(e.target.value) || 0)}
                    min={100}
                    max={1000000}
                    className="w-28 bg-white/5 border-white/10 text-white text-sm focus:border-amber-500/50"
                  />
                  <span className="text-sm text-slate-500">mots</span>
                </div>
              </div>

              {/* Year and ISBN */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="year" className="text-slate-300">
                    Année
                  </Label>
                  <Input
                    id="year"
                    type="number"
                    placeholder={new Date().getFullYear().toString()}
                    value={year}
                    onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : '')}
                    min={1900}
                    max={2100}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:bg-white/10"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="isbn" className="text-slate-300">
                    ISBN{' '}
                    <span className="text-slate-500 font-normal">(optionnel)</span>
                  </Label>
                  <Input
                    id="isbn"
                    placeholder="978-2-1234-5678-9"
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:bg-white/10"
                  />
                </div>
              </div>
            </div>
          </div>
          )}

          {activeTab === 'mentions' && (
            <div className="py-6 min-h-[300px]">
              {mentionsList.length === 0 && editingMentionIndex === null ? (
                <div className="flex flex-col items-center justify-center h-full py-12">
                  <Quote className="w-12 h-12 text-slate-600 mb-4" />
                  <p className="text-slate-400 text-sm mb-4 text-center">
                    Ajoutez des mentions ou dédicaces qui apparaîtront<br />
                    après la page de titre dans l'EPUB/PDF.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMentionsList(['']);
                      setEditingMentionIndex(0);
                    }}
                    className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une mention
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300 flex items-center gap-2">
                      <Quote className="w-4 h-4 text-amber-400" />
                      Mentions / Dédicaces
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMentionsList([...mentionsList, '']);
                        setEditingMentionIndex(mentionsList.length);
                      }}
                      className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 h-7 text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Ajouter
                    </Button>
                  </div>

                  {/* List of mentions */}
                  <div className="space-y-2">
                    {mentionsList.map((mention, index) => (
                      <div key={index}>
                        {editingMentionIndex === index ? (
                          /* Editing mode */
                          <div className="space-y-2">
                            <Textarea
                              autoFocus
                              value={mention}
                              onChange={(e) => {
                                const newList = [...mentionsList];
                                newList[index] = e.target.value;
                                setMentionsList(newList);
                              }}
                              placeholder="À ma famille...&#10;&#10;Merci à tous ceux qui m'ont soutenu..."
                              rows={6}
                              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:bg-white/10 resize-none italic"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  // Remove if empty
                                  if (!mention.trim()) {
                                    const newList = mentionsList.filter((_, i) => i !== index);
                                    setMentionsList(newList);
                                  }
                                  setEditingMentionIndex(null);
                                }}
                                className="text-slate-400 hover:text-white text-xs h-7"
                              >
                                Fermer
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Compact list mode */
                          <div
                            onClick={() => setEditingMentionIndex(index)}
                            className="group flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-amber-500/30 cursor-pointer transition-all"
                          >
                            <Quote className="w-4 h-4 text-amber-400/60 flex-shrink-0" />
                            <p className="flex-1 text-sm text-slate-300 italic truncate">
                              {mention.trim() || 'Mention vide...'}
                            </p>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingMentionIndex(index);
                                }}
                                className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newList = mentionsList.filter((_, i) => i !== index);
                                  setMentionsList(newList);
                                  if (editingMentionIndex === index) {
                                    setEditingMentionIndex(null);
                                  }
                                }}
                                className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-slate-500">
                    Chaque mention apparaîtra sur sa propre page, en italique, alignée à droite.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white hover:bg-white/5"
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || isLoading}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25 min-w-[120px]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isUploading ? 'Upload...' : 'Création...'}
                </>
              ) : isEditing ? (
                'Enregistrer'
              ) : (
                'Créer'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
