// Deep Research - Researcher Agent
// Executes searches and analyzes papers

import {
  BaseAgent,
  RegisterAgent,
  type AgentConfig,
  type AgentContext,
  type AgentResult,
} from './base-agent';
import type {
  DatabaseSource,
  ResearchSource,
  ExtractedContent,
  DataPoint,
  Author,
} from '../types';
import { searchService, type SearchPaper } from '../sources';

/**
 * Researcher Agent Configuration
 */
const RESEARCHER_CONFIG: AgentConfig = {
  type: 'researcher',
  name: 'Research Executor',
  description: 'Executes searches across databases and analyzes papers for relevance',
  systemPrompt: `You are a Research Executor Agent specializing in literature search and analysis.

Your responsibilities:
1. Execute search queries across academic databases
2. Evaluate paper relevance to the research topic
3. Extract key findings, methodology, and data points
4. Identify limitations and gaps in each paper
5. Score papers for inclusion in the synthesis

Evaluation criteria:
- Relevance: How well does the paper address the research question?
- Quality: Study design, sample size, methodology rigor
- Recency: Publication date relative to field evolution
- Impact: Citation count, journal quality
- Contribution: Unique insights or data provided

Always extract specific data points (statistics, metrics, outcomes) when available.`,
  temperature: 0.3,
  maxTokens: 4000,
};

/**
 * Search execution result
 */
interface SearchExecutionResult {
  database: DatabaseSource;
  query: string;
  totalFound: number;
  retrieved: number;
  papers: RawPaper[];
  executedAt: Date;
}

/**
 * Raw paper from search
 */
interface RawPaper {
  id: string;
  source: DatabaseSource;
  externalId: string;
  title: string;
  authors: string[];
  year: number;
  abstract?: string;
  journal?: string;
  doi?: string;
  pmid?: string;
  citationCount?: number;
  url?: string;
}

/**
 * Paper evaluation result
 */
interface PaperEvaluation {
  paperId: string;
  relevanceScore: number;
  qualityScore: number;
  recencyScore: number;
  impactScore: number;
  overallScore: number;
  include: boolean;
  reason: string;
}

/**
 * LLM triage result for a single paper.
 * Replaces static heuristic evaluation with genuine understanding
 * of whether a paper addresses the research question.
 */
interface TriageResult {
  paperId: string;
  verdict: 'RELEVANT' | 'MAYBE' | 'SKIP';
  relevanceScore: number; // 0-1, from LLM assessment
  reason: string;
  keyFindings: string[];
  methodology?: string;
  limitations?: string[];
}

/**
 * Result from researcher agent
 */
interface ResearcherResult {
  searchResults: SearchExecutionResult[];
  evaluations: PaperEvaluation[];
  selectedSources: ResearchSource[];
  totalPapersFound: number;
  totalPapersSelected: number;
  triageStats?: {
    relevant: number;
    maybe: number;
    skipped: number;
    llmTriageUsed: boolean;
  };
}

/**
 * Researcher Agent
 *
 * Executes search queries across multiple databases, evaluates papers
 * for relevance and quality, and extracts key content.
 */
@RegisterAgent('researcher')
export class ResearcherAgent extends BaseAgent {
  private searchResults: SearchExecutionResult[] = [];
  private selectedSources: ResearchSource[] = [];
  private useMockSearch: boolean = false;

  constructor(sessionId: string, useMockSearch: boolean = false) {
    super(RESEARCHER_CONFIG, sessionId);
    this.useMockSearch = useMockSearch;
  }

  /**
   * Enable mock search mode for testing
   */
  setMockMode(enabled: boolean): void {
    this.useMockSearch = enabled;
  }

  /**
   * Execute search using the real search service or mock mode
   */
  private async executeSearch(
    database: DatabaseSource,
    query: string,
    limit: number
  ): Promise<SearchExecutionResult> {
    this.addMessage('assistant', `Searching ${database} with query: ${query.substring(0, 50)}...`);

    // Use mock data for testing
    if (this.useMockSearch) {
      return {
        database,
        query,
        totalFound: 0,
        retrieved: 0,
        papers: [],
        executedAt: new Date(),
      };
    }

    try {
      const results = await searchService.searchSource(
        database,
        query,
        {}, // Use default filters for now
        limit,
        0
      );

      const papers: RawPaper[] = results.papers.map(this.convertSearchPaper);

      return {
        database,
        query,
        totalFound: results.totalResults,
        retrieved: papers.length,
        papers,
        executedAt: results.executedAt,
      };
    } catch (error) {
      this.addMessage('assistant', `Search failed for ${database}: ${error}`);
      return {
        database,
        query,
        totalFound: 0,
        retrieved: 0,
        papers: [],
        executedAt: new Date(),
      };
    }
  }

  /**
   * Convert SearchPaper to RawPaper format
   */
  private convertSearchPaper(paper: SearchPaper): RawPaper {
    return {
      id: paper.id,
      source: paper.source,
      externalId: paper.externalId,
      title: paper.title,
      authors: paper.authors.map(a => a.name),
      year: paper.year,
      abstract: paper.abstract,
      journal: paper.journal,
      doi: paper.doi,
      citationCount: paper.citationCount,
      url: paper.url,
    };
  }

  // --- LLM-Powered Paper Triage ---
  // Replaces static heuristic scoring with genuine semantic understanding.
  // Processes papers in batches of ~12 per LLM call for cost efficiency.
  // One call both evaluates relevance AND extracts key findings.

  /** Cache of triage results keyed by paper ID */
  private triageCache: Map<string, TriageResult> = new Map();

  /**
   * Triage a batch of papers using a single LLM call.
   *
   * Sends title + truncated abstract (300 chars) for each paper,
   * asks the LLM to classify each as RELEVANT/MAYBE/SKIP and extract
   * key findings in one pass. Falls back to heuristic scoring if LLM
   * is unavailable.
   */
  private async triagePapers(
    papers: RawPaper[],
    topic: string,
  ): Promise<TriageResult[]> {
    if (papers.length === 0) return [];

    // Build compact paper summaries for the LLM
    const paperSummaries = papers.map((p, i) => {
      const abstractSnippet = p.abstract
        ? p.abstract.substring(0, 300) + (p.abstract.length > 300 ? '...' : '')
        : 'No abstract available';
      return `[${i}] "${p.title}" (${p.authors.slice(0, 3).join(', ')}${p.authors.length > 3 ? ' et al.' : ''}, ${p.year})${p.journal ? ` — ${p.journal}` : ''}${p.citationCount ? ` [${p.citationCount} citations]` : ''}\nAbstract: ${abstractSnippet}`;
    }).join('\n\n');

    const prompt = `You are a research paper triage system. Given a research topic and a batch of papers, evaluate each paper's relevance and extract key information.

## Research Topic
"${topic}"

## Papers to Evaluate
${paperSummaries}

## Instructions
For EACH paper, provide:
1. verdict: RELEVANT (directly addresses the topic), MAYBE (tangentially related), or SKIP (not relevant)
2. relevance: 0.0-1.0 score
3. reason: One sentence explaining your verdict
4. findings: 1-3 key findings from the abstract (empty array if SKIP)
5. methodology: Brief methodology description if apparent (null if not clear)

Respond with ONLY valid JSON:
{
  "papers": [
    {
      "index": 0,
      "verdict": "RELEVANT",
      "relevance": 0.85,
      "reason": "Directly investigates...",
      "findings": ["Finding 1", "Finding 2"],
      "methodology": "Randomized controlled trial, n=500"
    }
  ]
}`;

    try {
      const { text, tokensUsed } = await this.callLLM(prompt);
      this.addMessage('assistant', `Triage LLM used ${tokensUsed} tokens for ${papers.length} papers`);

      // Parse response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in triage response');

      const parsed = JSON.parse(jsonMatch[0]);
      const results: TriageResult[] = [];

      for (const item of (parsed.papers || [])) {
        const idx = typeof item.index === 'number' ? item.index : results.length;
        if (idx >= papers.length) continue;

        const paper = papers[idx];
        const result: TriageResult = {
          paperId: paper.id,
          verdict: (['RELEVANT', 'MAYBE', 'SKIP'].includes(item.verdict) ? item.verdict : 'MAYBE') as TriageResult['verdict'],
          relevanceScore: typeof item.relevance === 'number' ? Math.min(1, Math.max(0, item.relevance)) : 0.5,
          reason: item.reason || 'No reason provided',
          keyFindings: Array.isArray(item.findings) ? item.findings : [],
          methodology: item.methodology || undefined,
        };

        this.triageCache.set(paper.id, result);
        results.push(result);
      }

      // Fill in any papers the LLM missed with fallback
      for (let i = 0; i < papers.length; i++) {
        if (!results.some(r => r.paperId === papers[i].id)) {
          const fallback = this.heuristicTriage(papers[i], topic);
          this.triageCache.set(papers[i].id, fallback);
          results.push(fallback);
        }
      }

      return results;
    } catch {
      // LLM failed — fall back to heuristic for all papers
      this.addMessage('assistant', 'LLM triage unavailable, using heuristic fallback');
      return papers.map(p => {
        const result = this.heuristicTriage(p, topic);
        this.triageCache.set(p.id, result);
        return result;
      });
    }
  }

  /**
   * Heuristic fallback triage when LLM is unavailable.
   * Uses keyword matching — same logic as before, but packaged as a TriageResult.
   */
  private heuristicTriage(paper: RawPaper, topic: string): TriageResult {
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const text = `${paper.title} ${paper.abstract || ''}`.toLowerCase();

    let matches = 0;
    for (const word of topicWords) {
      if (text.includes(word)) matches++;
    }
    const relevanceScore = topicWords.length > 0 ? Math.min(matches / topicWords.length, 1) : 0.5;

    let verdict: TriageResult['verdict'] = 'SKIP';
    if (relevanceScore >= 0.6) verdict = 'RELEVANT';
    else if (relevanceScore >= 0.3) verdict = 'MAYBE';

    return {
      paperId: paper.id,
      verdict,
      relevanceScore,
      reason: `Keyword match: ${matches}/${topicWords.length} topic terms found`,
      keyFindings: [],
    };
  }

  // --- Evaluation (now enhanced with triage data) ---

  /**
   * Calculate quality score based on available metadata
   */
  private calculateQualityScore(paper: RawPaper): number {
    let score = 0.5;
    if (paper.abstract && paper.abstract.length > 200) score += 0.1;
    if (paper.doi) score += 0.1;
    if (paper.journal) score += 0.1;
    if (paper.authors.length >= 3) score += 0.1;
    if (paper.pmid) score += 0.1;
    return Math.min(score, 1);
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(paper: RawPaper): number {
    const age = new Date().getFullYear() - paper.year;
    if (age <= 2) return 1.0;
    if (age <= 5) return 0.8;
    if (age <= 10) return 0.6;
    if (age <= 15) return 0.4;
    return 0.2;
  }

  /**
   * Calculate impact score based on citations
   */
  private calculateImpactScore(paper: RawPaper): number {
    const citations = paper.citationCount || 0;
    if (citations >= 100) return 1.0;
    if (citations >= 50) return 0.8;
    if (citations >= 20) return 0.6;
    if (citations >= 5) return 0.4;
    return 0.2;
  }

  /**
   * Evaluate a paper for inclusion.
   * Uses LLM triage relevance score when available (replacing keyword matching),
   * combined with metadata-based quality/recency/impact scores.
   */
  private evaluatePaper(paper: RawPaper, topic: string, minScore: number): PaperEvaluation {
    // Use LLM triage relevance if available, otherwise fall back to keyword matching
    const triage = this.triageCache.get(paper.id);
    const relevanceScore = triage ? triage.relevanceScore : this.heuristicTriage(paper, topic).relevanceScore;
    const qualityScore = this.calculateQualityScore(paper);
    const recencyScore = this.calculateRecencyScore(paper);
    const impactScore = this.calculateImpactScore(paper);

    // Weighted overall score — relevance now comes from LLM understanding
    const overallScore =
      relevanceScore * 0.4 +
      qualityScore * 0.25 +
      recencyScore * 0.2 +
      impactScore * 0.15;

    // Papers triaged as SKIP get excluded regardless of score
    const skipped = triage?.verdict === 'SKIP';
    const include = !skipped && overallScore >= minScore;

    const reason = triage
      ? triage.reason
      : (include ? 'Meets inclusion criteria' : 'Below threshold for inclusion');

    return {
      paperId: paper.id,
      relevanceScore,
      qualityScore,
      recencyScore,
      impactScore,
      overallScore,
      include,
      reason,
    };
  }

  /**
   * Extract content from a paper using triage data when available.
   * LLM triage already extracts key findings and methodology from the abstract
   * in the same call that evaluates relevance — no extra cost.
   */
  private extractContent(paper: RawPaper): ExtractedContent {
    const triage = this.triageCache.get(paper.id);
    const dataPoints: DataPoint[] = [];

    // Extract statistics from abstract
    if (paper.abstract) {
      const statMatches = paper.abstract.match(/\d+\.?\d*\s*%/g);
      if (statMatches) {
        statMatches.forEach((match, i) => {
          dataPoints.push({
            type: 'statistic',
            label: `Statistic ${i + 1}`,
            value: match,
            context: 'Extracted from abstract',
          });
        });
      }
    }

    // Use triage findings if available (extracted by LLM during triage)
    if (triage) {
      return {
        keyFindings: triage.keyFindings,
        methodology: triage.methodology,
        limitations: triage.limitations || [],
        conclusions: undefined,
        dataPoints,
      };
    }

    return {
      keyFindings: [],
      methodology: undefined,
      limitations: [],
      conclusions: undefined,
      dataPoints,
    };
  }

  /**
   * Convert raw paper to research source
   */
  private toResearchSource(paper: RawPaper, evaluation: PaperEvaluation): ResearchSource {
    const authors: Author[] = paper.authors.map(name => ({
      name,
      isCorresponding: false,
    }));

    return {
      id: `source-${paper.id}`,
      paperId: paper.id,
      doi: paper.doi,
      pmid: paper.pmid,
      title: paper.title,
      authors,
      year: paper.year,
      journal: paper.journal,
      abstract: paper.abstract,
      database: paper.source,
      url: paper.url,
      openAccess: false, // Would be determined from metadata
      extractedContent: this.extractContent(paper),
      citationType: 'mentioning', // Would be classified later
      citationContext: '',
      citationCount: paper.citationCount,
      influenceScore: evaluation.overallScore,
      processedAt: new Date() as any,
    };
  }

  /**
   * Execute the researcher agent
   */
  async execute(context: AgentContext): Promise<AgentResult<ResearcherResult>> {
    this.updateStatus('working', 'Preparing search execution', 0);

    try {
      const { topic, config } = context.session;

      this.addMessage('system', this.config.systemPrompt);
      this.addMessage('user', `Execute searches for: "${topic}"`);

      // Get search strategies from previous agent
      const strategyOutput = context.previousAgentOutputs.get('search_strategist') as
        { strategy: { queries: Array<{ database: DatabaseSource; query: string }> } } | undefined;

      // Get queries from strategy or create basic ones
      let queries: Array<{ database: DatabaseSource; query: string }>;

      if (strategyOutput?.strategy?.queries) {
        queries = strategyOutput.strategy.queries;
      } else {
        // Create basic queries if no strategy available
        queries = config.sources.map(source => ({
          database: source,
          query: topic,
        }));
      }

      // Execute searches
      this.updateStatus('working', 'Executing database searches', 20);
      this.searchResults = [];

      for (let i = 0; i < queries.length; i++) {
        const { database, query } = queries[i];
        const progress = 20 + (i / queries.length) * 30;
        this.updateStatus('working', `Searching ${database}`, progress);

        const result = await this.executeSearch(database, query, config.maxSources);
        this.searchResults.push(result);
      }

      // Collect all papers
      const allPapers = this.searchResults.flatMap(r => r.papers);
      this.addMessage('assistant', `Found ${allPapers.length} papers across ${queries.length} databases`);

      // LLM Triage — evaluate papers in batches using LLM understanding
      // instead of keyword matching. Each batch handles ~12 papers per LLM call.
      this.updateStatus('working', 'Triaging papers with LLM', 55);
      this.triageCache.clear();
      const BATCH_SIZE = 12;
      let llmTriageUsed = false;

      for (let i = 0; i < allPapers.length; i += BATCH_SIZE) {
        const batch = allPapers.slice(i, i + BATCH_SIZE);
        const progress = 55 + (i / allPapers.length) * 15;
        this.updateStatus('working', `Triaging papers ${i + 1}-${Math.min(i + BATCH_SIZE, allPapers.length)}`, progress);

        const triageResults = await this.triagePapers(batch, topic);
        if (triageResults.some(r => r.keyFindings.length > 0)) {
          llmTriageUsed = true;
        }
      }

      const triageStats = {
        relevant: Array.from(this.triageCache.values()).filter(t => t.verdict === 'RELEVANT').length,
        maybe: Array.from(this.triageCache.values()).filter(t => t.verdict === 'MAYBE').length,
        skipped: Array.from(this.triageCache.values()).filter(t => t.verdict === 'SKIP').length,
        llmTriageUsed,
      };

      this.addMessage('assistant',
        `Triage: ${triageStats.relevant} relevant, ${triageStats.maybe} maybe, ${triageStats.skipped} skipped` +
        (llmTriageUsed ? ' (LLM-powered)' : ' (heuristic fallback)')
      );

      // Evaluate papers (now uses LLM triage relevance scores)
      this.updateStatus('working', 'Evaluating papers', 75);
      const minScore = config.maxSources > 50 ? 0.5 : 0.6;
      const evaluations = allPapers.map(paper => this.evaluatePaper(paper, topic, minScore));

      // Select papers
      this.updateStatus('working', 'Selecting papers', 85);
      const selectedEvaluations = evaluations
        .filter(e => e.include)
        .sort((a, b) => b.overallScore - a.overallScore)
        .slice(0, config.maxSources);

      this.selectedSources = allPapers
        .filter(paper => selectedEvaluations.some(e => e.paperId === paper.id))
        .map(paper => {
          const evaluation = selectedEvaluations.find(e => e.paperId === paper.id)!;
          return this.toResearchSource(paper, evaluation);
        });

      this.updateStatus('complete', 'Research execution complete', 100);

      this.addMessage('assistant',
        `Selected ${this.selectedSources.length} papers from ${allPapers.length} found`
      );

      const result: ResearcherResult = {
        searchResults: this.searchResults,
        evaluations,
        selectedSources: this.selectedSources,
        totalPapersFound: allPapers.length,
        totalPapersSelected: this.selectedSources.length,
        triageStats,
      };

      return {
        success: true,
        data: result,
        messages: this.messages,
        tokensUsed: 0,
      };
    } catch (error) {
      this.updateStatus('error', `Research execution failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        messages: this.messages,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Get selected sources
   */
  getSelectedSources(): ResearchSource[] {
    return [...this.selectedSources];
  }

  /**
   * Get search results
   */
  getSearchResults(): SearchExecutionResult[] {
    return [...this.searchResults];
  }
}
