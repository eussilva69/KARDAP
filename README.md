# KARDAP

<p align="center">
  <strong>Uma plataforma para restaurantes criarem experiências digitais à mesa.</strong>
</p>

<p align="center">
  Cardápio por QR Code · gestão de produtos · mesas · chamados · identidade do restaurante
</p>

---

## Sobre o projeto

O **Kardap** conecta a operação do restaurante à experiência do cliente. A aplicação permite criar um restaurante, estruturar cardápio e categorias, gerar QR Codes para as mesas e acompanhar chamados em uma única interface.

O foco deste projeto foi construir uma experiência de uso clara em momentos diferentes da jornada:

- **Visitante:** encontra a proposta do produto na landing page e acessa o cardápio público por QR Code.
- **Gestor:** cria uma conta, configura o restaurante e administra o cardápio no painel.
- **Equipe de salão:** acompanha mesas e chamados com uma interface rápida para o dia a dia.

## Destaques

| Área | O que entrega |
| --- | --- |
| Autenticação | Login por e-mail/senha, criação de conta, recuperação de senha e acesso com Google. |
| Onboarding | Configuração inicial do restaurante, marca, capa, mesas e dados do cardápio. |
| Dashboard | Visão operacional de chamados, cardápio, categorias, produtos, mesas, QR Codes, avaliações, relatórios e configurações. |
| Cardápio público | Página responsiva por restaurante/mesa, pronta para ser acessada por QR Code. |
| Dados em tempo real | Integração com Firebase para autenticação, Firestore e Storage. |

## Interface

O painel mantém a base de alto contraste em papel claro, com números tabulares e poucos elementos visuais para leitura rápida durante a operação. A identidade vem da própria logo: a barra lateral usa a cor do contorno (lousa), o texto sobre ela usa o creme do chapéu (giz) e o amarelo da cloche fica reservado para o evento central do produto, uma mesa chamando a equipe. A tipografia é a Archivo, com larguras condensadas que ecoam o display de mesa. Detalhes em [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

### Landing page

<p align="center">
  <img src="docs/screenshots/landing-page.png" alt="Landing page do Kardap" width="900" />
</p>

### Acesso à plataforma

<p align="center">
  <img src="docs/screenshots/login.png" alt="Tela de login do Kardap" width="900" />
</p>

### Criação de conta

<p align="center">
  <img src="docs/screenshots/criar-conta.png" alt="Tela de criação de conta do Kardap" width="900" />
</p>

## Tecnologias

- **Next.js 14** e **React 18** para a aplicação web.
- **TypeScript** para maior segurança e previsibilidade no código.
- **Tailwind CSS** e CSS modular para a camada visual.
- **Firebase Authentication** para acesso por e-mail/senha e Google.
- **Cloud Firestore** para dados do restaurante, cardápio, mesas e chamados.
- **Firebase Storage** para imagens de marca e capa.
- **Lucide React** para ícones.
- **qrcode.react** para a geração dos QR Codes das mesas.

## Como executar

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure as variáveis de ambiente

Crie o arquivo `.env.local` a partir de `.env.example` e preencha com as credenciais do seu projeto Firebase.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> As variáveis `FIREBASE_ADMIN_*` são utilizadas apenas no servidor. Nunca exponha esses valores no navegador.

### 3. Inicie o ambiente local

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

### Outros comandos úteis

```bash
# Gerar o build de produção
npm run build

# Executar a versão de produção após o build
npm run start
```

## Rotas principais

| Rota | Descrição |
| --- | --- |
| `/` | Landing page institucional. |
| `/login` | Acesso à plataforma (login único também do PDV; aceita `?redirect=` para destinos permitidos). |
| `/logout` | Saída compartilhada com o PDV. |
| `/criar-conta` | Cadastro de novo restaurante. |
| `/onboarding` | Configuração inicial após o cadastro. |
| `/planos` | Planos, preços e comparação de recursos (pública). |
| `/dashboard` | Visão geral do painel administrativo. |
| `/dashboard/produtos` | Gestão de produtos. |
| `/dashboard/categorias` | Gestão de categorias. |
| `/dashboard/mesas` | Mesas e QR Codes individuais. |
| `/dashboard/chamados` | Acompanhamento de chamados do salão. |
| `/dashboard/assinatura` | Plano atual, troca de plano e histórico de pagamentos. |
| `/admin` | Administração do sistema: visão geral, restaurantes e planos (somente administradores). |
| `/r/:slug?mesa=:mesa` | Cardápio público por restaurante e mesa. |

## Estrutura do projeto

```text
app/                       # Rotas, layout global e endpoints
components/                # Componentes da aplicação
  admin/                   # Administração do sistema (/admin)
  dashboard/               # Painel do restaurante
  menu/                    # Cardápio público
  plans/                   # Cartões e comparação de planos
  site/                    # Páginas públicas, onboarding e páginas legais
  ui/                      # Componentes base do design system
lib/                       # Firebase, acesso a dados, storage e utilitários
public/                    # Imagens, ativos e páginas públicas
docs/                      # Documentação técnica e screenshots
scripts/                   # Utilitários de manutenção (administradores, rodapé da landing, vídeos antigos)
services/video-worker/     # Worker de vídeo (Cloud Run + FFmpeg): otimiza os vídeos enviados pelo painel
design/originais/          # Arquivos de arte originais que não vão para o site publicado
```

O guia de interface (tokens, hierarquia visual, ações, movimento) está em [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

## Imagens

Fotos de produto, logo e capa são redimensionadas e convertidas para WebP no navegador (Web Worker) antes de subir ao Firebase Storage, em duas versões: a principal e uma pequena para listas e miniaturas. Configurações, limites e a exceção do Safari: [docs/IMAGENS.md](docs/IMAGENS.md).

## Testes

Worker de vídeo: `cd services/video-worker && npm test`. Ponta a ponta (painel, cardápio público em tempo real, imagens, regras e isolamento entre estabelecimentos; login único com o PDV; Reels; planos e limites; cadastro e teste grátis) contra os emuladores do Firebase: [docs/TESTES.md](docs/TESTES.md).

## SEO e indexação

Títulos, descrições, canonical, Open Graph, dados estruturados (JSON-LD), `robots.txt`, `sitemap.xml` e `llms.txt`. As páginas estáticas da landing (`public/*.html`) são ajustadas por `npm run seo:landing`, que deve ser rodado depois de editar qualquer uma delas. Detalhes, páginas com "noindex" e configurações pendentes (Search Console, Bing, Analytics): [docs/SEO.md](docs/SEO.md).

## Login único com o PDV

O KARDAP é o servidor central de autenticação do ecossistema: o login em `kardapp.online` vale também para `pdv.kardapp.online` (cookie de sessão HttpOnly em `.kardapp.online`, logout global, permissão própria para o PDV, credencial do Firebase para o PDV por código de uso único). Contrato para os outros aplicativos: [SSO_INTEGRATION.md](SSO_INTEGRATION.md). Organização interna: [docs/SSO.md](docs/SSO.md). Kit do PDV: [integrations/pdv-sso/](integrations/pdv-sso/README.md).

## Vídeos de produto

O vídeo vai do painel direto para o Firebase Storage; um worker no Cloud Run (FFmpeg) comprime para MP4 H.264 até 720p, gera a capa WebP e publica no produto. O painel acompanha o envio e a otimização em tempo real, e o cardápio toca só a versão otimizada. Arquitetura, implantação no Google Cloud, permissões, custos e testes: [docs/VIDEOS.md](docs/VIDEOS.md).

## Planos e assinaturas

Start (R$ 49,90), Pro (R$ 129,90), Business (R$ 199,90) e Enterprise (sob consulta), com cobrança mensal pela Cakto.

- No cadastro, a pessoa escolhe qual plano quer testar e usa ele por 30 dias, sem cartão; o teste só começa depois que
  a configuração inicial do restaurante é concluída com sucesso.
- Limites (mesas, pedidos próprios por mês, PDV) e recursos são decididos no servidor, a partir de um catálogo único
  (`lib/billing/plans.ts`).
- Pedidos de iFood e outros marketplaces nunca contam no limite.
- O mesmo servidor libera ou não o PDV pelo login único.
- O painel tem "Meu plano" (consumo do mês, renovação da franquia, cobrança, troca de plano) e o botão "Acessar PDV".

Estrutura de dados, APIs, fluxos, regras, migração e configuração: [docs/PLANOS.md](docs/PLANOS.md).

## Reels do cardápio

No cardápio público, os pratos em vídeo viram um feed vertical em tela cheia no padrão dos Reels: deslizar para cima e para baixo, toque para pausar, dois toques para curtir, segurar para ver o prato inteiro. Curtir e enviar não pedem conta (a curtida usa uma identidade anônima do Firebase Auth); salvar fica no celular ou numa conta de cliente (Google ou e-mail). O painel mostra as curtidas de cada produto. Gestos, dados, regras, desempenho e a configuração necessária no Firebase (ativar o login anônimo): [docs/REELS.md](docs/REELS.md).

## Rodapé e imagens do site

- A landing é HTML estático em `public/`. O rodapé dela é gerado por `node scripts/site-footer.mjs`, que troca o bloco `<footer id="footer">` em todas as páginas. O mesmo rodapé, em React, fica em `components/site/site-chrome.tsx` (páginas `/planos` e legais). Os dois usam `public/kardap-footer.css`; ao mudar um, mude o outro e rode o script.
- As imagens publicadas estão em WebP e no tamanho em que aparecem na tela (o dobro, para telas de alta densidade). Os PNG originais da landing continuam em `LP KARDAP/`; outros originais ficam em `design/originais/`.

## Administradores do sistema

O acesso a `/admin` depende do documento `admins/{uid}` no Firestore, que as regras impedem de ser criado pelo app.

```bash
# Com FIREBASE_ADMIN_* configuradas no .env.local
node scripts/grant-admin.mjs pessoa@empresa.com          # libera
node scripts/grant-admin.mjs pessoa@empresa.com --remover # remove
```

Sem as credenciais de servidor, crie o documento pelo console do Firebase: coleção `admins`, ID do documento igual ao UID da conta (a tela de acesso negado em `/admin` mostra o UID com botão de copiar).

## Qualidade e segurança

- As rotas e dados do restaurante dependem de autenticação Firebase.
- Os dados administrativos são separados das páginas públicas de cardápio.
- Uploads de marca e capa passam pelo Firebase Storage.
- O projeto possui regras dedicadas para Firestore e Storage em `firestore.rules` e `storage.rules`. Depois de alterar e testar as regras, publique com `firebase deploy --only firestore:rules`.
- Campos de assinatura, dono e suspensão do restaurante só podem ser alterados pelo servidor ou por administradores.
- O build de produção pode ser validado com `npm run build`.

---

<p align="center">
  Feito para transformar o cardápio em uma experiência de atendimento mais simples, rápida e memorável.
</p>
