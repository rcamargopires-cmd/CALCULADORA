import React, { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { ShowroomPassage, User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { showroomFlowService } from '../services/showroomFlowService';

type AudioCtx = AudioContext & { webkitAudioContext?: typeof AudioContext };

const isWaitingToday = (item: ShowroomPassage) => {
  if (item.status !== 'waiting') return false;
  const created = new Date(item.createdAt);
  const now = new Date();
  return created.getFullYear() === now.getFullYear()
    && created.getMonth() === now.getMonth()
    && created.getDate() === now.getDate();
};

const SellerShowroomSoundAlert: React.FC = () => {
  const audioRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);
  const previousWaitingRef = useRef<Set<string>>(new Set());
  const latestWaitingRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const pendingSoundRef = useRef(false);

  const getAudioContext = () => {
    if (audioRef.current) return audioRef.current;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioRef.current = new Ctx();
    return audioRef.current;
  };

  const unlockAudio = async () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();
      unlockedRef.current = ctx.state === 'running';
      if (unlockedRef.current && pendingSoundRef.current) {
        pendingSoundRef.current = false;
        playChime();
      }
    } catch {
      unlockedRef.current = false;
    }
  };

  const playTone = (ctx: AudioContext, frequency: number, start: number, duration: number, gainValue: number) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };

  const playChime = async () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch {}
      }
      if (ctx.state !== 'running') {
        pendingSoundRef.current = true;
        try { navigator.vibrate?.([180, 80, 180]); } catch {}
        return;
      }
      unlockedRef.current = true;
      const now = ctx.currentTime + 0.015;
      playTone(ctx, 659.25, now, 0.20, 0.17);
      playTone(ctx, 783.99, now + 0.22, 0.20, 0.18);
      playTone(ctx, 987.77, now + 0.44, 0.34, 0.20);
      try { navigator.vibrate?.([150, 70, 150]); } catch {}
    } catch {
      pendingSoundRef.current = true;
    }
  };

  const scheduleReinforcement = (passageId: string) => {
    [12000, 24000].forEach(delay => {
      const id = window.setTimeout(() => {
        if (latestWaitingRef.current.has(passageId)) playChime();
      }, delay);
      timersRef.current.push(id);
    });
  };

  useEffect(() => {
    const unlock = () => { void unlockAudio(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  useEffect(() => {
    let unsubscribePassages: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async firebaseUser => {
      unsubscribePassages?.();
      unsubscribePassages = null;
      previousWaitingRef.current = new Set();
      latestWaitingRef.current = new Set();
      initializedRef.current = false;

      if (!firebaseUser?.email) return;

      let profile: User | null = null;
      try {
        profile = await userService.getUser(firebaseUser.email);
      } catch {
        return;
      }

      if (!profile || profile.status !== 'active' || (profile.role !== 'seller' && profile.role !== 'user')) return;

      const companyId = companyIdForUser(profile);
      const storeId = storeIdForUser(profile);

      unsubscribePassages = showroomFlowService.subscribeSellerPassages(
        companyId,
        storeId,
        profile.email,
        items => {
          const waiting = items.filter(isWaitingToday);
          const currentIds = new Set(waiting.map(item => item.id));
          latestWaitingRef.current = currentIds;

          if (!initializedRef.current) {
            initializedRef.current = true;
            previousWaitingRef.current = currentIds;
            const recent = waiting.find(item => Date.now() - new Date(item.createdAt).getTime() <= 120000);
            if (recent) {
              void playChime();
              scheduleReinforcement(recent.id);
            }
            return;
          }

          const fresh = waiting.find(item => !previousWaitingRef.current.has(item.id));
          previousWaitingRef.current = currentIds;

          if (fresh) {
            void playChime();
            scheduleReinforcement(fresh.id);
          }
        },
        error => console.warn('Motyq: não foi possível acompanhar o aviso sonoro do showroom.', error),
      );
    });

    return () => {
      unsubscribePassages?.();
      unsubscribeAuth();
      timersRef.current.forEach(id => window.clearTimeout(id));
      timersRef.current = [];
      try { audioRef.current?.close(); } catch {}
    };
  }, []);

  return null;
};

export default SellerShowroomSoundAlert;
