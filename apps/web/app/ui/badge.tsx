import { cn } from '../lib/cn';

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'info';
};

export function Badge({ className, tone = 'neutral', ...props }: Props) {
  const tones: Record<string, string> = {
    neutral: 'bg-zinc-800 text-zinc-300',
    good: 'bg-emerald-950 text-emerald-400',
    warn: 'bg-amber-950 text-amber-400',
    danger: 'bg-red-950 text-red-400',
    info: 'bg-blue-950 text-blue-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
