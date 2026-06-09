export function AddMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="block w-full px-3 py-1.5 text-left text-xs text-cyan-100/80 hover:bg-cyan-400/10"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function ActionButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] ${
        disabled
          ? 'cursor-not-allowed text-cyan-100/20'
          : 'text-cyan-100/60 hover:bg-cyan-400/10 hover:text-white'
      }`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

export function MaskActionButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex min-w-0 items-center justify-center gap-1 rounded border px-1.5 py-1 text-[10px] ${
        disabled
          ? 'cursor-not-allowed border-cyan-300/5 text-cyan-100/20'
          : 'border-cyan-300/10 text-cyan-100/60 hover:bg-cyan-400/10 hover:text-white'
      }`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
