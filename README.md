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

O painel administrativo segue a direção visual **“clinical blueprint on frosted paper”**: alto contraste, papel claro, tipografia objetiva, números tabulares e poucos elementos visuais para priorizar leitura rápida durante a operação.

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
| `/login` | Acesso à plataforma. |
| `/criar-conta` | Cadastro de novo restaurante. |
| `/onboarding` | Configuração inicial após o cadastro. |
| `/dashboard` | Visão geral do painel administrativo. |
| `/dashboard/produtos` | Gestão de produtos. |
| `/dashboard/categorias` | Gestão de categorias. |
| `/dashboard/mesas` | Mesas e QR Codes individuais. |
| `/dashboard/chamados` | Acompanhamento de chamados do salão. |
| `/r/:slug?mesa=:mesa` | Cardápio público por restaurante e mesa. |

## Estrutura do projeto

```text
app/                       # Rotas, layout global e endpoints
components/                # Componentes da aplicação
  dashboard/               # Painel administrativo e componentes de UI
lib/                       # Firebase, acesso a dados, storage e utilitários
public/                    # Imagens, ativos e páginas públicas
docs/                      # Documentação técnica e screenshots
```

## Qualidade e segurança

- As rotas e dados do restaurante dependem de autenticação Firebase.
- Os dados administrativos são separados das páginas públicas de cardápio.
- Uploads de marca e capa passam pelo Firebase Storage.
- O projeto possui regras dedicadas para Firestore e Storage em `firestore.rules` e `storage.rules`.
- O build de produção pode ser validado com `npm run build`.

---

<p align="center">
  Feito para transformar o cardápio em uma experiência de atendimento mais simples, rápida e memorável.
</p>
