export interface SourceAssetHandlePool {
  acquire: (id: string, url: string) => string;
  replace: (id: string, url: string) => string;
  release: (id: string) => void;
  get: (id: string) => string | undefined;
  has: (id: string) => boolean;
}

interface SourceAssetHandleRecord {
  url: string;
  refCount: number;
}

export function createSourceAssetHandlePool(
  releaseUrl: (url: string) => void = () => {},
): SourceAssetHandlePool {
  const handles = new Map<string, SourceAssetHandleRecord>();

  return {
    acquire(id, url) {
      const existing = handles.get(id);
      if (!existing) {
        handles.set(id, { url, refCount: 1 });
        return url;
      }

      if (existing.url !== url) {
        releaseUrl(existing.url);
        handles.set(id, { url, refCount: 1 });
        return url;
      }

      existing.refCount += 1;
      return existing.url;
    },
    replace(id, url) {
      const existing = handles.get(id);
      if (!existing) {
        handles.set(id, { url, refCount: 1 });
        return url;
      }

      if (existing.url === url) {
        return existing.url;
      }

      releaseUrl(existing.url);
      handles.set(id, { url, refCount: 1 });
      return url;
    },
    release(id) {
      const existing = handles.get(id);
      if (!existing) {
        return;
      }

      const nextRefCount = existing.refCount - 1;
      if (nextRefCount > 0) {
        handles.set(id, { ...existing, refCount: nextRefCount });
        return;
      }

      handles.delete(id);
      releaseUrl(existing.url);
    },
    get(id) {
      return handles.get(id)?.url;
    },
    has(id) {
      return handles.has(id);
    },
  };
}
