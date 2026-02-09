'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import {
  Network,
  Map as MapIcon,
  Lightbulb,
  Clock,
  Search,
  Loader2,
  Link2,
  TrendingUp,
  AlertCircle,
  RefreshCcw,
  X,
  Info,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// Import discovery components
import { CitationNetwork, type GraphData, type NetworkNode } from './citation-network';
import { KnowledgeMap, type KnowledgeMapData } from './knowledge-map';
import { RecommendationsPanel, type RecommendationsData } from './recommendations-panel';
import { TimelineView, type TimelineData } from './timeline-view';
import { FrontierDashboard, type FrontierDashboardData } from './frontier-dashboard';
import { LiteratureConnector, type LiteratureConnectionData, type PathPaper } from './literature-connector';

// Import discovery context
import { useDiscoveryContext } from '@/lib/contexts/discovery-context';
import type { DiscoveredPaper } from '@/lib/discovery/types';

/**
 * Paper type for the integrated panel
 */
export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  citationCount?: number;
  doi?: string;
  pmid?: string;
}

interface ResolvedPaperDetail {
  paperId: string;
  title: string;
  authors: string[];
  year: number;
  citationCount: number;
  journal?: string;
  pdfUrl?: string;
  openAccess?: boolean;
}

interface IntegratedDiscoveryPanelProps {
  seedPapers?: Paper[];
  onAddToLibrary?: (paper: Paper) => void;
  onAddCitation?: (citation: { paperId: string; title: string; authors: string[] }) => void;
  className?: string;
}

/**
 * Integrated Discovery Panel
 *
 * Combines all discovery features into a single cohesive interface:
 * - Citation Network: Build and explore citation graphs
 * - Knowledge Map: Visualize research landscapes
 * - Recommendations: Get personalized paper suggestions
 * - Timeline: View research evolution over time
 * - Frontiers: Discover emerging topics and gaps
 * - Connector: Find paths between papers
 *
 * Uses DiscoveryContext for state management
 */
export function IntegratedDiscoveryPanel({
  seedPapers = [],
  onAddToLibrary,
  onAddCitation,
  className,
}: IntegratedDiscoveryPanelProps) {
  const {
    activeView,
    setActiveView,
    networkData,
    mapData,
    recommendations,
    timelineData,
    frontiersData,
    connectionPath,
    getCurrentViewLoading,
    getCurrentViewError,
    buildNetwork,
    generateMap,
    getRecommendations,
    findConnection,
    getTimeline,
    detectFrontiers,
    clearError,
  } = useDiscoveryContext();

  // Local state for input controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [paperDetailsById, setPaperDetailsById] = useState<Record<string, ResolvedPaperDetail>>({});

  // Get current view's loading and error state
  const isLoading = getCurrentViewLoading();
  const error = getCurrentViewError();

  // Prime local detail cache from seed/library papers
  useEffect(() => {
    if (seedPapers.length === 0) return;

    setPaperDetailsById((prev) => {
      const next = { ...prev };
      for (const paper of seedPapers) {
        next[paper.id] = {
          paperId: paper.id,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          citationCount: paper.citationCount || 0,
          openAccess: true,
        };
      }
      return next;
    });
  }, [seedPapers]);

  const resolvePaperDetail = useCallback(
    (paperId: string): ResolvedPaperDetail => {
      const existing = paperDetailsById[paperId];
      if (existing) return existing;

      return {
        paperId,
        title: `Paper ${paperId.slice(0, 8)}`,
        authors: ['Unknown'],
        year: new Date().getFullYear(),
        citationCount: 0,
      };
    },
    [paperDetailsById]
  );

  const requiredPaperIds = useMemo(() => {
    const ids = new Set<string>();

    networkData?.papers.forEach((paper) => ids.add(paper.paperId));
    mapData?.papers.forEach((paper) => ids.add(paper.paperId));
    timelineData?.papers.forEach((paper) => ids.add(paper.paperId));

    if (recommendations) {
      recommendations.hotNow.forEach((rec) => ids.add(rec.paperId));
      recommendations.missingFromReview.forEach((rec) => ids.add(rec.paperId));
      recommendations.newThisWeek.forEach((rec) => ids.add(rec.paperId));
      recommendations.sameAuthors.forEach((rec) => ids.add(rec.paperId));
      recommendations.extendingWork.forEach((rec) => ids.add(rec.paperId));
    }

    if (connectionPath) {
      ids.add(connectionPath.sourcePaperId);
      ids.add(connectionPath.targetPaperId);
      connectionPath.paths.forEach((path) => {
        path.papers.forEach((paperId) => ids.add(paperId));
      });
    }

    return Array.from(ids);
  }, [networkData, mapData, timelineData, recommendations, connectionPath]);

  useEffect(() => {
    const missingIds = requiredPaperIds.filter((id) => !paperDetailsById[id]).slice(0, 50);
    if (missingIds.length === 0) return;

    let cancelled = false;

    const fetchMissingPaperDetails = async () => {
      try {
        const response = await fetch('/api/discovery/papers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paperIds: missingIds }),
        });

        if (!response.ok) return;

        const payload = await response.json();
        if (cancelled || !payload?.papers) return;

        setPaperDetailsById((prev) => ({ ...prev, ...payload.papers }));
      } catch (metadataError) {
        console.error('Failed to resolve discovery paper metadata:', metadataError);
      }
    };

    fetchMissingPaperDetails();

    return () => {
      cancelled = true;
    };
  }, [requiredPaperIds, paperDetailsById]);

  /**
   * Handle search/discover action
   */
  const handleDiscover = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;

    try {
      clearError(activeView);

      switch (activeView) {
        case 'network':
          // Use selected papers or seed papers for network
          const paperIds = selectedPaperIds.length > 0
            ? selectedPaperIds
            : seedPapers.slice(0, 5).map(p => p.id);

          if (paperIds.length === 0) {
            throw new Error('Please select papers or add papers to your library first');
          }

          await buildNetwork(paperIds);
          break;

        case 'map':
          await generateMap(query);
          break;

        case 'recommendations':
          // Use user's library papers
          const libraryIds = seedPapers.map(p => p.id);
          if (libraryIds.length === 0) {
            throw new Error('Please add papers to your library first to get recommendations');
          }
          await getRecommendations(libraryIds);
          break;

        case 'timeline':
          await getTimeline(query);
          break;

        case 'frontiers':
          await detectFrontiers(query);
          break;

        case 'connector':
          // Connector has its own UI for selecting papers
          break;
      }
    } catch (error) {
      console.error('Discovery error:', error);
    }
  }, [
    searchQuery,
    activeView,
    selectedPaperIds,
    seedPapers,
    buildNetwork,
    generateMap,
    getRecommendations,
    getTimeline,
    detectFrontiers,
    clearError,
  ]);

  /**
   * Handle view refresh
   */
  const handleRefresh = useCallback(() => {
    handleDiscover();
  }, [handleDiscover]);

  /**
   * Keyboard shortcuts handler
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Tab navigation: 1-6 keys for quick tab switching
      if (e.key >= '1' && e.key <= '6' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const tabs = ['network', 'map', 'recommendations', 'timeline', 'frontiers', 'connector'];
        const index = parseInt(e.key) - 1;
        if (index < tabs.length) {
          setActiveView(tabs[index] as any);
        }
      }

      // Arrow keys for navigation
      if (e.key === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const tabs = ['network', 'map', 'recommendations', 'timeline', 'frontiers', 'connector'];
        const currentIndex = tabs.indexOf(activeView);
        if (currentIndex > 0) {
          setActiveView(tabs[currentIndex - 1] as any);
        }
      }

      if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const tabs = ['network', 'map', 'recommendations', 'timeline', 'frontiers', 'connector'];
        const currentIndex = tabs.indexOf(activeView);
        if (currentIndex < tabs.length - 1) {
          setActiveView(tabs[currentIndex + 1] as any);
        }
      }

      // R key to refresh
      if (e.key === 'r' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleRefresh();
      }

      // Escape to clear error
      if (e.key === 'Escape' && error) {
        e.preventDefault();
        clearError(activeView);
      }

      // / or Ctrl+K to focus search
      if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && activeView !== 'connector') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, error, clearError, handleRefresh, setActiveView]);

  /**
   * Handle key press in search input
   */
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        handleDiscover();
      }
    },
    [handleDiscover, isLoading]
  );

  /**
   * Get placeholder text for search input based on active view
   */
  const getSearchPlaceholder = useCallback(() => {
    switch (activeView) {
      case 'network':
        return 'Search papers or use your library papers...';
      case 'map':
        return 'Enter research topic to map (e.g., "deep learning in healthcare")';
      case 'recommendations':
        return 'Get recommendations based on your library';
      case 'timeline':
        return 'Enter research topic for timeline (e.g., "CRISPR gene editing")';
      case 'frontiers':
        return 'Enter research domain to analyze (e.g., "artificial intelligence")';
      case 'connector':
        return 'Select two papers to find connections';
      default:
        return 'Search papers, topics, or enter queries...';
    }
  }, [activeView]);

  /**
   * Transform network data for CitationNetwork component
   */
  const graphData: GraphData | undefined = useMemo(() => {
    if (!networkData) return undefined;

    const nodes: NetworkNode[] = networkData.papers.map(paper => ({
      id: paper.paperId,
      paperId: paper.paperId,
      title: resolvePaperDetail(paper.paperId).title,
      authors: resolvePaperDetail(paper.paperId).authors,
      year: resolvePaperDetail(paper.paperId).year,
      citationCount: resolvePaperDetail(paper.paperId).citationCount,
      isSeed: networkData.seedPaperIds.includes(paper.paperId),
      x: paper.x,
      y: paper.y,
    }));

    return {
      nodes,
      edges: networkData.edges,
    };
  }, [networkData, resolvePaperDetail]);

  /**
   * Transform map data for KnowledgeMap component
   */
  const knowledgeMapData: KnowledgeMapData | undefined = useMemo(() => {
    if (!mapData) return undefined;

    return {
      clusters: mapData.clusters.map(cluster => ({
        id: cluster.id,
        label: cluster.label,
        description: cluster.description,
        keywords: cluster.keywords,
        paperCount: cluster.paperCount,
        avgCitations: cluster.avgCitations,
        growth: cluster.growth,
        x: cluster.x,
        y: cluster.y,
        radius: cluster.radius,
        color: cluster.color,
      })),
      papers: mapData.papers.map(paper => ({
        paperId: paper.paperId,
        clusterId: paper.clusterId,
        title: resolvePaperDetail(paper.paperId).title,
        year: resolvePaperDetail(paper.paperId).year,
        x: paper.x,
        y: paper.y,
        isUserPaper: paper.isUserPaper,
        isKeyPaper: paper.isKeyPaper,
      })),
      connections: mapData.connections,
    };
  }, [mapData, resolvePaperDetail]);

  /**
   * Transform recommendations for RecommendationsPanel
   */
  const recommendationsData: RecommendationsData | undefined = useMemo(() => {
    if (!recommendations) return undefined;

    const mapType = (type: string) => {
      switch (type) {
        case 'hot':
          return 'hot';
        case 'missing':
          return 'missing';
        case 'new':
          return 'new';
        case 'author':
          return 'author';
        case 'extending':
          return 'extending';
        default:
          return 'trending';
      }
    };

    const transform = (items: typeof recommendations.hotNow) =>
      items.map((item) => {
        const detail = resolvePaperDetail(item.paperId);
        return {
          paperId: item.paperId,
          title: detail.title,
          authors: detail.authors,
          year: detail.year,
          journal: detail.journal,
          citationCount: detail.citationCount,
          score: item.score,
          reason: item.reason,
          type: mapType(item.type) as 'hot' | 'missing' | 'new' | 'author' | 'extending' | 'trending',
          relatedPaperIds: item.relatedPaperIds,
          openAccess: detail.openAccess,
          pdfUrl: detail.pdfUrl,
        };
      });

    return {
      hotNow: transform(recommendations.hotNow),
      missingFromReview: transform(recommendations.missingFromReview),
      newThisWeek: transform(recommendations.newThisWeek),
      sameAuthors: transform(recommendations.sameAuthors),
      extendingWork: transform(recommendations.extendingWork),
      updatedAt: new Date(),
    };
  }, [recommendations, resolvePaperDetail]);

  /**
   * Transform timeline data for TimelineView
   */
  const timelineViewData: TimelineData | undefined = useMemo(() => {
    if (!timelineData) return undefined;

    // Transform TimelinePaper to match the expected format
    const transformedPapers = timelineData.papers.map(paper => ({
      paperId: paper.paperId,
      title: resolvePaperDetail(paper.paperId).title,
      authors: resolvePaperDetail(paper.paperId).authors,
      year: paper.year,
      citationCount: resolvePaperDetail(paper.paperId).citationCount,
      isSeminal: paper.importance > 0.8,
      isSeed: false,
    }));

    // Transform Trend to match the expected format (add endYear)
    const transformedTrends = timelineData.trends.map(trend => ({
      ...trend,
      endYear: new Date().getFullYear(), // Use current year as endYear
    }));

    return {
      papers: transformedPapers,
      milestones: timelineData.milestones,
      trends: transformedTrends,
    };
  }, [timelineData, resolvePaperDetail]);

  /**
   * Transform frontiers data for FrontierDashboard
   */
  const frontierData: FrontierDashboardData | undefined = useMemo(() => {
    if (!frontiersData) return undefined;

    return {
      emergingTopics: frontiersData.frontiers,
      researchGaps: frontiersData.gaps,
      futureDirections: frontiersData.opportunities,
      trendingPapers: [], // Would need to be computed from emerging topics
      metrics: frontiersData.metrics,
      generatedAt: frontiersData.generatedAt instanceof Date
        ? frontiersData.generatedAt
        : new Date((frontiersData.generatedAt as { toDate?: () => Date })?.toDate?.() || Date.now()),
    };
  }, [frontiersData]);

  /**
   * Transform connection data for LiteratureConnector
   */
  const connectionData: LiteratureConnectionData | undefined = useMemo(() => {
    if (!connectionPath) return undefined;

    const mapPathPaper = (paperId: string): PathPaper => {
      const detail = resolvePaperDetail(paperId);
      return {
        paperId,
        title: detail.title,
        authors: detail.authors,
        year: detail.year,
        citationCount: detail.citationCount,
      };
    };

    const mappedPaths = connectionPath.paths.map((path, index) => ({
      id: path.id || `path-${index + 1}`,
      papers: path.papers.map(mapPathPaper),
      edges: path.edges,
      totalWeight: path.totalWeight,
      type: path.type,
    }));

    if (mappedPaths.length === 0) return undefined;

    const sourcePaper = mapPathPaper(connectionPath.sourcePaperId);
    const targetPaper = mapPathPaper(connectionPath.targetPaperId);
    const shortestPath = mappedPaths.find((path) => path.id === connectionPath.shortestPath.id) || mappedPaths[0];

    return {
      sourcePaper,
      targetPaper,
      paths: mappedPaths,
      shortestPath,
    };
  }, [connectionPath, resolvePaperDetail]);

  /**
   * Handle paper connection request
   */
  const handleConnect = useCallback(
    async (sourceId: string, targetId: string) => {
      try {
        clearError('connector');
        await findConnection(sourceId, targetId);
      } catch (error) {
        console.error('Connection error:', error);
      }
    },
    [findConnection, clearError]
  );

  /**
   * Get available papers for connector (from seed papers)
   */
  const availablePapersForConnector: PathPaper[] = useMemo(() => {
    const byId = new Map<string, PathPaper>();

    for (const paper of seedPapers) {
      byId.set(paper.id, {
        paperId: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        citationCount: paper.citationCount || 0,
      });
    }

    for (const [paperId, detail] of Object.entries(paperDetailsById)) {
      if (!byId.has(paperId)) {
        byId.set(paperId, {
          paperId,
          title: detail.title,
          authors: detail.authors,
          year: detail.year,
          citationCount: detail.citationCount,
        });
      }
    }

    return Array.from(byId.values());
  }, [seedPapers, paperDetailsById]);

  return (
    <div className={cn('h-full flex flex-col bg-background rounded-lg border', className)}>
      {/* Header */}
      <div className="p-3 md:p-4 border-b space-y-3">
        <div className="flex items-start md:items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-base md:text-lg font-semibold truncate">Discovery</h2>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Explore research landscapes, connections, and emerging topics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <KeyboardShortcutsHint />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 md:mr-2 animate-spin" />
                  <span className="hidden md:inline">Loading...</span>
                </>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">Refresh</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Search/Action Bar */}
        {activeView !== 'connector' && (
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={getSearchPlaceholder()}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="pl-9"
              />
            </div>
            <Button
              onClick={handleDiscover}
              disabled={(!searchQuery.trim() && activeView !== 'recommendations') || isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Discover'
              )}
            </Button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearError(activeView)}
                className="h-auto p-1"
              >
                <X className="h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as any)}
        className="flex-1 flex flex-col"
      >
        <div className="px-2 md:px-4 pt-2 border-b overflow-x-auto">
          <TabsList className="inline-flex w-auto md:grid md:w-full md:grid-cols-6 h-auto">
            <TabsTrigger value="network" className="text-xs whitespace-nowrap px-2 md:px-3">
              <Network className="w-3 h-3 md:mr-1" />
              <span className="hidden sm:inline ml-1">Network</span>
              <span className="sm:hidden ml-1">1</span>
            </TabsTrigger>
            <TabsTrigger value="map" className="text-xs whitespace-nowrap px-2 md:px-3">
              <MapIcon className="w-3 h-3 md:mr-1" />
              <span className="hidden sm:inline ml-1">Map</span>
              <span className="sm:hidden ml-1">2</span>
            </TabsTrigger>
            <TabsTrigger value="recommendations" className="text-xs whitespace-nowrap px-2 md:px-3">
              <Lightbulb className="w-3 h-3 md:mr-1" />
              <span className="hidden sm:inline ml-1">Recommend</span>
              <span className="sm:hidden ml-1">3</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs whitespace-nowrap px-2 md:px-3">
              <Clock className="w-3 h-3 md:mr-1" />
              <span className="hidden sm:inline ml-1">Timeline</span>
              <span className="sm:hidden ml-1">4</span>
            </TabsTrigger>
            <TabsTrigger value="frontiers" className="text-xs whitespace-nowrap px-2 md:px-3">
              <TrendingUp className="w-3 h-3 md:mr-1" />
              <span className="hidden sm:inline ml-1">Frontiers</span>
              <span className="sm:hidden ml-1">5</span>
            </TabsTrigger>
            <TabsTrigger value="connector" className="text-xs whitespace-nowrap px-2 md:px-3">
              <Link2 className="w-3 h-3 md:mr-1" />
              <span className="hidden sm:inline ml-1">Connect</span>
              <span className="sm:hidden ml-1">6</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          {/* Citation Network */}
          <TabsContent value="network" className="h-full m-0 p-4">
            {isLoading ? (
              <LoadingState message="Building citation network..." />
            ) : graphData ? (
              <CitationNetwork data={graphData} />
            ) : (
              <EmptyState
                icon={Network}
                message="No network data available"
                description="Select papers from your library or search for papers to generate a citation network"
              />
            )}
          </TabsContent>

          {/* Knowledge Map */}
          <TabsContent value="map" className="h-full m-0 p-4">
            {isLoading ? (
              <LoadingState message="Generating knowledge map..." />
            ) : knowledgeMapData ? (
              <KnowledgeMap data={knowledgeMapData} />
            ) : (
              <EmptyState
                icon={MapIcon}
                message="No map data available"
                description="Enter a research topic to visualize the research landscape and identify clusters"
              />
            )}
          </TabsContent>

          {/* Recommendations */}
          <TabsContent value="recommendations" className="h-full m-0 p-0">
            {isLoading ? (
              <div className="p-4 h-full">
                <LoadingState message="Finding recommendations..." />
              </div>
            ) : recommendationsData ? (
              <RecommendationsPanel
                data={recommendationsData}
                onRefresh={handleRefresh}
                isRefreshing={isLoading}
              />
            ) : (
              <div className="p-4 h-full">
                <EmptyState
                  icon={Lightbulb}
                  message="No recommendations available"
                  description="Add papers to your library to receive personalized paper recommendations"
                />
              </div>
            )}
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline" className="h-full m-0 p-4">
            {isLoading ? (
              <LoadingState message="Building timeline..." />
            ) : timelineViewData ? (
              <TimelineView data={timelineViewData} />
            ) : (
              <EmptyState
                icon={Clock}
                message="No timeline data available"
                description="Enter a research topic to see its evolution over time with key milestones and trends"
              />
            )}
          </TabsContent>

          {/* Research Frontiers */}
          <TabsContent value="frontiers" className="h-full m-0 p-0">
            {isLoading ? (
              <div className="p-4 h-full">
                <LoadingState message="Analyzing research frontiers..." />
              </div>
            ) : frontierData ? (
              <FrontierDashboard
                data={frontierData}
                onRefresh={handleRefresh}
                isRefreshing={isLoading}
              />
            ) : (
              <div className="p-4 h-full">
                <EmptyState
                  icon={TrendingUp}
                  message="No frontier data available"
                  description="Enter a research domain to discover emerging topics, gaps, and opportunities"
                />
              </div>
            )}
          </TabsContent>

          {/* Literature Connector */}
          <TabsContent value="connector" className="h-full m-0 p-4">
            <LiteratureConnector
              availablePapers={availablePapersForConnector}
              connectionData={connectionData}
              onConnect={handleConnect}
              onAddIntermediatesToLibrary={(paperIds) => {
                if (!onAddToLibrary) return;
                for (const paperId of paperIds) {
                  const detail = resolvePaperDetail(paperId);
                  onAddToLibrary({
                    id: paperId,
                    title: detail.title,
                    authors: detail.authors,
                    year: detail.year,
                    citationCount: detail.citationCount,
                  });
                }
              }}
              onPaperClick={(paperId) => {
                if (!onAddCitation) return;
                const detail = resolvePaperDetail(paperId);
                onAddCitation({
                  paperId,
                  title: detail.title,
                  authors: detail.authors,
                });
              }}
              isLoading={isLoading}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/**
 * Enhanced loading state component with progress
 */
function LoadingState({
  message,
  progress,
  showProgress = false
}: {
  message: string;
  progress?: number;
  showProgress?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
      <p className="text-sm font-medium text-foreground mb-2">{message}</p>
      {showProgress && progress !== undefined && (
        <div className="w-full max-w-sm">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center mt-2">
            {Math.round(progress)}% complete
          </p>
        </div>
      )}
      <div className="mt-6 text-xs text-muted-foreground space-y-1 text-center">
        <p>This may take a moment...</p>
        <p className="flex items-center justify-center gap-2">
          <kbd className="px-2 py-1 text-xs bg-muted rounded">Esc</kbd>
          <span>to cancel</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState({
  icon: Icon,
  message,
  description,
  suggestions,
}: {
  icon: React.ElementType;
  message: string;
  description: string;
  suggestions?: string[];
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <Icon className="w-12 h-12 text-muted-foreground mb-3" />
      <p className="text-sm font-medium mb-1">{message}</p>
      <p className="text-xs text-muted-foreground max-w-sm mb-4">{description}</p>

      {suggestions && suggestions.length > 0 && (
        <div className="mt-4 p-4 bg-muted/50 rounded-lg max-w-md">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-medium">Suggestions:</p>
          </div>
          <ul className="text-xs text-left space-y-1 text-muted-foreground">
            {suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Enhanced error state with retry
 */
function ErrorState({
  error,
  onRetry,
  onDismiss,
}: {
  error: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="w-full max-w-md">
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="mt-2">{error}</AlertDescription>
        </Alert>

        <div className="flex gap-2 justify-center">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" size="sm">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button onClick={onDismiss} variant="ghost" size="sm">
              Dismiss
            </Button>
          )}
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-medium">Troubleshooting:</p>
          </div>
          <ul className="text-xs text-left space-y-1 text-muted-foreground">
            <li>• Check your internet connection</li>
            <li>• Try refreshing the page</li>
            <li>• Verify your search parameters</li>
            <li>• Try a different discovery mode</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Keyboard shortcuts helper
 */
function KeyboardShortcutsHint() {
  return (
    <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">1-6</kbd>
        <span>Switch tabs</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">⌘/Ctrl+R</kbd>
        <span>Refresh</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">/</kbd>
        <span>Search</span>
      </div>
    </div>
  );
}
