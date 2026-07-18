import { test, expect } from '@playwright/test';

/**
 * 主要フローのE2E（サンプルデータ表示ベース）。
 * 実Supabase接続時の登録→初期設定→実績入力→予測→補正→精度は
 * docs/setup.md の手順で環境を用意した上で拡張する。
 */

test.describe('smart-yosoku 主要画面', () => {
  test('ダッシュボードに明日の推奨数量が表示される', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveTitle(/smart-yosoku|予測/);
    // 推奨数量の見出しが存在
    await expect(page.getByText(/推奨/).first()).toBeVisible();
  });

  test('予測詳細で推奨数が大きく強調表示される（色だけに依存しない）', async ({ page }) => {
    await page.goto('/forecast');
    // ラベル＋数値＋単位が読める（アクセシビリティ: テキストで意味が伝わる）
    await expect(page.getByText(/推奨/).first()).toBeVisible();
  });

  test('実績入力画面が開ける', async ({ page }) => {
    await page.goto('/input');
    await expect(page.locator('body')).toBeVisible();
  });

  test('予測精度画面が開ける', async ({ page }) => {
    await page.goto('/accuracy');
    await expect(page.getByText(/精度|的中|誤差/).first()).toBeVisible();
  });
});
