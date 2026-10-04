import AsyncStorage from '@react-native-async-storage/async-storage';
import { Progress } from '../types';
import { DEFAULT_PROGRESS, sanitizeProgress } from './progressLogic';

export * from './progressLogic';

const KEY = 'zs:progress:v2';

export async function loadProgress(): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  }
}

export async function saveProgress(p: Progress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}
