# Kit universal de instruções para Claude Code, Gemini CLI e OpenAI Codex

Esta versão inclui **153 definições de subagentes** (51 perfis especializados), distribuídas de forma equivalente entre Claude Code, Gemini CLI e Codex, com catálogo e guia completo de uso em `GUIA_DE_AGENTES.md`.

Este kit mantém **uma fonte central de regras (`AI_RULES.md`)** e **um contexto do produto (`CONTEXTO_PROJETO.md`)** comuns às três ferramentas. Os arquivos específicos são leves. O guia técnico e o procedimento de auditoria são usados **sob demanda**, evitando carregar dezenas de páginas em toda tarefa pequena.

## 1. Organização dos arquivos

```text
seu-projeto/
├── AI_RULES.md                        # Regras compartilhadas para os três agentes
├── CLAUDE.md                          # Arquivo detectado pelo Claude Code
├── GEMINI.md                          # Arquivo detectado pelo Gemini CLI
├── AGENTS.md                          # Arquivo detectado pelo OpenAI Codex
├── CONTEXTO_PROJETO.md                # Contexto compartilhado; começa como NÃO CONFIGURADO
├── CONTEXTO_PROJETO.template.md       # Checklist detalhado para preenchimento
├── GUIA_TECNICO_DETALHADO.md         # Referência técnica extensa, sob demanda
├── AUDITORIA_GERAL.md                 # Protocolo de auditoria global, sob demanda
├── README_INSTALACAO.md               # Este guia (opcional dentro do projeto)
└── ...                                # Código já existente
```

## 2. Instalação simples

1. Faça backup dos `CLAUDE.md`, `GEMINI.md`, `AGENTS.md` ou regras já existentes. **Não substitua arquivos personalizados sem comparar e mesclar**.
2. Extraia o ZIP. Copie os **dez arquivos da raiz** e as pastas ocultas **`.claude/`, `.gemini/` e `.codex/`** para a **raiz do seu repositório Git**, ao lado de `package.json`, `pyproject.toml`, `Cargo.toml` ou do diretório principal, conforme o projeto.
3. Não coloque a pasta `KIT_IA_CLAUDE_GEMINI_CODEX` dentro do repositório como um nível adicional se quiser reconhecimento automático na raiz. Abra a pasta e mova os arquivos e as três pastas ocultas para a raiz.
4. Confirme que ambos `CLAUDE.md` e `GEMINI.md` contêm `@./AI_RULES.md` e `@./CONTEXTO_PROJETO.md`. **Não acrescente `@...` ao `AGENTS.md` imaginando que será uma importação automática**: nele o Codex recebe instruções explícitas para ler os arquivos compartilhados.
5. Abra uma sessão nova de cada agente a partir da raiz do repositório e verifique o carregamento conforme abaixo.

## 3. Qual arquivo cada ferramenta reconhece

| Ferramenta | Entrada automática | Uso das regras compartilhadas | Uso do contexto |
|---|---|---|---|
| Claude Code | `CLAUDE.md` | Importação `@./AI_RULES.md` | Importação `@./CONTEXTO_PROJETO.md` |
| Gemini CLI | `GEMINI.md` | Importação `@./AI_RULES.md` | Importação `@./CONTEXTO_PROJETO.md` |
| OpenAI Codex | `AGENTS.md` | Instrução explícita para ler `AI_RULES.md` | Instrução explícita para ler `CONTEXTO_PROJETO.md` |

**Nota:** a leitura de `AGENTS.md` é automática para o Codex, mas referências com caminhos Markdown dentro dele não têm semântica de importação automática garantida. Por isso, o documento **manda o agente abrir os arquivos**. Não confunda importação direta com consulta seguindo instruções.

## 4. Verificar se está funcionando

### Claude Code

Inicie na raiz do projeto e use:

```text
/memory
```

Verifique `CLAUDE.md`, `AI_RULES.md` e `CONTEXTO_PROJETO.md`. Se não carregarem, confira nome, pasta e linhas `@./...`.

### Gemini CLI

```text
/memory show
```

Para recarregar após editar:

```text
/memory reload
```

Verifique se o contexto apresenta `GEMINI.md`, as regras comuns e o contexto do projeto.

### OpenAI Codex

Inicie uma **nova sessão** na raiz e solicite:

```text
Informe quais arquivos de instruções do repositório foram identificados. Leia AI_RULES.md e CONTEXTO_PROJETO.md e resuma três regras principais e o status do contexto.
```

A identificação automática começa no `AGENTS.md`. Se o Codex não abrir os outros dois arquivos, solicite explicitamente que os leia e confira se a instalação da ferramenta permite leitura de arquivos. `AGENTS.md` não é tratado como `CLAUDE.md` e `GEMINI.md` para importação `@./arquivo`.

## 5. Como usar o contexto compartilhado

`CONTEXTO_PROJETO.md` já existe e é importado/consultado desde o início, mas está expressamente marcado como **NÃO CONFIGURADO**. Isso evita inventar informações sobre a empresa.

1. Abra `CONTEXTO_PROJETO.template.md` como lista de informações que vale registrar.
2. Peça a um agente para identificar **somente** dados técnicos comprováveis (stack, scripts, dependências, roteamento, banco, autorização e integrações existentes) e registrar fonte/arquivo correspondente.
3. Preencha ou aprove diretamente os itens humanos: objetivo de negócio, público, tom de marca, diferenciais, dados empresariais, domínio público, política comercial e responsáveis.
4. Atualize `CONTEXTO_PROJETO.md` quando algo realmente mudar; preserve apenas informações públicas ou apropriadas ao repositório. Nunca armazene segredos.

**Prompt para preencher a parte técnica:**

> Leia `CONTEXTO_PROJETO.md` e `CONTEXTO_PROJETO.template.md`. Inspecione o repositório e complete exclusivamente os campos técnicos que você conseguir comprovar nos arquivos, citando os caminhos. Mantenha os pontos de estratégia, marca, legal e negócio como não informados e não invente informações. Não altere o código.

## 6. Tarefas pontuais x auditoria geral

**Tarefa pontual:** pedir uma alteração normal. O agente aplica `AI_RULES.md` ao escopo relevante, sem varrer todo o projeto sem motivo.

**Auditoria geral**, quando explicitamente solicitada:

> Faça a auditoria integral deste repositório conforme `AUDITORIA_GERAL.md`, obedecendo `AI_RULES.md`, `CONTEXTO_PROJETO.md` e consultando `GUIA_TECNICO_DETALHADO.md`. Identifique arquitetura, páginas, componentes e fluxos reais. Classifique riscos, implemente correções seguras e proporcionais, execute testes disponíveis e entregue evidências, matriz de cobertura, mudanças, limitações e pendências. Não invente resultados nem faça operações irreversíveis sem autorização.

`GUIA_TECNICO_DETALHADO.md` e `AUDITORIA_GERAL.md` **não são importados em toda sessão**. A referência a eles não dispara auditoria sozinha.

## 7. Uso de vários agentes no mesmo repositório

- Edite normas comuns em **`AI_RULES.md`**, jamais mantenha três cópias diferentes das mesmas regras.
- O contexto da empresa pertence a **`CONTEXTO_PROJETO.md`** e deve conter apenas fatos confirmados.
- Ajustes específicos da ferramenta pertencem a `CLAUDE.md`, `GEMINI.md` ou `AGENTS.md`.
- Mudanças complexas e relatórios de auditoria seguem o mesmo documento `AUDITORIA_GERAL.md`.
- **Não rode Claude, Gemini e Codex modificando a mesma árvore de arquivos simultaneamente.** Use branches ou worktrees diferentes, revisão de diffs e integração coordenada.
- Não adicione vários `AGENTS.md` em subdiretórios sem necessidade: no Codex, arquivos mais próximos da pasta atual podem prevalecer sobre os de níveis acima. Verifique instruções preexistentes.
- Estas instruções não executam automações nem substituem revisão humana, ferramentas de teste, permissões ou segurança real.

## 8. Validação do kit e limitações

O pacote contém **instruções genéricas, não código da aplicação**. Conferir a instalação e testar cada ferramenta **exige abrir o repositório real** no ambiente correspondente. A consistência dos arquivos do kit pode ser verificada estaticamente, mas isso não comprova auditoria, SEO, LGPD ou testes funcionais da sua aplicação.

## 9. Referências técnicas

- OpenAI Codex (`AGENTS.md`): https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Claude Code (`CLAUDE.md`): https://code.claude.com/docs/en/memory
- Gemini CLI (`GEMINI.md` e importação de arquivos): https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/memport.md


## 9. Pacote com subagentes para as três ferramentas

Além dos arquivos originais, esta edição entrega:

```text
seu-projeto/
├── .claude/agents/              # 11 arquivos .md
├── .gemini/agents/              # 11 arquivos .md
├── .codex/agents/               # 11 arquivos .toml
├── .codex/config.toml           # Delegação Codex com limite de concorrência
├── GUIA_DE_AGENTES.md           # Catálogo e instruções de uso
├── AI_RULES.md
├── CLAUDE.md
├── GEMINI.md
├── AGENTS.md
├── CONTEXTO_PROJETO.md
├── CONTEXTO_PROJETO.template.md
├── GUIA_TECNICO_DETALHADO.md
├── AUDITORIA_GERAL.md
└── README_INSTALACAO.md
```

**Importante:** extraia **o conteúdo do ZIP** na raiz, inclusive as pastas ocultas. Não basta copiar os `.md` visíveis: os agentes dependem de seus diretórios específicos. Compare com configurações existentes antes de mesclar.

Confira o arquivo [`GUIA_DE_AGENTES.md`](./GUIA_DE_AGENTES.md) para comandos de uso, limites de permissão e fluxo de auditoria → correção → revisão.

No Codex, as definições de agentes são `.toml` e não `.md`. O `AGENTS.md` permanece para instruções gerais. Todas as três ferramentas podem apresentar diferenças por versão e plano: o kit não promete ativação automática sem verificação local.
