import { redirect } from 'next/navigation';

/** 「あした作る数」へ統合済み。古いリンク用に転送する。 */
export default function Page() {
  redirect('/dashboard');
}
