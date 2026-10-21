# Auditoria e otimização do Firestore

## Escopo e método

A auditoria estática cobre cliente web, APIs e serviços. Os números abaixo contam pontos de chamada no código e instâncias evitáveis conhecidas; não substituem as métricas faturadas do Firebase Console. Leituras reais variam com documentos retornados, reconexões, alterações e tempo de uso.

## Baseline observado

| Indicador | Antes | Problema |
|---|---:|---|
| Pontos `onSnapshot` no código | 14 | Assinaturas não eram compartilhadas entre consumidores |
| Pontos `getDocs` no código | 14 | Uma recarga de bairros ocorria imediatamente após cada salvamento |
| Pontos `getDoc` no código | 6 | Validações pontuais antes de gravações |
| Hooks simultâneos de uso mensal | até 3 | Mesmo documento observado por páginas diferentes |
| Hooks simultâneos de pedidos (30/35 dias) | até 3 | Janelas equivalentes geravam consultas distintas |
| Reordenação de categoria | N requisições | Uma chamada de rede por categoria alterada |

## Arquitetura aplicada

- A persistência oficial `persistentLocalCache`/IndexedDB continua servindo snapshots locais antes da rede.
- `subscribeShared` mantém uma instância por chave, compartilha o último snapshot e concede 5 segundos entre desmontagem/montagem durante navegação.
- Chaves sempre incluem `restaurantId`, período ou janela da consulta.
- Pedidos de 30/35 dias compartilham uma consulta de 35 dias e filtram a visualização em memória.
- Logout encerra listeners e remove a persistência local antes de outra conta reutilizar o dispositivo.
- Métricas locais registram listeners iniciados, reutilizados, encerrados, snapshots e documentos entregues.
- Reordenação usa batch atômico; bairros deixam de ser baixados novamente após uma gravação bem-sucedida.

## Comparativo esperado e verificável

| Cenário | Antes | Depois | Redução |
|---|---:|---:|---:|
| 3 consumidores de uso mensal | 3 listeners | 1 listener | 66,7% de listeners/conexões duplicadas |
| Pedidos em dashboard, vendas e relatório | até 3 listeners | 1 listener compartilhado | até 66,7% |
| Salvar bairros | 1 escrita + 1 releitura | 1 escrita | 100% da releitura imediata |
| Abrir configuração do delivery | API lia uso + listener lia uso | somente listener compartilhado | 1 leitura de documento evitada por abertura |
| Reordenar 2 categorias | 2 viagens de escrita | 1 batch | 50% das viagens; mesmas 2 escritas faturadas |
| Voltar a uma tela em até 5 s | novo listener | replay imediato do listener existente | elimina reconexão nessa navegação |

## Política de dados

| Dados | Estratégia | TTL/atualização |
|---|---|---|
| Restaurante, marca, configurações | IndexedDB Firestore + listener compartilhado | SWR em tempo real |
| Categorias e produtos | IndexedDB Firestore + listener compartilhado | SWR em tempo real |
| Pedidos ativos/históricos | memória + listener compartilhado na sessão | tempo real; limpeza no logout |
| Uso do plano | memória + listener compartilhado | tempo real por período |
| Financeiro/pagamentos | sem cache aplicativo persistente | servidor como fonte de verdade |

## Índices e paginação

- Chamados já usam página inicial de 20 itens e cursor sob demanda.
- Pedidos permanecem limitados a 1.500 documentos e janela temporal; a próxima etapa de escala é separar pedidos ativos de histórico paginado quando uma loja se aproximar desse limite.
- Índices compostos existentes cobrem pedidos, chamados, vídeos e consultas financeiras conhecidas.

## Limitações da medição

Sem acesso ao Firebase Console não é possível afirmar economia monetária histórica. Para validar em produção, compare `Document reads`, `Document writes` e `Active connections` por sete dias antes/depois, segmentando horários equivalentes. As métricas locais podem ser consultadas com `getFirestoreMetrics()` durante testes manuais.
