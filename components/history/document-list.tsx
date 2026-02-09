'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/auth';
import { getUserDocuments, deleteDocument } from '@/lib/supabase/documents';
import { DocumentMetadata } from '@/lib/supabase/schema';
import { FileText, Plus, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TemplateSelector } from '@/components/templates/template-selector';
import { DocumentTemplate } from '@/lib/templates/document-templates';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface DocumentListProps {
  currentDocumentId?: string;
  onDocumentSelect: (documentId: string) => void;
  onCreateNew: (template?: DocumentTemplate) => void;
  onDocumentDeleted?: (documentId: string) => void;
  refreshKey?: string | number;
}

export function DocumentList({
  currentDocumentId,
  onDocumentSelect,
  onCreateNew,
  onDocumentDeleted,
  refreshKey,
}: DocumentListProps) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  useEffect(() => {
    async function loadDocuments() {
      if (!user) {
        setDocuments([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const docs = await getUserDocuments(user.uid);
        setDocuments(docs);
      } catch (error) {
        console.error('Failed to load documents:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDocuments();
  }, [user, refreshKey]);

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (deleteConfirm !== docId) {
      setDeleteConfirm(docId);
      return;
    }

    try {
      setDeleting(true);
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setDeleteConfirm(null);
      toast.success('Document deleted');
      onDocumentDeleted?.(docId);
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast.error('Failed to delete document. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 bg-muted animate-pulse rounded"
          />
        ))}
      </div>
    );
  }

  const handleTemplateSelect = (template: DocumentTemplate) => {
    onCreateNew(template);
    setShowTemplateSelector(false);
  };

  return (
    <div className="flex flex-col h-full">
      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
      />

      <div className="p-4 space-y-3 border-b border-border">
        <Button
          onClick={() => setShowTemplateSelector(true)}
          className="w-full"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Document
        </Button>

        {documents.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {documents.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <p>No documents yet.</p>
            <p className="mt-1">Click "New Document" to start writing.</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <p>No documents match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className={`group relative w-full text-left p-3 rounded-lg transition-colors cursor-pointer ${
                  currentDocumentId === doc.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => onDocumentSelect(doc.id)}
              >
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm pr-8">
                      {doc.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs opacity-75 mt-1">
                      <span>{doc.wordCount} words</span>
                      <span>•</span>
                      <span>
                        {formatDistanceToNow(doc.updatedAt, {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(doc.id, e)}
                  disabled={deleting}
                  className={`absolute top-3 right-3 p-1 rounded transition-all ${
                    deleteConfirm === doc.id
                      ? 'bg-destructive text-destructive-foreground opacity-100'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive'
                  } ${currentDocumentId === doc.id ? 'hover:bg-white/20' : ''}`}
                  title={deleteConfirm === doc.id ? 'Click again to confirm' : 'Delete document'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Confirm delete tooltip */}
                {deleteConfirm === doc.id && (
                  <div className="absolute top-10 right-0 bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded shadow-lg z-10 whitespace-nowrap">
                    Click again to delete
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Click outside to cancel delete confirmation */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
