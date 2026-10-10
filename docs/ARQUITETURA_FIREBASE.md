# Arquitetura Firebase

O Kardap é um Next.js 14. O navegador usa Firebase Auth, Firestore e Storage; operações que criam restaurante, convites, pagamentos e totais devem passar por rotas Next.js verificadas com Firebase Admin.

## Isolamento

Cada recurso operacional vive em `restaurantes/{restaurantId}/...`. A associação é o documento `membros/{uid}`. As regras verificam esse documento, não dados de cargo enviados pelo cliente.

## Coleções

`configuracoes`, `membros`, `categorias`, `produtos`, `mesas`, `sessoesMesa`, `comandas`, `pedidos`, `pagamentos`, `sessoesCaixa`, `movimentacoesCaixa`, `clientes`, `entregas`, `ingredientes`, `movimentacoesEstoque`, `chamados` e `auditoria` são subcoleções previstas por restaurante. `usuarios/{uid}` contém somente referência a restaurantes; não armazena senha.

Os módulos visualmente presentes hoje são cardápio, categorias, mesas/QR codes, chamados, marca e configurações. PDV, caixa, estoque, cozinha e delivery não existem no código atual e não foram declarados como implementados.

## Deploy e emuladores

Copie `.env.example` para `.env.local`, preencha as variáveis e execute `firebase deploy --only firestore:rules,firestore:indexes,storage`. Para desenvolvimento, `firebase emulators:start` usa `firebase.json`. Nunca publique regras sem revisar o projeto Firebase de destino.
