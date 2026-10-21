# Vídeos de produto: envio, otimização e reprodução

O restaurante envia o vídeo pelo painel. O arquivo vai direto do navegador para o Firebase Storage, um worker no
Google Cloud Run otimiza com FFmpeg e o cardápio passa a tocar só a versão otimizada.

```
Painel ──(uploadBytesResumable)──► Storage: .../videos/original/{videoId}.{ext}
                                         │  evento "object.finalized" (Eventarc)
                                         ▼
                               Cloud Run: video-worker (FFmpeg)
                                         │  valida, comprime, gera capa
                                         ▼
          Storage: .../videos/optimized/{videoId}.mp4  +  .../thumbnails/{videoId}.webp
                                         │
                                         ▼
          Firestore: produto.videoUrl / videoPoster / video   ◄── cardápio (tempo real)
                     restaurantes/{id}/videos/{videoId}        ◄── painel (status em tempo real)
```

## Onde está cada parte

| Parte | Arquivo |
| --- | --- |
| Contrato (status, caminhos, limites) | `services/video-worker/src/contract.ts` |
| Worker (servidor HTTP, eventos) | `services/video-worker/src/server.ts`, `pipeline.ts` |
| FFmpeg (análise, compressão, validação, capa) | `services/video-worker/src/media.ts` |
| Firebase no worker | `services/video-worker/src/firebase.ts` |
| Limpeza diária | `services/video-worker/src/cleanup.ts` |
| Imagem Docker | `services/video-worker/Dockerfile` |
| Envio no painel (progresso, pausa, cancelamento) | `lib/video-upload.ts` |
| Status no painel (bandeja, etiquetas) | `components/dashboard/video-jobs.tsx` |
| Reprodução no cardápio | `components/menu/dish-row.tsx`, `components/menu/dish-viewer.tsx`, `lib/video-playback.ts` |
| Nova tentativa de otimização | `app/api/videos/retry/route.ts` |
| Vídeos antigos (opcional) | `scripts/reprocess-legacy-videos.mjs` |
| Regras | `firestore.rules`, `storage.rules`, `firestore.indexes.json` |

## Estrutura no Storage

```
restaurantes/{restaurantId}/produtos/{productId}/videos/original/{videoId}.{mp4|mov|webm}   privado (equipe)
restaurantes/{restaurantId}/produtos/{productId}/videos/optimized/{videoId}.mp4             público
restaurantes/{restaurantId}/produtos/{productId}/thumbnails/{videoId}.webp                  público
```

O projeto já usava `restaurantes/` (e não `establishments/`), então a estrutura nova segue esse padrão. A extensão do
original vem do conteúdo do arquivo (assinatura `ftyp` do MP4/MOV ou EBML do WebM), não do nome nem do tipo informado.
Cada vídeo tem um `videoId` novo: trocar o vídeo gera caminhos novos, então o navegador nunca mostra a versão antiga
em cache, e os arquivos gerados podem ter `Cache-Control: public, max-age=31536000, immutable`.

Vídeos enviados antes deste sistema (`restaurantes/{id}/produtos/videos/...`) continuam no ar sem mudança.

## Status

| Status | Quem grava | Significado |
| --- | --- | --- |
| `pending` | painel / rota de nova tentativa | registro criado, aguardando |
| `uploading` | painel | arquivo sendo enviado (`uploadCompletedAt` marca o fim do envio) |
| `processing` | worker | otimizando |
| `retrying` | worker | falha temporária; o evento volta para a fila e é tentado de novo |
| `ready` | worker | otimizado, validado e publicado no produto |
| `failed` | worker (ou painel, só com `error: "upload"`) | falhou; `error` diz o motivo |
| `canceled` | painel (ou worker, ao substituir) | cancelado ou substituído por um vídeo novo |

As regras do Firestore impedem o navegador de gravar `processing`, `retrying` ou `ready`, e de escrever
`videoUrl`, `videoPoster` ou `video` no produto (ele só pode limpar esses campos para remover o vídeo).

## O que o worker faz com cada vídeo

1. Recebe o evento do Storage e ignora tudo que não esteja em `.../videos/original/` (os arquivos que ele mesmo
   gera não disparam processamento: não há loop).
2. Reivindica o vídeo numa transação (status + geração do arquivo + prazo de posse). Evento repetido depois de
   pronto é ignorado; evento repetido durante o processamento volta para a fila (503).
3. Confere cota diária do estabelecimento e tamanho.
4. Baixa a geração exata do evento, analisa com `ffprobe` e decide:
   - **remontar** (sem perda, só `+faststart`) quando já é H.264 8 bits, até 720p, até 30 fps, até 2,5 Mbps,
     sem rotação e com AAC ou sem áudio;
   - **recodificar** nos outros casos: H.264 (`libx264`, CRF 25, preset `medium`, `yuv420p`, perfil high),
     no máximo 1280×720 na orientação do vídeo (sem ampliar, sem cortar), no máximo 30 fps, AAC 96 kbps,
     `+faststart`, quadro-chave a cada 2 s, metadados removidos (localização do celular etc.).
     A rotação de vídeos de celular é aplicada nos pixels.
5. Se a versão recodificada ficar maior que um original que já toca em qualquer navegador, usa o original remontado.
   Se o original não for compatível (ex.: HEVC de iPhone), mantém a recodificada mesmo que maior; a redução
   negativa é registrada como é.
6. Valida o resultado: abre no `ffprobe`, codec e dimensões esperados, duração igual, `moov` antes do `mdat`
   e decodificação do começo e do fim sem erro.
7. Gera a capa WebP (até 720 px no lado maior): testa três trechos e usa o filtro `thumbnail` do FFmpeg em cada um;
   descarta quadros escuros (brilho médio abaixo de 28) e fica com o mais claro se todos forem escuros.
8. Envia os dois arquivos, publica no produto numa transação (só se a posse continuar válida e o vídeo não tiver
   sido cancelado), apaga os arquivos do vídeo anterior do mesmo produto e, se configurado, o original.
9. Em falha: arquivo inválido, formato não suportado, longo demais, sem vídeo, cota ou produto excluído viram
   `failed` na hora; outras falhas viram `retrying` até `MAX_ATTEMPTS`. **O original nunca é apagado em falha.**

`reductionPercent = (1 − tamanho otimizado / tamanho original) × 100`, calculado com os tamanhos reais.

## Reprodução no cardápio

- Lista: o vídeo só existe enquanto a linha está perto da tela e é desmontado (com o download interrompido) ao se
  afastar; só toca visível e um de cada vez. Antes de carregar, aparece a capa WebP. Com o feed em tela cheia aberto,
  os vídeos da lista também saem (`useFeedOpen`) e voltam quando ele fecha: escondidos atrás do feed, eles dividiam a
  conexão com o vídeo da tela.
- Tela cheia (estilo Reels): só o prato visível toca (`muted`/`playsInline`/`loop`, quando o navegador permite).
  Existem no máximo três elementos `<video>` (anterior, atual, próximo); os demais slides são só o espaço reservado.
- Prioridade de download (`preloadFor` em `components/menu/reels/reels-viewer.tsx`):

  | Situação do atual | Atual | Próximo | Anterior |
  | --- | --- | --- | --- |
  | Sem o primeiro quadro | `auto` | nada | nada |
  | Com o primeiro quadro, sem folga, rede boa (orçamento `full`) | `auto` | `metadata` | nada |
  | Com folga, rede boa | `auto` | `auto` | `metadata` |
  | Sem folga, rede fraca (`light`: `effectiveType` 3G ou 2 travadas no último minuto) | `auto` | nada | nada |
  | Com folga, rede fraca | `auto` | `metadata` | nada |
  | Economia de dados ou 2G (`minimal`) | `auto` | nada | nada |
  | Parado (sem reprodução automática ou pausado) | `metadata` | `metadata` | como acima |

  "Folga": 5 s já baixados à frente do ponto em que o vídeo está, ou o arquivo inteiro. Com rede boa, `metadata`
  no próximo deixa a troca imediata. Com rede fraca, até o `metadata` custa caro (o Chrome baixou ~320 KB em 6 s num
  4G de 1,6 Mbps, e o vídeo da tela travou mais), então o próximo espera a folga: a troca fica mais lenta, mas o
  vídeo que a pessoa está vendo trava menos. O orçamento (`usePreloadBudget` em
  `lib/video-playback.ts`) usa `navigator.connection` quando existe e, em qualquer navegador (inclusive iPhone), as
  travadas do vídeo na tela; sem travadas por um minuto, volta ao normal.

  Testado e descartado: limitar o próximo aos primeiros segundos trocando `preload` de `auto` para `metadata` no meio
  do download. O Chrome ignora a troca e baixa o arquivo inteiro (medido com `npm run perf:reels`). Limitar de verdade
  exige servir o vídeo em segmentos (HLS ou MP4 fragmentado), ver "HLS: por que não agora".
- Falhas: arquivo inexistente, corrompido ou em formato que o aparelho não toca (`MEDIA_ERR_SRC_NOT_SUPPORTED`,
  `MEDIA_ERR_DECODE`) fica na capa, sem novas tentativas. Falha de rede tenta de novo no mesmo elemento, no ponto em
  que estava, em 1 s, 2 s e 4 s (sem rede, espera a conexão voltar); depois fica a capa. Vídeo que deveria tocar e
  passa 10 s sem receber nenhum dado (conexão pendurada, sem erro) conta como falha de rede. Voltar a tocar zera as
  tentativas.
- O navegador que recusa tocar sozinho mesmo sem som (iPhone em economia de energia) deixa o vídeo parado com o
  ícone de play; um toque inicia.
- A capa fica sempre por baixo do vídeo (sem tela preta). Vídeo horizontal aparece inteiro sobre a própria capa
  desfocada, sem corte.
- Com movimento reduzido ou economia de dados, o vídeo só toca quando o cliente pede.
- O cardápio (`/r/...`) abre a conexão com `firebasestorage.googleapis.com` (`<link rel="preconnect">`) enquanto o
  JavaScript e o Firestore carregam.

## Medição

`npm run perf:reels` (`scripts/perf-reels.mjs`) mede a reprodução num celular emulado contra os emuladores do Firebase
(mesmos pré-requisitos de `docs/TESTES.md`). Compila o app em `.next-perf` (não mexe na `.next` do `npm run dev`) e
serve os vídeos de um servidor próprio que faz o papel do Firebase Storage: Range, `Cache-Control: immutable`, banda
compartilhada e latência de cada perfil (wifi, 4G rápido, 4G lento, 3G). Os bytes contados são os que o aparelho
recebeu. Cenários: abertura e trocas em cada rede, rolagem rápida por 25 pratos, voltar, queda de conexão, vídeo
inexistente e arquivo inválido, autoplay recusado, reduzir movimento, 90 trocas seguidas (memória), `navigator.connection`
em 3G, lista do cardápio e troca de restaurante. `PERF_ONLY=<regex>` roda só alguns; `PERF_BUILD=0` reaproveita o
build; `KARDAP_DIST_DIR` escolhe a pasta do build (útil para comparar duas versões). `PERF_MEDIA_DIR` aponta para
vídeos já processados pelo worker (com um `manifest.json` de tamanhos e versões) em vez dos crus de `public/`, e
`PERF_VARIANTS=1` publica as versões extras nos produtos, como o worker com `VIDEO_VARIANTS` ligado.

Versões extras, uma rodada por cenário, mesmos vídeos processados pelo worker (principal ~1,7 Mbps), mesmo build:

| Cenário | Só a principal (hoje) | Com 540p/360p |
| --- | --- | --- |
| Wi-Fi e 4G rápido | principal, sem travadas | igual (principal) |
| 3G (`effectiveType` "3g"): tempo travado | 22,5 s | 17,1 s |
| 3G: dados de vídeo | 3,32 MB | 2,78 MB |
| 3G: prato fora do cache, troca → primeiro quadro | 2.300 ms | 1.800 ms |
| 4G lento sem `navigator.connection` (iPhone): tempo travado | 9,5 s | 8,2 s |
| 4G lento: pratos fora do cache, troca → primeiro quadro | 2.100 a 2.200 ms | 1.170 a 1.280 ms |

No 4G lento sem aviso da rede, o feed começa com a principal e passa para a 540p depois de duas travadas; um prato
que a lista já tinha baixado na principal perde esse cache quando a troca acontece.

`scripts/perf/video-probe.js` é a sonda usada na página (tempo até o primeiro quadro por prato, travadas, vídeos
tocando ao mesmo tempo, tarefas longas). Também dá para colar no console do navegador e ler
`window.__kdProbe.snapshot()`.

## Implantação no Google Cloud

Use o mesmo projeto do Firebase. Nada abaixo foi executado por este repositório: rode com uma conta com permissão de
administrador do projeto.

### 1. Serviços e região

```bash
PROJECT_ID=<id-do-projeto-firebase>
BUCKET=<projeto>.firebasestorage.app          # NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
REGION=southamerica-east1                       # região do Cloud Run (escolha a mais próxima)

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com

# O gatilho do Eventarc precisa ficar no MESMO local do bucket (ex.: "us-central1" ou "us").
BUCKET_LOCATION=$(gcloud storage buckets describe "gs://$BUCKET" --format="value(location)" | tr 'A-Z' 'a-z')
```

### 2. Contas de serviço com permissões mínimas

```bash
gcloud iam service-accounts create kardap-video-worker --display-name="Kardap: worker de vídeo"
gcloud iam service-accounts create kardap-video-events --display-name="Kardap: Eventarc e Scheduler do worker"
WORKER_SA=kardap-video-worker@$PROJECT_ID.iam.gserviceaccount.com
EVENTS_SA=kardap-video-events@$PROJECT_ID.iam.gserviceaccount.com

# Worker: objetos só no bucket do Firebase e acesso ao Firestore.
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$WORKER_SA" --role=roles/storage.objectUser
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$WORKER_SA" --role=roles/datastore.user

# Eventarc: receber eventos.
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$EVENTS_SA" --role=roles/eventarc.eventReceiver

# Agente do Cloud Storage publica os eventos no Pub/Sub (exigência dos gatilhos de Storage).
GCS_AGENT=$(gcloud storage service-agent --project="$PROJECT_ID")
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$GCS_AGENT" --role=roles/pubsub.publisher
```

### 3. Implantar o worker

```bash
gcloud run deploy kardap-video-worker \
  --source services/video-worker --region "$REGION" \
  --service-account "$WORKER_SA" --no-allow-unauthenticated \
  --cpu 2 --memory 2Gi --concurrency 1 --min-instances 0 --max-instances 3 --timeout 600 \
  --set-env-vars "STORAGE_BUCKET=$BUCKET,VIDEO_CRF=25,VIDEO_PRESET=medium,MAX_ATTEMPTS=3,DELETE_ORIGINAL_AFTER_SUCCESS=true,DAILY_VIDEO_QUOTA=30"

gcloud run services add-iam-policy-binding kardap-video-worker --region "$REGION" \
  --member="serviceAccount:$EVENTS_SA" --role=roles/run.invoker
```

- `--concurrency 1`: um vídeo por instância (FFmpeg usa os 2 vCPUs). `--max-instances 3` limita custo e paralelismo.
- O `/tmp` do Cloud Run fica na memória: 2 GiB cobrem o original de até 200 MB, o resultado e o FFmpeg.
- `--timeout 600` e `FFMPEG_TIMEOUT_SECONDS=480` (padrão) ficam abaixo do prazo de confirmação do Eventarc (600 s).

### 4. Gatilho do Storage

```bash
gcloud eventarc triggers create kardap-video-finalized \
  --location="$BUCKET_LOCATION" \
  --destination-run-service=kardap-video-worker --destination-run-region="$REGION" --destination-run-path=/ \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=$BUCKET" \
  --service-account="$EVENTS_SA"
```

O gatilho recebe todos os arquivos finalizados do bucket; o worker descarta em milissegundos o que não for
`.../videos/original/` (resposta 204). Falhas temporárias respondem 500 e o Pub/Sub reentrega com espera crescente.

### 5. Limpeza diária

```bash
WORKER_URL=$(gcloud run services describe kardap-video-worker --region "$REGION" --format="value(status.url)")
gcloud scheduler jobs create http kardap-video-cleanup --location="$REGION" \
  --schedule="0 4 * * *" --time-zone="America/Sao_Paulo" \
  --uri="$WORKER_URL/tasks/cleanup" --http-method=POST \
  --oidc-service-account-email="$EVENTS_SA"
```

### 6. Firestore e Storage

```bash
firebase deploy --only firestore:indexes            # índices usados pela limpeza (obrigatório)
firebase deploy --only storage                      # regras do Storage (ver nota abaixo)
firebase deploy --only firestore:rules              # só quando decidir sair da regra aberta
```

As regras do Storage consultam o Firestore (o original só é aceito se o registro do vídeo existir em `uploading` com o
mesmo caminho e tamanho). Na primeira publicação, o Firebase pede para autorizar o Storage a ler o Firestore.

**Regra aberta do Firestore:** enquanto `allow read, write: if true` estiver em produção, qualquer pessoa pode gravar
status e URLs de vídeo direto no banco. O worker continua correto, mas a proteção "só o servidor publica" depende de
publicar `firestore.rules`.

### 7. Nova tentativa pelo painel

O botão "Otimizar de novo" chama `POST /api/videos/retry`, que usa as variáveis `FIREBASE_ADMIN_*` já usadas pela
Cakto. Opcional: `FIREBASE_ADMIN_STORAGE_BUCKET` (padrão: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`). A conta de serviço
dessas variáveis precisa de acesso de escrita ao bucket. Sem elas, o painel orienta a enviar o vídeo de novo.

### 8. Vídeos antigos (opcional, não destrutivo)

```bash
node scripts/reprocess-legacy-videos.mjs                     # simula
node scripts/reprocess-legacy-videos.mjs --aplicar --max=20  # copia para a estrutura nova e o worker otimiza
```

O arquivo antigo continua no Storage; o produto troca de URL só depois que a versão otimizada for validada.

## Variáveis do worker

| Variável | Padrão | Uso |
| --- | --- | --- |
| `STORAGE_BUCKET` | (obrigatória) | bucket do Firebase; eventos de outros buckets são ignorados |
| `VIDEO_CRF` | 25 | qualidade do H.264 (18–30; menor = melhor e maior) |
| `VIDEO_PRESET` | medium | velocidade do x264 (veryfast, faster, fast, medium, slow) |
| `AUDIO_BITRATE` | 96k | AAC |
| `MAX_VIDEO_BITRATE` | 4M | teto de bitrate do vídeo |
| `MAX_ATTEMPTS` | 3 | tentativas por geração do arquivo |
| `LEASE_SECONDS` | 900 | prazo de posse de uma tentativa |
| `FFMPEG_TIMEOUT_SECONDS` | 480 | tempo máximo de uma conversão |
| `DELETE_ORIGINAL_AFTER_SUCCESS` | true | apaga o original depois da validação e da publicação |
| `DAILY_VIDEO_QUOTA` | 30 | vídeos por estabelecimento em 24 h (0 = sem limite) |
| `ORIGINAL_RETENTION_DAYS` | 7 | dias que originais com falha ou cancelados ficam guardados |
| `CLEANUP_MAX_FILES` | 2000 | arquivos verificados por execução da limpeza |
| `VIDEO_VARIANTS` | (vazio) | versões extras de cada vídeo: `540p`, `360p`, `av1` (ex.: `540p,360p,av1`). Vazio = só a principal. Ver "Versões extras" |

Limites do envio (painel, regras e worker): 200 MB, 2 minutos, MP4/MOV/WebM.

## Versões extras (540p, 360p, AV1)

Desligadas por padrão: cada versão soma processamento e armazenamento (ver "Custos"). Para ligar, implante o
worker com `VIDEO_VARIANTS=540p,360p` (ou com `av1`). Vídeos novos passam a ter as versões; os antigos continuam
funcionando só com a principal até a migração abaixo.

O que o worker faz, depois de validar a principal:

1. Para cada versão ligada, codifica **a partir do original** (não da principal, que já perdeu qualidade):
   - `540p` e `360p`: H.264, mesmo CRF da principal, teto de 2 Mbps e 900 kbps, AAC 80 e 64 kbps, mesma proporção;
     se o vídeo enviado já for desse tamanho ou menor, a versão não é gerada (nunca amplia);
   - `av1`: SVT-AV1 (preset 8, CRF 38) no tamanho da principal, com AAC, em MP4. Se o FFmpeg instalado não tiver o
     `libsvtav1`, a versão é pulada com aviso no log.
2. Valida cada uma como a principal (abre, codec e dimensões esperados, duração, `faststart`, decodifica começo e
   fim) e **descarta a que não sair pelo menos 15% menor que a principal** (`MAX_VARIANT_RATIO`).
3. Uma versão que falhar não derruba o vídeo: ele é publicado sem ela.
4. Publica tudo junto, na mesma transação da principal, em `produto.video.variants` (`kind`, `codec`, `width`,
   `height`, `size`, `path`, `url`). O campo `video` só é gravado pelo worker (regras do Firestore), então ninguém
   aponta o cardápio para outro arquivo. Os arquivos ficam em `.../videos/optimized/{videoId}.{540p|360p|av1}.mp4`,
   com o mesmo `Cache-Control: immutable` e as mesmas regras de leitura da principal.
5. Ao substituir o vídeo do produto, no descarte (cancelado) e na limpeza diária, as versões saem junto
   (`variantPaths` no registro do vídeo).

Medido com o código do worker nos três vídeos reais de `public/` (10 s cada, SSIM contra o original no tamanho da
principal; 1 = idêntico):

| Versão | Tamanho vs principal | SSIM | Codificação (6 núcleos) |
| --- | --- | --- | --- |
| Principal H.264 720p | 1,95 a 2,32 MB | 0,984 a 0,987 | ~4 s |
| 540p H.264 | −34% a −35% | 0,978 a 0,981 | 3,3 a 4,0 s |
| 360p H.264 | −61% | 0,964 a 0,971 | 2,3 a 2,4 s |
| AV1 720p | −41% a −44% | 0,982 a 0,986 | 3,8 a 4,0 s |
| VP9 720p (avaliado e descartado) | −27% | 0,933 a 0,969 | ~12 s |

VP9 ficou de fora: pior qualidade que o H.264 com pouca economia e 3x mais lento. AV1 vale a pena onde o aparelho
decodifica por hardware (iPhone 15 Pro em diante, Macs M3, Androids recentes); em celular simples a decodificação por
software gasta bateria e pode engasgar.

### Qual versão o cardápio toca

`pickVideoSource` (`lib/video-playback.ts`), decidido uma vez quando o player é criado:

| Onde / rede | Versão |
| --- | --- |
| Economia de dados ou 2G (`minimal`) | a menor |
| Rede fraca (`light`) | a maior resolução com bitrate médio até 1,3 Mbps (em geral 540p) |
| Rede boa (`full`) | a maior resolução; AV1 se o aparelho decodifica com eficiência, senão a principal |

A lista do cardápio usa a mesma regra do feed: quem toca num prato continua do que a lista já baixou (cache).
Testado e descartado: a lista sempre na menor versão. Economiza ~27% ao rolar a lista, mas quebra esse cache, e
numa rede lenta que o navegador ainda não identificou (iPhone, antes das primeiras travadas) o primeiro vídeo do
feed passava de imediato para 1 a 2 s (medido).

"Decodifica com eficiência": `navigator.mediaCapabilities.decodingInfo` responde `supported`, `smooth` e
`powerEfficient` para AV1 720p. Sem a API, ou sem versões no produto, toca a principal (`videoUrl`), como antes.

### Migração dos vídeos já publicados

Os originais são apagados depois do processamento, então a migração parte da versão otimizada publicada:

```bash
node scripts/reprocess-legacy-videos.mjs --versoes                       # simula: lista o que seria processado
node scripts/reprocess-legacy-videos.mjs --versoes --aplicar --max=20    # processa até 20
```

Para cada produto com vídeo otimizado e sem versões, o script grava o arquivo otimizado como um original novo (objeto
novo, sem o metadado `kardapGenerated`, senão o worker o ignoraria). O worker remonta a principal **sem
recomprimir** (já é H.264 compatível; coberto por teste), gera as versões a partir dela e só troca o vídeo do produto
depois de validar tudo; aí apaga os arquivos do anterior. As versões saem de um arquivo já comprimido, então perdem um
pouco mais que as de um envio novo. Cada vídeo conta na cota diária do estabelecimento (`DAILY_VIDEO_QUOTA`, 30):
rode em lotes com `--max` e `--restaurante`, ou aumente a cota durante a migração.

### HLS: por que não agora

Avaliado e adiado. Os vídeos têm de 10 s a 2 min e as versões MP4 escolhidas ao criar o player já dão a maior parte do
ganho em rede fraca, mantendo o cache HTTP, as requisições por faixa (Range) e o gerenciamento de players do feed.
HLS exigiria:

- playlists com URLs absolutas e token de cada segmento: as URLs de download do Firebase Storage codificam o
  caminho num único trecho (`/o/restaurantes%2F...`), então caminhos relativos na playlist não funcionam;
- ~15 a 60 objetos por vídeo (segmentos de 2 s em 3 qualidades), com mais operações cobradas no Storage;
- `hls.js` (~60 KB comprimido) no Chrome do Android e do computador; só Safari toca HLS nativo;
- reescrever o gerenciamento de players (MSE em vez de `src`).

Faz sentido rever se os vídeos ficarem longos (vários minutos), quando trocar de qualidade no meio do vídeo pesa mais.

## Logs e acompanhamento

Os logs do worker são JSON de uma linha (`severity`, `message`, `videoId`, `restaurantId`, `productId`, tamanhos,
redução, estratégia, tempo de processamento). No Cloud Logging:

```
resource.type="cloud_run_revision" resource.labels.service_name="kardap-video-worker" jsonPayload.message="vídeo pronto"
resource.type="cloud_run_revision" resource.labels.service_name="kardap-video-worker" severity>=WARNING
```

## Custos

Tudo é cobrado por uso e o worker fica com zero instâncias quando não há vídeo. Itens que geram custo:

- **Cloud Run:** vCPU e memória durante o processamento de cada vídeo (2 vCPU / 2 GiB).
  Na máquina de desenvolvimento, um vídeo de 10 s em 720p levou cerca de 3,5 s para comprimir;
  o tempo no Cloud Run depende da CPU alocada.
- **Cloud Build e Artifact Registry:** a cada implantação (build da imagem) e armazenamento da imagem.
- **Eventarc / Pub/Sub:** uma mensagem por arquivo finalizado no bucket (inclui imagens e logos).
- **Cloud Scheduler:** um job diário.
- **Cloud Storage:** armazenamento e transferência, que caem com a compressão; o original é apagado após o sucesso.
- **Firestore:** cerca de uma dezena de leituras/escritas por vídeo, mais a consulta da limpeza diária.
- **Versões extras (`VIDEO_VARIANTS`, desligadas por padrão):** medido nos vídeos de exemplo, `540p,360p` soma
  ~145% ao tempo de codificação da principal e ~104% ao armazenamento (0,65 + 0,39 do tamanho da principal); com
  `av1`, mais ~95% de tempo e ~57% de armazenamento. A transferência cai para quem recebe uma versão menor (lista do
  cardápio, rede fraca, aparelhos com AV1), e transferência costuma pesar mais que armazenamento na conta.

Consulte os preços atuais em <https://cloud.google.com/pricing> antes de ativar. Cloud Run e Eventarc exigem o
projeto no plano Blaze (com faturamento).

## Testes

```bash
cd services/video-worker
npm ci
npm test            # 33 testes; os de mídia usam o FFmpeg instalado na máquina
npm run typecheck
```

Os testes de mídia geram vídeos reais com FFmpeg (horizontal 1080p60 com áudio, celular com rotação, H.264 já
otimizado, HEVC, WebM 360p, abertura preta, 125 s, só áudio, texto com extensão .mp4, MP4 cortado no meio) e
processam os três vídeos reais de `public/`, medindo redução e SSIM. Os testes de fluxo usam Firestore e Storage em
memória com as mesmas funções de decisão do adaptador real; o comportamento do próprio Firebase não é coberto por eles.

## Evolução para HLS

O worker grava cada saída em caminho próprio por vídeo e o produto guarda `video.optimizedPath`. Para HLS ou várias
resoluções, basta gerar outros arquivos ao lado (ex.: `.../videos/hls/{videoId}/master.m3u8`) e acrescentar um campo ao
resumo publicado; o envio, os eventos e os status não mudam.

## Próximos passos (dependem de aprovação)

1. **Ligar as versões extras** (`VIDEO_VARIANTS=540p,360p`, opcionalmente `av1`) e rodar a migração
   (`--versoes`) em lotes. Custos na seção "Custos"; ganhos medidos em "Medição".
2. **Conferir o AV1 na imagem do Cloud Run.** O `Dockerfile` usa o FFmpeg do Debian bookworm; se ele não tiver o
   `libsvtav1` (ou tiver uma versão antiga), o worker pula o AV1 e registra no log. Testar num ambiente de
   homologação antes de ligar `av1` em produção; se faltar, a alternativa é a imagem `node:24-trixie-slim`.
3. **Teto de bitrate da principal** (`MAX_VIDEO_BITRATE`, padrão 4M). Com CRF 25 os vídeos de exemplo saem com
   1,6 a 1,9 Mbps, abaixo do teto; baixar o teto só muda vídeos com muito movimento. Avaliar com vídeos reais dos
   restaurantes antes de mexer.
4. **HLS:** ver "HLS: por que não agora".
