# AUDITORIA_GERAL.md | Procedimento executável de auditoria integral do sistema

> **Acionamento:** ler e aplicar este procedimento apenas quando o usuário pedir auditoria geral, revisão completa, reestruturação global ou conjunto de melhorias de todo o sistema. Este arquivo não deve ser importado automaticamente em toda tarefa simples.
>
> **Pré-requisito:** observar `AI_RULES.md` e consultar as seções pertinentes de `GUIA_TECNICO_DETALHADO.md`. Executar sobre o repositório real. Não supor stack, telas, fornecedores, dados ou obrigações legais.

## 1. Objetivo e entrega esperada

Faça uma auditoria transversal do sistema, encontre problemas confirmáveis, classifique seu impacto, implemente correções seguras e proporcionais, teste alterações de verdade e relate cobertura e pendências. Inclua frontend, backend e integrações que existirem, com atenção especial a identidade do produto, UX, mobile, acessibilidade, SEO, segurança, privacidade, tarefas assíncronas, performance e qualidade de código.

O objetivo não é reconstruir tudo para cumprir uma checklist, e sim melhorar resultados reais preservando funcionalidades. Faça uma primeira análise antes de iniciar modificações de grande alcance. Trabalhe em lotes verificáveis, não em uma reescrita cega.

**Atenção:** caso a superfície seja grande, não alegue cobertura total sem inventário completo. Entregue o máximo de correções seguras realizado na sessão e deixe claramente o backlog para continuidade; não transforme limites de acesso em alegações de sucesso.

## 2. Etapa zero: reconhecimento, restrições e baseline

### 2.1 Repositório

- Verificar diretório, raiz do repo, estado do Git, arquivos modificados pelo usuário, branch, convenções e documentação.
- Detectar linguagem, framework, versão, dependências, monorepo, gerenciador de pacotes, scripts, runtime, roteamento, bundler, renderização, hospedagem e testes.
- Inventariar diretórios de página/rota, componentes compartilhados, design tokens, providers, serviços, middlewares, endpoints, jobs, dados, configurações e deploys quando disponíveis.
- Identificar domínios/superfícies públicos, autenticados, administrativos, pagamentos, integrações e dados pessoais.
- Checar logs ou falhas conhecidos sem divulgar segredos.
- Respeitar alterações não relacionadas pré-existentes. Não realizar git reset, clean, force push, migração irreversível ou deploy sem autorização.

### 2.2 Produto

- Determinar tarefa principal e secundárias, público, etapas do funil e diferenciais a partir de materiais verificados.
- Identificar principais jornadas: descoberta, cadastro, login, recuperação, pesquisa, filtros, criação, edição, exclusão, compra, pagamento, upload, relatórios, área de usuário, área administrativa, suporte.
- Distinguir jornadas existentes de sugestões hipotéticas. Não adicionar features por padrão.

### 2.3 Baseline

- Registrar build, lint, testes e typecheck existentes ANTES de alterações significativas, sempre que for praticável.
- Registrar medidas iniciais realmente obtidas (Lighthouse, web vitals, tempo de API, tamanho de bundle etc.) e condições do teste. Se não houver medição, não inventar baseline.
- Em interfaces, capturar estado representativo de mobile e desktop se houver navegador disponível e ambiente de teste legítimo.
- Registrar áreas não acessíveis (credenciais, ambiente, build quebrado, serviços externos ou falta de dados de teste).

## 3. Matriz obrigatória de inventário e cobertura

Criar internamente ou em arquivo de trabalho uma matriz para cada página ou fluxo real:

| ID | Rota/componente/fluxo | Pública? | Persona | Ação principal | Dados/integr. | Estado inicial | Inspeção de código | Teste real | Problemas | Situação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... | ... | ... | Sim/Não | Sim/Não | ... | Verificado/Pendente/NA |

Percorrer layouts globais e componentes transversais uma vez em profundidade, depois observar cada instância particular relevante. A cobertura deve incluir estados de erro, vazio, carregamento, sucesso, permissões e mobile sempre que o elemento os possuir.

### 3.1 Registro único de problemas

Para cada achado, registrar:

- ID, página, arquivo e trecho/componente.
- Categoria: UX, visual, acessibilidade, mobile, performance, SEO, backend, segurança, privacidade, integração, operação.
- Reprodução ou evidência: código, vídeo, screenshot, teste, resposta HTTP, log sanitizado, métrica.
- Comportamento atual; esperado; impacto no usuário/negócio.
- Severidade: **Crítica**, **Alta**, **Média**, **Baixa**, **Informativa**.
- Probabilidade/frequência; extensão; reversibilidade; custo de correção e dependências.
- Solução proposta; risco de regressão; situação (confirmado, corrigido, validado, pendente, não aplicável).

Um único problema pode afetar várias heurísticas, mas deve ser contado uma vez no total de achados. Não inflar números para parecer completo.

## 4. Critérios de prioridade

1. **P0/Crítico:** vazamento/exposição de dados, bypass de autorização, fraude de pagamento, perda de dados, quebra severa da tarefa principal, falha ampla de disponibilidade.
2. **P1/Alto:** fluxo essencial difícil/inacessível, erro recorrente sem recuperação, regressão de mobile relevante, bloqueio de rastreamento de páginas estratégicas, timeout operacional frequente.
3. **P2/Médio:** inconsciência de estado, inconsistência compartilhada, tempo perceptível acima do necessário, copy ambígua, perda de eficiência significativa.
4. **P3/Baixo:** refinamento, decoração excessiva com baixo impacto, microinteração ou detalhe secundário.

Priorize não só pela estética: use risco × impacto × ocorrência × alcance, considerando esforço e dependências. Trabalhe primeiro em componentes compartilhados quando isso corrigir problemas reais em múltiplos fluxos.

## 5. Auditoria UX: Nielsen e Norman Door

Aplicar cada um dos dez princípios de Nielsen, verificando nas rotas e componentes existentes:

1. Status do sistema: feedback em saves, uploads, buscas, jobs, navegação, erros e mutações.
2. Correspondência com mundo real: nomes, moeda, unidades, datas, labels, mensagens e linguagem do domínio.
3. Controle/liberdade: cancelar, fechar, voltar, desfazer, sair de fluxos e confirmar destruições.
4. Consistência: os mesmos controles têm os mesmos nomes, estados e efeitos.
5. Prevenção: validação, evitar duplicidade, confirmação proporcional, permissões e limites.
6. Reconhecimento: localização, filtros ativos, seleção, próxima ação, instrução contextual.
7. Eficiência: excesso de cliques, busca, atalhos, auto-preenchimento, operações repetitivas.
8. Estética/minimalismo: ruído, informações redundantes, importância e densidade.
9. Recuperação: diagnóstico compreensível, resposta após erro, retry, preservação de dados.
10. Ajuda: instruções onde há dúvida real, documentação e tooltips acessíveis.

Para Norman Door, verificar **signifier, affordance, mapping, feedback, constraints, conceptual model e prevenção/recuperação**. Ao auditar um controle, perguntar se o usuário o identifica, entende o efeito, prevê o resultado e sabe o que aconteceu.

Não remover botões, ícones ou texto úteis apenas para deixar a tela visualmente limpa. Não criar confirmação para toda ação reversível.

## 6. Auditoria de autenticidade e design system

### 6.1 Inspeção visual

Revisar identidade, tipografia, layout, uso de cor, conteúdo, hero, cards, seções, CTAs, navegação, menus, forms, modais, tabelas, dashboards, rodapé, skeletons e empty states.

Aplicar as 30 verificações de padrões genéricos de `GUIA_TECNICO_DETALHADO.md`, especialmente gradiente agressivo, Lucide decorativo, três cards padrão, glassmorphism, bento por moda, prova social inventada, sparkles, orbes, dot grids, roxo/preto, neon, soft-rounding, fundo branco automático, font defaults, terminal cenográfico, setas animadas e copy clichê.

Para cada padrão: identificar onde ocorre, se cumpre função, custo cognitivo, possibilidade de preservar e alternativa específica do produto. Não trocar um template por outro, nem inventar screenshots, reviews ou números.

### 6.2 Hierarquia global

- Páginas: clareza do objetivo principal, agrupamento de seções, ação dominante e ritmo de leitura.
- Cards de preço: título, preço, condição e CTA com prioridade contextual.
- Dashboards: KPIs principais reconhecíveis, relação entre filtro e métrica, dados comparáveis.
- Tabelas: colunas essenciais, leitura de números, ações no contexto e densidade adequada.
- Formulários: labels, seções, obrigatoriedade, validação e botões principais.
- Modais: objetivo, informação crítica, confirmação/cancelamento e foco.
- Estados: vazio, erro, processamento, sucesso e indisponibilidade.
- Tokens: tipografia, espaçamento, superfícies, cores semânticas, borda, radius, elevação, motion e foco.

Não expandir todas as fontes, espaços ou cantos como regra. Construir hierarquia com conteúdo, tipografia, proximidade e contraste, não com sombras por padrão.

### 6.3 Motion

Verificar se há animações contínuas, scroll reveals, parallax, hover, press/tap, page transitions e componentes de efeitos. Remover ou limitar efeitos sem benefício. Usar animação funcional, `transform`/`opacity` quando adequado, reduced motion, fallback e verificação de custo de renderização.

### 6.4 Copy e conteúdo

Inspecionar textos genéricos, repetição de estrutura, termos imprecisos, benefícios vagos e inconsistência de nomenclatura. Reescrever com base no produto real, sem inventar provas sociais, dados comerciais e funcionalidades.

### 6.5 Segunda passagem visual

Após corrigir, procurar outros padrões genéricos não listados. Teste conceitual: retirando o logo/nome, a interface ainda comunica algo específico do produto? Se não, priorizar diferenciação baseada em fluxo, dados e conteúdo real, não ornamentação.

## 7. Auditoria mobile e responsividade profunda

Verificar quando possível as larguras: 320, 360, 375, 390, 414, 430, 768, 820, 1024, 1366, 1440, 1920 CSS pixels. Usar pelo menos uma amostra de mobile pequeno, mobile comum, tablet e desktop quando execução for limitada, declarando a amostragem.

### 7.1 Checklist de layout

- Overflow horizontal, grids, textos longos, zoom, orientação e safe-area.
- Fontes legíveis, inputs de 16px em iOS quando apropriado, contraste e largura de linha.
- Header/menus, sidebar, modal, overlays, toast, banners legais, teclado virtual.
- Mídia, carrosséis, tabs, tabelas e empty states adaptados sem omitir informação essencial.
- Uso adequado de `dvh`, sticky/fixed, safe-area e fallback para WebKit.

### 7.2 Checklist de toque

- Áreas de toque preferencialmente 48x48 quando pertinentes, afastamento de elementos adjacentes.
- Ação de alta frequência alcançável com polegar sem obstruir conteúdo.
- Hover nunca obrigatório; feedback `active`, `focus-visible`; gestos não exclusivos.
- CTA fixo somente se melhorar conversão sem diminuir acesso ao conteúdo e teclado.
- Nav hambúrguer, breadcrumbs, acordeões e cards de tabela apenas se adequados ao conteúdo.

### 7.3 Formulários

- `type`, `inputmode`, `autocomplete`, labels visíveis, blur/submit, mensagens inline, foco, dados preservados e segurança de persistência.
- Evitar `type=number` para CPF, CEP, conta, identificação ou telefone.
- Evitar validação incessante antes de o usuário terminar o campo.
- Links `tel:` e `mailto:` quando o contexto indicar ação de telefonar/enviar e-mail.

## 8. Auditoria de acessibilidade detalhada

Inspecionar WCAG 2.2 AA relevante e evidenciar a verificação:

- Contraste, foco, keyboard order, navegação só por teclado, semântica, headings e landmarks.
- Ícones de ação com nome que identifique objeto e consequência; tooltip como ajuda suplementar.
- `aria-label` genérico, duplicidade de nomes, elementos decorativos anunciados e roles incorretos.
- Dialog: gerenciamento de foco, escape, fechamento, nomes, conteúdo rolável e retorno do foco.
- Form: label, help/error, required, autocomplete, validação sem depender de cor.
- Leitor de tela: nome, papel, valor e anúncios de estados, quando houver teste real.
- Zoom, reflow, touch targets, alternativas a swipe, prefers-reduced-motion.
- `alt` descritivo quando imagem informativa, vazio se decorativa.
- Nenhuma informação exclusiva de cor, hover, animação ou som.

## 9. Auditoria de todos os botões e ações

Para cada variante e instância de comportamento relevante:

- O controle parece clicável? qual ação executa? resultado é antecipável?
- Existe label visível ou nome acessível descritivo? tooltip faria diferença para o entendimento?
- `aria-label` nomeia o objeto? Exemplo: "Editar endereço de entrega" é mais claro que "Editar" se houver vários registros.
- Os estados default, hover, focus-visible, active, loading, disabled, success e error são apropriados?
- Há indicação de ação destrutiva, confirmação/reversão, perda de contexto, cancelamento?
- Mouse, teclado e touch produzem efeito equivalente?
- Existe botão sem handler, handler sem feedback, card clicável ambíguo, `div` com onClick, link sem href?

Correção deve preservar design system e semântica. Incluir teste real para o que foi alterado quando possível. Não marcar corrigido por intuibilidade suposta do ícone.

## 10. Auditoria de estados assíncronos do frontend

Catalogar requests e mutations: carregamento de rota, busca, filtros, submit, autenticação, upload, download, atualização, exclusão, integração externa, pagamento e consulta de job.

Para cada operação:

1. Identificar disparo, estado e owner do estado.
2. Dar resposta imediata ao usuário.
3. Escolher skeleton, progresso mensurável, indeterminado ou mensagem adequada à operação.
4. Prevenir reenvio acidental; preservar dados e contexto.
5. Tratar vazio, erro, sucesso e ação de retry segura.
6. Garantir cancelamento ou descarte de resultado obsoleto quando necessário.
7. Usar optimistic UI apenas com rollback íntegro.
8. Tratar concorrência, timeout, offline e mutação duplicada.
9. Respeitar reduced motion e leitores de tela.
10. Validar rede lenta e erro de API com mock/controlador de rede real quando disponível.

Não declarar teste de rede ou API falha caso não tenha sido executado. Não exibir barra de progresso com porcentagem inventada.

## 11. Auditoria de trabalho pesado dentro do request

Encontrar operações síncronas de longa duração: arquivos, relatórios, importação, agregações, integrações externas, e-mails, exportação, transcodificação, consultas intensas.

Para cada candidata:

- Medir/estimar a partir de evidência latência, volume, timeout e custo; distinguir operação pequena de trabalho apto a job.
- Avaliar infraestrutura real (scheduler, worker, queue, banco, ambiente serverless).
- Propor ou implementar fila/job apenas quando benefício supera complexidade.
- Definir status durável, ID seguro, consulta autenticada, retries idempotentes, timeout, backoff, concorrência, observabilidade e acesso ao resultado.
- Evitar estados falsos, perda de jobs em crash, execução duplicada e notificações enviadas duas vezes.
- Testar disparo -> status -> execução -> conclusão -> erro -> retry quando infraestrutura estiver disponível.

Alteração estrutural com alto risco, nova dependência operacional ou migração de dados exige decisão/autorizações adequadas. Não montar uma infraestrutura fictícia para cumprir instrução.

## 12. Auditoria técnica de SEO integral

### 12.1 Inventário

Separar todas as rotas públicas, privadas, admin, produto, categoria, serviço, conteúdo, login, filtros e páginas dinâmicas. Mapear indexabilidade por tipo, canonical e intenção de busca.

### 12.2 Rastreamento e renderização

- Verificar sitemap, robots, HTML renderizado, links `<a href>`, configurações de SSR/SSG/CSR e necessidade real de mudança.
- Status de 200/301/404/410 corretos e evitar soft 404.
- URLs estáveis, redirects sem cadeia, filtros/parametrização sem duplicidade.
- `noindex` onde fizer sentido, sem expor dados privados; não confiar em robots/noindex como controle de segurança.
- Testar roteamento dinâmico, paginação, atualização de registros e remoção de conteúdo.

### 12.3 Conteúdo e metadados

- Titles/descriptions específicos, H1/heading, idioma, OG/Twitter, alt e canonical.
- Validação de links internos, conteúdo específico e alinhamento à intenção, sem stuffing.
- Hreflang quando houver equivalentes reais; SEO local somente com presença geográfica relevante.
- Metadados dinâmicos automaticamente coerentes com dados reais e páginas indexáveis.
- Schema.org e JSON-LD apenas com dados verdadeiros; validar sintaxe e compatibilidade com rich results.

### 12.4 Experiência e métricas

- Core Web Vitals, mobile, imagens, scripts de terceiros, conteúdo principal visível.
- Medir Search Console/PageSpeed quando autorizado; separar testes locais de dados de campo.
- Entregar indicadores a acompanhar: impressões, cliques, CTR, URLs indexadas, cobertura, posições contextuais, LCP/INP/CLS. Não prometer ranking.

## 13. Auditoria de performance profunda

- Identificar assets LCP, lazy loading mal aplicado, imagens enormes, fontes, dimensões ausentes, scripts grandes, bundling, hydration e renders repetitivos.
- Verificar compressão, cache, redirecionamentos, prefetching, CSS crítico via framework, conexões móveis lentas, consumo de bateria/animações e third parties.
- Verificar APIs, N+1, índices, queries lentas, payload, paginação, pool de conexões, timeouts e circuitos de falha quando pertinentes.
- Medir ou registrar impossibilidade; priorizar ganhos que não prejudiquem funcionalidade.
- Validar que otimização de performance não reduziu segurança, acessibilidade ou informações essenciais.

## 14. Auditoria de segurança e integridade de dados

### 14.1 Superfície

- Listar autenticação, sessão, recursos por usuário/tenant, papéis administrativos, APIs, banco, storage, functions, upload, webhooks e gateways.
- Investigar permissões reais em servidor/regras de banco, não apenas estado no frontend.
- Procurar falhas de IDOR/BOLA, acesso de outro usuário, privilege escalation e exposição de endpoints.
- Testar autorização com contas/fixtures autorizadas, não com dados privados de terceiros.

### 14.2 Inputs e credenciais

- XSS, sanitização de HTML/Markdown, injeções, CSRF, CORS, SSRF, uploads, redirecionamento, headers, rate limits e logs.
- Verificar uso indevido de secrets no frontend sem reproduzir seus valores em saída.
- Identificar dependências vulneráveis e risco real, não atualizar major só para zerar alerta.
- Verificar CSP, HSTS, framing, cookie Secure/HttpOnly/SameSite conforme arquitetura.

### 14.3 Pagamentos e eventos

- Se existirem Stripe/Mercado Pago/outro gateway: manter segredo no backend, validar preço/status no servidor, conferir assinatura de webhook e idempotência.
- Testar com sandbox/mock validado: dupla submissão, webhook repetido, transição inválida, timeout, reconciliação e erro de pagamento.
- Não executar transações reais nem alterar contas/dados de clientes sem autorização.

## 15. Auditoria legal, LGPD, privacidade e consentimento

### 15.1 Detectar realidade do negócio

Encontrar cadastro, login, pagamentos, contas, CPF, e-mail, telefone, endereço, IP, analytics, newsletter, scripts terceiros, pixels, WhatsApp, upload, localização, marketplace, assinaturas e conteúdo do usuário **apenas se existirem**.

### 15.2 Mapa de dados

Para cada categoria real: finalidade, coleta, armazenamento, uso, acesso, terceiros, possível transferência internacional, retenção e exclusão. Indicar o que foi verificado em código e o que requer confirmação operacional/jurídica.

### 15.3 Páginas e controles

- Avaliar necessidades de privacidade, termos, cookies, informação de fornecedor, suporte, consentimentos, direitos do titular e política de marketing.
- Criar/ajustar páginas somente com dados reais e contexto confirmado; campos empresariais sem fonte devem aparecer como pendências, não fatos inventados.
- Banner e preferência de cookies: rejeitar/aceitar/personalizar quando juridicamente requerido, revogar, bloquear tracker não essencial antes da autorização quando necessário.
- Não usar consentimento implícito, dark patterns ou caixa pré-marcada.
- Exclusão de conta e direitos: evitar promessa falsa de automação; preservar dados sujeitos à retenção obrigatória.

### 15.4 Legislação e classificação

Cada achado deve ter classe **Obrigatório**, **Necessário pelo contexto**, **Boa prática** ou **Opcional** e, quando classificado como legal, fundamentação e incerteza. Código não permite atestar conformidade jurídica completa.

## 16. Plano de correção e implementação

Depois do diagnóstico inicial:

1. Ordenar achados por severidade e dependências.
2. Criar plano de lotes pequenos (ex.: vulnerabilidade; fluxo de pagamento; componentes globais; forms; carregamentos; SEO público; refinamento visual).
3. Implementar primeiro correções seguras e de maior impacto. Preferir componentes compartilhados quando reduz duplicidade.
4. Para qualquer mudança, estimar raio de impacto e critérios de aceite.
5. Não recriar código sem necessidade nem migrar infraestrutura/SSR/DB só para satisfazer checklist.
6. Para mudanças de alto risco, irreversíveis ou que alterem contratos/regras de negócio, registrar decisão pendente e pedir autorização; continuar nos itens seguros.
7. Revisar diff e testes por lote, corrigindo regressões introduzidas.

**Não** afirmar que todas as recomendações da auditoria foram implementadas quando houver dependências externas, aprovação pendente ou limitações do ambiente.

## 17. Protocolo de validação: o que comprova uma correção

### 17.1 Camadas de evidência

- Inspeção estática demonstra presença/ausência de código, não experiência real.
- Teste de unidade valida uma função isolada, não um fluxo completo.
- Teste de integração valida o contrato entre camadas testadas.
- E2E/browser valida fluxo e UI dentro do ambiente e configurações executados.
- Verificação manual de teclado e leitor de tela exige uso efetivo dessas ferramentas.
- Lighthouse/lab e Web Vitals/campo são fontes diferentes; relatar separadamente.
- Validação legal requer análise adicional externa adequada, não substituída por teste de código.

### 17.2 Cenários mínimos quando aplicáveis

- Build, lint, typecheck, testes existentes; reportar scripts ausentes.
- Fluxos críticos: sucesso, erro, loading, vazio, retry, double submit, back/refresh.
- Segurança: sem autenticação, com autenticação, permissão negada, usuário diferente, token expirado.
- Mobile: layout, touch, zoom, teclado, modal, safe area, input e overflow.
- Acessibilidade: teclado, foco, nome acessível, contraste e leitor de tela quando disponível.
- Rede: lenta, timeout, offline/falha de API quando simulações realmente executáveis.
- SEO: sitemap/robots/canonical/status/metadados/HTML/estruturados.
- Jobs: criação, execução, status, duplicação, erro, retry, resultado posterior.
- Pagamentos: testes seguros/sandbox, duplicidade de evento, cancelamento, falha e reconciliação.
- Cookies: primeiro acesso, aceitar, recusar, personalizar, renovar preferência, refresh e mobile.

### 17.3 Revisão final

- Revisar `git diff` e arquivos editados, validar importações e dependências.
- Corrigir falhas novas de lint/typecheck/test/build quando puder.
- Comparar estado anterior e posterior, não afirmar ganhos quantitativos sem baseline comparável.
- Fazer segunda auditoria visual e heurística, verificando novos padrões genéricos, acessibilidade e regressões.
- Separar explicitamente falhas preexistentes, testes bloqueados e riscos restantes.

## 18. Relatório final padronizado

### A. Resumo executivo

- Stack e arquitetura identificadas (sem presunções).
- Objetivo do produto e jornadas examinadas.
- Rotas/módulos inventariados versus efetivamente examinados e testados.
- Quantidade de achados **únicos** por gravidade; corrigidos, validados, pendentes e não aplicáveis.

### B. Matriz de cobertura

| Área | Itens encontrados | Inspecionados | Corrigidos | Testados | Sem acesso/pendentes |
| --- | ---: | ---: | ---: | ---: | ---: |
| UX / Nielsen / Norman | | | | | |
| Autenticidade / hierarquia visual | | | | | |
| Mobile / acessibilidade | | | | | |
| Botões / formulários | | | | | |
| Fluxos assíncronos / jobs | | | | | |
| SEO / performance | | | | | |
| Segurança / privacidade / legal | | | | | |

Se uma quantidade não puder ser apurada com rigor, marcar "não determinado", não inventar zero.

### C. Achados priorizados

| ID | Local | Problema / evidência | Categoria | Gravidade | Decisão | Status |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

### D. Alterações realizadas

Informar arquivos, funções/componentes e efeito produzido. Separar alterações concluídas de propostas. Documentar decisões arquiteturais relevantes e trade-offs.

### E. Testes executados

| Teste/comando | Ambiente | Resultado | Evidência / limitação |
| --- | --- | --- | --- |
| | | | |

Distinguir PASSOU, FALHOU, NÃO EXECUTADO, NÃO DISPONÍVEL e PENDENTE. Não fabricar screenshots, relatórios de cobertura nem testes E2E.

### F. Pendências e riscos

Listar decisão de negócio, jurídico, infraestrutura, credencial, sandbox, documentação, aprovação e outras dependências. Cada pendência deve ter próximo passo acionável.

### G. Próximas prioridades

Ordenar por impacto, esforço, risco, dependência e mensurabilidade. Evitar lista genérica de "melhorias futuras".

### H. Indicadores a acompanhar

Conforme escopo: bugs/regressões, sucesso de tarefa, acessibilidade, Core Web Vitals, erros, latência p95, fila/falhas de job, indexação, impressões, cliques e CTR orgânico. Não inventar baseline nem prometer resultados.

## 19. Teste final sob a perspectiva de um usuário real

Pergunte, em cada jornada importante: sei onde estou? sei o que posso fazer? entendo o efeito dos botões? consigo perceber carregamento, erro e sucesso? posso desfazer/cancelar? preserva meus dados digitados? funciona com celular, teclado e tecnologias assistivas? há ações perigosas sem confirmação? os elementos expressam a identidade real do produto ou parecem de template? há algo que impeça a tarefa principal?

Se alguma resposta for negativa, documente a causa concreta e corrija quando seguro e dentro do escopo. Não confunda uma suposição do agente com teste com usuários.

**Encerramento:** auditoria boa não é um relatório longo. É uma relação verificável entre achados reais, correções entregues, testes efetivos e pendências honestas.
