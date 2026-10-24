# GUIA DE AGENTES E SKILLS: REGISTRO CONSOLIDADO

> **Origem e escopo da contagem:** 52 agentes e 1 skill (`search-first`) foram INFORMADOS no feedback do usuário, e os arquivos locais desses 52 não foram fornecidos integralmente. Os 22 agentes e 30 skills foram gerados no complemento anterior; os 6 agentes e 12 skills estão neste pacote. **80 agentes e 43 skills são o INVENTÁRIO ESPERADO**, não uma verificação da pasta real. Execute o verificador/inventário local para confirmar o que existe.

## Contagens esperadas

| Etapa | Agentes por ferramenta | Skills únicas | Situação |
|---|---:|---:|---|
| Base declarada no feedback | 52 | 1 | Não verificada integralmente neste ambiente |
| Complemento anterior | +22 | +30 | Disponível no pacote complementar anterior |
| Novo complemento | +6 | +12 | Incluído neste ZIP |
| **Total previsto após integração** | **80** | **43** | Depende de instalar e confirmar os arquivos anteriores |

Cada agente possui formatos próprios para Claude (`.claude/agents/*.md`), Gemini (`.gemini/agents/*.md`) e Codex (`.codex/agents/*.toml`). Skills do Codex/Gemini em `.agents/skills/*/SKILL.md` e Claude em `.claude/skills/*/SKILL.md`.

## Agentes da base (52, conforme relatório, NÃO verificados nesta entrega)

### Orquestração e planejamento

- `agent-organizer`
- `implementation-planner`

### Kit especializado PT-BR

- `arquitetura-sistema`
- `especialista-frontend`
- `especialista-backend-jobs`
- `especialista-design-system`
- `especialista-imagens`
- `especialista-mobile-a11y`
- `especialista-performance`
- `especialista-seguranca-privacidade`
- `especialista-seo`
- `especialista-testes-qa`
- `especialista-ux-ui`
- `revisor-independente`

### Frontend e mobile

- `frontend-developer`
- `react-pro`
- `nextjs-pro`
- `mobile-developer`
- `electron-pro`
- `ui-designer`
- `ux-designer`

### Backend e linguagens

- `full-stack-developer`
- `backend-architect`
- `typescript-pro`
- `python-pro`
- `golang-pro`
- `graphql-architect`
- `postgres-pro`
- `database-optimizer`

### Cloud, DevOps e SRE

- `cloud-architect`
- `deployment-engineer`
- `incident-responder`
- `observability-engineer`
- `performance-engineer`

### Qualidade e depuração

- `debugger`
- `code-reviewer`
- `architect-review`
- `qa-expert`
- `test-automator`

### IA e dados

- `ai-engineer`
- `prompt-engineer`
- `ml-engineer`
- `data-engineer`
- `data-scientist`

### Segurança

- `security-auditor`

### Documentação, pesquisa e produto

- `docs-researcher`
- `search-first`
- `api-documenter`
- `documentation-expert`
- `dx-optimizer`
- `legacy-modernizer`
- `product-manager`

## Agentes do complemento anterior (22, arquivos no pacote anterior)

### Sistemas distribuídos e baixo nível

- `distributed-systems-architect`
- `rust-systems-engineer`
- `cpp-kernel-engineer`
- `java-enterprise-architect`

### LLMOps e recuperação

- `llm-evals-engineer`
- `model-alignment-finetuner`
- `multi-agent-orchestrator`
- `vector-search-engineer`
- `edge-ai-quantization-specialist`

### Segurança avançada

- `red-team-pentester`
- `llm-security-red-teamer`
- `blue-team-soc-analyst`
- `cryptography-privacy-engineer`

### Plataforma e resiliência

- `platform-engineer`
- `chaos-engineer`
- `finops-cloud-economist`
- `dbre-reliability-engineer`
- `network-edge-architect`

### Governança e growth

- `tech-lead-cto`
- `growth-experimentation-engineer`
- `reverse-engineer`
- `accessibility-i18n-lead`

## Novos agentes desta expansão (6, arquivos incluídos)

- **`payments-fintech-architect`**: Arquitetura de pagamentos, conciliação e livro-razão; Projetar e revisar fluxos monetários com rastreabilidade, correção contábil e resistência a duplicidades; aplica-se a Pix, cartões, assinaturas, repasses e gateways.
- **`iam-auth-architect`**: Arquitetura IAM, OAuth/OIDC e autorização granular; Desenhar e auditar identidade, sessões, SSO e políticas de autorização consistentes entre frontend, APIs e serviços.
- **`native-ios-engineer`**: Engenharia iOS nativa com Swift e SwiftUI; Implementar e revisar apps nativos iOS com integridade de concorrência, acessibilidade e integração adequada com o ecossistema Apple.
- **`native-android-engineer`**: Engenharia Android nativa com Kotlin e Jetpack Compose; Implementar experiências Android nativas robustas, acessíveis e eficientes em bateria, lifecycle e background work.
- **`analytics-engineer`**: Analytics engineering com dbt, métricas e contratos de dados; Transformar dados brutos em modelos analíticos confiáveis e métricas de negócio definidas de forma consistente.
- **`compliance-dpo-officer`**: Governança de dados, privacidade e controles de conformidade; Mapear tratamento de dados e apoiar implementação técnica de controles de privacidade e evidências de governança regulatória.

## Skills da base e da expansão anterior (31 previstas)

- `search-first` (skill inicial declarada; arquivo não fornecido neste pacote).

- `agent-context-compression`
- `architecture-decision-records-adr`
- `clean-architecture-ddd-mapping`
- `contract-testing-pact`
- `dependency-security-remediation`
- `distributed-load-testing-k6`
- `docker-multi-stage-distroless`
- `event-sourcing-snapshotting`
- `flamegraph-profiling-analysis`
- `incident-postmortem-rca`
- `k8s-pod-hardening-budget`
- `llm-jailbreak-redteaming`
- `memory-leak-detection`
- `mutation-testing-analysis`
- `nielsen-heuristic-evaluation`
- `owasp-api-top10-audit`
- `playwright-flaky-test-elimination`
- `prompt-dspy-optimization`
- `property-based-testing`
- `rag-triad-evaluation`
- `redis-cache-stampede-prevention`
- `secrets-zero-leakage-audit`
- `sql-explain-analyze-mastery`
- `structured-output-enforcement`
- `synthetic-dataset-generator`
- `terraform-idempotent-modules`
- `threat-modeling-stride`
- `vector-index-benchmarking`
- `wcag-22-audit-checklist`
- `zero-downtime-migrations`

## Skills novas nesta expansão (12, arquivos incluídos)

- **`double-entry-accounting-ledger`**: Projetar e validar livro-razão de partidas dobradas para pagamentos, saldos, estornos e conciliação; usar quando dinheiro muda de titularidade.
- **`stripe-webhook-reconciliation`**: Processar webhooks Stripe e PSPs de forma autenticada, idempotente, resiliente e conciliável; usar quando pagamentos dependem de eventos assíncronos.
- **`oauth2-pkce-jwt-rotation`**: Auditar OAuth/OIDC Authorization Code + PKCE, sessões, rotação de refresh tokens e autorização de APIs sem expor credenciais.
- **`bundle-budget-tree-shaking`**: Investigar tamanho de bundles e definir budgets por rota com análise real, code splitting e tree-shaking seguro.
- **`form-validation-zod-react-hook-form`**: Projetar formulários robustos com Zod/React Hook Form quando a stack justificar, validação cliente-servidor e acessibilidade.
- **`email-deliverability-dns-setup`**: Planejar DNS e autenticação de e-mail SPF, DKIM, DMARC e políticas de reputação de forma gradual e verificável.
- **`whatsapp-business-api-integration`**: Integrar Meta WhatsApp Business Cloud API com consentimento, templates aprovados, webhooks e janela de atendimento verificável.
- **`github-actions-hardening-oidc`**: Revisar segurança de GitHub Actions com permissions mínimas, OIDC, pinagem de dependências e proteção de supply chain.
- **`semantic-release-conventional-commits`**: Introduzir versionamento SemVer e geração de changelog/releases a partir de Conventional Commits, sem publicar versões incorretas.
- **`app-store-fastlane-automation`**: Planejar pipelines Fastlane seguros para assinatura e distribuição iOS/Android, TestFlight e Google Play.
- **`grpc-protobuf-communication`**: Projetar contratos Protobuf e APIs gRPC robustas, versionáveis e observáveis entre serviços.
- **`dbt-transformation-pipeline`**: Construir pipeline dbt testável com fontes, staging, intermediate, marts, catálogo de métricas e data lineage.

## Roteamento sem redundância desnecessária

1. Escolha o especialista mais específico ao problema real; não acione agentes apenas porque existem.
2. Para pagamentos: `payments-fintech-architect` é dono do design monetário; segurança revisa autenticação; compliance classifica requisitos regulatórios; QA valida invariantes.
3. Para identidade: `iam-auth-architect` é dono dos fluxos de login/autorização; `security-auditor` e `revisor-independente` podem revisar sem editar.
4. Para apps nativos: `native-ios-engineer`/`native-android-engineer` operam código nativo; `mobile-developer` fica com cross-platform; QA valida experiências.
5. Para BI: `analytics-engineer` cuida de modelo semântico/dimensional e dbt; `data-engineer` cuida da ingestão/orquestração; `data-scientist` cuida de modelagem e inferência.
6. Para LGPD/GDPR e auditoria: `compliance-dpo-officer` coordena inventário/controles/pendências; assessoria jurídica valida enquadramento e `cryptography-privacy-engineer` aprofunda controles criptográficos.
7. Atividades de alto risco (migração financeira, credenciais, produção, publicação) exigem consentimento e plano de rollback; a presença de um agente não concede privilégios adicionais.

## Auditoria e contagem local

Execute `python INVENTARIAR_ECOSISTEMA.py "CAMINHO_DA_PASTA"` para obter a quantidade REAL por ferramenta, nomes ausentes, sobreposições, YAML/TOML e skills efetivamente presentes.
Confira `README_INSTALACAO.md` antes de distribuir e fazer commit/push.
