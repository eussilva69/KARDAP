# ADR-001: Cache e listeners do Firestore

## Status

Aceito

## Contexto

O Kardap usa Next.js, Firebase Auth e Firestore em painel, PDV e cardápios públicos. Telas distintas podem consumir as mesmas consultas, enquanto dispositivos compartilhados não devem conservar dados privados após logout.

## Decisão

Manter a persistência IndexedDB oficial do Firestore para resposta cache-first, centralizar listeners equivalentes em um registro em memória com chaves contendo `restaurantId`, e limpar listeners, caches privados e persistência ao encerrar a sessão. Dados financeiros continuam vindos das APIs autoritativas e não entram no cache SWR aplicativo.

## Alternativas consideradas

| Opção | Benefícios | Custos |
|---|---|---|
| TanStack Query | SWR completo e maduro | Nova dependência e duas camadas de cache sobre Firestore |
| Cache próprio para tudo | Controle granular | Maior risco de inconsistência e duplicação do SDK |
| Firestore + registro mínimo compartilhado | Reutiliza SDK atual e reduz duplicação | Exige disciplina nas chaves e limpeza de sessão |

## Consequências

- Positivas: primeiro snapshot pode vir do IndexedDB; assinantes idênticos compartilham rede; navegação curta recebe replay imediato.
- Negativas: IndexedDB do Firestore não oferece persistência seletiva por coleção.
- Mitigação: limpeza explícita no logout, dados financeiros fora do cache aplicativo e fonte de verdade mantida no servidor.
- Revisitar quando: pedidos excederem frequentemente 1.500 documentos na janela ou houver requisito formal de criptografia local por campo.
