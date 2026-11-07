---
name: otimizar-performance
description: Audita e otimiza o desempenho de aplicações web full-stack com base em evidências. Use quando o usuário pedir análise de lentidão, melhoria de Core Web Vitals, APIs, banco de dados, renderização, cache, infraestrutura ou execução de um plano de performance. Examina 32 técnicas, aplica apenas as pertinentes à stack e valida o resultado com métricas e testes.
---

# Skill — Auditoria e otimização de performance web full-stack

## Missão

Atue como engenheiro sênior de performance de aplicações web, especializado em frontend, backend, bancos de dados, redes, infraestrutura e observabilidade. Investigue o código e o ambiente disponíveis; identifique gargalos reais; priorize ações por impacto, risco e esforço; implemente melhorias adequadas à stack; e comprove os efeitos com testes e métricas. **Analise os 32 itens deste documento, mas não implemente todos automaticamente.** Uma otimização sem justificativa pode aumentar custos, complexidade, latência ou risco operacional.

Esta skill serve para aplicações existentes e novas. Adapte instruções a linguagens, frameworks, arquitetura e infraestrutura efetivamente presentes no projeto. Não presuma React, Next.js, Node.js, PostgreSQL, Redis, Kubernetes, provedor de nuvem ou ferramenta de APM se não houver evidência.

## Como interpretar o pedido

- Se o usuário solicitar **auditoria**, inspecione e proponha; não altere código ou infraestrutura.
- Se solicitar **otimização**, investigue, implemente as mudanças seguras e pertinentes ao escopo autorizado, teste e reporte. Não pare apenas em recomendações quando houver meios de implementar.
- Se pedir **otimização completa**, avalie os 32 itens, agrupe as mudanças e implemente por prioridade; trate mudanças que exigem aquisição, credenciais, migração, alteração de produção ou provisionamento externo como pendências explícitas até haver autorização e acesso.
- Se houver limites de tempo, acesso ou ambiente, faça o máximo verificável e declare o que não foi possível medir ou executar.
- Se o usuário delimitar páginas, endpoints ou serviços, mantenha o foco; só amplie quando uma dependência direta justificar.

## Regras obrigatórias

1. **Medir antes de modificar.** Identifique ao menos um sintoma observável, a causa provável e a métrica de referência. Se não houver infraestrutura de medição, instrumente ou obtenha uma linha de base local; jamais invente dados.
2. **Inspecionar antes de escolher ferramentas.** Leia estrutura do repositório, scripts, gerenciador de pacotes, lockfiles, configurações, rotas, acesso a dados, serviços externos e deployment. Respeite padrões existentes.
3. **Preservar comportamento.** Não altere contratos de API, autorização, privacidade, SEO, acessibilidade, consistência de dados ou experiência funcional sem necessidade demonstrada e aprovação adequada.
4. **Evitar otimização por checklist.** Para cada item, registre `Aplicável`, `Já atendido`, `Não aplicável` ou `Pendente de infraestrutura/dados`, com motivo. Nunca diga que uma alteração foi feita sem evidência no código ou no ambiente.
5. **Preferir a solução mais simples.** Antes de adicionar infraestrutura ou dependências, verifique mecanismos já disponíveis no framework, banco, navegador, CDN e provedor.
6. **Mudar em lotes pequenos.** Faça alterações rastreáveis, validadas por testes e, sempre que possível, por medição comparativa antes/depois. Não faça refatorações extensas não relacionadas.
7. **Proteger produção.** Não execute migração destrutiva, `DROP`, alterações globais de configuração, exclusão de recursos, deploy, provisionamento pago ou mudanças de tráfego sem autorização explícita. Para índices/migrações, avalie bloqueios, concorrência, rollback e janela operacional.
8. **Proteger dados e segredos.** Não exponha tokens, dados pessoais, chaves de cache com informações sensíveis nem payloads confidenciais em logs, tracing, CDN ou cache compartilhado.
9. **Validar confiabilidade.** Toda otimização de cache, concorrência, fila, timeout ou renderização deve preservar tratamento de erro, idempotência quando aplicável, invalidação, observabilidade e comportamento de fallback.
10. **Não mascarar lentidão.** Skeleton, atualização otimista e streaming melhoram percepção, mas não substituem redução de latência real; avalie as duas dimensões separadamente.

## Fluxo de trabalho obrigatório

### Fase 1 — Reconhecer a arquitetura e estabelecer a linha de base

- Identifique frontend (SSR, SSG, SPA ou híbrido), backend, ORM, banco, cache, CDN, hospedagem, filas, observabilidade, volume de dados e endpoints críticos.
- Encontre as jornadas mais relevantes: entrada, login, busca, listagem, detalhe, formulários, upload e funcionalidades com IA, quando existirem.
- Avalie a disponibilidade de Chrome DevTools, Lighthouse, WebPageTest, testes de carga, logs, métricas APM, `EXPLAIN`/plano de execução, painel de hospedagem e dados de usuários reais (RUM).
- Registre, onde for possível: LCP, INP, CLS, TTFB, FCP, TBT de laboratório, tamanho de JS/CSS/imagens, número de requisições, tempo de busca, latências p50/p95/p99, taxa de erros, consultas lentas, CPU/memória, utilização de conexões e taxa de acerto de cache.
- Para Core Web Vitals, considere como referências de boa experiência no **p75** de usuários reais: LCP até **2,5 s**, INP até **200 ms**, CLS até **0,1**. Não apresente metas como resultados medidos. Segmente mobile/desktop e, quando útil, rede e rota.
- Registre contexto do teste: commit, ambiente, URL/rota, cache frio ou quente, dispositivo, limitação de rede, volume de dados e horário. Comparações devem manter condições equivalentes.

### Fase 2 — Diagnosticar e priorizar

- Localize os principais gargalos pelo caminho crítico: navegador → rede/CDN → servidor/API → banco/serviço externo → renderização.
- Monte uma lista ordenada por **impacto esperado, evidência, esforço, risco e reversibilidade**, distinguindo ganhos reais de percepção de velocidade.
- Priorize primeiro regressões e gargalos comprovados, depois otimizações de baixo risco. Não trate instalar Redis, CDN ou orquestrador como objetivo em si.
- Para cada mudança candidata, explicite: problema, evidência, mecanismo, arquivos/serviços atingidos, métrica-alvo, testes e possibilidade de rollback.

### Fase 3 — Implementar

- Use a stack existente e os padrões do projeto; se necessário, consulte a documentação correspondente à versão efetiva das bibliotecas.
- Faça uma alteração por grupo lógico; execute testes de unidade/integração, lint, build e testes funcionais pertinentes antes de continuar.
- Quando não for possível implantar infraestrutura externa, entregue configuração, código preparado ou instruções de implantação específicas, **sem marcar como concluído em produção**.
- Se houver conflito entre otimizações, escolha pelo caminho crítico medido: por exemplo, não aplicar lazy loading à imagem LCP; não armazenar conteúdo privado em cache público; não paralelizar chamadas dependentes.

### Fase 4 — Validar e relatar

- Compare antes/depois usando condições equivalentes, indicando percentis, unidades e amostras quando houver. Se não houver medição confiável, escreva `não medido`.
- Verifique correção funcional, tratamento de erro, acessibilidade, SEO, segurança, compatibilidade e consumo de recursos.
- Reavalie se a mudança deslocou o gargalo para outra camada.
- Preencha a matriz de cobertura dos 32 itens e apresente resultado no formato da seção **Entrega obrigatória**.

---

## Catálogo técnico: 32 otimizações

### A. Interface, carregamento e experiência percebida

#### 01. Skeletons de carregamento

- **Quando:** blocos previsíveis permanecem visivelmente vazios durante busca de dados, navegação ou carregamento de componentes.
- **Implementação:** crie placeholders com dimensões e geometria semelhantes ao conteúdo definitivo; use componentes de loading do framework, Suspense ou estados de requisição já adotados. Preserve espaço para evitar CLS; exiba skeleton apenas enquanto houver carregamento real. Dê nome acessível ao estado (`aria-busy` no contêiner, texto de status quando necessário), evite anunciar dezenas de placeholders e respeite preferência por movimento reduzido.
- **Verificação:** teste transição sucesso/erro/vazio e alteração de layout. Compare tempo percebido sem ocultar a latência real. Não use skeleton infinito após timeout.

#### 02. Imagens em WebP ou AVIF

- **Quando:** imagens raster representam parcela relevante do peso transferido ou do LCP.
- **Implementação:** use pipeline de otimização da stack, serviço de imagens ou CDN com negociação por `Accept`; disponibilize AVIF/WebP com fallback compatível quando necessário. Gere variantes responsivas por largura e qualidade, use `srcset`/`sizes`, mantenha proporção com `width`/`height` ou `aspect-ratio`, e otimize previamente imagens enviadas pelo usuário quando permitido. Evite recompressões cumulativas ou perda visual inadequada.
- **Verificação:** compare bytes, dimensões, qualidade perceptível e LCP; confirme `Content-Type` e cache das variantes. Não converta SVG em raster sem motivo.

#### 03. Eliminar chamadas duplicadas à API

- **Quando:** duas ou mais partes da interface solicitam o mesmo recurso com os mesmos parâmetros no mesmo intervalo.
- **Implementação:** inspecione a aba Network e o código; centralize a camada de consulta; use deduplicação de requisições em voo, cache por chave estável e biblioteca já existente (quando disponível). Inclua parâmetros, usuário/tenant, versão e permissões na identidade do recurso. Cancele consultas obsoletas com `AbortController` e elimine efeitos que disparam fetch redundante; não remova chamadas distintas apenas porque usam a mesma URL.
- **Verificação:** conte requisições por interação e teste alternância de usuário, atualização de dados, reconexão, erro e invalidação.

#### 04. Debounce em busca e autocompletar

- **Quando:** cada tecla inicia busca remota, validação cara ou cálculo pesado.
- **Implementação:** aplique debounce ao evento apropriado (referência inicial: **200–350 ms**, ajustável por medição); não atrase a atualização visual do input. Cancele timers e requisições anteriores; proteja contra respostas fora de ordem; trate composição de texto/IME, campo vazio, submit imediato e desmontagem do componente. Para eventos contínuos que exigem frequência controlada, avalie throttle em vez de debounce.
- **Verificação:** digitação rápida deve produzir menos chamadas sem resultados antigos substituírem novos; teste teclado, acessibilidade e tempo de resposta percebido.

#### 05. Streaming de respostas de IA

- **Quando:** o produto gera respostas textuais incrementais e o provedor suporta streaming.
- **Implementação:** habilite streaming no SDK/API apropriado; propague chunks pelo backend até o cliente com SSE, HTTP streaming ou WebSocket conforme a arquitetura. Envie eventos de início, delta, fim e erro; ajuste buffering do servidor/proxy, cancelamento e timeout de inatividade. Faça parsing incremental correto (incluindo UTF-8 e limites arbitrários de chunk), e acumule tokens na UI em lotes pequenos para evitar re-render por caractere. Não exponha chaves do provedor no navegador.
- **Verificação:** meça tempo até o primeiro token e tempo total; teste interrupção, reconexão, falha parcial, moderação/segurança quando aplicável e proxies intermediários. Não alegue streaming se o servidor acumular toda a resposta antes de transmiti-la.

#### 06. Atualização otimista da interface

- **Quando:** ações reversíveis e de baixa criticidade precisam de feedback imediato, como curtir, reordenar ou editar metadados simples.
- **Implementação:** aplique mudança local com identificador da operação, envie mutação e reconcilie estado após sucesso; em falha, reverta ou mostre estado de conflito e opção de tentar novamente. Evite duplicações com chaves de idempotência quando necessário; trate concorrência e refetch após confirmação.
- **Verificação:** simule 400/409/500, perda de rede, cliques repetidos e respostas fora de ordem. Não sinalize sucesso definitivo de pagamentos, saldos ou ações irreversíveis antes da confirmação do servidor.

#### 07. Lazy loading de imagens fora da tela

- **Quando:** há imagens distantes da viewport ou listagens extensas.
- **Implementação:** use `loading="lazy"` nativo ou mecanismo equivalente; inclua dimensões para manter layout estável e `srcset` quando apropriado. Priorize imagens acima da dobra e **não** aplique lazy loading à imagem principal responsável pelo LCP. Em conteúdo carregado dinamicamente, estabeleça limiar de antecipação proporcional ao uso e à rede.
- **Verificação:** inspecione Network/Performance para confirmar adiamento; valide rolagem rápida, preload excessivo e mudança de layout.

#### 08. Renderização no servidor ou no build (SSR/SSG)

- **Quando:** conteúdo inicial depende demais de JS no cliente, o HTML chega vazio, há necessidade de indexação ou páginas públicas mudam pouco.
- **Implementação:** compare SSG, ISR/revalidação, SSR e rendering híbrido conforme o framework. Pré-renderize conteúdo estável no build; use SSR onde há dados por requisição; mantenha componentes interativos no cliente apenas onde necessários. Separe dados públicos de dados por usuário, defina políticas corretas de cache e evite waterfalls na busca do servidor.
- **Verificação:** compare TTFB, LCP, tamanho de HTML/JS, hidratação, conteúdo visto sem JS quando relevante, metadata e SEO. Não converta indiscriminadamente páginas altamente personalizadas em páginas estáticas.

#### 09. Carregar scripts de terceiros depois do conteúdo crítico

- **Quando:** analytics, chat, mapas, anúncios ou widgets externos bloqueiam parse, CPU ou rede.
- **Implementação:** inventarie tags/scripts e seu custo; use `async`, `defer`, estratégias pós-interatividade/idle e carregamento sob interação conforme suportado. Preserve scripts estritamente necessários ao fluxo crítico, consentimento, atribuição ou segurança. Prefira carregamento por rota e remova terceiros sem uso efetivo.
- **Verificação:** revise waterfall, long tasks, FCP/LCP/INP e funcionamento das integrações, incluindo consentimento e eventos enviados.

#### 10. Dividir JavaScript por página e funcionalidade

- **Quando:** bundles iniciais incluem bibliotecas e telas que o usuário não utilizará naquele fluxo.
- **Implementação:** use code splitting por rota, importação dinâmica e chunks para componentes pesados; analise bundle antes de fragmentar. Remova imports globais não essenciais e assegure tree-shaking onde suportado. Prefetch seletivo apenas quando houver probabilidade razoável de navegação e capacidade de rede.
- **Verificação:** compare JS inicial, JS executado, TBT/INP e quantidade de requests; teste carregamento de chunks, falha de rede e rotas acessadas diretamente. Evite microchunks em excesso.

#### 11. Remover dependências não utilizadas

- **Quando:** o projeto possui bibliotecas, pacotes transitivos ou SDKs não usados que aumentam bundle, instalação, tempo de build, superfície de ataque ou manutenção.
- **Implementação:** inspecione manifests, lockfiles, imports dinâmicos, scripts, configurações, geração de código e ferramentas de build; use analisador de dependências compatível com a stack como sinal, não como verdade absoluta. Remova apenas pacotes comprovadamente sem uso, incluindo polyfills ou bibliotecas substituíveis por APIs nativas já suportadas. Atualize o lockfile pelo gerenciador atual e revise imports, arquivos gerados e dependências de runtime versus desenvolvimento. Não remova pacotes usados indiretamente em plugins, CLI, testes, CI ou deploy.
- **Verificação:** execute instalação limpa, build de produção, testes, scripts de CI pertinentes e análise de tamanho do bundle. Registre redução real de bytes/tempo quando mensurável e preserve compatibilidade com ambientes de produção.

#### 12. Virtualizar listas longas

- **Quando:** centenas/milhares de itens no DOM causam jank, memória elevada ou re-render caro.
- **Implementação:** use virtualizador consolidado ou recurso nativo da stack; renderize itens visíveis com overscan moderado, chaves estáveis, altura fixa ou medição dinâmica. Preserve foco, teclado, leitores de tela, posição de rolagem, seleção e carregamento incremental.
- **Verificação:** compare quantidade de nós DOM, CPU, memória, FPS/interações e estabilidade ao rolar rapidamente. Não virtualize listas pequenas sem evidência.

#### 13. Evitar re-renders desnecessários

- **Quando:** profiler mostra componentes atualizando por mudanças de estado irrelevantes ou computações caras.
- **Implementação:** mova estado para o menor escopo possível; estabilize props e chaves, selecione apenas fatias necessárias do estado compartilhado e memorize cálculos/componentes somente quando houver benefício medido. Considere transições e trabalho fora da thread principal para tarefas pesadas. Evite memoização indiscriminada ou comparações profundas mais caras que o render.
- **Verificação:** use profiler da stack para comparar contagem e duração dos renders nas interações críticas; teste consistência do estado.

#### 14. Hospedar e otimizar fontes

- **Quando:** fontes externas atrasam renderização, causam layout shift ou exigem múltiplas conexões.
- **Implementação:** quando licenças permitirem, hospede fontes em origem própria/CDN, preferencialmente WOFF2; limite pesos/variantes, faça subset das famílias usadas, configure `font-display` apropriado e preload apenas do arquivo crítico realmente utilizado na dobra. Defina cache durável para URLs versionadas e fallback com métricas semelhantes.
- **Verificação:** meça solicitações de fontes, transferência, renderização do texto e CLS; confira licenças, CORS, caracteres acentuados e ícones.

### B. APIs, rede, cache e processamento assíncrono

#### 15. Paginar resultados da API

- **Quando:** endpoints retornam coleções grandes, com alto payload, uso de memória ou consultas demoradas.
- **Implementação:** ofereça paginação server-side com tamanho máximo validado; prefira cursor/keyset para feeds volumosos ou sujeitos a inserções, com ordenação determinística e critério de desempate. Offset/limit pode servir em coleções moderadas. Retorne metadados mínimos (`nextCursor` ou equivalente), limite filtros e campos, e mantenha controles de autorização em cada página.
- **Verificação:** teste primeira/última página, itens inseridos/removidos, filtros, ordenação, cursor inválido, paginação vazia e custos de consulta sob volumes altos. Não calcule `COUNT(*)` caro em toda resposta sem necessidade.

#### 16. Servir arquivos estáticos por CDN

- **Quando:** o produto entrega JS, CSS, imagens ou downloads a usuários geograficamente distribuídos e o cache no edge ajuda.
- **Implementação:** use CDN ou edge já disponível; aponte assets versionados para origem adequada, configure HTTPS, compressão, cache key e invalidação. Mantenha URLs com hash de conteúdo para deploys seguros. Configure CORS para recursos que necessitem e proteja downloads privados com URLs assinadas ou autenticação apropriada.
- **Verificação:** cheque headers, cache hit/miss, localização/origem, deploy novo e rollback; não confunda CDN configurada no código com distribuição efetiva em produção.

#### 17. Enviar tarefas lentas para fila de trabalhos

- **Quando:** exportação, geração de relatórios, IA demorada, mídia ou operações não interativas excedem o orçamento de latência HTTP.
- **Implementação:** escolha fila existente ou equivalente durável; o endpoint valida e enfileira, devolvendo identificador de trabalho e status apropriado (por exemplo, 202). Worker separado processa com limites de concorrência, tentativas com backoff, política de falha final/dead-letter, monitoramento e idempotência. Disponibilize status/progresso por polling, eventos ou canal existente; proteja autorização de leitura e cancelamento.
- **Verificação:** teste reentrega, duplicidade, crash do worker, indisponibilidade do broker, timeout, cancelamento e conclusão. Não envie para fila operações que precisam de confirmação síncrona transacional.

#### 18. Ativar Brotli ou Gzip

- **Quando:** HTML, CSS, JS, JSON e outros payloads textuais são transferidos sem compressão eficiente.
- **Implementação:** habilite Brotli preferencialmente, com Gzip como alternativa, no proxy/CDN/servidor; respeite `Accept-Encoding`, `Content-Encoding` e `Vary: Accept-Encoding`. Use compressão estática de bundles quando suportada. Não comprima novamente AVIF/WebP, vídeos ou arquivos já comprimidos; avalie custo de CPU e questões de segurança em respostas sensíveis refletindo entrada do usuário.
- **Verificação:** inspecione headers e bytes transferidos em navegador e cliente HTTP, inclusive com CDN, e teste fallback sem Brotli.

#### 19. Cachear dados mais consultados com Redis ou mecanismo equivalente

- **Quando:** leituras repetidas e razoavelmente estáveis sobrecarregam banco ou serviços externos.
- **Implementação:** identifique queries/recursos quentes; escolha cache local, HTTP, banco, CDN ou Redis conforme compartilhamento e consistência necessários. Para cache-aside, construa chaves versionadas com escopo de usuário/tenant/permissão, TTL explícito, estratégia de invalidação em mutações, serialização segura e limites de memória. Considere stale-while-revalidate, proteção contra stampede (single-flight/jitter) e fallback em cache miss ou indisponibilidade.
- **Verificação:** meça hit rate, latência, carga do banco e dados obsoletos; teste expiração, invalidação, mudança de autorização e ambiente multi-instância. Não use cache público para dados pessoais ou privados.

#### 20. Timeout nas APIs externas

- **Quando:** chamadas a gateways, IA, autenticação e serviços terceiros podem ficar penduradas e consumir threads/conexões.
- **Implementação:** defina timeouts explícitos de conexão, leitura, inatividade e/ou prazo total conforme cliente e SLA; propague cancelamento, encerre recursos e ajuste timeout do servidor/proxy. Para operações idempotentes, considere retry limitado com backoff exponencial e jitter; para chamadas não idempotentes, use idempotency key ou política específica. Combine circuit breaker/bulkhead quando volume e falhas justificarem.
- **Verificação:** simule indisponibilidade, resposta parcial, lentidão, repetição e cancelamento; confirme resposta de fallback adequada, erro rastreável e ausência de efeito duplicado.

#### 21. Executar requisições independentes em paralelo

- **Quando:** waterfall mostra chamadas que não dependem do resultado umas das outras.
- **Implementação:** desenhe o grafo de dependências; lance chamadas independentes em concorrência (`Promise.all`/equivalente), mantendo sequenciais as dependentes. Defina teto de concorrência para lotes extensos; escolha comportamento correto para falha total ou parcial (`allSettled`/equivalente), mantendo cancelamento e timeouts.
- **Verificação:** compare duração da jornada e número de chamadas simultâneas; verifique limites do provedor, rate limits e carga do backend. Não transforme um endpoint saudável em pico de fan-out.

#### 22. Cache de arquivos estáticos no navegador

- **Quando:** CSS, JS, fontes e imagens versionadas são baixados novamente sem necessidade.
- **Implementação:** para nomes com hash de conteúdo, use política longa, por exemplo `Cache-Control: public, max-age=31536000, immutable`; para HTML e arquivos mutáveis sem hash, configure revalidação apropriada (`no-cache`/ETag conforme o caso). Para respostas autenticadas ou sensíveis, use `private` ou `no-store` conforme os dados. Garanta que deploys mudem URLs de assets e não quebrem clientes antigos.
- **Verificação:** repita navegação e deploy, observe status 200/304, cache do navegador e ausência de assets obsoletos ou vazamento entre usuários.

#### 23. Limitar requisições (rate limiting)

- **Quando:** endpoints públicos, login, busca, autocompletar ou APIs caras precisam se proteger de abuso e rajadas.
- **Implementação:** estabeleça cotas por identidade adequada (usuário, token, tenant e/ou IP com cuidado para NAT), janelas ou token bucket e limites diferenciados por custo/endpoint. Em ambiente multi-instância use armazenamento/edge compartilhado quando necessário. Responda HTTP 429 com `Retry-After` quando pertinente; monitore rejeições e permita exceções administradas. Combine com autenticação, autorização, proteção antiabuso e limites de payload.
- **Verificação:** faça testes de rajada, concorrência, clientes atrás de proxy, distribuição por instâncias e recuperação após janela. Não bloqueie usuários legítimos por configuração arbitrária.

### C. Banco de dados e consultas

#### 24. Corrigir consultas N+1

- **Quando:** uma listagem dispara uma consulta inicial seguida de uma consulta por item/relacionamento.
- **Implementação:** identifique com logging de queries, traces e contagem por request; prefira eager loading seletivo, joins, agregação, prefetch ou carregamento em lote (ex.: DataLoader no contexto adequado). Avalie multiplicação de linhas em joins 1:N; não troque N+1 por uma única consulta gigantesca sem medir.
- **Verificação:** compare número de round trips, tempo total, linhas retornadas e memória com datasets pequenos e grandes; confirme autorização por registro e ausência de duplicatas.

#### 25. Criar índices para consultas frequentes

- **Quando:** planos de execução mostram scans caros, filtros/joins/ordenações lentos em tabelas suficientemente grandes.
- **Implementação:** colete SQL real e parâmetros representativos; use `EXPLAIN` com estatísticas apropriadas, identifique seletividade e crie índices alinhados a `WHERE`, `JOIN`, `ORDER BY` e padrões de acesso. Considere índices compostos, parciais ou de cobertura somente quando sustentados pela engine e workload. Verifique índices redundantes, cardinalidade e custos de escrita/armazenamento; planeje criação sem bloqueio quando suportada.
- **Verificação:** compare plano, tempo p95, linhas examinadas, escrita e crescimento de armazenamento. Entregue migração reversível e não crie índices por nome de coluna apenas.

#### 26. Ajustar o servidor do banco de dados

- **Quando:** métricas indicam gargalos de memória, I/O, CPU, locks, saturação, autovacuum/estatísticas ou configuração inadequada.
- **Implementação:** descubra engine, versão, hospedagem e limites; meça conexões, queries lentas, cache hit do banco, buffers, waits, locks, replicação e disco. Corrija primeiro queries, índices e pooling; só depois proponha tuning de memória, paralelismo, manutenção, checkpoint e capacidade conforme as regras específicas do SGBD/provedor. Para serviços gerenciados, use mecanismos oficiais e documente necessidade de reinício.
- **Verificação:** teste mudanças em staging sob carga comparável, monitore regressão, custos, estabilidade e plano de rollback. Não altere parâmetros de produção às cegas.

#### 27. Selecionar apenas as colunas necessárias

- **Quando:** consultas carregam linhas inteiras, blobs, JSON grande ou relações não usadas.
- **Implementação:** substitua `SELECT *` ou projeções amplas por campos explicitamente consumidos; em ORM use `select`/projeção adequada e mapeie DTOs sem expor dados sensíveis. Evite selecionar campos adicionais por conveniência; mantenha campos essenciais a joins, chaves, autorização e serialização.
- **Verificação:** compare bytes transferidos do banco, uso de memória, payload API e tempo de serialização. Teste telas que reutilizam a entidade e contratos de API.

#### 28. Usar pool de conexões

- **Quando:** abertura de conexões por request, saturação ou alta concorrência aumentam latência/erros.
- **Implementação:** reutilize pool do driver/ORM ou pooler existente; dimensione o total considerando número de processos, réplicas, workers, limite do banco e conexões reservadas. Em ambientes serverless, avalie proxy/pooler suportado e compatibilidade com transações/prepared statements. Defina aquisição, idle timeout, lifetime e vazamentos; libere conexões mesmo sob erro.
- **Verificação:** acompanhe tempo de espera, conexões ativas/ociosas, timeouts, throughput e erro em testes de concorrência. Não aumente `max_connections` sem estimar memória e capacidade.

### D. Infraestrutura e observabilidade

#### 29. Rastrear requisições lentas com OpenTelemetry

- **Quando:** é difícil atribuir latência a frontend, middleware, backend, banco ou serviço externo.
- **Implementação:** instrumente entrada HTTP, chamadas externas, queries e jobs com OpenTelemetry ou ferramenta existente compatível; propague contexto e trace IDs entre serviços, crie spans nos trechos críticos e exporte para backend de observabilidade disponível. Use sampling proporcional à carga e registre duração, status e atributos seguros; evite dados pessoais, headers de autenticação e textos de prompts sem necessidade/consentimento.
- **Verificação:** provoque uma requisição lenta e confira trace completo, relações pai-filho, identificação de gargalo, overhead e tratamento de erro. Não afirme haver monitoramento se traces não chegam a um coletor.

#### 30. Distribuir tráfego entre múltiplas instâncias

- **Quando:** capacidade/alta disponibilidade exigem mais de uma réplica e o aplicativo suporta distribuição horizontal.
- **Implementação:** verifique se sessões, uploads, cache, locks e jobs não dependem de disco/memória local de uma única instância. Configure load balancer com health checks e readiness, encerramento gracioso, timeouts, limites e política de distribuição; compartilhe estado quando necessário e dimensione banco/pool/filas junto com o número de réplicas. Preveja autoscaling apenas quando compatível com métricas e orçamento.
- **Verificação:** execute carga e desligamento controlado de instância; monitore taxa de erro, latência p95, distribuição, utilização e custos. Não escale antes de resolver gargalo único compartilhado (como banco saturado).

#### 31. Monitorar velocidade de usuários reais (RUM)

- **Quando:** resultados de laboratório não explicam a experiência efetiva dos usuários ou é necessário detectar regressões pós-deploy.
- **Implementação:** integre `web-vitals`/instrumentação equivalente ou solução RUM já adotada; colete LCP, INP, CLS, TTFB e informações agregadas úteis de página, tipo de dispositivo e rede, respeitando consentimento e privacidade aplicáveis. Aplique amostragem, retenção e agregações por p75; correlacione releases com mudanças de métricas e erros. Evite instrumentação bloqueante.
- **Verificação:** confirme recebimento de eventos reais, segregação mobile/desktop, qualidade dos dados, ausência de informações pessoais e impacto desprezível do próprio monitoramento.

#### 32. Testar em celulares e redes lentas

- **Quando:** o público acessa por dispositivos de capacidade ou conectividade diversa; esta validação é recomendável em todas as otimizações visíveis ao usuário.
- **Implementação:** rode fluxos críticos em emulação e, quando possível, em aparelhos reais de entrada/intermediários; teste redes com alta latência/baixa banda, CPU limitada, cache frio/quente, modo economia, perda de rede e reconexão. Use DevTools, Lighthouse, WebPageTest e testes automatizados de jornadas. Inclua digitação, busca, navegação, scroll, formulários e streaming/atualização otimista onde existirem.
- **Verificação:** registre condições e resultados reproduzíveis. Compare tempo de carregamento, responsividade, layout, erros, consumo de dados e acessibilidade. Não extrapole resultados de desktop rápido para experiência móvel real.

---

## Critérios de decisão e conflitos frequentes

- **Skeleton vs. desempenho:** implemente feedback visual para latência legítima, mas priorize resolver origem da espera.
- **SSR/SSG vs. privacidade:** nunca pré-renderize ou compartilhe em cache conteúdo individual sem separar escopos corretamente.
- **Redis/CDN vs. consistência:** especifique invalidação e política de frescor antes de habilitar cache; se não houver benefício demonstrado, não adicione serviço.
- **Debounce vs. resposta imediata:** atualize o campo imediatamente e atrase somente a operação cara; preserve submit explícito sem espera artificial.
- **Lazy loading vs. LCP:** a imagem principal acima da dobra exige prioridade, não adiamento.
- **Streaming vs. renderizações:** agrupe deltas para evitar bloquear a thread principal; previna buffering no proxy.
- **Paralelismo vs. capacidade:** limite fan-out para não causar rate limits, saturação da API ou esgotamento do pool.
- **Fila vs. semântica:** tarefas assíncronas precisam de estado, reprocessamento e idempotência; transações críticas podem precisar permanecer síncronas.
- **Índices vs. escrita:** meça ganhos de leitura e penalidade em escrita/disco; evite duplicidade.
- **Autoscaling vs. banco:** mais instâncias não resolvem recursos compartilhados saturados e podem agravar o problema.
- **Otimização vs. segurança:** nunca sacrifique autorização, consistência financeira, integridade, proteção contra vazamento ou conformidade por latência.

## Protocolo de testes

Selecione verificações relevantes e execute as disponíveis:

1. **Frontend:** inspeção de rede e profiler, build de produção, chunks iniciais, carregamento de imagens, fontes, lazy loading, CLS, interação, teclado e leitores de tela quando aplicável.
2. **API:** testes de contrato, p50/p95/p99 e erro, duplicações, paginação, rate limit, timeout, cancelamento, concorrência, retry e respostas parciais.
3. **Banco:** `EXPLAIN`/instrumentação equivalente, contagem de queries, N+1, cobertura de índices, locks, pool, consultas lentas e integridade.
4. **Infraestrutura:** compressão, cache headers, CDN, cache distribuído, workers, traces end-to-end, health checks e simulação de indisponibilidade.
5. **Regressão:** lint, checagem de tipos, testes automatizados, build e smoke tests; compare os mesmos fluxos antes/depois.

Se uma ferramenta não estiver instalada, não introduza uma dependência pesada apenas para obter uma métrica simples; use os instrumentos já presentes. Nunca declare `passou` em teste que não foi executado.

## Entrega obrigatória

Ao concluir, responda nesta ordem:

### 1. Resumo executivo

- Quais eram os gargalos mais importantes, o que foi realmente corrigido e o que permanece.
- O risco/complexidade agregado e o impacto esperado; diferencie impacto **medido** de **estimado**.

### 2. Alterações realizadas

Tabela: `Prioridade | Item # | Problema encontrado | Alteração e arquivos/serviços | Como foi validado`.

### 3. Métricas antes/depois

Tabela: `Métrica | Antes | Depois | Ambiente/amostra | Observação`. Use `não medido` quando aplicável; inclua comparação percentual apenas se os dados forem equivalentes e disponíveis.

### 4. Cobertura dos 32 itens

Tabela resumida com **todos os números de 01 a 32**, status (`Aplicado`, `Já atendido`, `Não aplicável`, `Pendente`) e justificativa sucinta. Para um item `Aplicado`, identifique evidência verificável. Nenhum item pode desaparecer silenciosamente.

### 5. Testes, riscos e próximos passos

- Liste comandos/testes realmente executados e seus resultados.
- Destaque riscos, rollback, alterações dependentes de infraestrutura, credenciais, permissões, custos e impactos não mensurados.
- Indique as próximas ações em ordem de impacto, sem inventar prazos, resultados ou garantias.

## Critério de conclusão

Uma otimização está concluída somente quando há: (a) alteração implementada na camada correta, se aplicável; (b) validação funcional; (c) checagem de regressão; e (d) medição comparável ou justificativa explícita para a ausência de medição. Uma configuração apenas recomendada, escrita em exemplo ou ainda não aplicada ao ambiente deve permanecer `Pendente`.
