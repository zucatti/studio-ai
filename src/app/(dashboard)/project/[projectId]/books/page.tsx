'use client';

import { useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { BooksList } from '@/components/books/BooksList';
import { ProjectBibleButton } from '@/components/bible/ProjectBible';
import { useBooksStore } from '@/store/books-store';
import { useProject } from '@/hooks/use-project';

export default function BooksPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project } = useProject();

  const {
    books,
    chapters,
    isLoading,
    fetchBooks,
    createBook,
    updateBook,
    deleteBook,
    fetchChapters,
  } = useBooksStore();

  useEffect(() => {
    fetchBooks(projectId);
  }, [projectId, fetchBooks]);

  // Fetch chapters for each book to calculate word counts
  useEffect(() => {
    books.forEach((book) => {
      fetchChapters(projectId, book.id);
    });
  }, [books, projectId, fetchChapters]);

  const handleCreateBook = async (
    title: string,
    summary?: string,
    wordCountGoal?: number,
    coverImageUrl?: string | null
  ) => {
    await createBook(projectId, title, {
      summary,
      wordCountGoal,
      coverImageUrl,
    });
  };

  const handleUpdateBook = async (
    bookId: string,
    updates: { title?: string; summary?: string; word_count_goal?: number; cover_image_url?: string | null }
  ) => {
    await updateBook(projectId, bookId, {
      title: updates.title,
      summary: updates.summary || null,
      word_count_goal: updates.word_count_goal,
      cover_image_url: updates.cover_image_url,
    });
  };

  const handleDeleteBook = async (bookId: string) => {
    await deleteBook(projectId, bookId);
  };

  // Get total word count for a specific book
  const getTotalWordCount = useCallback(
    (bookId: string) => {
      return chapters
        .filter((c) => c.book_id === bookId)
        .reduce((sum, c) => sum + (c.word_count || 0), 0);
    },
    [chapters]
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header with Bible button */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mes Livres</h1>
          <p className="text-slate-500 text-sm mt-1">
            Écrivez et organisez vos romans et nouvelles
          </p>
        </div>
        <ProjectBibleButton projectId={projectId} />
      </div>

      {/* Books list */}
      <BooksList
        books={books}
        projectId={projectId}
        isLoading={isLoading}
        onCreateBook={handleCreateBook}
        onUpdateBook={handleUpdateBook}
        onDeleteBook={handleDeleteBook}
        getTotalWordCount={getTotalWordCount}
      />
    </div>
  );
}
