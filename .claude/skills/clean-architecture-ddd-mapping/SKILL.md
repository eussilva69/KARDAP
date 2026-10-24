---
name: clean-architecture-ddd-mapping
description: Mapeamento de domínios, agregados, bounded contexts e dependências para refatoração incremental.
---

# clean-architecture-ddd-mapping

## Quando ativar
Quando separar módulos acoplados, reduzir complexidade do domínio ou planejar modernização da arquitetura.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Liste casos de uso e jornadas de negócio observáveis, não inicie pela pasta de arquivos.
2. Trace rotas de entrada, serviços, DTOs, modelos, eventos, persistência e dependências entre módulos; registre exemplos concretos.
3. Distinga domínio de infraestrutura, identifique regras que vazaram para controllers, UI ou ORM, e determine fronteiras reais de transação.
4. Proponha bounded contexts somente quando houver linguagem, regras ou ciclos de mudança distintos; não transforme CRUD simples em arquitetura cerimonial.
5. Escolha uma extração pequena com interfaces necessárias e testes de caracterização que preservem comportamento e contratos externos.
6. Implemente vertical slice, adapte interfaces aos padrões reais do projeto e meça diferença de acoplamento/complexidade.
7. Revise riscos de consistência entre agregados, acoplamento temporal de eventos e ganho/custo de abstrações.

## Verificações e critérios de aceitação
- Testes de caracterização e regressão de APIs; revisão de imports/depências; build e typecheck existentes.
- Validar que regras não foram duplicadas e que não houve regressão de autenticação/autorização.

## Entrega obrigatória
Diagrama curto de dependências, mapa de contextos, ADR resumido, arquivos modificados, testes realizados e trade-offs.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não force camadas nem DDD quando a complexidade não justificar.

## Ferramentas/comandos candidatos (não executar automaticamente)
Grep/ripgrep, testes de contrato e comandos reais do repositório.

## Referência para consulta e checagem de versão
- https://martinfowler.com/bliki/BoundedContext.html

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Exemplos e Implementações de Produção

### Estrutura de Camadas DDD (Domain, Use Case, Adapter)
```typescript
// 1. DOMAIN: Entity pura sem dependência externa
export class Order {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    private _totalAmount: number,
    private _status: 'PENDING' | 'PAID' | 'CANCELLED'
  ) {}

  public pay(): void {
    if (this._status !== 'PENDING') {
      throw new Error('Apenas pedidos pendentes podem ser pagos.');
    }
    this._status = 'PAID';
  }

  get status() { return this._status; }
  get totalAmount() { return this._totalAmount; }
}

// 2. DOMAIN: Porta / Interface de Repositório
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

// 3. APPLICATION: Caso de Uso (Interactor)
export class PayOrderUseCase {
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(orderId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error('Pedido não encontrado');
    order.pay();
    await this.orderRepo.save(order);
  }
}
```
