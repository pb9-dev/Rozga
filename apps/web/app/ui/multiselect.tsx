import { cn } from '../lib/cn';

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function MultiSelect({ className, label, hint, error, children, ...props }: Props) {
  return (
    <label className="block">
      {label ? <div className="mb-1.5 text-sm font-medium text-zinc-300">{label}</div> : null}
      <select
        multiple
        className={cn(
          'min-h-28 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-1 focus:ring-offset-[var(--background)] transition-colors',
          error ? 'border-red-500 focus:ring-red-500' : '',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <div className="mt-1 text-xs text-red-400">{error}</div>
      ) : hint ? (
        <div className="mt-1 text-xs text-zinc-500">{hint}</div>
      ) : null}
    </label>
  );
}
