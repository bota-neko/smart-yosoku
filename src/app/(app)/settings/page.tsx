import { ApiKeyCard } from '@/components/features/settings/api-key-card';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-muted">アカウントごとの設定です。</p>
      </header>
      <ApiKeyCard />
    </div>
  );
}
