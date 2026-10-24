# Client Wrapper & Resilience Templates for Public APIs

Este documento apresenta padrões defensivos de integração em TypeScript e Python para consumir qualquer API do catálogo público com resiliência, fallback e proteção de chaves.

---

## 1. Padrão TypeScript / Next.js (Server-Side Proxy + Cache + Fallback)

```typescript
// lib/services/apiClient.ts
export interface FetchApiOptions {
  timeoutMs?: number;
  retries?: number;
  revalidateSeconds?: number;
}

export async function fetchWithResilience<T>(
  url: string,
  fallbackData: T,
  options: FetchApiOptions = {}
): Promise<T> {
  const { timeoutMs = 5000, retries = 2, revalidateSeconds = 300 } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        next: { revalidate: revalidateSeconds },
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MyApp/1.0',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: T = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeout);
      console.warn(`[API Attempt ${attempt}/${retries} failed] ${url}:`, error);

      if (attempt === retries) {
        console.error(`[API Max Retries Reached] Usando fallback para ${url}`);
        return fallbackData;
      }

      // Exponential backoff: 300ms, 600ms...
      await new Promise((res) => setTimeout(res, attempt * 300));
    }
  }

  return fallbackData;
}
```

---

## 2. Padrão Python / FastAPI (Async Client com httpx e Tenacity)

```python
# services/api_client.py
import httpx
import logging
from typing import TypeVar, Optional, Any

logger = logging.getLogger("api_client")
T = TypeVar("T")

async def fetch_public_api(
    url: str,
    fallback: T,
    timeout_sec: float = 5.0,
    headers: Optional[dict] = None
) -> T:
    req_headers = {"User-Agent": "AntigravityBot/1.0"}
    if headers:
        req_headers.update(headers)

    try:
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.get(url, headers=req_headers)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning(f"Falha ao chamar {url}: {e}. Retornando fallback seguro.")
        return fallback
```
