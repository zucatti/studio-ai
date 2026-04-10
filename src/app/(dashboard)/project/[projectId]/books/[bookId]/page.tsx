'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BookEditor } from '@/components/books/BookEditor';
import { CreateBookDialog } from '@/components/books/CreateBookDialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, BookOpen, Info } from 'lucide-react';
import { useBooksStore } from '@/store/books-store';
import type { Book } from '@/types/database';

export default function BookEditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const bookId = params.bookId as string;

  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const { updateBook } = useBooksStore();

  useEffect(() => {
    const fetchBook = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/books/${bookId}`);
        if (!res.ok) {
          throw new Error('Book not found');
        }
        const data = await res.json();
        setBook(data.book);
      } catch (err) {
        console.error('Error fetching book:', err);
        setError('Livre non trouvé');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBook();
  }, [projectId, bookId]);

  const handleUpdateBook = async (
    title: string,
    summary?: string,
    wordCountGoal?: number,
    coverImageUrl?: string | null,
    isbn?: string,
    year?: number,
    mentions?: string
  ) => {
    const updated = await updateBook(projectId, bookId, {
      title,
      summary,
      word_count_goal: wordCountGoal,
      cover_image_url: coverImageUrl,
      isbn: isbn || null,
      year: year || null,
      mentions: mentions || null,
    });
    if (updated) {
      setBook(updated);
    }
    setShowEditDialog(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <BookOpen className="w-12 h-12 text-slate-600" />
        <p className="text-slate-400">{error || 'Livre non trouvé'}</p>
        <Button
          variant="ghost"
          onClick={() => router.push(`/project/${projectId}/books`)}
          className="text-amber-400 hover:text-amber-300"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour aux livres
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/project/${projectId}/books`)}
          className="text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Retour
        </Button>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">{book.title}</h1>
            {book.summary && (
              <p className="text-sm text-slate-500 line-clamp-1">{book.summary}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEditDialog(true)}
            className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
            title="Informations du livre"
          >
            <Info className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <BookEditor book={book} projectId={projectId} />

      {/* Edit Book Dialog */}
      <CreateBookDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        editBook={book}
        onSubmit={handleUpdateBook}
      />
    </div>
  );
}
