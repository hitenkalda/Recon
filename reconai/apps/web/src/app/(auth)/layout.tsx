'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && me) {
      router.replace('/dashboard');
    }
  }, [me, loading, router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundColor: '#08090b',
        backgroundImage:
          'radial-gradient(circle at 50% 0%, rgba(103,232,249,0.08) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(30,41,59,0.25) 0%, transparent 50%), radial-gradient(circle at 0% 100%, rgba(14,165,233,0.04) 0%, transparent 40%)',
      }}
    >
      {loading ? null : children}
    </div>
  );
}