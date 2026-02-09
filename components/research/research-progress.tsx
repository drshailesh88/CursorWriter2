// Deep Research - Progress Visualization
// Elegant, Apple-like progress display

'use client';

import { motion } from 'framer-motion';
import {
  MessageSquare,
  Users,
  Search,
  GitBranch,
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useResearch } from './research-context';
import type { ResearchStatus } from '@/lib/deep-research/types';

interface Stage {
  id: ResearchStatus;
  label: string;
  description: string;
  icon: typeof Search;
}

const stages: Stage[] = [
  {
    id: 'clarifying',
    label: 'Clarifying',
    description: 'Understanding your research question',
    icon: MessageSquare,
  },
  {
    id: 'planning',
    label: 'Perspectives',
    description: 'Generating expert viewpoints',
    icon: Users,
  },
  {
    id: 'researching',
    label: 'Searching',
    description: 'Querying academic databases',
    icon: Search,
  },
  {
    id: 'reviewing',
    label: 'Analyzing',
    description: 'Evaluating citations and evidence',
    icon: GitBranch,
  },
  {
    id: 'synthesizing',
    label: 'Synthesizing',
    description: 'Composing your research report',
    icon: FileText,
  },
];

export function ResearchProgress() {
  const { status, progress, currentAgent, topic, cancelResearch } = useResearch();

  const currentStageIndex = stages.findIndex(s => s.id === status);

  return (
    <div className="px-8 pb-8">
      {/* Topic display */}
      <div className="mb-6 p-4 bg-muted/30 rounded-xl">
        <p className="text-sm text-muted-foreground mb-1">Researching</p>
        <p className="font-medium line-clamp-2">{topic}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{currentAgent || 'Initializing...'}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Stages */}
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const isComplete = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isPending = index > currentStageIndex;

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${
                isCurrent ? 'bg-primary/5' : ''
              }`}
            >
              {/* Icon */}
              <div
                className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                  isComplete
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : isCurrent
                    ? 'bg-primary/10'
                    : 'bg-muted'
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : isCurrent ? (
                  <>
                    <Icon className="w-5 h-5 text-primary" />
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-primary"
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 1.3, opacity: 0 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  </>
                ) : (
                  <Icon className="w-5 h-5 text-muted-foreground/50" />
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div
                  className={`font-medium transition-colors ${
                    isPending ? 'text-muted-foreground/50' : ''
                  }`}
                >
                  {stage.label}
                </div>
                <div
                  className={`text-sm transition-colors ${
                    isCurrent
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/50'
                  }`}
                >
                  {stage.description}
                </div>
              </div>

              {/* Status indicator */}
              {isCurrent && (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              )}
              {isComplete && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Done
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Cancel button */}
      <div className="mt-6 text-center">
        <button
          onClick={cancelResearch}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel research
        </button>
      </div>
    </div>
  );
}
