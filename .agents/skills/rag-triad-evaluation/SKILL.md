---
name: rag-triad-evaluation
description: Avaliação de RAG por relevância do contexto, fidelidade da resposta e relevância da resposta ao pedido.
---

# rag-triad-evaluation

## Quando ativar
Quando avaliar chat com documentos, reduzir alucinação ou comparar chunking, retriever, reranker ou prompt RAG.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Estabeleça unidade de avaliação: consulta, documentos esperados, versão do índice, resposta, prompt, modelo e contexto de aplicação.
2. Construa conjunto pequeno e representativo com casos fáceis, difíceis, sem evidência, ambíguos, adversariais e negativos; preserve privacidade.
3. Calcule Context Relevance independentemente de Answer Relevance e Groundedness; verifique citações apoiam trechos específicos e não apenas tema geral.
4. Desenhe rubrica com exemplos de nota 0/1/2/3 e abstention correta quando contexto não suporta resposta.
5. Rode amostras cegas, dupla anotação humana quando viável; se usar LLM judge, calibre contra referências humanas e monitore viés e variação.
6. Faça análise por segmento (idioma, tamanho, no-answer, atualização documental), com taxa de falsos suportes e regressão.
7. Compare alteração única contra baseline fixo; avalie custo/latência e evite otimizar exclusivamente nota do juiz.

## Verificações e critérios de aceitação
- Dataset versionado sem PII; exemplos de falhas com fonte; curvas precisão/recall retriever, métricas de groundedness e intervalo de confiança quando aplicável.
- Separar inferência automática de avaliação humana.

## Entrega obrigatória
Rubrica, dataset, métricas por fatia, casos de alucinação/abstenção e go/no-go de implantação.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não use dados de usuários para eval externo sem autorização; não invente ground truth.

## Ferramentas/comandos candidatos (não executar automaticamente)
Ragas ou framework de avaliação usado no projeto, mais planilha/JSONL auditável.

## Referência para consulta e checagem de versão
- https://docs.ragas.io/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Exemplos e Implementações de Produção

### Validação da Tríade de RAG (Context Relevance, Groundedness, Answer Relevance)
```python
from typing import Dict, Any

class RAGTriadEvaluator:
    """
    Tríade de RAG:
    1. Context Relevance: O contexto recuperado é relevante para a pergunta do usuário?
    2. Groundedness (Fidelidade): A resposta gerada é 100% suportada pelo contexto (sem alucinação)?
    3. Answer Relevance: A resposta atende diretamente o que foi perguntado?
    """
    
    @staticmethod
    def audit_trace(query: str, retrieved_chunks: list[str], answer: str) -> Dict[str, Any]:
        has_context = len(retrieved_chunks) > 0
        context_text = " ".join(retrieved_chunks).lower()
        
        # Heurística estática pré-LLM judge
        unsupported_claims = []
        for sentence in answer.split("."):
            s_clean = sentence.strip().lower()
            if len(s_clean) > 20 and not any(word in context_text for word in s_clean.split() if len(word) > 5):
                unsupported_claims.append(sentence.strip())
                
        return {
            "has_context": has_context,
            "groundedness_pass": len(unsupported_claims) == 0,
            "suspicious_sentences": unsupported_claims,
            "risk_score": len(unsupported_claims) / max(1, len(answer.split(".")))
        }
```
