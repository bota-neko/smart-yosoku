# 予測ロジック仕様

予測は UI から分離した純粋なドメイン層 `src/domain/` に実装。すべて単体テスト済み。

## モジュール構成
| モジュール | 役割 |
|---|---|
| `domain/types.ts` | 契約（`ForecastEngine`, `ForecastResult` 等） |
| `domain/math.ts` | NaN/Infinity をガードする安全数値ユーティリティ |
| `domain/dateutil.ts` | 外部依存なしの日付処理（UTC基準） |
| `domain/forecast/features.ts` | 特徴量計算（各種平均・曜日/月係数・トレンド・前年比較） |
| `domain/forecast/adjustments.ts` | 天候/気温/特売/イベント/祝日/店休の補正 |
| `domain/forecast/weighting.ts` | 蓄積期間別の重みティア + モデル成績反映 |
| `domain/forecast/engine.ts` | 加重アンサンブル本体（`EnsembleForecastEngine`） |
| `domain/confidence/confidence.ts` | 今回予測の信頼度算出 |
| `domain/accuracy/metrics.ts` | MAE/WAPE/MAPE/RMSE/Bias/的中率・4段階分類 |
| `domain/anomaly/detect.ts` | 異常値検知（削除せず確認待ち） |

## 需要の代理値（demandOf）
販売数を基本とし、**売り切れ日は需要の上限にしない**補正を行う:
- 欠品推定があれば `販売数 + 欠品推定`。
- `soldOut` のみなら控えめに `販売数 × 1.1`。

## アンサンブル
各モデル要素の予測値を、蓄積期間で決まる重み（`selectTier`）で加重平均。
モデル別過去成績（WAPEから算出）があれば重みへ乗算（`adjustByPerformance`）。
データが乏しい場合は「全体平均 × 曜日係数」にフォールバックし、それも無ければ 0。

要素キー: `avg7, avg14, avg28, sameDowLastWeek, sameDowAvg4, lastYearSameDay,
lastYearSamePeriod, trend, month`。

## 蓄積期間別ティア（selectTier）
| 期間 | 重視する要素 | 学習表示 |
|---|---|---|
| 7日未満 | 直近7日平均のみ | （参考値） |
| 7〜30日 | 直近平均+曜日 | 曜日傾向を学習中 |
| 1〜3か月 | +直近トレンド・気温天候 | 曜日/直近を学習済み |
| 3か月〜1年 | +月別・季節 | 月別を学習済み/季節を学習中 |
| 1年以上 | 前年同日/同時期を重視 | 前年比較が利用可能 |
| 2年以上 | 複数年季節性・年次トレンド | 年間イベント傾向を学習済み |

## 補正（applyAdjustments）
乗算補正を順に積み、各段の差分（delta）と日本語理由を記録。
- 天候: 晴+3% / 雨−10% / 雪−15% / 荒天−35%。
- 気温: 30℃以上 or 5℃以下で微増。
- 特売/キャンペーン/イベント/祝日: **履歴からあり/なしの平均比を学習**（サンプル不足時は既定倍率）。
- 店休日: 予測を 0。

## 推奨数
`最終推奨 = 予測需要 + 安全分 − 現在庫 − 既発注`（下限0、業種により整数/小数）。
予測範囲は蓄積量に応じて ±12〜35%。

## 信頼度（calcConfidence）
100点から減点方式。要因: データ日数・欠損率・新商品/新規拠点・構造変化・直近誤差・
異常値件数・需要変動係数(CV)・類似条件の有無。
`high(≥75) / standard(≥50) / low(<50) / reference(実績7日未満)`。低い場合は理由を返す。

## 精度指標（calcAccuracy）
- **MAPE**: 実績0の行を除外（`mapeCount` を併せて返す）。全0でも破綻しない。
- **WAPE**: Σ|誤差| / Σ実績。実績合計0なら0。**主指標**。
- MAE / RMSE / Bias(±=過剰/不足) / 的中率(許容誤差内割合)。
- 4段階分類: 的中(≤5%) / ほぼ的中(≤10%) / 要注意(≤20%) / 大きなずれ(>20%)。閾値は組織/対象単位で変更可。

## エンドツーエンド検証
`npx tsx scripts/verify-pipeline.ts` が、生成データの直近30日をホールドアウトして
600ペアを予測・突合し、WAPE・的中率・異常値件数・サンプル予測理由を出力する。
（NaN/Infinity 非発生を機械的に確認）
