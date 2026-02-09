'use client';

import { MessageSquare, Search, FileText, Network } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type FeatureTab = 'chat' | 'research' | 'papers' | 'discovery';

interface Badge {
  chat?: number;
  research?: number;
  papers?: number;
  discovery?: number;
}

interface FeatureTabsProps {
  activeTab: FeatureTab;
  onTabChange: (tab: FeatureTab) => void;
  badges?: Badge;
}

const tabs = [
  {
    id: 'chat' as const,
    label: 'Chat',
    icon: MessageSquare,
    description: 'AI assistant for writing and research',
  },
  {
    id: 'research' as const,
    label: 'Research',
    icon: Search,
    description: 'Deep research with AI synthesis',
  },
  {
    id: 'papers' as const,
    label: 'Papers',
    icon: FileText,
    description: 'Your paper library and chat',
  },
  {
    id: 'discovery' as const,
    label: 'Discovery',
    icon: Network,
    description: 'Citation network and recommendations',
  },
] as const;

export function FeatureTabs({ activeTab, onTabChange, badges }: FeatureTabsProps) {
  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      e.preventDefault();
      onTabChange(tabs[currentIndex - 1].id);
    } else if (e.key === 'ArrowRight' && currentIndex < tabs.length - 1) {
      e.preventDefault();
      onTabChange(tabs[currentIndex + 1].id);
    }
  };

  return (
    <div className="flex border-b border-border bg-card" role="tablist">
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const badge = badges?.[tab.id];

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            title={tab.description}
            className={cn(
              'flex-1 relative flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'hover:bg-muted/50',
              isActive
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">{tab.label}</span>

            {/* Badge for notifications/counts */}
            {badge !== undefined && badge > 0 && (
              <span
                className={cn(
                  'absolute -top-1 -right-1 sm:relative sm:top-0 sm:right-0',
                  'min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center',
                  'text-xs font-semibold rounded-full',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
