'use client';

import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import type { FeatureTab } from './feature-tabs';
import { ChatInterface } from '@/components/chat/chat-interface';
import { CommentsSidebar } from '@/components/collaboration/comments-sidebar';
import type { DisciplineId } from '@/lib/supabase/schema';
import { usePaperLibraryOptional } from '@/components/papers';

// Lazy load the new feature panels for better performance
const ResearchPanelCompact = lazy(() =>
  import('@/components/research/research-panel-compact').then((mod) => ({
    default: mod.ResearchPanelCompact,
  }))
);

const PapersPanelCompact = lazy(() =>
  import('@/components/papers/papers-panel-compact').then((mod) => ({
    default: mod.PapersPanelCompact,
  }))
);

const IntegratedDiscoveryPanel = lazy(() =>
  import('@/components/discovery/integrated-discovery-panel').then((mod) => ({
    default: mod.IntegratedDiscoveryPanel,
  }))
);

interface TabContentProps {
  activeTab: FeatureTab;
  // Chat props
  documentId?: string;
  onInsertToEditor?: (content: string) => void;
  initialDiscipline?: DisciplineId;
  onDisciplineChange?: (discipline: DisciplineId) => void;
  // Common props
  documentContent: string;
  userId?: string;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export function TabContent({
  activeTab,
  documentId,
  onInsertToEditor,
  initialDiscipline,
  onDisciplineChange,
  documentContent,
  userId,
}: TabContentProps) {
  const paperLibrary = usePaperLibraryOptional();
  const seedPapers = (paperLibrary?.papers || []).map((paper) => ({
    id: paper.id,
    title: paper.title,
    authors: (paper.authors || []).map((author) => author.name),
    year: paper.year || new Date().getFullYear(),
    citationCount: 0,
    doi: undefined,
    pmid: undefined,
  }));

  // Render the active panel content
  // We keep all panels mounted but hidden to preserve state
  return (
    <>
      {/* Chat Panel */}
      <div
        role="tabpanel"
        id="panel-chat"
        aria-labelledby="tab-chat"
        hidden={activeTab !== 'chat'}
        className={activeTab === 'chat' ? 'h-full' : 'hidden'}
      >
        <ChatInterface
          documentId={documentId}
          onInsertToEditor={onInsertToEditor}
          initialDiscipline={initialDiscipline}
          onDisciplineChange={onDisciplineChange}
        />
      </div>

      {/* Research Panel */}
      <div
        role="tabpanel"
        id="panel-research"
        aria-labelledby="tab-research"
        hidden={activeTab !== 'research'}
        className={activeTab === 'research' ? 'h-full' : 'hidden'}
      >
        <Suspense fallback={<LoadingFallback />}>
          <ResearchPanelCompact
            documentContent={documentContent}
            onInsertToEditor={onInsertToEditor}
          />
        </Suspense>
      </div>

      {/* Papers Panel */}
      <div
        role="tabpanel"
        id="panel-papers"
        aria-labelledby="tab-papers"
        hidden={activeTab !== 'papers'}
        className={activeTab === 'papers' ? 'h-full' : 'hidden'}
      >
        <Suspense fallback={<LoadingFallback />}>
          {userId ? (
            <PapersPanelCompact
              userId={userId}
              onInsertToEditor={onInsertToEditor}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Sign in to access your paper library
            </div>
          )}
        </Suspense>
      </div>

      {/* Discovery Panel */}
      <div
        role="tabpanel"
        id="panel-discovery"
        aria-labelledby="tab-discovery"
        hidden={activeTab !== 'discovery'}
        className={activeTab === 'discovery' ? 'h-full overflow-auto' : 'hidden'}
      >
        <Suspense fallback={<LoadingFallback />}>
          <IntegratedDiscoveryPanel
            seedPapers={seedPapers}
            onAddCitation={(citation) => {
              if (onInsertToEditor) {
                // Format citation for insertion
                const citationText = `(${citation.authors.slice(0, 3).join(', ')}${citation.authors.length > 3 ? ' et al.' : ''})`;
                onInsertToEditor(citationText);
              }
            }}
            className="h-full"
          />
        </Suspense>
      </div>

    </>
  );
}
