import { useMemo, useState, type ReactNode } from 'react';
import { Activity, RefreshCw, Wallet } from 'lucide-react';
import {
  collectActualUsageRollup,
  estimateCanvasRunCosts,
  formatUsd,
  formatRollupSummary,
} from '../../lib/costEstimation';
import { useFlowStore } from '../../store/flowStore';
import { useProjectUsageStore } from '../../store/projectUsageStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { ProjectUsageLedgerBucket, ProjectUsageLedgerSummary } from '../../lib/projectUsageLedger';
import type { ProviderBalance } from '../../lib/providerBalance';

export function UsageBar() {
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const defaultModels = useSettingsStore((state) => state.defaultModels);
  const providerSettings = useSettingsStore((state) => state.providerSettings);
  const projectSummary = useProjectUsageStore((state) => state.summary);
  const balances = useProjectUsageStore((state) => state.balances);
  const balancesLoading = useProjectUsageStore((state) => state.balancesLoading);
  const refreshBalances = useProjectUsageStore((state) => state.refreshBalances);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const projectSpendSummary = formatProjectSpendSummary(projectSummary);

  return (
    <div className="absolute left-1/2 top-20 z-[60] -translate-x-1/2" data-signal-loom-usage-bar="true">
      <div className="flex min-w-[420px] max-w-[86vw] items-center gap-2 rounded-2xl border border-gray-700/70 bg-[#171922]/90 px-3 py-2 shadow-2xl backdrop-blur-md">
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
        <UsagePill
          button
          icon={<Wallet size={14} />}
          onClick={() => setDetailsOpen((open) => !open)}
          summary={projectSpendSummary}
          toneClassName={projectSummary.unknownCostEntryCount > 0 ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-50' : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-50'}
        />
      </div>
      {detailsOpen ? (
        <ProjectSpendPopover
          balances={balances}
          balancesLoading={balancesLoading}
          onRefreshBalances={() => void refreshBalances(apiKeys)}
          summary={projectSummary}
        />
      ) : null}
    </div>
  );
}

interface UsagePillProps {
  button?: boolean;
  icon: ReactNode;
  onClick?: () => void;
  summary: string;
  toneClassName: string;
}

function UsagePill({ button = false, icon, onClick, summary, toneClassName }: UsagePillProps) {
  const className = `min-w-0 flex-1 rounded-xl border px-3 py-2 text-left ${toneClassName}`;
  const content = (
      <div className="flex items-center gap-2 text-[11px] leading-relaxed">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{summary}</span>
      </div>
  );
  if (button) {
    return (
      <button className={`${className} transition hover:border-cyan-200/50`} onClick={onClick} type="button">
        {content}
      </button>
    );
  }
  return (
    <div className={className}>
      {content}
    </div>
  );
}

function ProjectSpendPopover({
  balances,
  balancesLoading,
  onRefreshBalances,
  summary,
}: {
  balances: ProviderBalance[];
  balancesLoading: boolean;
  onRefreshBalances: () => void;
  summary: ProjectUsageLedgerSummary;
}) {
  return (
    <div className="mt-2 w-[min(860px,86vw)] rounded-xl border border-cyan-300/15 bg-[#111620]/95 p-3 text-xs text-cyan-50 shadow-2xl shadow-black/50 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">Project Spend Ledger</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {formatUsd(summary.totalKnownCostUsd)} known across {summary.entryCount} recorded operation{summary.entryCount === 1 ? '' : 's'}
          </div>
          {summary.unknownCostEntryCount > 0 ? (
            <div className="mt-1 text-[11px] text-amber-100/80">
              {summary.unknownCostEntryCount} operation{summary.unknownCostEntryCount === 1 ? '' : 's'} had provider-defined or unknown pricing.
            </div>
          ) : null}
        </div>
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-50 hover:border-cyan-200/50 disabled:cursor-wait disabled:opacity-60"
          disabled={balancesLoading}
          onClick={onRefreshBalances}
          type="button"
        >
          <RefreshCw className={balancesLoading ? 'animate-spin' : ''} size={12} />
          Balances
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SpendBreakdown title="Provider" rows={summary.byProvider} />
        <SpendBreakdown title="Model" rows={summary.byModel} />
        <SpendBreakdown title="Operation" rows={summary.byOperation} />
        <SpendBreakdown title="Workspace" rows={summary.byWorkspace} />
      </div>
      <div className="mt-3 rounded-lg border border-gray-700/60 bg-black/20 p-2">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Provider Balances</div>
        {balances.length > 0 ? (
          <div className="grid gap-1.5 md:grid-cols-2">
            {balances.map((balance) => <BalanceRow balance={balance} key={balance.provider} />)}
          </div>
        ) : (
          <div className="text-[11px] text-gray-400">Click Balances to check supported providers. Unsupported providers explain why no live balance is available.</div>
        )}
      </div>
    </div>
  );
}

function SpendBreakdown({ rows, title }: { rows: ProjectUsageLedgerBucket[]; title: string }) {
  const visibleRows = rows.slice(0, 5);
  return (
    <div className="rounded-lg border border-gray-700/60 bg-black/20 p-2">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{title}</div>
      {visibleRows.length > 0 ? (
        <div className="space-y-1">
          {visibleRows.map((row) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" key={row.key}>
              <span className="truncate text-gray-200">{row.key}</span>
              <span className="font-mono text-cyan-100">{formatUsd(row.totalKnownCostUsd)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-gray-500">No recorded usage yet.</div>
      )}
    </div>
  );
}

function BalanceRow({ balance }: { balance: ProviderBalance }) {
  const value = balance.status === 'available'
    ? `${formatUsd(balance.estimatedUsd)} / ${balance.credits?.toFixed(2)} credits`
    : balance.status;
  return (
    <div className="rounded-md border border-gray-700/50 bg-[#11131a] px-2 py-1.5">
      <div className="flex justify-between gap-2">
        <span className="font-semibold text-gray-200">{balance.label}</span>
        <span className="font-mono text-cyan-100">{value}</span>
      </div>
      {balance.message ? <div className="mt-1 text-[10px] leading-snug text-gray-500">{balance.message}</div> : null}
    </div>
  );
}

function formatProjectSpendSummary(summary: ProjectUsageLedgerSummary): string {
  const unknown = summary.unknownCostEntryCount > 0 ? `, ${summary.unknownCostEntryCount} unknown` : '';
  return `Project total: ${formatUsd(summary.totalKnownCostUsd)}${unknown}`;
}
