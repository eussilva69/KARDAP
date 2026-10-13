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
  afastar; só toca visível e um de cada vez. Antes de carregar, aparece a capa WebP.
- Tela cheia (estilo Reels): só o prato visível toca (`autoPlay`/`muted`/`playsInline`/`loop`, quando o navegador
  permite). O anterior e o próximo existem com `preload="metadata"`; o próximo passa a `preload="auto"` só depois que
  o atual começou a tocar e se a conexão não for 2G/3G nem estiver em economia de dados. Os demais não são criados.
- A capa fica sempre por baixo do vídeo (sem tela preta). Vídeo horizontal aparece inteiro sobre a própria capa
  desfocada, sem corte.
- Com movimento reduzido ou economia de dados, o vídeo só toca quando o cliente pede.

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

Limites do envio (painel, regras e worker): 200 MB, 2 minutos, MP4/MOV/WebM.

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
