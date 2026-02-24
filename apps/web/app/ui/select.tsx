 'use client';

import { cn } from '../lib/cn';
import React, { useEffect, useMemo, useRef, useState } from 'react';

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Select({ className, label, hint, error, children, ...props }: Props) {
  const { value: valueProp, defaultValue: defaultValueProp, onChange: onChangeProp, ...restProps } = props;
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo(() => {
    const out: Array<{ value: string; label: string; disabled?: boolean }> = [];
    for (const child of React.Children.toArray(children)) {
      if (!React.isValidElement(child)) continue;
      // Allow <option> children (and ignore optgroup for now).
      if (typeof child.type === 'string' && child.type === 'option') {
        const value = String((child.props as any).value ?? '');
        const disabled = Boolean((child.props as any).disabled);
        const labelText = React.Children.toArray((child.props as any).children)
          .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
          .join('')
          .trim();
        out.push({ value, label: labelText || value || '—', disabled });
      }
    }
    return out;
  }, [children]);

  const isControlled = valueProp !== undefined;
  const initial = useMemo(() => {
    const v = valueProp ?? defaultValueProp;
    return v !== undefined && v !== null ? String(v) : '';
  }, [valueProp, defaultValueProp]);

  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(initial);
  const value = isControlled ? String(valueProp ?? '') : internalValue;

  const selectedLabel = useMemo(() => {
    const found = options.find((o) => o.value === value);
    if (found) return found.label;
    // If value isn't set, show the first option label (often placeholder like "Select...")
    if (!value && options.length) return options[0].label;
    return value || 'Select…';
  }, [options, value]);

  useEffect(() => {
    if (isControlled) return;
    setInternalValue(initial);
  }, [initial, isControlled]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [open]);

  function commit(next: string) {
    if (!isControlled) setInternalValue(next);

    const sel = selectRef.current;
    if (sel) {
      sel.value = next;
      // Fire a real change event so any onChange handlers work.
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  return (
    <label className="block">
      {label ? <div className="mb-1.5 text-sm font-medium text-zinc-300">{label}</div> : null}
      <div className="relative">
        {/* Keep a real select for forms + accessibility, but hide it from UI. */}
        <select
          ref={selectRef}
          className="sr-only"
          {...restProps}
          value={isControlled ? value : undefined}
          defaultValue={!isControlled ? initial : undefined}
          onChange={(e) => {
            if (!isControlled) setInternalValue(e.currentTarget.value);
            onChangeProp?.(e);
          }}
        >
          {children}
        </select>

        <button
          ref={buttonRef}
          type="button"
          disabled={Boolean(props.disabled)}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (props.disabled) return;
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            'h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-left text-sm text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors',
            'flex items-center justify-between gap-2',
            Boolean(props.disabled) ? 'opacity-50 cursor-not-allowed' : '',
            error ? 'border-red-500 focus-visible:ring-red-500' : '',
            className,
          )}
        >
          <span className={cn('truncate', !value ? 'text-zinc-500' : '')}>{selectedLabel}</span>
          <span className="text-zinc-500 flex-shrink-0 text-xs">▾</span>
        </button>

        {open ? (
          <div
            ref={popoverRef}
            role="listbox"
            className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-lg"
          >
            {options.map((o) => {
              const isSel = o.value === value;
              return (
                <button
                  key={`${o.value}-${o.label}`}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  disabled={o.disabled}
                  onClick={() => {
                    if (o.disabled) return;
                    commit(o.value);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm',
                    'hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none transition-colors',
                    o.disabled ? 'opacity-50 cursor-not-allowed' : '',
                    isSel ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-300',
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate">{o.label}</span>
                    {isSel ? <span className="text-indigo-400 flex-shrink-0">✓</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="mt-1 text-xs text-red-400">{error}</div>
      ) : hint ? (
        <div className="mt-1 text-xs text-zinc-500">{hint}</div>
      ) : null}
    </label>
  );
}
