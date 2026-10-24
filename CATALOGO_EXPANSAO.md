# NOVA EXPANSÃO: 6 AGENTES E 12 SKILLS

Esta entrega é **aditiva**, não substitui nem contém automaticamente os outros 52 agentes/22 agentes/31 skills informados nos relatórios anteriores.

## Agentes incluídos

### `payments-fintech-architect`
Projetar e revisar fluxos monetários com rastreabilidade, correção contábil e resistência a duplicidades; aplica-se a Pix, cartões, assinaturas, repasses e gateways.
Acione quando: pagamentos, saldo de carteira, transferências, reembolsos, disputas, webhooks de gateway, lançamentos contábeis ou conciliação.

### `iam-auth-architect`
Desenhar e auditar identidade, sessões, SSO e políticas de autorização consistentes entre frontend, APIs e serviços.
Acione quando: login, SSO, MFA, OAuth/OIDC, sessão, tokens, RBAC/ABAC/ReBAC, permissões multi-tenant ou recuperação de conta.

### `native-ios-engineer`
Implementar e revisar apps nativos iOS com integridade de concorrência, acessibilidade e integração adequada com o ecossistema Apple.
Acione quando: projetos Xcode, Swift/SwiftUI, UIKit, StoreKit, APNs, extensões/widgets, perfis iOS ou problemas de performance e memória no iPhone.

### `native-android-engineer`
Implementar experiências Android nativas robustas, acessíveis e eficientes em bateria, lifecycle e background work.
Acione quando: Kotlin, Jetpack Compose, Android SDK, Gradle, WorkManager, notificações, Google Play Billing e bugs de ciclo de vida.

### `analytics-engineer`
Transformar dados brutos em modelos analíticos confiáveis e métricas de negócio definidas de forma consistente.
Acione quando: pipelines dbt, SQL analytics, DW/BI, dimensional modeling, testes de dados, métricas, funis ou dashboards inconsistentes.

### `compliance-dpo-officer`
Mapear tratamento de dados e apoiar implementação técnica de controles de privacidade e evidências de governança regulatória.
Acione quando: LGPD, GDPR, DSAR, ROPA, RIPD/DPIA, retenção, cookies, consentimento, SOC 2, ISO 27001 ou incidentes de dados pessoais.

## Skills incluídas

### `double-entry-accounting-ledger`
Projetar e validar livro-razão de partidas dobradas para pagamentos, saldos, estornos e conciliação; usar quando dinheiro muda de titularidade.

### `stripe-webhook-reconciliation`
Processar webhooks Stripe e PSPs de forma autenticada, idempotente, resiliente e conciliável; usar quando pagamentos dependem de eventos assíncronos.

### `oauth2-pkce-jwt-rotation`
Auditar OAuth/OIDC Authorization Code + PKCE, sessões, rotação de refresh tokens e autorização de APIs sem expor credenciais.

### `bundle-budget-tree-shaking`
Investigar tamanho de bundles e definir budgets por rota com análise real, code splitting e tree-shaking seguro.

### `form-validation-zod-react-hook-form`
Projetar formulários robustos com Zod/React Hook Form quando a stack justificar, validação cliente-servidor e acessibilidade.

### `email-deliverability-dns-setup`
Planejar DNS e autenticação de e-mail SPF, DKIM, DMARC e políticas de reputação de forma gradual e verificável.

### `whatsapp-business-api-integration`
Integrar Meta WhatsApp Business Cloud API com consentimento, templates aprovados, webhooks e janela de atendimento verificável.

### `github-actions-hardening-oidc`
Revisar segurança de GitHub Actions com permissions mínimas, OIDC, pinagem de dependências e proteção de supply chain.

### `semantic-release-conventional-commits`
Introduzir versionamento SemVer e geração de changelog/releases a partir de Conventional Commits, sem publicar versões incorretas.

### `app-store-fastlane-automation`
Planejar pipelines Fastlane seguros para assinatura e distribuição iOS/Android, TestFlight e Google Play.

### `grpc-protobuf-communication`
Projetar contratos Protobuf e APIs gRPC robustas, versionáveis e observáveis entre serviços.

### `dbt-transformation-pipeline`
Construir pipeline dbt testável com fontes, staging, intermediate, marts, catálogo de métricas e data lineage.

## Questões regulatórias e versões

- **PCI DSS**: a exigência de nível de validação depende de adquirente, marca, volume, escopo e contexto. Arquivos de agente não certificam conformidade.
- **OAuth/OIDC**: consultar RFCs e evolução de OAuth 2.1; diferenciar drafts de standards publicados.
- **Android Billing**: consultar obrigatoriedade e versões vigentes, evitando congelar "v6+" como requisito permanente.
- **E-mail**: introduzir DMARC gradualmente; `p=reject` não é passo inicial universal.
- **WhatsApp**: usar API oficial, opt-in e templates aprovados, conferindo janelas e políticas atuais.
- **GitHub Actions**: workflows de produção exigem revisão de trust boundary, pinagem e OIDC com permissões mínimas.
