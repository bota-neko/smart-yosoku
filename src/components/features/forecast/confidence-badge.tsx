import { ShieldCheck, ShieldAlert, Shield, HelpCircle } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { confidenceLabel, type ConfidenceLevel } from '@/domain';

/**
 * 信頼度バッジ。色だけでなくアイコン + 文言で信頼度レベルを伝える（AA配慮）。
 */
interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  score?: number;
}

const MAP: Record<
  ConfidenceLevel,
  { variant: NonNullable<BadgeProps['variant']>; Icon: typeof Shield }
> = {
  high: { variant: 'good', Icon: ShieldCheck },
  standard: { variant: 'neutral', Icon: Shield },
  low: { variant: 'warn', Icon: ShieldAlert },
  reference: { variant: 'ref', Icon: HelpCircle },
};

export function ConfidenceBadge({ level, score }: ConfidenceBadgeProps) {
  const { variant, Icon } = MAP[level];
  return (
    <Badge variant={variant}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>
        信頼度: {confidenceLabel(level)}
        {typeof score === 'number' ? `（${score}）` : ''}
      </span>
    </Badge>
  );
}
