import type { CollectionColor } from '@/types/library';

export const COLLECTION_COLORS: CollectionColor[] = ['amber', 'emerald', 'purple', 'blue', 'rose'];

/** Literal class names so Tailwind can see them. */
export const collectionDot: Record<CollectionColor, string> = {
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  purple: 'bg-purple-400',
  blue: 'bg-blue-400',
  rose: 'bg-rose-400',
};

export const collectionAccent: Record<CollectionColor, string> = {
  amber: 'border-t-amber-400',
  emerald: 'border-t-emerald-400',
  purple: 'border-t-purple-400',
  blue: 'border-t-blue-400',
  rose: 'border-t-rose-400',
};
