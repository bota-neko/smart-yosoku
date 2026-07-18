import { Target, AlertTriangle, PackageMinus, PackagePlus } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  buildAllAccuracyPairs,
  buildAccuracyPairs,
  TARGETS,
} from '@/lib/sample-data';
import { calcAccuracy, type AccuracyMetrics } from '@/domain';
import { formatNumber, formatPercent } from '@/lib/utils';

/** 集計する期間の定義。 */
const PERIODS = [
  { key: 7, label: '直近7日' },
  { key: 30, label: '直近30日' },
  { key: 90, label: '直近90日' },
] as const;

/**
 * 予測精度ページ。
 * ドメインの calcAccuracy で、ダミーの予測実績ペアから
 * 的中率・平均誤差・過剰/不足回数などを算出して表示する。
 */
export default function AccuracyPage() {
  const overall = PERIODS.map((p) => ({
    ...p,
    metrics: calcAccuracy(buildAllAccuracyPairs(p.key)),
  }));

  // 直近30日の対象別内訳
  const perTarget = TARGETS.map((entry) => ({
    entry,
    metrics: calcAccuracy(buildAccuracyPairs(entry, 30)),
  }));

  const headline = overall.find((o) => o.key === 30)!.metrics;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">予測精度</h1>
        <p className="text-muted">
          過去の予測と実績を比較した、精度の推移と内訳です（許容誤差 10%）。
        </p>
      </header>

      {/* ヘッドライン指標（直近30日） */}
      <section
        aria-label="直近30日の精度サマリー"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <StatCard
          icon={<Target className="h-5 w-5" aria-hidden="true" />}
          label="的中率（直近30日）"
          value={formatPercent(headline.hitRate)}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          label="平均誤差率"
          value={formatPercent(headline.wape, 1)}
        />
        <StatCard
          icon={<PackagePlus className="h-5 w-5" aria-hidden="true" />}
          label="過剰予測回数"
          value={`${formatNumber(headline.overCount)}回`}
        />
        <StatCard
          icon={<PackageMinus className="h-5 w-5" aria-hidden="true" />}
          label="不足予測回数"
          value={`${formatNumber(headline.underCount)}回`}
        />
      </section>

      {/* 期間別テーブル */}
      <Card>
        <CardHeader>
          <CardTitle>期間別の精度</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>期間</TableHead>
                <TableHead className="text-right">件数</TableHead>
                <TableHead className="text-right">的中率</TableHead>
                <TableHead className="text-right">平均誤差率</TableHead>
                <TableHead className="text-right">平均誤差</TableHead>
                <TableHead className="text-right">過剰</TableHead>
                <TableHead className="text-right">不足</TableHead>
                <TableHead className="text-right">偏り</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overall.map((o) => (
                <TableRow key={o.key}>
                  <TableCell className="font-medium">{o.label}</TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(o.metrics.count)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatPercent(o.metrics.hitRate)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatPercent(o.metrics.wape, 1)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(o.metrics.mae, 1)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(o.metrics.overCount)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(o.metrics.underCount)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    <BiasLabel bias={o.metrics.bias} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 対象別（直近30日） */}
      <Card>
        <CardHeader>
          <CardTitle>対象別の精度（直近30日）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>卸先</TableHead>
                <TableHead>商品</TableHead>
                <TableHead className="text-right">的中率</TableHead>
                <TableHead className="text-right">平均誤差率</TableHead>
                <TableHead className="text-right">過剰</TableHead>
                <TableHead className="text-right">不足</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perTarget.map(({ entry, metrics }) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted">
                    {entry.location.name}
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.productName}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatPercent(metrics.hitRate)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatPercent(metrics.wape, 1)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(metrics.overCount)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(metrics.underCount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** 統計カード。 */
function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-2 text-muted">
          <span className="text-primary">{icon}</span>
          <span className="text-sm">{label}</span>
        </div>
        <p className="tabular text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

/** 偏りを「過剰傾向 / 不足傾向 / ほぼ均衡」で色分け表示。 */
function BiasLabel({ bias }: { bias: AccuracyMetrics['bias'] }) {
  const v = Number(bias.toFixed(1));
  if (v > 0.5) {
    return <Badge variant="warn">過剰 +{formatNumber(v, 1)}</Badge>;
  }
  if (v < -0.5) {
    return <Badge variant="down">不足 {formatNumber(v, 1)}</Badge>;
  }
  return <Badge variant="good">均衡</Badge>;
}
