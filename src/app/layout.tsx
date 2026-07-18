import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'smart-yosoku | 需要予測',
  description: '必要数量を予測し、発注・製造の判断を支援するサービス',
};

/** ルートレイアウト（最小）。日本語 UI（lang=ja）。画面ごとのシェルは各グループで持つ。 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
