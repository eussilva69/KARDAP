---
name: contract-testing-pact
description: Verificação de contratos consumidor-provedor com Pact ou alternativa existente.
---

# contract-testing-pact

## Quando ativar
Quando serviços ou frontends evoluem independentemente e mudanças de payload quebram consumidores.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique consumidores, provedores, endpoints e cenários realmente usados; mapeie versionamento e compatibilidade.
2. Defina interações centradas no consumidor com estado de provider verificável; inclua erros, campos opcionais e headers críticos.
3. Crie contratos que toleram campos extras quando desejável, sem tornar asserts vagos demais.
4. Publique pacto no broker somente com credenciais/config existentes e ambiente autorizado; não exponha segredos.
5. Execute verifier contra instância isolada e estados de teste determinísticos.
6. Use can-i-deploy ou gate equivalente antes de entrega de versões incompatíveis; documente rollback.
7. Teste cenários de deprecação e compatibilidade retroativa em release com versões simultâneas.

## Verificações e critérios de aceitação
- Consumer contract test, provider verification, resultado por versão e evidência de compatibilidade; marcar gateways externos não testados.

## Entrega obrigatória
Inventário de contratos, pacts/fixtures, verificações e recomendação de deploy.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não substituir testes de integração real por Pact; tokens do broker fora do repo.

## Ferramentas/comandos candidatos (não executar automaticamente)
Pact JS/JVM/Python se já instalado; CLI can-i-deploy.

## Referência para consulta e checagem de versão
- https://docs.pact.io/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Exemplos e Implementações de Produção

### Teste de Contrato Consumer com Pact (TypeScript)
```typescript
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import path from 'path';

const provider = new PactV3({
  consumer: 'WebFrontend',
  provider: 'OrderService',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('Order API Pact Test', () => {
  it('deve retornar detalhes do pedido no contrato acordado', () => {
    provider
      .given('o pedido 123 existe')
      .uponReceiving('uma requisição para buscar o pedido 123')
      .withRequest({
        method: 'GET',
        path: '/orders/123',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: MatchersV3.string('123'),
          totalAmount: MatchersV3.number(150.50),
          status: MatchersV3.regex(/PENDING|PAID|CANCELLED/, 'PAID'),
        },
      });

    return provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/orders/123`, {
        headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      expect(data.id).toBe('123');
      expect(data.status).toBe('PAID');
    });
  });
});
```
