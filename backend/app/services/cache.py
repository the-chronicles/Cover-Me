import os
import json
from typing import Any, Optional
import redis

class CacheService:
    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL")
        self.client = None
        if self.redis_url:
            try:
                print(f"[Cache Service] Connecting to Redis at {self.redis_url}...")
                self.client = redis.from_url(self.redis_url, decode_responses=True, socket_timeout=3.0)
            except Exception as e:
                print(f"[Cache Service Warning] Could not connect to Redis: {e}. Caching is disabled.")
        else:
            print("[Cache Service] REDIS_URL not configured. Caching is disabled.")

    def get(self, key: str) -> Optional[Any]:
        """Retrieve and deserialize a value from cache."""
        if not self.client:
            return None
        try:
            val = self.client.get(key)
            if val:
                return json.loads(val)
        except Exception as e:
            print(f"[Cache Service Error] Failed to fetch cache key {key}: {e}")
        return None

    def set(self, key: str, value: Any, expire_seconds: int = 3600) -> bool:
        """Serialize and store a value in cache with expiration."""
        if not self.client:
            return False
        try:
            serialized = json.dumps(value)
            self.client.set(key, serialized, ex=expire_seconds)
            return True
        except Exception as e:
            print(f"[Cache Service Error] Failed to write cache key {key}: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Invalidate a cache key."""
        if not self.client:
            return False
        try:
            self.client.delete(key)
            return True
        except Exception as e:
            print(f"[Cache Service Error] Failed to delete cache key {key}: {e}")
            return False

cache_service = CacheService()
