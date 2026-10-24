---
name: whatsapp-business-api-integration
description: "Integrar Meta WhatsApp Business Cloud API com consentimento, templates aprovados, webhooks e janela de atendimento verificável."
---

# whatsapp-business-api-integration

## Quando usar
Envio ou recebimento de mensagens via Cloud API oficial, automações de atendimento ou notificações WhatsApp.

## Informações necessárias
WABA autorizado, phone_number_id, versão Graph API, eventos, tokens no backend, templates aprovados e finalidade de contato.

## Procedimento de execução
1. Confirme que o projeto utiliza a **Cloud API oficial Meta** (ou BSP) e valide versão Graph API atual antes de usar endpoints.
2. Modelar opt-in quando aplicável, finalidade de mensagens, categoria marketing/utility/authentication e descadastro/opt-out.
3. Configure token no backend/secret manager, permissões mínimas, webhook HTTPS e verificação de challenge/assinatura conforme Meta.
4. Registre `message_id`, contato, direction, status, timestamps e evento com deduplicação e retenção proporcional; não logar texto pessoal integral.
5. Respeite janela de atendimento de 24h para respostas livres e use templates aprovados fora dela, conforme política vigente.
6. Implemente fila de saída com rate limits, backoff, jitter e dead-letter; trate erro por categoria e não faça spam/retries infinitos.
7. Construa transições de status sent/delivered/read/failed sem supor ordenação; conversas multiagente devem preservar contexto e opt-out.
8. Faça verificação de custo, template, qualidade e limites; configure alertas sem expor PII.

## Casos de teste e validação
- Callback GET de verificação e assinatura de evento falham corretamente para segredos inválidos.
- Mesmo webhook reenviado não gera resposta em duplicidade.
- Mensagem fora da janela exige template autorizado; janela aberta permite resposta livre conforme regras atuais.
- Erro de API, rate-limit, opt-out e destino inválido recebem tratamento sem loop de retry.
- Teste apenas em conta e contatos autorizados, evitando mensagens não solicitadas.

## Evidências e entregáveis
Mapa de fluxos, variáveis de configuração sem valores, testes de sandbox/contatos opt-in, tratamento de falhas e logs minimizados.

## Antipadrões e limites
Não utilizar automação não oficial de WhatsApp Web; não prometer aprovação de template; não disparar mensagens em massa sem autorização.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.


## Exemplos e Implementações de Produção

### 1. Handler Next.js de Verificação e Recebimento de Webhook Meta WhatsApp
```typescript
// app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

// 1. Verificação inicial da Meta (GET)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// 2. Recebimento de Mensagens e Notificações (POST com validação HMAC)
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-hub-signature-256') || '';
  const rawBody = await req.text();

  if (APP_SECRET) {
    const expectedSig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
    if (signature !== expectedSig) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
    }
  }

  const data = JSON.parse(rawBody);
  const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (message) {
    console.log(`[WhatsApp de ${message.from}]: ${message.text?.body}`);
  }

  return NextResponse.json({ status: 'ok' });
}
```

### 2. Disparo de Mensagem de Template Transacional
```typescript
export async function sendWhatsAppTemplate(toPhone: string, orderId: string, totalBrl: string) {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: 'confirmacao_pedido',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: orderId },
              { type: 'text', text: totalBrl },
            ],
          },
        ],
      },
    }),
  });

  return response.json();
}
```
