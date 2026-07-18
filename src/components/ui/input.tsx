import * as React from 'react';
import { cn } from '@/lib/utils';

/** 単一行入力。最小高さ 44px でタッチ操作にも対応。 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
