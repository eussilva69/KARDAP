---
name: structured-output-enforcement
description: Saída de LLM aderente a schema via constrained decoding, JSON Schema, Zod/Pydantic e tratamento de falhas.
---

# structured-output-enforcement

## Quando ativar
Quando integrações LLM retornam JSON inválido, campos ausentes, enum inválido ou erros de parsing em produção.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique consumidor downstream e invariantes reais; mantenha schema mínimo, versionado e coerente com contratos existentes.
2. Verifique suporte nativo do provedor a JSON Schema/structured outputs e limites; evite exigir JSON puro apenas por prompt se API oferece restrição estrutural.
3. Modele campos obrigatórios, enums, ranges, nullable, strings de data e `additionalProperties` quando compatível.
4. Valide output no backend com Zod/Pydantic/JSON Schema; diferencie recusa do modelo, truncamento, timeout e violação do schema.
5. Aplique retry bounded só para falhas transitórias; gere error object tipado e fallback seguro, sem mascarar corrupção de dado.
6. Crie casos de strings com unicode, escape, listas vazias, outputs grandes, prompt injection e dados maliciosos.
7. Meça taxa de parsing/validação, erro downstream, latência e custo após mudanças.

## Verificações e critérios de aceitação
- Schema e testes automatizados de tipos, limites e casos negativos; exemplos de erros corretamente tratados; stats em lote.
- Zero erro prometido não é critério realista sem medição.

## Entrega obrigatória
Schema, validador, tratamento tipado, testes e taxa observada de falha antes/depois.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Nunca execute HTML/SQL/código recebido em campo de output; validar semântica além da estrutura.

## Ferramentas/comandos candidatos (não executar automaticamente)
JSON Schema, Zod, Pydantic, ferramentas oficiais do provedor.

## Referência para consulta e checagem de versão
- https://json-schema.org/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Exemplos e Implementações de Produção

### Padrão Python Pydantic com Instructor para Saídas Garantidas
```python
from pydantic import BaseModel, Field
from typing import List
import instructor
from openai import OpenAI

# 1. Definição do Schema Rígido
class ProductExtraction(BaseModel):
    product_name: str = Field(description="Nome comercial do produto")
    price_brl: float = Field(ge=0.0, description="Preço numérico em Reais")
    category: str = Field(description="Categoria mercadológica")
    tags: List[str] = Field(default_factory=list, description="Palavras-chave")
    is_available: bool = Field(default=True)

# 2. Cliente com Validação Automática e Retentativa
client = instructor.from_openai(OpenAI())

def extract_product_data(raw_text: str) -> ProductExtraction:
    return client.chat.completions.create(
        model="gpt-4o-mini",
        response_model=ProductExtraction,
        max_retries=3,
        messages=[
            {"role": "system", "content": "Extraia dados estruturados com precisão cirúrgica."},
            {"role": "user", "content": raw_text}
        ]
    )
```
