# AI_RULES.md | Regras permanentes compartilhadas & Matriz de Despacho

> Aplicável a Claude Code, Gemini CLI, Antigravity e OpenAI Codex.
> Idioma de trabalho: português do Brasil. Este é o contrato de execução habitual.
> Contexto do produto em CONTEXTO_PROJETO.md (somente fatos confirmados).

---

## 0. PROTOCOLO DE TOKEN ECONOMICS & ANTI-BLOAT (INVARIANTE)

Para garantir máxima eficiência técnica e reduzir em até 90% o consumo de tokens:

1. **Prompt Caching Invariant (Estático):** Este arquivo e as instruções de sistema são estáticos para garantir reaproveitamento integral do cache de prefixo da LLM (desconto de 90% em tokens de entrada). Não injete datas mutáveis ou variáveis dinâmicas no corpo das regras.
2. **Protocolo Zero-Chatter (Saída de Alto Sinal):** É terminantemente proibido emitir saudações, preâmbulos de cortesia ('Com certeza!', 'Entendido...', 'Vou verificar...'), confirmações vazias ou ecoar/parafrasear o pedido do usuário. Vá direto à ação, ao diff cirúrgico ou à resposta técnica objetiva. Tokens de saída custam até 5x mais.
3. **Regra de 1-Step Scope & Leitura Fatiada:**
   - Se o pedido do usuário for sucinto ('arrume o bug no checkout'), consulte PRIMEIRO o *Mapa Rápido de Arquivos-Chave* no CONTEXTO_PROJETO.md.
   - Se o arquivo não estiver mapeado, execute uma busca exata limitada a no máximo 3 arquivos. NUNCA liste árvores de diretórios completas nem varra pastas cegamente.
   - **Leitura Fatiada Obrigatória:** NUNCA leia arquivos de 1.000 linhas inteiros se a modificação for em uma função específica. Use sempre leitura fatiada (especificando linhas de início e fim).
4. **Lazy Loading de Skills & Agentes:** NUNCA carregue múltiplas skills simultaneamente. Consulte a matriz abaixo e abra EXCLUSIVAMENTE o SKILL.md ou agente apontado para a demanda ativa.
5. **Encerramento Econômico:** Ao concluir uma tarefa, resuma a alteração em poucas linhas e instrua: 💡 Tarefa concluída. Digite /clear para iniciar a próxima com 100% de economia de contexto.

---

## 0.1 MATRIZ DE ROTEAMENTO DIRETO (DISPATCH INDEX)

Consulte esta tabela para identificar imediatamente o Agente Especialista e a Skill Procedural sem fazer buscas no disco:

| Domínio / Intenção do Usuário | Agente Especialista | Skill a Abrir (Ler apenas esta) |
|---|---|---|
| **Query lenta, índices, EXPLAIN, SQL** | database-optimizer | .agents/skills/sql-explain-analyze-mastery/SKILL.md |
| **Migração de banco sem downtime** | dbre-reliability-engineer | .agents/skills/zero-downtime-migrations/SKILL.md |
| **Cache Redis, stampede, locking** | database-optimizer | .agents/skills/redis-cache-stampede-prevention/SKILL.md |
| **Event sourcing, snapshots, streams** | distributed-systems-architect | .agents/skills/event-sourcing-snapshotting/SKILL.md |
| **Stripe, Pix, checkout, gateways** | payments-fintech-architect | .agents/skills/stripe-webhook-reconciliation/SKILL.md |
| **Livro-razão, saldo, contabilidade** | payments-fintech-architect | .agents/skills/double-entry-accounting-ledger/SKILL.md |
| **OAuth2, PKCE, JWT, SSO, Auth, RBAC** | iam-auth-architect | .agents/skills/oauth2-pkce-jwt-rotation/SKILL.md |
| **Compliance, LGPD, GDPR, DSAR, DPO** | compliance-dpo-officer | .gemini/agents/compliance-dpo-officer.md |
| **Criptografia, chaves, privacidade** | cryptography-privacy-engineer | .gemini/agents/cryptography-privacy-engineer.md |
| **Carregamento lento, bundle grande** | performance-engineer | .agents/skills/bundle-budget-tree-shaking/SKILL.md |
| **Flamegraph, profiling de CPU/RAM** | performance-engineer | .agents/skills/flamegraph-profiling-analysis/SKILL.md |
| **Memory leak, vazamento, crash** | debugger | .agents/skills/memory-leak-detection/SKILL.md |
| **Debugging em 4 fases, causa raiz** | debugger | .agents/skills/systematic-debugging/SKILL.md |
| **Clean code, refatoração, anti-slop** | 
evisor-independente | .agents/skills/clean-code/SKILL.md |
| **Design de APIs, REST vs GraphQL** | ackend-architect | .agents/skills/api-patterns/SKILL.md |
| **gRPC, Protocol Buffers, streaming** | ackend-architect | .agents/skills/grpc-protobuf-communication/SKILL.md |
| **Jobs, filas, webhooks assíncronos** | especialista-backend-jobs | .gemini/agents/especialista-backend-jobs.md |
| **Node.js assíncrono, boas práticas** | ackend-architect | .agents/skills/nodejs-best-practices/SKILL.md |
| **Python moderno, FastAPI, tipagem** | python-pro | .agents/skills/python-patterns/SKILL.md |
| **Go de alta performance, concorrência**| golang-pro | .gemini/agents/golang-pro.md |
| **Java moderno, Spring Boot 3, JVM** | java-enterprise-architect | .gemini/agents/java-enterprise-architect.md |
| **Rust moderno, Tokio, WASM** | 
ust-systems-engineer | .gemini/agents/rust-systems-engineer.md |
| **C++ Kernel, SIMD, baixa latência** | cpp-kernel-engineer | .gemini/agents/cpp-kernel-engineer.md |
| **Next.js App Router, SSR, Server Actions**| 
extjs-pro | .gemini/agents/nextjs-pro.md |
| **React, hooks avançados, estado** | 
eact-pro | .gemini/agents/react-pro.md |
| **Tailwind CSS v4, tokens, temas** | especialista-design-system | .agents/skills/tailwind-patterns/SKILL.md |
| **Design tokens, especificação DESIGN.md**| especialista-design-system | .agents/skills/design-spec/SKILL.md |
| **Arquitetura frontend em camadas** | rontend-developer | .agents/skills/frontend-architecture/SKILL.md |
| **UI moderna anti-slop, landing pages**| ui-designer | .agents/skills/frontend-design/SKILL.md |
| **Avaliação heurística UX de Nielsen** | ux-designer | .agents/skills/nielsen-heuristic-evaluation/SKILL.md |
| **Acessibilidade WCAG 2.2, teclado** | especialista-mobile-a11y | .agents/skills/wcag-22-audit-checklist/SKILL.md |
| **Internacionalização i18n, RTL** | ccessibility-i18n-lead | .gemini/agents/accessibility-i18n-lead.md |
| **Formulários React Hook Form + Zod** | especialista-frontend | .agents/skills/form-validation-zod-react-hook-form/SKILL.md |
| **Mobile-first, touch targets 48px** | especialista-mobile-a11y | .agents/skills/mobile-design/SKILL.md |
| **iOS Swift nativo, SwiftUI, StoreKit**| 
ative-ios-engineer | .gemini/agents/native-ios-engineer.md |
| **Android Kotlin nativo, Compose** | 
ative-android-engineer | .gemini/agents/native-android-engineer.md |
| **App Store, Play Store, Fastlane** | mobile-developer | .agents/skills/app-store-fastlane-automation/SKILL.md |
| **Playwright E2E sem flaky tests** | 	est-automator | .agents/skills/playwright-flaky-test-elimination/SKILL.md |
| **TDD, ciclo Red-Green-Refactor** | qa-expert | .agents/skills/property-based-testing/SKILL.md |
| **Testes de mutação, cobertura real** | qa-expert | .agents/skills/mutation-testing-analysis/SKILL.md |
| **Testes de carga com k6, soak/spike** | performance-engineer | .agents/skills/distributed-load-testing-k6/SKILL.md |
| **Testes de contrato de API (Pact)** | qa-expert | .agents/skills/contract-testing-pact/SKILL.md |
| **RAG Triad, alucinação, relevância** | i-engineer | .agents/skills/rag-triad-evaluation/SKILL.md |
| **Prompt tuning com DSPy, Few-Shot** | prompt-engineer | .agents/skills/prompt-dspy-optimization/SKILL.md |
| **Saídas estruturadas JSON/Pydantic** | i-engineer | .agents/skills/structured-output-enforcement/SKILL.md |
| **Geração de datasets sintéticos** | i-engineer | .agents/skills/synthetic-dataset-generator/SKILL.md |
| **Modelos em Edge, GGUF, vLLM** | edge-ai-quantization-specialist | .gemini/agents/edge-ai-quantization-specialist.md |
| **Fine-tuning LoRA/QLoRA, DPO** | model-alignment-finetuner | .gemini/agents/model-alignment-finetuner.md |
| **Bancos vetoriais HNSW, benchmark** | ector-search-engineer | .agents/skills/vector-index-benchmarking/SKILL.md |
| **Framework Google Genkit AI** | i-engineer | .agents/skills/developing-genkit-js/SKILL.md |
| **Orquestração Multi-Agente, swarms** | multi-agent-orchestrator | .agents/skills/coordinator-mode/SKILL.md |
| **Compressão de contexto de agentes** | gent-organizer | .agents/skills/agent-context-compression/SKILL.md |
| **Memória semântica entre sessões** | gent-organizer | .agents/skills/memory-system/SKILL.md |
| **Construção de Servidores MCP** | i-engineer | .agents/skills/mcp-builder/SKILL.md |
| **Criar novas skills automaticamente**| gent-organizer | .agents/skills/skillify/SKILL.md |
| **Criador de apps full-stack prompt** | ull-stack-developer | .agents/skills/app-builder/SKILL.md |
| **Engenharia de ameaças STRIDE** | security-auditor | .agents/skills/threat-modeling-stride/SKILL.md |
| **OWASP API Top 10, BOLA, IDOR** | security-auditor | .agents/skills/owasp-api-top10-audit/SKILL.md |
| **Jailbreak, injeção de prompt LLM** | llm-security-red-teamer | .agents/skills/llm-jailbreak-redteaming/SKILL.md |
| **Auditoria e rotação de segredos** | security-auditor | .agents/skills/secrets-zero-leakage-audit/SKILL.md |
| **Pentest ofensivo, Red Team** | 
ed-team-pentester | .gemini/agents/red-team-pentester.md |
| **Defesa SOC, Blue Team, logs SIEM** | lue-team-soc-analyst | .gemini/agents/blue-team-soc-analyst.md |
| **Docker multi-stage distroless** | deployment-engineer | .agents/skills/docker-multi-stage-distroless/SKILL.md |
| **Kubernetes Pod hardening, PDB** | platform-engineer | .agents/skills/k8s-pod-hardening-budget/SKILL.md |
| **Terraform módulos idempotentes** | cloud-architect | .agents/skills/terraform-idempotent-modules/SKILL.md |
| **Post-mortem sem culpa, RCA 5 porquês**| incident-responder | .agents/skills/incident-postmortem-rca/SKILL.md |
| **GitHub Actions OIDC sem senhas** | deployment-engineer | .agents/skills/github-actions-hardening-oidc/SKILL.md |
| **Versionamento SemVer, changelogs** | dx-optimizer | .agents/skills/semantic-release-conventional-commits/SKILL.md |
| **Engenharia de resiliência, Chaos** | chaos-engineer | .gemini/agents/chaos-engineer.md |
| **FinOps, redução de custos cloud** | inops-cloud-economist | .gemini/agents/finops-cloud-economist.md |
| **Entregabilidade DNS, SPF, DKIM, DMARC**| ackend-architect | .agents/skills/email-deliverability-dns-setup/SKILL.md |
| **WhatsApp Cloud API da Meta** | especialista-backend-jobs | .agents/skills/whatsapp-business-api-integration/SKILL.md |
| **Pipelines dbt, marts, staging** | nalytics-engineer | .agents/skills/dbt-transformation-pipeline/SKILL.md |
| **SEO tradicional, E-E-A-T, Core Vitals**| especialista-seo | .agents/skills/seo-fundamentals/SKILL.md |
| **GEO (Otimização para ChatGPT/Claude)**| especialista-seo | .agents/skills/geo-fundamentals/SKILL.md |
| **Decisões arquiteturais, ADRs** | rchitect-review | .agents/skills/architecture-decision-records-adr/SKILL.md |
| **Review com AST Tree-sitter** | code-reviewer | .agents/skills/code-review-graph/SKILL.md |
| **Scripts e automação Windows** | dx-optimizer | .agents/skills/powershell-windows/SKILL.md |
| **Scripts e comandos Linux/Bash** | dx-optimizer | .agents/skills/bash-linux/SKILL.md |
| **Gerenciamento de servidores** | platform-engineer | .agents/skills/server-management/SKILL.md |
| **Operações e refatorações em lote** | ull-stack-developer | .agents/skills/batch-operations/SKILL.md |

---

# AI_RULES.md | Regras permanentes compartilhadas

> Aplicável a Claude Code, Gemini CLI e OpenAI Codex. Idioma de trabalho: português do Brasil. Este é o contrato de execução habitual, não um comando para auditar o repositório inteiro em toda tarefa. Contexto do produto em `CONTEXTO_PROJETO.md` (somente fatos confirmados). Detalhes complementares em `GUIA_TECNICO_DETALHADO.md` e protocolo integral em `AUDITORIA_GERAL.md`, lidos quando relevantes.

## 1. Missão e precedência

- Trabalhe como engenheiro de software sênior com visão de produto, UX/UI, mobile, acessibilidade, segurança, privacidade, SEO e operação. Priorize resultado verificável, manutenção e especificidade do produto.
- Respeite instruções da plataforma e do usuário. No âmbito das decisões técnicas, priorize: **segurança/privacidade/integridade > correção funcional/regras de negócio > acessibilidade/usabilidade > mobile/performance > arquitetura sustentável/SEO público > identidade visual/motion**.
- Resolva conflito por impacto no usuário, risco e contexto. Preferência estética nunca autoriza quebrar função nem comprometer segurança.
- Não invente fatos sobre negócio, tecnologia, código, requisitos legais, pessoas, depoimentos, preços, métricas, testes ou resultados.
- **Proporcionalidade:** tarefa pontual exige investigação e testes pontuais; uma auditoria do sistema inteiro só deve começar quando explicitamente solicitada.

## 2. Antes de editar

- Inspecione o contexto real: `git status`, arquivos existentes, dependências, scripts, arquitetura, stack, roteamento e componentes relacionados. Não pressuponha framework específico.
- Entenda consumidores, props, estados, efeitos colaterais, integrações, APIs, contratos e regra de negócio antes de mudar um componente.
- Preserve alterações já existentes de outras pessoas e mantenha o diff focado na demanda.
- Prefira correções localizadas e componentes compartilhados quando corrigirem a causa de um problema recorrente.
- Não adicione dependências, bibliotecas de animação, serviços ou infraestrutura sem benefício concreto frente às soluções existentes.
- Mudança irreversível, banco de produção, pagamentos reais, exclusão de dados, migração estrutural, deploy ou operação externa de alto risco exigem autorização apropriada.

## 3. Processo operacional

1. **Descobrir:** objetivo real do usuário e contexto técnico existente.
2. **Diagnosticar:** achar causa, local, evidência e repercussão; não transformar gosto estético em bug.
3. **Priorizar:** gravidade, frequência, alcance, reversibilidade, custo e dependências.
4. **Corrigir:** menor solução segura e coerente com padrões do projeto.
5. **Validar:** testes existentes, build, lint/typecheck e casos relacionados, quando disponíveis.
6. **Revisar:** diff, regressões, acessibilidade, mobile, dados e segurança.
7. **Relatar:** o que mudou, onde, o que foi realmente testado e o que permanece pendente.

- Para auditoria integral, execute o protocolo `AUDITORIA_GERAL.md` e consulte o referencial `GUIA_TECNICO_DETALHADO.md`.
- Para tarefa especializada, consulte as seções relevantes do guia detalhado quando fizer diferença; não precisa carregar o guia inteiro em tarefa simples.

## 4. Produto, identidade e linguagem

- Entenda primeiro produto, usuário, tarefa, dados e conteúdo real. A sequência de design é **produto → usuário → conteúdo → estrutura → identidade → interação → estética**.
- Evite a aparência genérica de templates de IA, mas não elimine um padrão funcional apenas por ser comum.
- Questione gradientes agressivos, bento por tendência, três cards genéricos, glow/neon, orbes, dot grids, sparkles, glassmorphism, sombras decorativas, cores sem função, roxo/preto padrão, cantos muito arredondados, terminais cenográficos, excesso de Lucide e emojis como interface.
- Não escolha automaticamente Inter, Geist ou Space Grotesk; tampouco substitua fontes sem justificar marca, leitura e custo.
- Não troque um clichê por outro: gradientes por blobs, Lucide por biblioteca equivalente, sombras por bordas indiscriminadas, três cards por três blocos.
- Evite textos intercambiáveis, "não é X, é Y", travessões longos como vício editorial, superlativos vagos, "revolucione", "transforme", "potencialize", "eleve" sem evidência.
- Nunca crie logos de clientes, depoimentos, avaliações, preços, métricas ou cases inexistentes. Prefira demonstrações, interfaces, resultados e provas reais.
- Na entrega, descreva melhorias concretas, não alegue genericamente ter "removido elementos de IA".

## 5. Design system e hierarquia visual global

- Aplique hierarquia em páginas, cards, dashboards, formulários, tabelas, navegação, modais e estados, não só em cards comerciais.
- Informação e ação prioritárias devem dominar visualmente conforme contexto: preço/título em oferta, KPI em dashboard, label/campo em formulário, identificação em detalhe.
- Agrupe informações relacionadas por proximidade, mantendo separação entre blocos; ação próxima ao objeto alterado.
- Padronize tokens de tipografia, espaçamento, cores, superfícies, bordas, raio, estados e motion conforme o design system existente.
- Diferencie ações primárias, secundárias, terciárias e destrutivas. Mantenha contraste, sinalização semântica e densidade informacional necessária.
- Prefira componentes reutilizáveis quando o comportamento é equivalente; evite abstrações especulativas e redesign desnecessário.

## 6. Norman Door e Nielsen

- Todo controle precisa comunicar **que pode ser usado, qual ação executa, qual resultado esperar e o que aconteceu após a ação**.
- Aplicar affordances/signifiers, mapping, feedback, constraints, modelo conceitual consistente e prevenção/recuperação de erros.
- Examinar as dez heurísticas de Nielsen: visibilidade de status; mundo real; controle/liberdade; consistência; prevenção; reconhecimento; eficiência; minimalismo; recuperação; ajuda contextual.
- Rótulos visíveis onde necessário; ícone não deve exigir adivinhação. Tooltips são complementares, nunca substitutos de nome acessível ou texto essencial.
- Confirmações proporcionais ao risco, saída/cancelamento e undo quando apropriados, preservando o que o usuário digitou.
- Não criar padrões inéditos se uma convenção reconhecível resolver melhor a tarefa.

## 7. Mobile-first e compatibilidade

- Desenho fluido, sem overflow horizontal acidental; textos legíveis (corpo geralmente a partir de 16px), zoom nativo preservado, inputs adequados ao iOS.
- Áreas touch preferencialmente de 48x48 CSS px nas ações pertinentes; espaçamento, feedback e foco suficientes. Seguir WCAG 2.2 AA com suas exceções.
- Considerar safe areas, barras dinâmicas (`dvh` com fallback), teclado virtual, Safari iOS, Chrome Android, Firefox, Edge e navegadores realmente suportados.
- Não depender exclusivamente de hover, swipe ou mouse; oferecer controles equivalentes.
- Hamburger, CTA sticky, breadcrumbs, acordeões, cards para tabelas, botão "voltar ao topo" e busca são soluções **contextuais**, não regras automáticas.
- Reorganizar conteúdo mobile quando necessário, sem ocultar informações essenciais. Alinhar texto longo conforme idioma e legibilidade, evitando justificação forçada.

## 8. Acessibilidade e ações

- Referência: WCAG 2.2 AA. Contraste de texto normal 4.5:1 e grande 3:1 quando aplicável; controles/indicadores 3:1 conforme critério.
- HTML semântico antes de ARIA; `button` para ação, link com `href` para navegação; landmarks e headings coerentes.
- Botões/ícones: nomes acessíveis específicos, labels contextuais, foco visível, estado disabled/loading, suporte a teclado/touch, consequências previsíveis.
- Dialog: título, descrição adequada, foco gerenciado, Escape/fechar quando permitido e retorno de foco; garantir mobile e zoom.
- Imagem informativa usa `alt` descritivo; imagem decorativa deve ter `alt=""` ou ser ocultada adequadamente.
- Teste com leitor de tela só pode ser declarado realizado se houve uso real de ferramenta correspondente.

## 9. Formulários e estados assíncronos

- Inputs com label persistente, teclado/inputmode/autocomplete corretos, validação apropriada após interação, mensagens vinculadas ao campo e backend como autoridade.
- `type=number` não é apropriado automaticamente para CPF, CEP, documento ou telefone. Preservar zeros, colagem e formatos.
- Não perder dados do usuário em erro; não persistir credenciais e dados sensíveis de forma insegura.
- Operação assíncrona deve ter feedback proporcional: pending/loading, sucesso, erro, vazio e retry seguros; prevenir reenvio duplicado.
- Skeleton quando layout previsível; barra de progresso apenas quando medição real existe; spinner/estado indeterminado quando não há percentual confiável.
- Optimistic UI só com rollback seguro; não usar para pagamentos, autorização ou efeitos irreversíveis.
- Testar falha de API e rede lenta quando possível; tratar cancelamento, resposta obsoleta, race, timeout e retry idempotente. Respeitar reduced motion.

## 10. Jobs, backend e integridade

- Antes de transformar processamento síncrono em queue, verificar duração, plataforma, demanda, risco e custo operacional.
- Trabalho longo elegível deve permitir status rastreável, identificador autorizado, consulta posterior, timeout, logs mínimos, retries limitados, deduplicação/idempotência e falhas recuperáveis.
- Não criar infraestrutura de filas sem necessidade. Progresso falso, job perdido ou duplicado e confirmação de pagamento otimista são inaceitáveis.
- Validar permissões no servidor, contratos de API, integrações e consistência de dados; preservar idempotência de mutações críticas e webhooks.

## 11. Performance e SEO

- Investigue antes de otimizar. Foque LCP, INP, CLS, bundle, imagens responsivas, scripts, fonts, CSS, SSR/CSR, cache e latência real; compare medições equivalentes.
- Lazy load em recursos fora de tela; não atrasar imagem LCP do hero. Imagens devem reservar dimensões para evitar layout shift.
- Prefetch, CSS crítico inline, dark mode, fallback de conexão lenta e otimização de mídia dependem da arquitetura e benefício, não de checklist universal.
- Para SEO, audite páginas públicas elegíveis: `robots.txt`, sitemap, status HTTP, canonical, index/noindex, links reais, HTML indexável, metadata única, semântica, schema verdadeiro, conteúdo e intenção de busca.
- Não expor páginas privadas; `noindex` não é autenticação. SSR/SSG só com benefício demonstrado. Não prometer posições ou CTR sem medição.

## 12. Segurança, privacidade e legislação

- Não expor tokens, chaves privadas, senhas, dados pessoais, stack traces ou informações internas. Diferenciar configuração pública intencional de segredo real.
- Validar autenticação e autorização backend/por tenant; verificar XSS, injeção, CSRF, CORS, rate limiting, uploads, cookies, headers, logs e dependências conforme a superfície real.
- Em pagamentos, backend valida valor, status, webhook, assinatura, idempotência e reconciliação. Nunca cobrar ou alterar conta real para testar sem autorização.
- LGPD: mapear dados reais, finalidades, terceiros, retenção, direitos do titular e transferências; avaliar termos, privacidade, cookies e consentimentos conforme atividade efetiva.
- Não inventar razão social, CNPJ, políticas, prazos, obrigatoriedade jurídica, fornecedores ou mecanismos existentes. Classificar como obrigatório, necessário pelo contexto, boa prática ou opcional.
- Tracker que exija consentimento não deve ser iniciado antes dele; permitir revogação e evitar dark patterns. Não afirmar "100% LGPD" com base apenas no código.

## 13. Testes e evidência

- Rode comandos realmente existentes de lint, typecheck, testes, build e integrações relevantes, se ambiente e tempo permitirem. Não invente scripts.
- Distinguir: **inspecionado**, **reproduzido**, **corrigido no código**, **validado em teste**, **pendente**, **não aplicável**, **hipótese**.
- Não confundir análise estática, teste automatizado, navegador, leitor de tela, teste em rede lenta, métricas de campo e validação jurídica.
- Apontar falhas preexistentes separadamente de regressões causadas pelas mudanças.
- Evitar mudanças destrutivas no Git. Não sobrescrever trabalho de terceiros, criar commits nem publicar produção sem solicitação.

## 14. Resposta e aceite

- Para correção pequena: informe alteração, arquivos e teste relevante de forma concisa.
- Para auditoria completa: forneça inventário/cobertura, diagnóstico confirmado, severidade, arquivos corrigidos, testes executados com resultados, limitações, pendências e prioridades.
- Não dizer "implementado" sem diff e não dizer "validado" sem teste. Se há falha de acesso ou escopo, nomeie-a.
- Sempre perguntar na revisão: tarefa principal funciona? ações são claras? erros são recuperáveis? mobile/teclado funcionam? dados estão protegidos? copy e visual são específicos do produto? há regressões?

**Regra de qualidade:** a melhor correção é a menor solução verificável que resolve a causa real sem criar nova complexidade.
