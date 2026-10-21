# Reels do cardápio

Feed vertical de pratos em tela cheia no cardápio público (`/r/:slug`), no padrão dos Reels do Instagram: a pessoa
desliza para cima e para baixo, um prato por vez, e pode curtir, enviar para alguém e salvar.

## Como o cliente usa

| Onde | O que acontece |
| --- | --- |
| Topo do cardápio | "Pratos em vídeo": bolhas com os pratos que têm vídeo (como os stories) e o botão **Assistir** |
| Barra de seções | Ícone de claquete ao lado da busca (fica fixo na rolagem) |
| Toque num prato da lista | Abre o mesmo feed com **todos** os pratos (com e sem vídeo), começando nele |
| Link compartilhado `/r/:slug?reel=<produto>` | Abre direto no prato. O `?reel` sai do endereço; a mesa (`?mesa=`) continua |
| "Salvos" no topo | Lista dos pratos salvos (deste e de outros restaurantes Kardap) |

Gestos no vídeo:

| Gesto | Ação |
| --- | --- |
| Deslizar para cima/baixo | Próximo/anterior (encaixe por prato, sem pular vários) |
| Um toque | Pausa/continua (ícone de play no centro) |
| Dois toques | Curte, com o coração onde o dedo tocou (só curte, nunca descurte) |
| Segurar | Pausa e esconde botões e legenda para ver o prato inteiro |
| Alto-falante (topo) | Liga/desliga o som. Começa sem som; a escolha vale até fechar a aba |
| "Voltar" do celular | Fecha o feed e continua no cardápio |
| Teclado (computador) | ↑/↓ (ou J/K) navega, espaço pausa, M som, L curte, Esc fecha |

Botões à direita: **Curtir** (com o total), **Enviar**, **Salvar** e **Pedir** (quando "Chamar garçom" está ligado,
abre o chamado com o motivo "Fazer um pedido"). Na legenda: logo e nome do restaurante, prato, preço, categoria e
descrição com "mais". No fim do feed, um cartão leva de volta ao cardápio.

## Curtir (sem conta)

- No primeiro toque, o navegador recebe uma **identidade anônima** do Firebase Auth (sem cadastro, sem dado pessoal).
- A curtida é o documento `restaurantes/{rid}/curtidas/{produto}_{uid}` (`productId`, `uid`, `createdAt`). No mesmo
  lote, o campo `likes` do produto sobe 1 (ou desce 1 ao descurtir).
- A tela muda na hora. Toques rápidos viram uma fila por prato que sempre termina no estado do último toque, sem
  gravações cruzadas. O total aparece para todo mundo em tempo real (o cardápio já escuta os produtos).
- O painel mostra "N curtidas" em cada produto.

O contador é **uma curtida por identidade**. Quem limpa os dados do navegador ganha uma identidade nova e pode curtir de
novo: o número é um termômetro de interesse, não uma votação à prova de fraude.

## Salvar

- **Sem conta:** o toque salva na hora neste celular (`localStorage`, chave `kardap-salvos`). Um aviso oferece
  **Salvar na conta**.
- **Conta de cliente:** Google ou e-mail e senha (com "Esqueci a senha"). Os salvos ficam em
  `clientes/{uid}/salvos/{rid}_{produto}` e aparecem em qualquer celular, em qualquer cardápio Kardap. Ao entrar, o que
  estava salvo no celular sobe para a conta.
- Quem já curtiu tem a identidade anônima: ao **criar** a conta, ela vira a conta (mesmo uid), então as curtidas
  continuam valendo. Ao **entrar** numa conta que já existia, as curtidas feitas antes como anônimo ficam com a
  identidade anônima.
- **Outro lugar:** "Mandar para mim no WhatsApp" e "Copiar link do prato".
- Na lista de salvos, o preço exibido é o atual do cardápio. Pratos de outros restaurantes mostram só o nome do
  restaurante e abrem pelo link.

A conta de cliente serve só para os salvos. Ela não acessa o painel. Uma conta do painel (dono ou equipe) também
pode salvar pratos, e sair dela continua sendo pelo painel.

## Enviar

Usa a folha de compartilhamento do celular (`navigator.share`). Sem ela, ou se ela falhar, abre opções próprias:
WhatsApp, Telegram, e-mail e copiar link. O link é `https://kardapp.online/r/{slug}?reel={produto}`, **sem a mesa**
de quem compartilhou.

## Desempenho no celular

- Só o vídeo do prato na tela toca. Até ele ter folga para tocar (5 s baixados à frente), nenhum outro baixa.
  Depois, o próximo e o anterior baixam conforme a rede (tabela em `docs/VIDEOS.md`, "Reprodução no cardápio").
  Medição: `npm run perf:reels`.
- Slides a mais de 2 posições são só o espaço reservado. Vídeos que saem do alcance interrompem o download e liberam
  o decodificador.
- Cada slide é memorizado e isolado com `contain: strict`. Trocar de prato renderiza poucos slides.
- A barra de progresso é desenhada direto no elemento a cada quadro (`requestAnimationFrame`), sem renderizar o React.
- Rolagem nativa com `scroll-snap` (`mandatory` + `scroll-snap-stop: always`) e `IntersectionObserver` para o prato
  atual: sem listeners de rolagem.
- A camada de gestos usa `touch-action: pan-y`: sem zoom de dois toques, sem menu de toque longo.
- Aba em segundo plano pausa o vídeo.
- Com "reduzir movimento" ou economia de dados, nada toca sozinho: o vídeo começa parado e um toque inicia.
- Som: começa sem som (exigência dos navegadores para tocar sozinho). Se o navegador recusar o som fora de um toque
  (iPhone), o vídeo continua sem som e aparece "Toque no alto-falante para ouvir o som". Se recusar tocar sozinho
  mesmo sem som (iPhone em economia de energia), o vídeo fica parado com o ícone de play e um toque inicia.
- Vídeo com problema não trava o feed: arquivo inexistente ou inválido fica na capa; falha de rede tenta de novo
  algumas vezes (ver `docs/VIDEOS.md`).
- O login (`firebase/auth`) só é carregado quando a pessoa abre o feed, a lista de salvos ou curte. Quem só olha o
  cardápio não baixa esse código.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `lib/reels.ts` | Dados: identidade anônima, curtidas, salvos (celular e conta), conta de cliente, links |
| `components/menu/reels/use-engagement.ts` | Estado otimista de curtidas e salvos, fila por prato |
| `components/menu/reels/reels-viewer.tsx` | Feed: rolagem, prato atual, som, aviso, cartão final, teclado |
| `components/menu/reels/reel-slide.tsx` | Um prato: vídeo, gestos, coração, botões, legenda, progresso |
| `components/menu/reels/reels-rail.tsx` | Bolhas "Pratos em vídeo" no topo do cardápio |
| `components/menu/reels/save-sheet.tsx`, `account-form.tsx` | Salvar na conta (Google, e-mail) ou em outro lugar |
| `components/menu/reels/share-sheet.tsx` | Opções de envio quando o celular não tem a folha do sistema |
| `components/menu/reels/saved-sheet.tsx` | Lista de salvos, entrar/criar conta, sair |
| `app/menu.css` | Estilos (seções "Reels", "Entrada dos Reels" e "Folhas") |

## Regras do Firestore

Estão em `firestore.rules` (proposta do repositório, **não publicada**: em produção vale a regra aberta escolhida pelo
responsável). O que elas garantem quando forem publicadas:

- Contador `likes`: qualquer pessoa identificada (anônima ou não) só soma 1 criando a **própria** curtida no mesmo lote,
  ou subtrai 1 apagando-a. Nenhum outro campo do produto muda, nem para mais de ±1. O painel não altera o contador.
- Curtida: id obrigatório `{produto}_{uid}`, campos fixos, `createdAt` do servidor, uma por pessoa e prato, sem edição.
  Cada pessoa lê só as próprias curtidas.
- Conta de cliente e salvos: cada pessoa lê e grava só o que é dela, com campos e id fixos. Identidade anônima não
  grava aqui.

Fora das regras, o servidor também recusa identidade anônima ao criar restaurante (`/api/restaurants`) e ao abrir a
sessão compartilhada do SSO (`/api/auth/session`). No navegador, o painel trata a identidade anônima como "sem login".

## Configuração necessária no Firebase (uma vez)

1. **Authentication → Sign-in method → Anônimo: ativar.** Sem isso, curtir mostra "Não foi possível registrar a
   curtida agora".
2. **E-mail/senha** e **Google** já são usados pelo painel. O domínio do cardápio precisa estar em
   **Authentication → Settings → Authorized domains** (`kardapp.online` e `www.kardapp.online`) para o login com Google
   funcionar.
3. Opcional: limpar identidades anônimas antigas (Authentication → Settings → "Automatic clean-up", disponível com o
   Identity Platform), que o Firebase acumula.

Também é preciso atualizar a **Política de Privacidade** (`/privacidade`) para incluir a conta de cliente (e-mail,
pratos salvos) e as curtidas (identificador anônimo do navegador). O formulário de conta já mostra o aceite dos Termos e
da Política.

## Testes

`npm run test:reels` (ver [TESTES.md](TESTES.md)): regras com tokens reais do emulador, servidor, e o fluxo completo
num celular emulado com toque de verdade.
