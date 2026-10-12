/** Numbered corner badge used by fan-speed card controls. The button owns its accessible label. */
export function CardControlNumberBadge({ value }: { value: string | number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-white/14 bg-zinc-950 px-1 text-[8px] font-semibold leading-none text-white"
    >
      {value}
    </span>
  );
}
