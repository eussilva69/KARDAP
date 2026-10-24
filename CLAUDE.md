# CLAUDE.md | Instruções do Claude Code para este repositório

## Regras compartilhadas (importação automática)

@./AI_RULES.md

## Contexto do produto (importação automática)

@./CONTEXTO_PROJETO.md

## Como operar neste projeto

1. Considere `AI_RULES.md` o contrato de qualidade e de execução para este repositório. Mantenha-o como referência principal, sem reproduzir aqui todas as normas.
2. Trate `CONTEXTO_PROJETO.md` como fonte apenas para fatos confirmados; se estiver marcado como NÃO CONFIGURADO, inspecione o código e não invente informações de negócio. Trabalhe sobre os arquivos reais do projeto. Primeiro identifique stack, scripts e alterações pré-existentes no Git. Não assuma Next.js/React/Firebase se a stack não estiver confirmada.
3. Aplique as regras do arquivo compartilhado **apenas na parte do sistema afetada pela tarefa atual**, além dos efeitos colaterais relevantes. Não inicie uma auditoria geral por conta própria.
4. Se a tarefa for especializada e o resumo compartilhado não cobrir nuances importantes, consulte as seções pertinentes de `GUIA_TECNICO_DETALHADO.md` sem precisar carregar o documento inteiro.
5. **Quando o usuário solicitar auditoria geral/completa, revisão de ponta a ponta ou reconstrução abrangente**, leia `AUDITORIA_GERAL.md` e consulte `GUIA_TECNICO_DETALHADO.md` antes de editar. Esse documento é acionado sob demanda, não uma tarefa permanente a ser executada em todas as sessões.
6. Execute verificações reais disponíveis no repositório. Não anuncie como testadas funcionalidades que não executou e não invente evidências.
7. Preserve código e mudanças que já existiam antes da sessão; não faça commits, push, deploys, migrações ou ações externas irreversíveis sem pedido/autorização.
8. Ao encerrar, resuma alterações, arquivos, testes realmente executados e limites. Na auditoria completa, use o formato mais detalhado especificado no procedimento.

## Quando houver conflito ou lacuna

Instruções explícitas do usuário e regras do ambiente prevalecem, dentro dos limites de segurança. Prefira soluções conservadoras e localizadas; para consequências duráveis de alto risco, detalhe o risco e peça autorização. Nunca invente requisitos do negócio.

## Confirmar que este arquivo foi carregado

No Claude Code, use `/memory` para inspecionar os arquivos de instruções e verificar a importação de `AI_RULES.md`.

## Especialistas locais

Há 52 subagentes em `.claude/agents/*.md` cobrindo orquestração (Think Protocol), arquitetura, frontend, backend, bancos de dados, linguagens (Python, Go, TS), mobile, desktop, devops, SRE, QA, IA/LLMs, imagens e design. Consulte `GUIA_DE_AGENTES.md` para o catálogo completo e matriz de responsabilidades. Acione especialistas **somente quando acrescentarem análise independente ou tiverem escopo específico**, sem delegar automaticamente tarefas simples. Agentes auditores têm ferramentas limitadas à leitura; agentes implementadores podem editar apenas mediante escopo delegado. Delegações paralelas não devem modificar o mesmo arquivo.
