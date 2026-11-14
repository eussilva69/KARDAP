---
name: app-store-fastlane-automation
description: "Planejar pipelines Fastlane seguros para assinatura e distribuição iOS/Android, TestFlight e Google Play."
---

# app-store-fastlane-automation

## Quando usar
Projeto nativo ou cross-platform requer build, assinatura, versionamento e publicação nas lojas.

## Informações necessárias
Targets/flavors, Xcode/Gradle, app IDs, contas Apple/Google, pipelines, certificados e distribuição existente.

## Procedimento de execução
1. Inventarie app IDs, bundle identifiers, esquemas, flavors, contas e canais beta/prod; valide exigências atuais das lojas.
2. Separe credenciais de publicação do repositório. Em iOS, use API keys/provisioning gerenciado com acesso restrito; em Android, signing key protegida e conta de serviço de menor privilégio.
3. Configure lanes independentes para lint/test, build assinada, distribuição interna e produção; *deploy* em produção exige aprovação explícita.
4. Configure número de build/versionCode monotônico e política de versionamento alinhada aos canais.
5. Execute testes e static checks antes de assinar/publicar; use cache sem vazar provisioning/signing credentials.
6. Em iOS, valide StoreKit/in-app purchases e entitlements; em Android, Play Billing e target SDK exigidos na data.
7. Garanta rollback operacional por staged rollout/halt quando suportado; stores não garantem reversão de binário instantânea.
8. Defina retenção de artefatos, símbolos dSYM/mapping files e plano de resposta a crash.

## Casos de teste e validação
- Build local de staging sem secret em logs ou artifacts.
- Assinatura é validada, profiles correspondem ao bundle/application ID.
- Lane beta envia apenas para ambiente de teste autorizado.
- Publicação de produção permanece bloqueada por approvals e não é executada no teste.
- Documente instalações e requisitos de CI específicos de macOS para iOS.

## Evidências e entregáveis
Fastfile/CI, matriz certificados×apps×environments, logs redigidos e checklist da loja com pendências.

## Antipadrões e limites
Não comprometer private keys, não gerar/rotacionar certificados sem aprovação, não afirmar publicação se não houve confirmação da loja.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.


## Exemplos e Implementações de Produção

### Fastfile Completo para iOS e Android
```ruby
default_platform(:ios)

platform :ios do
  desc "Build e upload para TestFlight"
  lane :beta do
    setup_ci if is_ci
    match(type: "appstore", readonly: is_ci)
    increment_build_number(xcodeproj: "MyApp.xcodeproj")
    build_app(
      scheme: "MyApp",
      export_method: "app-store",
      clean: true
    )
    upload_to_testflight(
      skip_waiting_for_build_processing: true
    )
  end
end

platform :android do
  desc "Build e deploy no Google Play Console (Internal Track)"
  lane :beta do
    gradle(
      task: "bundle",
      build_type: "Release"
    )
    upload_to_play_store(
      track: "internal",
      aab: "app/build/outputs/bundle/release/app-release.aab",
      skip_upload_metadata: true,
      skip_upload_images: true
    )
  end
end
```
