'use client';

import { useEffect, useState } from 'react';

/**
 * Ensures there is a persisted user ID in localStorage and returns it.
 * Creates a fallback user if one doesn't exist yet.
 */
export function usePersistentUserId(defaultEmail = 'user@assistant.local') {
  const [userId, setUserId] = useState('');

  useEffect(() => {
    let cancelled = false;

    const ensureUser = async () => {
      if (typeof window === 'undefined') return;

      let storedUserId: string | null = localStorage.getItem('userId');
      if (storedUserId) {
        try {
          const resp = await fetch(`/api/users/${storedUserId}`);
          if (!resp.ok) {
            localStorage.removeItem('userId');
            storedUserId = null;
          }
        } catch {
          localStorage.removeItem('userId');
          storedUserId = null;
        }
      }

      if (!storedUserId) {
        try {
          const resp = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: defaultEmail }),
          });
          const data = await resp.json();
          const id = data?.user?.id;
          if (id) {
            localStorage.setItem('userId', id);
            storedUserId = id;
          }
        } catch (error) {
          console.error('Failed to create user', error);
        }
      }

      if (!cancelled && storedUserId) {
        setUserId(storedUserId);
      }
    };

    void ensureUser();
    return () => {
      cancelled = true;
    };
  }, [defaultEmail]);

  return userId;
}
