---
name: public-apis-catalog
description: "Catálogo exaustivo com mais de 1.500 APIs públicas gratuitas organizadas em 52 categorias (Geocodificação/CEP, Câmbio/Finanças, Clima, IA/ML, Autenticação, Dados de Teste, Saúde, Governos, Esportes). Inclui guia de seleção, segurança e templates de clientes resilientes."
when_to_use: "Quando o usuário solicitar integração de dados externos, busca de APIs gratuitas de qualquer nicho, dados para prototipagem ou padrões seguros de consumo de REST APIs."
allowed-tools: Read, Write, Edit, Glob, Grep
version: 2.0.0
priority: HIGH
---

# Catálogo Completo de APIs Públicas & Guia de Integração

> **Diretiva de Engenharia:** Nunca desenvolva scrapers artesanais ou serviços caros quando já existem APIs públicas consolidadas, gratuitas e abertas. Consulte o catálogo exaustivo em `references/apis-catalog.md` para encontrar endpoints verificados com suporte a HTTPS, CORS e sem necessidade de cartão de crédito.

---

## 1. Navegação no Catálogo Exaustivo (52 Categorias)

O repositório completo com mais de 1.500 APIs catalogadas está disponível em:
👉 [Catálogo de APIs](references/apis-catalog.md)

Para encontrar uma API específica sem ler todo o arquivo de 320 KB:
- Utilize `grep` ou busca de linha focando na categoria desejada:
  - **Geocoding & CEP:** BrasilAPI, ViaCEP, Nominatim/OSM, Zippopotam.
  - **Finance & Currency:** AwesomeAPI (BRL/USD/EUR/BTC), ExchangeRate-API, CoinGecko, Wallstreet.
  - **Weather:** Open-Meteo (grátis sem API Key), 7Timer, WeatherAPI.
  - **Development & Mock:** JSONPlaceholder, DummyJSON, RandomUser, DiceBear, ReqRes.
  - **Data Validation & Auth:** Abstract Phone/Email, IPify, UserAgentString.
  - **Media, Books & Entertainment:** Open Library, Unsplash, Pexels, TheMovieDB, PokéAPI.

---

## 2. Critérios de Seleção de APIs (Checklist de Segurança)

Ao selecionar uma API para o projeto, valide obrigatoriamente:

1. **Autenticação (Auth):**
   - `No`: Sem autenticação (ideal para protótipos e utilitários rápidos).
   - `apiKey`: Requer chave gratuita (guarde em `.env` e acesse via backend/server action).
   - `OAuth`: Requer fluxo OAuth2 (adequado para login social e permissões granulares).
2. **HTTPS:** Priorize SEMPRE APIs com HTTPS (`Yes`) para evitar bloqueios de conteúdo misto em produção.
3. **CORS:**
   - `Yes` ou `Unknown`: Pode ser chamada diretamente pelo navegador se não houver dados sensíveis.
   - `No`: DEVE ser chamada via backend proxy (Next.js Route Handler `app/api/...` ou server side) para contornar restrições de CORS.
4. **Resiliência e Fallbacks:** NUNCA acople o fluxo principal do usuário a uma API externa de terceiros sem um fallback local. Use o template em `references/client-wrapper-templates.md`.

---

## 3. Padrão Arquitetural de Consumo no Frontend/Next.js

```
Navegador (Client Component)
       │
       ▼  (fetch interno)
Next.js Route Handler (/app/api/dados)  <-- Injeta API Key secreta e aplica Cache
       │
       ▼  (fetch externo resiliente)
API Pública Gratuita (ex: Open-Meteo / BrasilAPI)
```
