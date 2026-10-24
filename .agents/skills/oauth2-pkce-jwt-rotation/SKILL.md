---
name: oauth2-pkce-jwt-rotation
description: "Auditar OAuth/OIDC Authorization Code + PKCE, sessões, rotação de refresh tokens e autorização de APIs sem expor credenciais."
---

# oauth2-pkce-jwt-rotation

## Quando usar
Login web/mobile com IdP, refresh tokens, JWTs, SSO, múltiplos tenants ou integração OIDC.

## Informações necessárias
Cliente público/confidencial, IdP, redirect URIs, claims, cookies, API, JWKS, autorização e logs.

## Procedimento de execução
1. Mapeie atores, authorization server, resource server e clientes; determine se é SPA, BFF, mobile ou backend confidencial.
2. Prefira Authorization Code + PKCE S256; gere `code_verifier` criptograficamente aleatório e `code_challenge`, `state`, e `nonce` para OIDC conforme fluxo.
3. Configure redirect URIs fixas, TLS, scopes mínimos, issuer discovery seguro e validação de `iss`, `aud`, `exp`, `nbf`, `nonce`/`azp` conforme contexto.
4. Em BFF, avalie session cookie HttpOnly, Secure e SameSite apropriado + defesa CSRF; não armazene refresh token sensível em localStorage por conveniência.
5. Se refresh tokens forem emitidos, modele rotação em operação atômica, *reuse detection*, família de sessão, revogação seletiva e comportamento de refresh concorrente.
6. Defina access-token TTL e revogação que faça sentido: JWT self-contained expira sozinho; blocklist/short TTL/introspection dependem de necessidade, não são exigências universais.
7. Audite autorização **no recurso e no servidor** em todos endpoints: BOLA, privilégios de admin, tenant e changes de ownership.
8. Planeje migrações de sessão sem logout em massa, rotação de JWKS e suporte a múltiplas chaves durante transição.

## Casos de teste e validação
- State/callback trocado é rejeitado, nonce inválido e issuer errado são rejeitados.
- JWT expirado, aud incorreta, alg alterado ou assinatura inválida falham sem revelar claims sensíveis.
- Duas renovações concorrentes têm comportamento documentado e seguro.
- Refresh-token reutilizado após rotação causa resposta de segurança proporcional sem punir sessões legítimas desnecessariamente.
- Usuário A não consegue acessar recursos B por troca de ID.
- Logout, expiração, reset de senha e revogação de conta encerram sessões conforme política.

## Evidências e entregáveis
Mapa de autenticação, threat model, config revisável, testes de sessão/claims/autorização e plano de rollout.

## Antipadrões e limites
OAuth 2.1 pode ser draft/versão em evolução: consultar standards atuais; nunca usar implicit flow por padrão ou tokens em URLs; não confiar em UI para autorização.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.
