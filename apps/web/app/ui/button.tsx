import { cn } from '../lib/cn';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap cursor-pointer';

  const variants: Record<string, string> = {
    primary: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
    secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700',
    ghost: 'bg-transparent hover:bg-zinc-800 text-zinc-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };

  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 text-sm',
    lg: 'h-10 px-5 text-sm',
  };

  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
