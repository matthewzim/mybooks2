import { useEffect, useState } from 'react';
import { getSpineImageUrl } from '@/services/storage';

export function useSpineImageUrl(imageUrlOrPath: string | null | undefined) {
  const [spineImageUrl, setSpineImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const resolveImageUrl = async () => {
      const resolvedUrl = await getSpineImageUrl(imageUrlOrPath);
      if (!isCancelled) {
        setSpineImageUrl(resolvedUrl);
      }
    };

    resolveImageUrl();

    return () => {
      isCancelled = true;
    };
  }, [imageUrlOrPath]);

  return spineImageUrl;
}

export default useSpineImageUrl;
