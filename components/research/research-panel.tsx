// Deep Research - Main Research Panel
// Clean, Apple-like research interface

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Sparkles,
  ArrowRight,
  X,
  ChevronDown,
  BookOpen,
  Zap,
  Target,
  Layers,
  FileSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useResearch } from './research-context';
import { ResearchProgress } from './research-progress';
import type { ResearchMode } from '@/lib/deep-research/types';

const modeConfig: Record<ResearchMode, {
  label: string;
  description: string;
  icon: typeof Zap;
  sources: number;
  time: string;
}> = {
  quick: {
    label: 'Quick',
    description: 'Fast overview with key findings',
    icon: Zap,
    sources: 10,
    time: '~2 min',
  },
  standard: {
    label: 'Standard',
    description: 'Balanced depth and coverage',
    icon: Target,
    sources: 25,
    time: '~5 min',
  },
  deep: {
    label: 'Deep',
    description: 'Comprehensive multi-perspective analysis',
    icon: Layers,
    sources: 50,
    time: '~10 min',
  },
  exhaustive: {
    label: 'Exhaustive',
    description: 'Leave no stone unturned',
    icon: FileSearch,
    sources: 100,
    time: '~20 min',
  },
  systematic: {
    label: 'Systematic',
    description: 'Full systematic review protocol',
    icon: BookOpen,
    sources: 200,
    time: '~30 min',
  },
};

export function ResearchPanel() {
  const {
    isResearchMode,
    exitResearchMode,
    topic,
    setTopic,
    mode,
    setMode,
    status,
    startResearch,
    synthesis,
  } = useResearch();

  const [isModeOpen, setIsModeOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when entering research mode
  useEffect(() => {
    if (isResearchMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isResearchMode]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isResearchMode && status === 'idle') {
        exitResearchMode();
      }
      if (e.key === 'Enter' && e.metaKey && topic.trim()) {
        startResearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isResearchMode, status, topic, exitResearchMode, startResearch]);

  useEffect(() => {
    if (status !== 'complete') {
      setShowResults(false);
    }
  }, [status]);

  const isResearching = status !== 'idle' && status !== 'complete';
  const currentMode = modeConfig[mode];
  const ModeIcon = currentMode.icon;

  if (!isResearchMode) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', duration: 0.5, bounce: 0.2 }}
          className="w-full max-w-2xl mx-4"
        >
          {/* Main card */}
          <div className="relative bg-card rounded-2xl shadow-2xl shadow-primary/5 border border-border overflow-hidden">
            {/* Close button */}
            {status === 'idle' && (
              <button
                onClick={exitResearchMode}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            )}

            {/* Header */}
            <div className="px-8 pt-8 pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Deep Research</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Multi-perspective research synthesis powered by AI
              </p>
            </div>

            {/* Input section */}
            {!isResearching && status !== 'complete' && (
              <div className="px-8 pb-6">
                {/* Topic input */}
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="What would you like to research?"
                    className="w-full px-4 py-4 pr-12 text-lg bg-muted/50 border-0 rounded-xl
                             resize-none focus:outline-none focus:ring-2 focus:ring-primary/20
                             placeholder:text-muted-foreground/60 transition-all"
                    rows={3}
                  />
                  <Search className="absolute right-4 top-4 w-5 h-5 text-muted-foreground/40" />
                </div>

                {/* Mode selector */}
                <div className="mt-4">
                  <button
                    onClick={() => setIsModeOpen(!isModeOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <ModeIcon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{currentMode.label}</span>
                    <span className="text-xs text-muted-foreground">
                      · {currentMode.sources} sources · {currentMode.time}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isModeOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isModeOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 p-2 bg-muted/30 rounded-xl space-y-1">
                          {(Object.entries(modeConfig) as [ResearchMode, typeof currentMode][]).map(([key, config]) => {
                            const Icon = config.icon;
                            const isSelected = key === mode;
                            return (
                              <button
                                key={key}
                                onClick={() => {
                                  setMode(key);
                                  setIsModeOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                                  isSelected
                                    ? 'bg-primary/10 text-primary'
                                    : 'hover:bg-muted'
                                }`}
                              >
                                <Icon className="w-4 h-4 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium">{config.label}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {config.description}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {config.sources} sources
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Start button */}
                <div className="mt-6">
                  <Button
                    onClick={startResearch}
                    disabled={!topic.trim()}
                    className="w-full h-12 text-base font-medium rounded-xl gap-2
                             bg-primary hover:bg-primary/90 transition-all
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Research
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <p className="mt-2 text-xs text-center text-muted-foreground">
                    Press ⌘ + Enter to start
                  </p>
                </div>
              </div>
            )}

            {/* Progress section */}
            {isResearching && <ResearchProgress />}

            {/* Complete section */}
            {status === 'complete' && (
              <div className="px-8 pb-8">
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
                    <BookOpen className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Research Complete</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Your synthesis is ready to view
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button
                      variant="outline"
                      onClick={exitResearchMode}
                      className="rounded-xl"
                    >
                      Close
                    </Button>
                    <Button
                      className="rounded-xl gap-2"
                      onClick={() => setShowResults((prev) => !prev)}
                      disabled={!synthesis}
                    >
                      {showResults ? 'Hide Results' : 'View Results'}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {showResults && synthesis && (
                  <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold">Synthesis Preview</h4>
                      <span className="text-xs text-muted-foreground">
                        {synthesis.wordCount.toLocaleString()} words
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground max-h-48 overflow-auto whitespace-pre-wrap">
                      {synthesis.content}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Keyboard hint */}
          {status === 'idle' && (
            <p className="text-center mt-4 text-xs text-muted-foreground">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Esc</kbd> to close
            </p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
