# Conta demonstrativa "Brasa & Sabor"

Restaurante fictício para apresentações comerciais: cardápio em vídeo, mesas com QR Code, chamados, delivery próprio,
pedidos de todos os canais, indicadores de vendas e financeiro, tudo com dados simulados e calculados a partir dos
registros — nada é número fixo na tela.

| O quê | Onde |
| --- | --- |
| Painel | `/login` com a conta demo → `/dashboard` |
| Cardápio | `/r/brasa-e-sabor-demo` |
| Mesa (QR) | `/r/brasa-e-sabor-demo?mesa=demo-mesa-01-bs` (até `-12-bs`) |
| Delivery | `/r/brasa-e-sabor-demo/delivery` |
| PDV | botão "Acessar PDV" do painel (login único; o PDV é outro repositório) |

## Credenciais

E-mail `demo@kardapp.online` (ou `DEMO_ACCOUNT_EMAIL`). A senha nunca fica no código: o seed gera uma senha forte na
primeira execução e grava `DEMO_ACCOUNT_EMAIL` / `DEMO_ACCOUNT_PASSWORD` no `.env.local` (fora do Git). Para trocar,
mude `DEMO_ACCOUNT_PASSWORD` e rode o seed de novo — a conta existente é atualizada.

## Comandos

```bash
npm run demo:seed -- --emulator     # emuladores locais (docs/TESTES.md)
npm run demo:seed -- --production   # projeto do .env.local; exige a flag explícita
npm run demo:audit -- ./capturas    # auditoria no navegador (padrão: app em localhost:3100 com emuladores)
```

Opções do seed: `--skip-media` (reaproveita a mídia já publicada), `--refresh-media` (baixa e processa de novo),
`--review` (folha de contato com as capas, para conferir se cada vídeo representa o prato). A mídia precisa de
`PEXELS_API_KEY` no `.env.local` (chave gratuita em https://www.pexels.com/api/). Trocar o vídeo de um prato:
`scripts/demo/media-overrides.json`, por exemplo `{ "p-pudim": { "pexelsVideoId": 1234567 } }` ou
`{ "p-pudim": { "queries": ["flan dessert"] } }`.

O seed é idempotente: rodar de novo recoloca o estado inicial, com os mesmos ids, sem duplicar nada. As datas são
relativas ao momento da execução: o painel sempre mostra movimento hoje, na semana e nos últimos 30 dias.

## Onde está cada parte

| Parte | Arquivo |
| --- | --- |
| Identificação (id fixo, slug, e-mail) | `lib/demo/ids.ts` |
| Catálogo, mesas, gerador de pedidos e financeiro (puro, determinístico) | `lib/demo/dataset.ts` |
| Gravação/restauração no Firestore, com trava de segurança | `lib/demo/apply.ts` |
| Script de seed (Auth, mídia, Storage, dados, validação) | `scripts/demo/seed-demo.mjs` |
| Auditoria no navegador | `scripts/demo/audit-demo.mjs` |
| Restaurar pelo painel | `app/api/demo/reset/route.ts`, `components/dashboard/demo.tsx` (Configurações) |
| Créditos da mídia | `docs/demo/CREDITOS_MIDIA.md` (gerado pelo seed) |

## O que é gravado

- `restaurantes/demo-brasa-e-sabor` com `isDemo: true`, plano Business ativo sem cobrança (`paymentProvider: "demo"`,
  `priceCents: 0`), marca (logo, capa, paleta Brasa), horários, delivery por bairro (11 bairros de São Paulo).
- 7 categorias, 37 produtos com preço de venda e custo estimado (`costCents`, usado na margem dos relatórios); a Pizza
  Camarão fica indisponível de propósito (mostra o produto oculto).
- 12 mesas com QR Code; Mesas 03, 04, 07, 10 e 12 ocupadas, com chamados de garçom e de conta abertos.
- ~190 pedidos em 40 dias (~150 nos últimos 30), com movimento por dia da semana, picos no almoço e às 20 h e
  crescimento nas duas últimas semanas; canais delivery próprio, mesa, balcão, retirada, iFood, 99Food e Keeta;
  ~12 pedidos "ao vivo" em todas as etapas. Todos têm `simulated: true`. Cancelados e recusados ficam fora da receita.
- Franquia de pedidos próprios (`uso/{AAAA-MM}`) coerente com os pedidos; marketplaces não consomem.
- Financeiro: vendas online (Pix e cartão de crédito do delivery/retirada) com as taxas e a carência de 15 dias do
  sistema, um saque já pago e saldo disponível para um saque ao vivo. Registros com `is_demo: true`.

## Isolamento e segurança

- `lib/demo/apply.ts` só escreve no id fixo da demo; se esse documento existir sem `isDemo` ou com outro dono, para
  antes de gravar qualquer coisa. Registros financeiros são filtrados por `restaurant_id` da demo.
- `isDemo` e `demo` são campos protegidos nas regras do Firestore: nenhum painel consegue marcar (ou desmarcar) um
  restaurante como demonstração. O app só trata como demo o id fixo **e** a marca.
- O painel administrativo mostra a demo como "Demonstração": fora da receita mensal, dos assinantes e dos testes;
  os totais financeiros da plataforma ignoram registros `is_demo`.
- Nenhum pagamento real: o delivery da demo é "pago na entrega"; pedidos de marketplace são eventos locais marcados
  como simulados ("sem conexão real com iFood"); saques são só registros (o KARDAP não transfere dinheiro sozinho).
- A mídia publicada tem uma cópia mestra em `demo-media/…` no Storage (as regras negam acesso de qualquer cliente);
  a restauração recoloca arquivos apagados numa apresentação.

## O que não existe no KARDAP (e por isso não está na demo)

Estoque/insumos, entregadores, adicionais/variações de produto, perfis de equipe com tela própria, integração real com
iFood/99Food/Keeta e PDV/caixa/cozinha (o PDV é outro repositório: a demo funciona com ele pelo login único, mas não foi
testada aqui). O custo por produto já fica gravado para quando houver estoque.
