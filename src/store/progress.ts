import AsyncStorage from '@react-native-async-storage/async-storage';
import { Progress } from '../types';
import { createProgressStore } from './progressStore';

export * from './progressLogic';

const store = createProgressStore(AsyncStorage);

export const loadProgress = (): Promise<Progress> => store.load();
export const saveProgress = (p: Progress): Promise<void> => store.save(p);
