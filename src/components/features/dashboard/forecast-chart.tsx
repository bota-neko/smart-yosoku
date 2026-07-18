'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/lib/sample-data';

/**
 * 予測 vs 実績の推移グラフ。
 * Recharts はブラウザ描画のため Client Component。
 * - 実績: 濃紺の実線 / 予測: アクセント色の破線
 * 色だけに頼らないよう、凡例テキストと線種（実線/破線）でも区別する。
 */
interface ForecastChartProps {
  data: TrendPoint[];
}

export function ForecastChart({ data }: ForecastChartProps) {
  return (
    <div className="w-full">
      {/* 凡例（色 + 線種 + 文言で区別） */}
      <div className="mb-3 flex flex-wrap gap-4 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-6 bg-primary"
          />
          実績（実線）
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-0 w-6 border-t-2 border-dashed border-accent"
          />
          予測（破線）
        </span>
      </div>

      <div className="h-72 w-full" role="img" aria-label="予測と実績の推移グラフ">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
          >
            <CartesianGrid stroke="rgb(226 230 235)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: 'rgb(82 93 107)' }}
              tickLine={false}
              axisLine={{ stroke: 'rgb(226 230 235)' }}
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'rgb(82 93 107)' }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 6,
                border: '1px solid rgb(226 230 235)',
                fontSize: 14,
              }}
              formatter={(value, name) => {
                const display =
                  typeof value === 'number'
                    ? value.toLocaleString('ja-JP')
                    : value == null
                      ? '—'
                      : String(value);
                return [display, name === 'actual' ? '実績' : '予測'];
              }}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="actual"
              stroke="rgb(15 61 92)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="predicted"
              name="predicted"
              stroke="rgb(14 90 86)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
