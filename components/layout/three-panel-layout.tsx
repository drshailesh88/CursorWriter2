'use client';

import { useState, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  CheckCircle,
  FileText,
  Edit3,
  MessageSquare,
  MessageCircle,
  Menu,
  X,
  Share2,
  Settings,
  Library,
  Presentation as PresentationIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatInterface } from '@/components/chat/chat-interface';
import { AcademicEditor } from '@/components/editor/academic-editor';
import { DocumentList } from '@/components/history/document-list';
import { ExportButtons } from '@/components/export/export-buttons';
import { AuthButton } from '@/components/auth/auth-button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { KeyboardShortcuts, useKeyboardShortcuts } from '@/components/ui/keyboard-shortcuts';
import { CommentsSidebar } from '@/components/collaboration/comments-sidebar';
import { ShareDialog, useShareDialog } from '@/components/collaboration/share-dialog';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { FeatureTabs } from '@/components/layout/feature-tabs';
import { TabContent } from '@/components/layout/tab-content';
import type { FeatureTab } from '@/components/layout/feature-tabs';
import { useDocument } from '@/lib/hooks/use-document';
import { useAuth } from '@/lib/firebase/auth';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { DocumentTemplate } from '@/lib/templates/document-templates';
import type { DisciplineId } from '@/lib/firebase/schema';
import {
  ResearchProvider,
  ResearchTrigger,
  ResearchPanel,
  CitationExplorerProvider,
  CitationExplorer,
} from '@/components/research';
import {
  PaperLibraryProvider,
  PaperLibrary,
  PaperChat,
  usePaperLibrary,
} from '@/components/papers';
import { GenerationDialog } from '@/components/presentations/generation-dialog';
import { PresentationMode } from '@/components/presentations/presentation-mode';
import { GenerationConfig, Presentation } from '@/lib/presentations/types';

// Hook to detect mobile screen
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

type MobileView = 'documents' | 'editor' | 'chat' | 'comments';
type RightPanelView = 'chat' | 'research' | 'papers' | 'discovery' | 'comments';

// Paper Library trigger button (must be inside PaperLibraryProvider)
function PaperLibraryTrigger() {
  const { openLibrary, papers } = usePaperLibrary();

  return (
    <button
      onClick={openLibrary}
      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
    >
      <Library className="w-4 h-4" />
      Papers
      {papers.length > 0 && (
        <span className="px-1.5 py-0.5 text-xs bg-muted rounded-full">
          {papers.length}
        </span>
      )}
    </button>
  );
}

export function ThreePanelLayout() {
  const { user } = useAuth();

  return (
    <ResearchProvider>
      <CitationExplorerProvider>
        {user ? (
          <PaperLibraryProvider userId={user.uid}>
            <ThreePanelContent />
          </PaperLibraryProvider>
        ) : (
          <ThreePanelContent />
        )}
      </CitationExplorerProvider>
    </ResearchProvider>
  );
}

function ThreePanelContent() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | undefined>();
  const [mobileView, setMobileView] = useState<MobileView>('editor');
  const [rightPanelView, setRightPanelView] = useState<FeatureTab>(() => {
    // Load from localStorage or default to 'chat'
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rightPanelView');
      if (saved && ['chat', 'research', 'papers', 'discovery'].includes(saved)) {
        return saved as FeatureTab;
      }
    }
    return 'chat';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { isOpen: shortcutsOpen, setIsOpen: setShortcutsOpen } = useKeyboardShortcuts();
  const { isOpen: shareDialogOpen, documentId: shareDocumentId, open: openShareDialog, close: closeShareDialog } = useShareDialog();

  // Presentation state
  const [showGenerationDialog, setShowGenerationDialog] = useState(false);
  const [currentPresentation, setCurrentPresentation] = useState<Presentation | null>(null);
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const {
    document,
    content,
    setContent,
    loading,
    saving,
    lastSaved,
    createNew,
    updateTitle,
    updateDiscipline,
    saveNow,
  } = useDocument({
    documentId: currentDocumentId,
    autoSaveInterval: 30000, // 30 seconds
  });

  // Handle discipline change from chat interface
  const handleDisciplineChange = async (newDiscipline: DisciplineId) => {
    try {
      await updateDiscipline(newDiscipline);
    } catch (error) {
      console.error('Failed to update discipline:', error);
    }
  };

  // Handle inserting content from chat into the editor
  const handleInsertToEditor = (chatContent: string) => {
    // Convert markdown to HTML for the editor
    // For now, just append to content with proper paragraph tags
    const htmlContent = chatContent
      .split('\n\n')
      .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');

    const newContent = content
      ? `${content}${htmlContent}`
      : htmlContent;

    setContent(newContent);
    toast.success('Content inserted into editor');
  };

  // Create initial document when user signs in
  useEffect(() => {
    async function createInitialDoc() {
      if (user && !currentDocumentId) {
        try {
          const newDocId = await createNew('Untitled Document');
          setCurrentDocumentId(newDocId);
        } catch (error) {
          console.error('Failed to create initial document:', error);
        }
      }
    }

    createInitialDoc();
  }, [user, currentDocumentId, createNew]);

  // Persist right panel view to localStorage
  useEffect(() => {
    localStorage.setItem('rightPanelView', rightPanelView);
  }, [rightPanelView]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+G or Ctrl+Shift+G - Generate presentation
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        if (user && currentDocumentId) {
          setShowGenerationDialog(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, currentDocumentId]);

  const handleDocumentSelect = (documentId: string) => {
    setCurrentDocumentId(documentId);
    // On mobile, switch to editor after selecting a document
    if (isMobile) {
      setMobileView('editor');
    }
  };

  const handleCreateNew = async (template?: DocumentTemplate) => {
    try {
      const title = template?.name === 'Blank Document' ? 'Untitled Document' : template?.name || 'Untitled Document';
      const newDocId = await createNew(title);
      setCurrentDocumentId(newDocId);

      // If template has content, set it after the document is created
      if (template?.content) {
        // Small delay to ensure document is loaded
        setTimeout(() => {
          setContent(template.content);
        }, 100);
      }

      toast.success('New document created');
      if (isMobile) {
        setMobileView('editor');
      }
    } catch (error) {
      console.error('Failed to create new document:', error);
      toast.error('Failed to create new document');
    }
  };

  const handleDocumentDeleted = async (deletedId: string) => {
    // If the deleted document was the current one, create a new document
    if (deletedId === currentDocumentId) {
      try {
        const newDocId = await createNew('Untitled Document');
        setCurrentDocumentId(newDocId);
      } catch (error) {
        console.error('Failed to create new document after deletion:', error);
        setCurrentDocumentId(undefined);
      }
    }
  };

  // Presentation handlers
  const handleGeneratePresentation = async (config: GenerationConfig) => {
    try {
      const response = await fetch('/api/presentations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          sourceId: currentDocumentId,
          sourceText: content,
          userId: user?.uid,
        }),
      });

      const data = await response.json();

      if (data.success && data.slides) {
        // Create presentation object
        const presentation: Presentation = {
          id: '',  // Will be set on save
          userId: user?.uid || '',
          documentId: currentDocumentId || '',
          title: document?.title || 'Untitled Presentation',
          theme: config.theme,
          slides: data.slides,
          settings: {
            aspectRatio: '16:9',
            showSlideNumbers: true,
            showProgressBar: true,
            autoAdvance: false,
            autoAdvanceInterval: 30,
            transition: 'fade',
            transitionDuration: 300,
          },
          createdAt: new Date() as any,
          updatedAt: new Date() as any,
        };

        setCurrentPresentation(presentation);
        setIsPresentationMode(true);
        setShowGenerationDialog(false);
        toast.success(`Generated ${data.slides.length} slides`);
      } else {
        toast.error(data.error || 'Failed to generate presentation');
      }
    } catch (error) {
      console.error('Presentation generation error:', error);
      toast.error('Failed to generate presentation');
    }
  };

  const handleSavePresentation = async () => {
    if (!currentPresentation || !user?.uid) return;

    try {
      const response = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentPresentation,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setCurrentPresentation({
          ...currentPresentation,
          id: data.presentationId,
        });
        toast.success('Presentation saved');
      }
    } catch (error) {
      console.error('Failed to save presentation:', error);
      toast.error('Failed to save presentation');
    }
  };

  const handleExportPresentation = async (format: 'pptx' | 'pdf') => {
    if (!currentPresentation) return;

    try {
      if (format === 'pptx') {
        // TODO: PPTX export temporarily disabled due to Node.js module compatibility
        // Need to move to server-side API route
        toast.error('PPTX export temporarily unavailable. Use PDF export instead.');
        return;
        // const { exportToPptx } = await import('@/lib/presentations/export/pptx-export');
        // const blob = await exportToPptx(currentPresentation);
        // downloadBlob(blob, `${currentPresentation.title}.pptx`);
      } else {
        const { exportToPdf } = await import('@/lib/presentations/export/pdf-export');
        const blob = await exportToPdf(currentPresentation);
        downloadBlob(blob, `${currentPresentation.title}.pdf`);
      }
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Failed to export as ${format.toUpperCase()}`);
    }
  };

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Keyboard Shortcuts Modal (shared between mobile and desktop)
  const shortcutsModal = (
    <KeyboardShortcuts isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
  );

  const shareDialog = shareDocumentId ? (
    <ShareDialog
      isOpen={shareDialogOpen}
      onClose={closeShareDialog}
      documentId={shareDocumentId}
    />
  ) : null;

  const settingsDialog = (
    <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
  );

  const generationDialog = (
    <GenerationDialog
      open={showGenerationDialog}
      onOpenChange={setShowGenerationDialog}
      documentId={currentDocumentId}
      documentTitle={document?.title}
      documentContent={content}
      onGenerate={handleGeneratePresentation}
    />
  );

  // Presentation mode - render full screen when active
  if (isPresentationMode && currentPresentation) {
    return (
      <PresentationMode
        presentation={currentPresentation}
        onUpdate={setCurrentPresentation}
        onExit={() => {
          setIsPresentationMode(false);
          setCurrentPresentation(null);
        }}
        onSave={handleSavePresentation}
        onExport={handleExportPresentation}
      />
    );
  }

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col">
        {shortcutsModal}
        {shareDialog}
        {settingsDialog}
        {generationDialog}
        {/* Mobile Top Bar */}
        <div className="h-14 border-b border-border flex items-center justify-between px-3 bg-card">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            {document && mobileView === 'editor' && (
              <input
                type="text"
                value={document.title}
                onChange={(e) => updateTitle(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1 text-sm bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary rounded truncate"
                placeholder="Untitled Document"
              />
            )}
            {mobileView === 'documents' && (
              <h1 className="text-lg font-semibold truncate">Documents</h1>
            )}
            {mobileView === 'chat' && (
              <h1 className="text-lg font-semibold truncate">AI Assistant</h1>
            )}
          </div>

          <div className="flex items-center gap-1">
            {user && saving && <Save className="w-4 h-4 animate-pulse text-muted-foreground" />}
            {user && !saving && lastSaved && <CheckCircle className="w-4 h-4 text-green-600" />}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="absolute top-14 left-0 right-0 bg-card border-b border-border z-50 p-4 space-y-3">
            {user && currentDocumentId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  openShareDialog(currentDocumentId);
                  setMobileMenuOpen(false);
                }}
                className="w-full"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share Document
              </Button>
            )}
            {user && currentDocumentId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowGenerationDialog(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full"
              >
                <PresentationIcon className="h-4 w-4 mr-2" />
                Generate Slides
              </Button>
            )}
            {user && (
              <ExportButtons title={document?.title} content={content} />
            )}
            <div className="text-xs text-muted-foreground">
              {lastSaved && `Saved ${formatDistanceToNow(lastSaved, { addSuffix: true })}`}
            </div>
          </div>
        )}

        {/* Mobile Content Area */}
        <div className="flex-1 overflow-hidden">
          {mobileView === 'documents' && (
            <div className="h-full bg-card">
              {user ? (
                <DocumentList
                  currentDocumentId={currentDocumentId}
                  onDocumentSelect={handleDocumentSelect}
                  onCreateNew={handleCreateNew}
                  onDocumentDeleted={handleDocumentDeleted}
                />
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  Sign in to see your documents
                </div>
              )}
            </div>
          )}

          {mobileView === 'editor' && (
            <div className="h-full bg-background">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                </div>
              ) : (
                <AcademicEditor
                  content={content}
                  onChange={setContent}
                  onSave={saveNow}
                  placeholder="Start writing your academic paper..."
                />
              )}
            </div>
          )}

          {mobileView === 'chat' && (
            <div className="h-full bg-card">
              <ChatInterface
                documentId={currentDocumentId}
                onInsertToEditor={handleInsertToEditor}
                initialDiscipline={document?.discipline}
                onDisciplineChange={handleDisciplineChange}
              />
            </div>
          )}

          {mobileView === 'comments' && (
            <div className="h-full bg-card">
              <CommentsSidebar
                documentId={currentDocumentId}
                currentUserId={user?.uid}
              />
            </div>
          )}
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="h-16 border-t border-border bg-card flex items-center justify-around px-2 safe-area-bottom">
          <button
            onClick={() => { setMobileView('documents'); setMobileMenuOpen(false); }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
              mobileView === 'documents' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
            }`}
          >
            <FileText className="h-5 w-5" />
            <span className="text-xs">Docs</span>
          </button>
          <button
            onClick={() => { setMobileView('editor'); setMobileMenuOpen(false); }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
              mobileView === 'editor' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
            }`}
          >
            <Edit3 className="h-5 w-5" />
            <span className="text-xs">Write</span>
          </button>
          <button
            onClick={() => { setMobileView('chat'); setMobileMenuOpen(false); }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
              mobileView === 'chat' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
            }`}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-xs">Chat</span>
          </button>
          <button
            onClick={() => { setMobileView('comments'); setMobileMenuOpen(false); }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
              mobileView === 'comments' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-xs">Comments</span>
          </button>
        </div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="h-screen w-screen bg-background flex flex-col">
      {shortcutsModal}
      {shareDialog}
      {settingsDialog}
      {generationDialog}
      {/* Deep Research Panel (modal overlay) */}
      <ResearchPanel />

      {/* Citation Explorer (modal overlay) */}
      <CitationExplorer />

      {/* Paper Library (modal overlay) */}
      {user && <PaperLibrary userId={user.uid} />}

      {/* Paper Chat (slide-in panel) */}
      {user && <PaperChat userId={user.uid} />}

      {/* Top bar with auth and save status */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-card">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold hidden sm:block">Academic Writing</h1>
          {document && (
            <input
              type="text"
              value={document.title}
              onChange={(e) => updateTitle(e.target.value)}
              className="px-2 py-1 text-sm bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary rounded"
              placeholder="Untitled Document"
            />
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Save status */}
          {user && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {saving ? (
                <>
                  <Save className="w-4 h-4 animate-pulse" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="hidden sm:inline">
                    Saved {formatDistanceToNow(lastSaved, { addSuffix: true })}
                  </span>
                </>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Paper Library trigger */}
            {user && <PaperLibraryTrigger />}
            {/* Deep Research trigger */}
            {user && <ResearchTrigger />}
            {user && currentDocumentId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openShareDialog(currentDocumentId)}
                title="Share document"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            )}
            {user && currentDocumentId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowGenerationDialog(true)}
                title="Generate Presentation (Cmd+Shift+G)"
              >
                <PresentationIcon className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Slides</span>
              </Button>
            )}
            {user && (
              <ExportButtons title={document?.title} content={content} />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="academic-writer-layout">
          {/* LEFT PANEL: History/Documents */}
          <Panel
            defaultSize={20}
            minSize={15}
            maxSize={35}
            collapsible={true}
            onCollapse={() => setIsHistoryCollapsed(true)}
            onExpand={() => setIsHistoryCollapsed(false)}
          >
            <div className="h-full relative bg-card border-r border-border">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-primary-700 dark:text-primary-300">
                  Documents
                </h2>
              </div>

              {user ? (
                <DocumentList
                  currentDocumentId={currentDocumentId}
                  onDocumentSelect={handleDocumentSelect}
                  onCreateNew={handleCreateNew}
                  onDocumentDeleted={handleDocumentDeleted}
                />
              ) : (
                <div className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Sign in to see your documents
                  </p>
                </div>
              )}

              {/* Collapse button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
              >
                {isHistoryCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary-300 transition-colors" />

          {/* CENTER PANEL: Editor */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full bg-background flex flex-col">
              <div className="flex-1 overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                  </div>
                ) : (
                  <AcademicEditor
                    content={content}
                    onChange={setContent}
                    onSave={saveNow}
                    placeholder="Start writing your academic paper... Use the AI chat on the right to search PubMed or generate content."
                  />
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary-300 transition-colors" />

          {/* RIGHT PANEL: Feature Tabs */}
          <Panel
            defaultSize={30}
            minSize={20}
            maxSize={40}
            collapsible={true}
            onCollapse={() => setIsChatCollapsed(true)}
            onExpand={() => setIsChatCollapsed(false)}
          >
            <div className="h-full relative bg-card border-l border-border flex flex-col">
              {/* Feature Tabs Navigation */}
              <FeatureTabs
                activeTab={rightPanelView}
                onTabChange={setRightPanelView}
                badges={{
                  // TODO: Add real badge counts from app state
                  // chat: unreadMessages,
                  // research: activeResearchCount,
                  // papers: paperCount,
                  // discovery: recommendationCount,
                }}
              />

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                <TabContent
                  activeTab={rightPanelView}
                  documentId={currentDocumentId}
                  onInsertToEditor={handleInsertToEditor}
                  initialDiscipline={document?.discipline}
                  onDisciplineChange={handleDisciplineChange}
                  documentContent={content}
                  userId={user?.uid}
                />
              </div>

              {/* Collapse button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 left-2 z-10"
                onClick={() => setIsChatCollapsed(!isChatCollapsed)}
              >
                {isChatCollapsed ? (
                  <PanelRightOpen className="h-4 w-4" />
                ) : (
                  <PanelRightClose className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
