# CATÁLOGO DE COMPLEMENTOS AVANÇADOS

O relatório recebido enumera **22 agentes nomeados** embora afirme 28. Este complemento contém exatamente os 22 pedidos, evitando inventar outros seis por estética numérica. Também inclui as 30 skills especificadas.

## Agentes novos

### Sistemas e baixo nível
- `distributed-systems-architect`: Arquitetura de sistemas distribuídos, consistência e resiliência em falhas parciais.
- `rust-systems-engineer`: Rust para sistemas confiáveis, concorrência async e módulos WASM.
- `cpp-kernel-engineer`: C++ e baixo nível, SIMD, cache locality, FFI e otimização orientada a perfis.
- `java-enterprise-architect`: Arquitetura Java moderna, Spring/Quarkus, Kafka e tuning JVM.

### LLMs e busca
- `llm-evals-engineer`: Medição confiável de qualidade de LLMs, RAG, alucinação e regressão.
- `model-alignment-finetuner`: Fine-tuning, LoRA/QLoRA e avaliação de alinhamento de modelos.
- `multi-agent-orchestrator`: Orquestração de agentes, fronteiras de responsabilidade e delegação segura.
- `vector-search-engineer`: Busca vetorial/híbrida, HNSW, BM25, reranking e confiabilidade de recuperação.
- `edge-ai-quantization-specialist`: Quantização e serving de modelos em edge e ambientes restritos.

### Segurança e criptografia
- `red-team-pentester`: Auditoria ofensiva autorizada de aplicações e APIs com escopo estrito.
- `llm-security-red-teamer`: Segurança defensiva de agentes contra prompt injection e abuso de ferramentas.
- `blue-team-soc-analyst`: Detecção, resposta e investigação defensiva de eventos de segurança.
- `cryptography-privacy-engineer`: Criptografia aplicada, proteção de chaves e engenharia de privacidade.

### Plataforma e resiliência
- `platform-engineer`: Platform engineering, golden paths e infraestrutura interna reutilizável.
- `chaos-engineer`: Resiliência e injeção de falhas controlada, com limites de impacto.
- `finops-cloud-economist`: FinOps, custos cloud e análise de preço-performance.
- `dbre-reliability-engineer`: Database reliability, migrações seguras, replicação e failover.
- `network-edge-architect`: Networking, CDN, edge compute e protocolos HTTP/3/QUIC.

### Estratégia e produto
- `tech-lead-cto`: Decisões estratégicas de engenharia, ADR, governança e dívida técnica.
- `growth-experimentation-engineer`: Experimentos de produto, feature flags e análise de efeitos causais.
- `reverse-engineer`: Análise autorizada de interfaces binárias, protocolos e compatibilidade.
- `accessibility-i18n-lead`: Acessibilidade avançada, i18n/l10n, RTL e design inclusivo.

## Skills novas

### Software e arquitetura
- `zero-downtime-migrations`: Migrações de banco sem indisponibilidade usando expand/contract, dual-read/write quando adequado e rollback.
- `clean-architecture-ddd-mapping`: Mapeamento de domínios, agregados, bounded contexts e dependências para refatoração incremental.
- `flamegraph-profiling-analysis`: Investigação instrumentada de CPU, heap e flamegraphs para localizar hotspots reais.
- `memory-leak-detection`: Rastreamento de vazamento de memória em frontend, serviços, workers e pools de conexões.
- `dependency-security-remediation`: Triagem e correção de dependências vulneráveis baseada em exposição real, sem atualizar tudo cegamente.

### LLMs e RAG
- `rag-triad-evaluation`: Avaliação de RAG por relevância do contexto, fidelidade da resposta e relevância da resposta ao pedido.
- `prompt-dspy-optimization`: Otimização orientada a dados de prompts e pipelines com DSPy ou metodologia equivalente, evitando overfit.
- `structured-output-enforcement`: Saída de LLM aderente a schema via constrained decoding, JSON Schema, Zod/Pydantic e tratamento de falhas.
- `agent-context-compression`: Compactação verificável de histórico, memória e contexto de agentes sem perder decisões e restrições críticas.
- `synthetic-dataset-generator`: Geração de datasets sintéticos representativos com diversidade, controles de privacidade e validação de domínio.

### Qualidade e testes
- `playwright-flaky-test-elimination`: Diagnóstico e redução de flakiness em testes E2E Playwright, com sincronização por estado e isolamento.
- `property-based-testing`: Testes generativos por propriedades/invariantes com shrinking e seeds reprodutíveis.
- `contract-testing-pact`: Verificação de contratos consumidor-provedor com Pact ou alternativa existente.
- `distributed-load-testing-k6`: Testes de carga, stress, spike e soak com k6, limites de segurança e métricas de degradação.
- `mutation-testing-analysis`: Avaliar se testes detectam mutações de código semanticamente relevantes.

### Dados e caching
- `sql-explain-analyze-mastery`: Analisar query plans, cardinalidade e índices para reduzir latência de consultas SQL reais.
- `redis-cache-stampede-prevention`: Desenho de cache com TTL, invalidação e mitigação de cache stampede/hot keys.
- `vector-index-benchmarking`: Benchmark de ANN/HNSW/IVF e busca híbrida com recall@k, latência, memória e freshness.
- `event-sourcing-snapshotting`: Snapshot e reconstrução segura de estado em event sourcing, com versionamento e idempotência.

### Segurança
- `threat-modeling-stride`: Modelagem de ameaças STRIDE com fronteiras de confiança, ativos e mitigação priorizada.
- `owasp-api-top10-audit`: Auditoria defensiva das categorias OWASP API Security Top 10 em APIs autorizadas.
- `llm-jailbreak-redteaming`: Testes adversariais controlados de prompt injection, vazamento e separação de instruções de agentes LLM.
- `secrets-zero-leakage-audit`: Auditoria de segredos em código, histórico e logs, com plano de rotação e sem expor os valores.

### Infra e SRE
- `docker-multi-stage-distroless`: Hardening e redução de imagens Docker com multi-stage e runtime mínimo sem root.
- `k8s-pod-hardening-budget`: Proteção operacional de pods Kubernetes com PDBs, probes, limites e políticas de segurança.
- `incident-postmortem-rca`: Postmortem técnico sem culpabilização com linha do tempo, impacto e causas sistêmicas.
- `terraform-idempotent-modules`: Módulos IaC Terraform/OpenTofu reutilizáveis com state locking, idempotência e prevenção de drift.

### UX e documentação
- `nielsen-heuristic-evaluation`: Auditoria de usabilidade baseada nas 10 heurísticas de Nielsen com severidade e evidência por fluxo.
- `wcag-22-audit-checklist`: Auditoria acessível WCAG 2.2 em fluxos, teclado, leitores de tela, touch e validações.
- `architecture-decision-records-adr`: Registro de decisões arquiteturais com contexto, opções, trade-offs, reversibilidade e impactos.

## Sobre redundância dos 52 agentes originais
O relatório cita 52 agentes existentes, mas seus arquivos reais não foram fornecidos nesta mensagem. A verificação de duplicações deve ocorrer **no diretório local**, comparando nomes, descrições, ferramentas e responsabilidades. Recomendação: preserve perfis especializados com trabalho realmente distinto; use roteamento pelo tipo de tarefa, não invoque todos de uma vez.

## Padrão de atuação
Agente = responsabilidade/escopo/limites. Skill = protocolo executável de investigação/implementação/teste. Ambos dependem das ferramentas reais e da permissão do ambiente.
