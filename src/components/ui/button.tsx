import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * ボタン。shadcn 風の自前実装（Radix 非依存）。
 * タッチターゲット確保のため最小高さ 44px を既定サイズに設定。
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-base font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
        outline:
          'border border-border bg-surface text-foreground hover:bg-muted-bg',
        ghost: 'text-foreground hover:bg-muted-bg',
        accent: 'bg-accent text-primary-fg hover:opacity-90',
      },
      size: {
        // 44px 以上のタッチターゲット
        md: 'h-11 px-4',
        sm: 'h-9 px-3 text-sm',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
