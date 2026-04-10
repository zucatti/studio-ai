'use client';

import { useState } from 'react';
import { BookCard } from './BookCard';
import { CreateBookDialog } from './CreateBookDialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, BookOpen, Loader2 } from 'lucide-react';
import type { Book } from '@/types/database';

interface BooksListProps {
  books: Book[];
  projectId: string;
  isLoading: boolean;
  onCreateBook: (title: string, summary?: string, wordCountGoal?: number, coverImageUrl?: string | null) => Promise<void>;
  onUpdateBook: (bookId: string, updates: { title?: string; summary?: string; word_count_goal?: number; cover_image_url?: string | null }) => Promise<void>;
  onDeleteBook: (bookId: string) => Promise<void>;
  getTotalWordCount: (bookId: string) => number;
}

export function BooksList({
  books,
  projectId,
  isLoading,
  onCreateBook,
  onUpdateBook,
  onDeleteBook,
  getTotalWordCount,
}: BooksListProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [deletingBook, setDeletingBook] = useState<Book | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleEdit = (book: Book) => {
    setEditingBook(book);
    setShowEditDialog(true);
  };

  const handleDelete = async () => {
    if (!deletingBook) return;
    setIsDeleting(true);
    try {
      await onDeleteBook(deletingBook.id);
    } finally {
      setIsDeleting(false);
      setDeletingBook(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {books.length === 0 ? (
        // Empty state
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-6">
            <BookOpen className="w-10 h-10 text-amber-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Commencez votre livre
          </h3>
          <p className="text-slate-400 text-center max-w-md mb-6">
            Créez votre premier livre et commencez à écrire. Organisez votre contenu
            en chapitres et suivez votre progression.
          </p>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Créer un livre
          </Button>
        </div>
      ) : (
        // Books grid
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              {books.length} livre{books.length > 1 ? 's' : ''}
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nouveau livre
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                projectId={projectId}
                totalWordCount={getTotalWordCount(book.id)}
                onEdit={handleEdit}
                onDelete={(b) => setDeletingBook(b)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <CreateBookDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={async (title, summary, wordCountGoal, coverImageUrl) => {
          await onCreateBook(title, summary, wordCountGoal, coverImageUrl);
          setShowCreateDialog(false);
        }}
      />

      {/* Edit Dialog */}
      <CreateBookDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        editBook={editingBook}
        onSubmit={async (title, summary, wordCountGoal, coverImageUrl) => {
          if (editingBook) {
            await onUpdateBook(editingBook.id, {
              title,
              summary,
              word_count_goal: wordCountGoal,
              cover_image_url: coverImageUrl,
            });
          }
          setShowEditDialog(false);
          setEditingBook(null);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBook} onOpenChange={() => setDeletingBook(null)}>
        <AlertDialogContent className="bg-[#1a2433] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Supprimer le livre
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Êtes-vous sûr de vouloir supprimer &ldquo;{deletingBook?.title}&rdquo; ?
              Cette action supprimera également tous les chapitres et ne peut pas
              être annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Supprimer'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
