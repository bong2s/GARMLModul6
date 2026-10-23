import { MODEL_CONFIG } from '@/constants/models';
import type { TopicId } from '@/types/ar';

export function glbUrlForTopic(id: TopicId): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/models/${MODEL_CONFIG[id].asset}.glb`;
}