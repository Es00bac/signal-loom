export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-cyan-100/40">{format(value)}</span>
      </label>
      <input
        className="w-full cursor-pointer accent-cyan-400"
        max={max}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </div>
  );
}

export function Field({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 items-center gap-1 rounded border border-cyan-300/10 bg-[#252630] px-2 py-1">
      <span className="text-cyan-100/40">{label}</span>
      <span className="flex-1 text-right text-cyan-100/80">{value}</span>
    </div>
  );
}
