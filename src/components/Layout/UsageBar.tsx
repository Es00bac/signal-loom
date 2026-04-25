import { useMemo, type ReactNode } from 'react';
import { Activity, Wallet } from 'lucide-react';
import {
  collectActualUsageRollup,
  estimateCanvasRunCosts,
  formatRollupSummary,
} from '../../lib/costEstimation';
import { useFlowStore } from '../../store/flowStore';
import { useSettingsStore } from '../../store/settingsStore';

export function UsageBar() {
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const defaultModels = useSettingsStore((state) => state.defaultModels);
  const providerSettings = useSettingsStore((state) => state.providerSettings);
  const settings = useMemo(
    () => ({
      apiKeys,
      defaultModels,
      providerSettings,
    }),
    [apiKeys, defaultModels, providerSettings],
  );

  const canvasEstimate = useMemo(
    () => estimateCanvasRunCosts(nodes, edges, settings),
    [nodes, edges, settings],
  );
  const actualUsage = useMemo(() => collectActualUsageRollup(nodes), [nodes]);

  return (
    <div className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2">
      <div className="flex min-w-[420px] max-w-[80vw] items-center gap-2 rounded-2xl border border-gray-700/70 bg-[#171922]/90 px-3 py-2 shadow-2xl backdrop-blur-md">
        <UsagePill
          icon={<Wallet size={14} />}
          summary={formatRollupSummary(canvasEstimate, 'Canvas estimate')}
          toneClassName={canvasEstimate.unknownCostCount > 0 ? 'border-amber-500/25 bg-amber-500/10 text-amber-50' : 'border-blue-500/25 bg-blue-500/10 text-blue-50'}
        />
        <UsagePill
          icon={<Activity size={14} />}
          summary={formatRollupSummary(actualUsage, 'Actual this session')}
          toneClassName="border-emerald-500/25 bg-emerald-500/10 text-emerald-50"
        />
      </div>
    </div>
  );
}

interface UsagePillProps {
  icon: ReactNode;
  summary: string;
  toneClassName: string;
}

function UsagePill({ icon, summary, toneClassName }: UsagePillProps) {
  return (
    <div className={`min-w-0 flex-1 rounded-xl border px-3 py-2 ${toneClassName}`}>
      <div className="flex items-center gap-2 text-[11px] leading-relaxed">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{summary}</span>
      </div>
    </div>
  );
}
