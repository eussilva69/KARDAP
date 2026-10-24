---
name: grpc-protobuf-communication
description: "Projetar contratos Protobuf e APIs gRPC robustas, versionáveis e observáveis entre serviços."
---

# grpc-protobuf-communication

## Quando usar
Comunicação interna de baixa latência, contratos tipados, streaming e migração REST/gRPC.

## Informações necessárias
Topologia de serviços, limites, requisitos de compatibilidade, tráfego, latência, autenticação e plataformas cliente.

## Procedimento de execução
1. Valide benefício gRPC sobre HTTP/JSON: suporte do cliente (browser precisa gRPC-Web/connect), networking, observabilidade e custo operacional.
2. Modele contratos em `.proto` com **field numbers estáveis**, enums com valor zero `UNSPECIFIED`, mensagens de request/response e namespaces por versão.
3. NUNCA reutilize tags Protobuf removidas; use `reserved` names/numbers para compatibilidade.
4. Escolha unary vs streaming com base no caso de uso; implemente deadlines, cancellation, limites de tamanho, keepalive e flow-control quando streaming.
5. Configure TLS/mTLS e identidade serviço a serviço conforme threat model; trate metadata sensível com cuidado.
6. Mapeie gRPC status codes para erros públicos seguros; retries apenas para métodos idempotentes, com limite de tentativas e backoff.
7. Gere clientes via toolchain versionada; automatize lint/breaking checks com Buf/protoc quando existentes e testes de contrato.
8. Estabeleça tracing, métricas p50/p95/p99 e controle de versões para deploy escalonado cliente/servidor.

## Casos de teste e validação
- Cliente antigo interopera com servidor novo durante rollout (backward compatibility).
- Campos removidos têm tags reservadas; alterações breaking são detectadas.
- Deadline, cancelamento, streaming desconectado e payload acima do limite são tratados.
- Requisições inválidas e sem autorização são rejeitadas sem vazar detalhes.
- Benchmarks reais demonstram ganho ou trade-off esperado.

## Evidências e entregáveis
Arquivos proto, matriz de compatibilidade, código gerado, testes contract e documentação de protocolo/deploy.

## Antipadrões e limites
Não supor que gRPC é mais rápido em todo contexto; não expor streams sem auth; não alterar field numbers.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.


## Exemplos e Implementações de Produção

### 1. Definição Proto3 (order_service.proto)
```protobuf
syntax = "proto3";

package orders.v1;

option go_package = "orders/v1;ordersv1";

service OrderService {
  rpc CreateOrder (CreateOrderRequest) returns (OrderResponse);
  rpc StreamOrderStatus (StreamOrderRequest) returns (stream OrderStatusUpdate);
}

message CreateOrderRequest {
  string customer_id = 1;
  repeated OrderItem items = 2;
  double total_amount = 3;
}

message OrderItem {
  string product_id = 1;
  int32 quantity = 2;
  double unit_price = 3;
}

message OrderResponse {
  string order_id = 1;
  string status = 2;
  int64 created_at_unix = 3;
}

message StreamOrderRequest {
  string order_id = 1;
}

message OrderStatusUpdate {
  string order_id = 1;
  string new_status = 2;
  string notes = 3;
  int64 updated_at_unix = 4;
}
```

### 2. Implementação do Servidor Node.js (@grpc/grpc-js)
```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const packageDefinition = protoLoader.loadSync('order_service.proto', {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const ordersPackage = protoDescriptor.orders.v1;

const server = new grpc.Server();

server.addService(ordersPackage.OrderService.service, {
  CreateOrder: (call: any, callback: any) => {
    const { customer_id, items, total_amount } = call.request;
    const order_id = 'ord_' + Math.random().toString(36).substring(7);
    callback(null, {
      order_id,
      status: 'CONFIRMED',
      created_at_unix: Date.now(),
    });
  },
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('gRPC Server rodando na porta 50051');
});
```
