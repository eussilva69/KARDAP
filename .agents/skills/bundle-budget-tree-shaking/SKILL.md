---
name: bundle-budget-tree-shaking
description: "Investigar tamanho de bundles e definir budgets por rota com análise real, code splitting e tree-shaking seguro."
---

# bundle-budget-tree-shaking

## Quando usar
LCP/INP lento, JS excessivo, build pesado, bundles duplicados ou dependências aparentemente infladas.

## Informações necessárias
Stack real, bundler, build de produção, bundle analyzer, páginas principais e budget aprovado.

## Procedimento de execução
1. Identifique Vite/Webpack/Rollup/Next ou outro bundler, estratégia CSR/SSR, configuração de sourcemaps e saída do build.
2. Meça antes de alterar: tamanhos transferidos **gzip/brotli**, execução/parse JS, chunks por rota e import graph; documente hardware/rede usados.
3. Estabeleça budget plausível por rota crítica baseado em baseline e usuários, não um único número mágico para todo produto.
4. Descubra dependências redundantes, bibliotecas de ícones importadas integralmente, polyfills, locales, rich text e gráficos pesados.
5. Substitua imports amplos por entry points modulares quando tree-shakeable; use dynamic import por rota/funcionalidade **sem degradar LCP**.
6. Priorize renderização estável: código do hero/LCP deve ser crítico; adie charts/editores e funções secundárias. Configure cache adequado dos assets versionados.
7. Evite scripts pesados e listeners desnecessários; monitore custo de hidratação, INP e estabilidade visual.
8. Crie gate de CI para impedir regressão no budget, com tolerância/documentação de exceções.

## Casos de teste e validação
- Compare baseline e pós com mesma configuração e builds de produção.
- Rode smoke E2E nos componentes carregados dinamicamente.
- Verifique erros de import, CSS e chunk loading em conexão lenta/offline.
- Meça LCP/INP/CLS e teste ao menos uma rota típica com devtools ou laboratório disponível.
- Documente redução efetiva em bytes e tempo; não declare ganho sem medição.

## Evidências e entregáveis
Relatório de chunks, budget por rota, diffs de imports/config, resultado do build e comparação before/after.

## Antipadrões e limites
Não fazer lazy load de recursos LCP; tree-shaking não é garantido só pela sintaxe do import; não instalar analyzer pesado em runtime.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.


## Exemplos e Implementações de Produção

### 1. Configuração do Next.js Bundle Analyzer (next.config.js)
```javascript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Força tree-shaking em pacotes de terceiros populares
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
    'lodash': {
      transform: 'lodash/{{member}}',
    },
  },
};

module.exports = withBundleAnalyzer(nextConfig);
```

### 2. Padrão de Dynamic Import com SSR Seguro
```typescript
import dynamic from 'next/dynamic';

// Carrega componentes pesados (gráficos, editores, mapas) sob demanda
export const HeavyChart = dynamic(
  () => import('@/components/analytics/HeavyChart'),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse bg-muted rounded-xl" />,
  }
);
```
