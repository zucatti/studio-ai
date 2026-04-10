import { create } from 'zustand';
import type { Book, Chapter, BookStatus } from '@/types/database';

interface BooksStore {
  // Data
  books: Book[];
  chapters: Chapter[];
  currentBookId: string | null;
  currentChapterId: string | null;
  isLoading: boolean;

  // Actions - Navigation
  setCurrentBook: (bookId: string | null) => void;
  setCurrentChapter: (chapterId: string | null) => void;

  // Actions - Books CRUD
  fetchBooks: (projectId: string) => Promise<void>;
  createBook: (projectId: string, title: string, options?: {
    summary?: string;
    wordCountGoal?: number;
    coverImageUrl?: string | null;
  }) => Promise<Book | null>;
  updateBook: (projectId: string, bookId: string, updates: Partial<{
    title: string;
    summary: string | null;
    cover_image_url: string | null;
    word_count_goal: number;
    status: BookStatus;
    isbn: string | null;
    year: number | null;
    mentions: string | null;
  }>) => Promise<Book | null>;
  deleteBook: (projectId: string, bookId: string) => Promise<void>;

  // Actions - Chapters CRUD
  fetchChapters: (projectId: string, bookId: string) => Promise<void>;
  createChapter: (projectId: string, bookId: string, title?: string) => Promise<Chapter | null>;
  updateChapter: (projectId: string, bookId: string, chapterId: string, updates: Partial<{
    title: string;
    content: string;
    word_count: number;
  }>) => Promise<void>;
  deleteChapter: (projectId: string, bookId: string, chapterId: string) => Promise<void>;
  reorderChapters: (projectId: string, bookId: string, orderedIds: string[]) => Promise<void>;

  // Computed - Stats
  getTotalWordCount: () => number;
  getProgress: () => number;
  getCurrentBook: () => Book | null;
  getCurrentChapter: () => Chapter | null;
}

export const useBooksStore = create<BooksStore>((set, get) => ({
  // Initial state
  books: [],
  chapters: [],
  currentBookId: null,
  currentChapterId: null,
  isLoading: false,

  // Navigation
  setCurrentBook: (bookId) => set({ currentBookId: bookId }),
  setCurrentChapter: (chapterId) => set({ currentChapterId: chapterId }),

  // Fetch books for a project
  fetchBooks: async (projectId) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`/api/projects/${projectId}/books`);
      if (res.ok) {
        const data = await res.json();
        set({ books: data.books || [] });
      }
    } catch (error) {
      console.error('Error fetching books:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  // Create a new book
  createBook: async (projectId, title, options) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          summary: options?.summary,
          word_count_goal: options?.wordCountGoal,
          cover_image_url: options?.coverImageUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newBook = data.book;
        set((state) => ({ books: [...state.books, newBook] }));
        return newBook;
      }
    } catch (error) {
      console.error('Error creating book:', error);
    }
    return null;
  },

  // Update a book
  updateBook: async (projectId, bookId, updates) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          books: state.books.map((b) => (b.id === bookId ? data.book : b)),
        }));
        return data.book as Book;
      }
    } catch (error) {
      console.error('Error updating book:', error);
    }
    return null;
  },

  // Delete a book
  deleteBook: async (projectId, bookId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/books/${bookId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        set((state) => ({
          books: state.books.filter((b) => b.id !== bookId),
          chapters: state.chapters.filter((c) => c.book_id !== bookId),
          currentBookId: state.currentBookId === bookId ? null : state.currentBookId,
        }));
      }
    } catch (error) {
      console.error('Error deleting book:', error);
    }
  },

  // Fetch chapters for a book
  fetchChapters: async (projectId, bookId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/books/${bookId}/chapters`);
      if (res.ok) {
        const data = await res.json();
        set({ chapters: data.chapters || [] });
      }
    } catch (error) {
      console.error('Error fetching chapters:', error);
    }
  },

  // Create a new chapter
  createChapter: async (projectId, bookId, title) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/books/${bookId}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'Nouveau chapitre' }),
      });
      if (res.ok) {
        const data = await res.json();
        const newChapter = data.chapter;
        set((state) => ({ chapters: [...state.chapters, newChapter] }));
        return newChapter;
      }
    } catch (error) {
      console.error('Error creating chapter:', error);
    }
    return null;
  },

  // Update a chapter
  updateChapter: async (projectId, bookId, chapterId, updates) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/books/${bookId}/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          chapters: state.chapters.map((c) => (c.id === chapterId ? data.chapter : c)),
        }));
      }
    } catch (error) {
      console.error('Error updating chapter:', error);
    }
  },

  // Delete a chapter
  deleteChapter: async (projectId, bookId, chapterId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/books/${bookId}/chapters/${chapterId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        set((state) => ({
          chapters: state.chapters.filter((c) => c.id !== chapterId),
          currentChapterId: state.currentChapterId === chapterId ? null : state.currentChapterId,
        }));
      }
    } catch (error) {
      console.error('Error deleting chapter:', error);
    }
  },

  // Reorder chapters
  reorderChapters: async (projectId, bookId, orderedIds) => {
    // Optimistic update
    const reorderedChapters = orderedIds
      .map((id, index) => {
        const chapter = get().chapters.find((c) => c.id === id);
        return chapter ? { ...chapter, sort_order: index } : null;
      })
      .filter((c): c is Chapter => c !== null);
    set({ chapters: reorderedChapters });

    try {
      await fetch(`/api/projects/${projectId}/books/${bookId}/chapters/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (error) {
      console.error('Error reordering chapters:', error);
      // Refetch on error
      get().fetchChapters(projectId, bookId);
    }
  },

  // Get total word count across all chapters
  getTotalWordCount: () => {
    return get().chapters.reduce((sum, c) => sum + (c.word_count || 0), 0);
  },

  // Get progress as percentage (0-100)
  getProgress: () => {
    const book = get().getCurrentBook();
    if (!book || !book.word_count_goal) return 0;
    const total = get().getTotalWordCount();
    return Math.min(100, Math.round((total / book.word_count_goal) * 100));
  },

  // Get current book
  getCurrentBook: () => {
    const { books, currentBookId } = get();
    return books.find((b) => b.id === currentBookId) || null;
  },

  // Get current chapter
  getCurrentChapter: () => {
    const { chapters, currentChapterId } = get();
    return chapters.find((c) => c.id === currentChapterId) || null;
  },
}));
