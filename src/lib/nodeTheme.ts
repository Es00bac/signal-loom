import type { FlowNodeType } from '../types/flow';

export interface NodeTheme {
  accentColor: string;
  hoverAccentColor: string;
  containerClassName: string;
  headerClassName: string;
  iconClassName: string;
}

const defaultTheme: NodeTheme = {
  accentColor: '#8b8f98',
  hoverAccentColor: '#a7acb6',
  containerClassName: 'bg-[#1e2027] border-gray-700/60 shadow-black/35',
  headerClassName: 'bg-[#252830]/80 border-gray-700/50',
  iconClassName: 'text-gray-400',
};

const nodeThemes: Record<FlowNodeType, NodeTheme> = {
  textNode: {
    accentColor: '#f59e0b',
    hoverAccentColor: '#fbbf24',
    containerClassName: 'bg-[linear-gradient(155deg,rgba(245,158,11,0.15),#1e2027_34%,#15171d)] border-amber-400/35 shadow-amber-950/20',
    headerClassName: 'bg-[linear-gradient(90deg,rgba(245,158,11,0.20),rgba(37,40,48,0.82))] border-amber-400/25',
    iconClassName: 'text-amber-200',
  },
  imageGen: {
    accentColor: '#22c55e',
    hoverAccentColor: '#4ade80',
    containerClassName: 'bg-[linear-gradient(155deg,rgba(34,197,94,0.14),#1e2027_34%,#141a18)] border-emerald-400/35 shadow-emerald-950/20',
    headerClassName: 'bg-[linear-gradient(90deg,rgba(34,197,94,0.20),rgba(37,40,48,0.82))] border-emerald-400/25',
    iconClassName: 'text-emerald-200',
  },
  videoGen: {
    accentColor: '#38bdf8',
    hoverAccentColor: '#7dd3fc',
    containerClassName: 'bg-[linear-gradient(155deg,rgba(56,189,248,0.14),#1e2027_34%,#111923)] border-sky-400/35 shadow-sky-950/20',
    headerClassName: 'bg-[linear-gradient(90deg,rgba(56,189,248,0.20),rgba(37,40,48,0.82))] border-sky-400/25',
    iconClassName: 'text-sky-200',
  },
  audioGen: {
    accentColor: '#06b6d4',
    hoverAccentColor: '#22d3ee',
    containerClassName: 'bg-[linear-gradient(155deg,rgba(6,182,212,0.14),#1e2027_34%,#111b20)] border-cyan-400/35 shadow-cyan-950/20',
    headerClassName: 'bg-[linear-gradient(90deg,rgba(6,182,212,0.20),rgba(37,40,48,0.82))] border-cyan-400/25',
    iconClassName: 'text-cyan-200',
  },
  settings: {
    accentColor: '#a78bfa',
    hoverAccentColor: '#c4b5fd',
    containerClassName: 'bg-[linear-gradient(155deg,rgba(167,139,250,0.14),#1e2027_34%,#181622)] border-violet-400/35 shadow-violet-950/20',
    headerClassName: 'bg-[linear-gradient(90deg,rgba(167,139,250,0.20),rgba(37,40,48,0.82))] border-violet-400/25',
    iconClassName: 'text-violet-200',
  },
  composition: {
    accentColor: '#fb7185',
    hoverAccentColor: '#fda4af',
    containerClassName: 'bg-[linear-gradient(155deg,rgba(251,113,133,0.14),#1e2027_34%,#211419)] border-rose-400/35 shadow-rose-950/20',
    headerClassName: 'bg-[linear-gradient(90deg,rgba(251,113,133,0.20),rgba(37,40,48,0.82))] border-rose-400/25',
    iconClassName: 'text-rose-200',
  },
  sourceBin: {
    accentColor: '#f97316',
    hoverAccentColor: '#fb923c',
    containerClassName: 'bg-[linear-gradient(155deg,rgba(249,115,22,0.14),#1e2027_34%,#211812)] border-orange-400/35 shadow-orange-950/20',
    headerClassName: 'bg-[linear-gradient(90deg,rgba(249,115,22,0.20),rgba(37,40,48,0.82))] border-orange-400/25',
    iconClassName: 'text-orange-200',
  },
  virtual: {
    accentColor: '#e879f9',
    hoverAccentColor: '#f0abfc',
    containerClassName: 'bg-[linear-gradient(155deg,rgba(232,121,249,0.14),#1e2027_34%,#211422)] border-fuchsia-400/35 shadow-fuchsia-950/20',
    headerClassName: 'bg-[linear-gradient(90deg,rgba(232,121,249,0.20),rgba(37,40,48,0.82))] border-fuchsia-400/25',
    iconClassName: 'text-fuchsia-200',
  },
};

export function getNodeTheme(nodeType?: FlowNodeType): NodeTheme {
  return nodeType ? nodeThemes[nodeType] : defaultTheme;
}
