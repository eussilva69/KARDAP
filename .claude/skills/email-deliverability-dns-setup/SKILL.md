---
name: email-deliverability-dns-setup
description: "Planejar DNS e autenticação de e-mail SPF, DKIM, DMARC e políticas de reputação de forma gradual e verificável."
---

# email-deliverability-dns-setup

## Quando usar
Domínio enviando transacionais/marketing, mensagens indo a spam, implantação de ESP, spoofing ou baixa entrega.

## Informações necessárias
Domínios, subdomínios, todos os provedores remetentes, DNS atual, Postmaster/ESP, política de unsubscribe.

## Procedimento de execução
1. Faça inventário de **todos os senders** (app, CRM, helpdesk, newsletter, ERP), domínios, bounce e alinhamento de From.
2. Verifique DNS atual e evite múltiplos registros SPF no mesmo hostname; compute limite de DNS lookups e caminho de includes.
3. Ative DKIM pelo provedor e prefira chave de **2048 bits quando suportado**; valide assinatura e alinhamento organizacional/domínio.
4. Configure DMARC inicialmente com monitoração `p=none`, `rua` apropriado e controles de proteção de dados; interprete relatórios antes de endurecer.
5. Evolua para `p=quarantine` e depois `p=reject` **somente quando** todos os remetentes legítimos estiverem autenticados/alinhados; documente janela de rollout e rollback.
6. Verifique PTR/rDNS, HELO, TLS, reputação, complaint/bounce rate, formato RFC e warmup quando relevante.
7. Para marketing e mensagens assinadas, implemente unsubscribe conforme requisitos do provedor; não confunda transacionais com marketing.
8. BIMI é opcional e depende de requisitos e marcas/certificados vigentes; não adicione como obrigação nem promessa de entrega.

## Casos de teste e validação
- Consultas DNS (`dig`/`nslookup`) comprovam SPF/DKIM/DMARC em domínio correto.
- Headers de e-mails enviados de teste mostram SPF/DKIM/DMARC alinhados.
- Relatórios DMARC não mostram remetentes legítimos em falha após mudança de política.
- Testes com destinatários reais de laboratório e métricas do ESP documentados (não prometer inbox placement).
- Troca de DNS pode ser revertida por plano e TTL conhecido.

## Evidências e entregáveis
Inventário de senders, registros DNS propostos (sem segredos), logs de autenticação, rollout e política DMARC.

## Antipadrões e limites
Nunca definir p=reject cegamente; não editar DNS de produção sem autorização; não divulgar endereços de relatórios sensíveis.

## Exemplo/nota técnica
Exemplos ilustrativos, não para copiar em produção sem auditoria:
```dns
_dmarc.example.com. TXT "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
```
O endereço de relatórios e a política devem ser escolhidos pela organização; avalie privacidade e destino do reporte.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.
