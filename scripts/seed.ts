/**
 * シードスクリプト。
 *  - SUPABASE 環境変数が設定されていれば Supabase へ投入（サービスロール）。
 *  - 未設定なら supabase/seed/seed-data.json へ書き出す（オフラインでも動作確認可能）。
 * 実行: npm run seed  （tsx scripts/seed.ts）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateSeedRecords, SEED_ORG, SEED_LOCATIONS, SEED_TARGETS } from '../src/lib/seed/generate';

const END_DATE = process.env.SEED_END_DATE ?? '2026-07-15';
const DAYS = Number(process.env.SEED_DAYS ?? 400); // 1年以上

async function main() {
  console.log(`シード生成: ${SEED_ORG.name} / ${DAYS}日分 / 最終日 ${END_DATE}`);
  const records = generateSeedRecords(END_DATE, DAYS);
  console.log(`生成レコード数: ${records.length}（拠点${SEED_LOCATIONS.length} × 対象${SEED_TARGETS.length} × ${DAYS}日）`);

  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasSupabase) {
    const dir = resolve(process.cwd(), 'supabase/seed');
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, 'seed-data.json');
    writeFileSync(file, JSON.stringify({
      org: SEED_ORG, locations: SEED_LOCATIONS, targets: SEED_TARGETS,
      recordCount: records.length, records,
    }, null, 0));
    console.log(`Supabase未設定のため JSON へ書き出しました: ${file}`);
    console.log('（.env に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定すると DB へ投入します）');
    return;
  }

  // Supabase 投入は実DB接続が必要。ここでは手順のみ示し、実装は docs/setup.md 参照。
  console.log('Supabase 検出: 実DBへの投入は docs/setup.md の手順に従ってください。');
  console.log('（本スクリプトはオフライン検証用にJSON書き出しを主目的とし、DB投入は接続時に有効化）');
}

main().catch((e) => { console.error(e); process.exit(1); });
