import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * バッジ。状態表示に使うが、色だけに頼らずアイコン/ラベル文言を併用する前提。
 * 各バリアントは十分なコントラスト比（AA）を確保した淡色背景＋濃色文字。
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted-bg text-foreground',
        up: 'border-state-up/30 bg-state-up/10 text-state-up',
        down: 'border-state-down/30 bg-state-down/10 text-state-down',
        good: 'border-state-good/30 bg-state-good/10 text-state-good',
        warn: 'border-state-warn/30 bg-state-warn/10 text-state-warn',
        bad: 'border-state-bad/30 bg-state-bad/10 text-state-bad',
        ref: 'border-state-ref/30 bg-state-ref/10 text-state-ref',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
