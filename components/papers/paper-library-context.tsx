// Paper Library Context
// State management for paper library

'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import type { Paper, PaperMetadata, PaperContent } from '@/lib/supabase/schema';

interface PaperLibraryContextValue {
  // State
  papers: PaperMetadata[];
  selectedPaper: Paper | null;
  selectedPaperContent: PaperContent | null;
  isLoading: boolean;
  error: string | null;

  // View state
  isLibraryOpen: boolean;
  isChatOpen: boolean;
  chatPaperIds: string[];

  // Actions
  openLibrary: () => void;
  closeLibrary: () => void;
  refreshPapers: () => Promise<void>;
  selectPaper: (paperId: string) => Promise<void>;
  deletePaper: (paperId: string) => Promise<void>;
  toggleFavorite: (paperId: string) => Promise<void>;

  // Chat actions
  openChat: (paperIds: string[]) => void;
  closeChat: () => void;
  addPaperToChat: (paperId: string) => void;
  removePaperFromChat: (paperId: string) => void;
}

const PaperLibraryContext = createContext<PaperLibraryContextValue | null>(null);

export function usePaperLibrary() {
  const context = useContext(PaperLibraryContext);
  if (!context) {
    throw new Error('usePaperLibrary must be used within PaperLibraryProvider');
  }
  return context;
}

export function usePaperLibraryOptional() {
  return useContext(PaperLibraryContext);
}

interface PaperLibraryProviderProps {
  userId: string;
  children: ReactNode;
}

export function PaperLibraryProvider({
  userId,
  children,
}: PaperLibraryProviderProps) {
  // State
  const [papers, setPapers] = useState<PaperMetadata[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [selectedPaperContent, setSelectedPaperContent] = useState<PaperContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPaperIds, setChatPaperIds] = useState<string[]>([]);

  // Fetch papers on mount and when userId changes
  const refreshPapers = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/papers?userId=${userId}&metadata=true`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch papers');
      }

      const { papers: fetchedPapers } = await response.json();
      setPapers(fetchedPapers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load papers');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Load papers on mount
  useEffect(() => {
    refreshPapers();
  }, [refreshPapers]);

  // Poll for processing updates
  useEffect(() => {
    const processingPapers = papers.filter((p) =>
      ['uploading', 'processing', 'extracting_text', 'extracting_figures', 'extracting_tables', 'parsing_references', 'generating_embeddings'].includes(p.processingStatus)
    );

    if (processingPapers.length === 0) return;

    const interval = setInterval(() => {
      refreshPapers();
    }, 3000);

    return () => clearInterval(interval);
  }, [papers, refreshPapers]);

  // Select a paper
  const selectPaper = useCallback(async (paperId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/papers/${paperId}?content=true`);

      if (!response.ok) {
        throw new Error('Failed to fetch paper');
      }

      const { paper, content } = await response.json();
      setSelectedPaper(paper);
      setSelectedPaperContent(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load paper');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete a paper
  const deletePaper = useCallback(
    async (paperId: string) => {
      try {
        const response = await fetch(`/api/papers/${paperId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete paper');
        }

        // Update local state
        setPapers((prev) => prev.filter((p) => p.id !== paperId));

        // Clear selection if deleted paper was selected
        if (selectedPaper?.id === paperId) {
          setSelectedPaper(null);
          setSelectedPaperContent(null);
        }

        // Remove from chat if present
        setChatPaperIds((prev) => prev.filter((id) => id !== paperId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete paper');
        throw err;
      }
    },
    [selectedPaper]
  );

  // Toggle favorite
  const toggleFavorite = useCallback(async (paperId: string) => {
    try {
      const response = await fetch(`/api/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'favorite' }),
      });

      if (!response.ok) {
        throw new Error('Failed to update favorite');
      }

      const { isFavorite } = await response.json();

      // Update local state
      setPapers((prev) =>
        prev.map((p) => (p.id === paperId ? { ...p, isFavorite } : p))
      );

      if (selectedPaper?.id === paperId) {
        setSelectedPaper((prev) => (prev ? { ...prev, isFavorite } : null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  }, [selectedPaper]);

  // Library view
  const openLibrary = useCallback(() => setIsLibraryOpen(true), []);
  const closeLibrary = useCallback(() => setIsLibraryOpen(false), []);

  // Chat
  const openChat = useCallback((paperIds: string[]) => {
    setChatPaperIds(paperIds);
    setIsChatOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  const addPaperToChat = useCallback((paperId: string) => {
    setChatPaperIds((prev) => {
      if (prev.includes(paperId)) return prev;
      return [...prev, paperId];
    });
  }, []);

  const removePaperFromChat = useCallback((paperId: string) => {
    setChatPaperIds((prev) => prev.filter((id) => id !== paperId));
  }, []);

  const value: PaperLibraryContextValue = {
    papers,
    selectedPaper,
    selectedPaperContent,
    isLoading,
    error,
    isLibraryOpen,
    isChatOpen,
    chatPaperIds,
    openLibrary,
    closeLibrary,
    refreshPapers,
    selectPaper,
    deletePaper,
    toggleFavorite,
    openChat,
    closeChat,
    addPaperToChat,
    removePaperFromChat,
  };

  return (
    <PaperLibraryContext.Provider value={value}>
      {children}
    </PaperLibraryContext.Provider>
  );
}
