---
name: public-apis-catalog
description: "Curated catalog, architectural patterns, and security best practices for integrating free and open public APIs (geocoding, weather, finance, currency conversion, mock data, sports, media, and development tools)."
when_to_use: "When the user needs to integrate third-party data, find reliable free public APIs, implement currency exchange, geocoding/CEP lookup, weather widgets, or mock external data without building custom backend scrapers."
allowed-tools: Read, Write, Edit, Glob, Grep
version: 1.0.0
---

# Public APIs Catalog & Integration Guide

> **CORE PRINCIPLE:** Don't reinvent data services that already exist for free. Integrate well-maintained, reliable public APIs using defensive client wrappers, environment-based credentials, and intelligent fallback caching.

---

## 1. Top Verified Free API Categories

### 1. Geocoding & Addresses (Brasil & Global)
- **BrasilAPI:** `https://brasilapi.com.br/api/cep/v1/{cep}` (Free, fast, no auth required, Brazilian addresses, banks, CNPJ).
- **ViaCEP:** `https://viacep.com.br/ws/{cep}/json/` (Standard Brazilian postal code lookup).
- **Nominatim / OpenStreetMap:** Free global geocoding and reverse geocoding.

### 2. Currency, Exchange Rates & Finance
- **AwesomeAPI (Economia Brasil):** `https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL` (Real-time exchange rates, no token required).
- **ExchangeRate-API:** Standard global currency conversion rates.
- **CoinGecko:** Public crypto prices and market data.

### 3. Weather & Forecasts
- **Open-Meteo:** `https://api.open-meteo.com/v1/forecast` (Free for non-commercial, no API key required, accurate temperature, precipitation, wind).

### 4. Development & Mock Data
- **JSONPlaceholder:** Fake REST API for testing and prototyping (`posts`, `users`, `comments`).
- **DummyJSON:** Realistic mock products, carts, recipes, and users.
- **DiceBear:** Dynamic SVG avatar generation via URL.

---

## 2. Integration Best Practices

1. **Defensive Client Wrapper:** Always isolate external API calls in a dedicated service file (`lib/services/apiName.ts`) with a timeout (e.g. 5000ms) and typed error handling.
2. **Server-Side Proxy:** Never expose secret API keys on client-side React components. Route third-party calls through Next.js Route Handlers (`app/api/...`) or server actions.
3. **Graceful Fallbacks:** If the third-party API is down or rate-limited, provide sensible mock or cached fallback data so the user interface never crashes.
