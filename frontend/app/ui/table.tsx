import { cn } from '../lib/cn';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className={cn('overflow-x-auto rounded-md border border-zinc-800', className)}>
      <table className="w-full text-sm" {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'bg-zinc-900/50 px-3 py-2.5 text-left text-xs font-medium text-zinc-500 whitespace-nowrap border-b border-zinc-800',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td 
      className={cn(
        'border-t border-zinc-800 px-3 py-2.5 text-zinc-300 text-sm',
        className
      )} 
      {...props} 
    />
  );
}
