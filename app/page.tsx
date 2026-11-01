"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import VatesLogo from '@/app/components/VatesLogo';
import { getClientLandingPath, getClientViewMode } from '@/app/lib/authClient';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let isDisposed = false;

    const resolveStartPage = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const payload = response.ok ? await response.json().catch(() => null) : null;

        if (isDisposed) {
          return;
        }

        if (payload?.authenticated && payload.user) {
          const mode = getClientViewMode(payload.user);
          router.replace(getClientLandingPath({ ...payload.user, role: mode }));
          return;
        }

        router.replace('/login');
      } catch (error) {
        console.error('Не удалось определить стартовую страницу Ватэс:', error);
        if (!isDisposed) {
          router.replace('/login');
        }
      }
    };

    void resolveStartPage();

    return () => {
      isDisposed = true;
    };
  }, [router]);

  return (
    <main className="vates-launch-screen" aria-label="Загрузка Ватэс">
      <VatesLogo className="vates-launch-logo" priority />
      <div className="vates-launch-progress" aria-hidden="true"><span /></div>
      <p>Подготавливаем рабочее пространство...</p>
    </main>
  );
}
