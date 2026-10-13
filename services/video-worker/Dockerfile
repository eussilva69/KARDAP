# Worker de vídeo do Kardap: Node 24 (executa TypeScript direto, sem etapa de build) + FFmpeg do Debian.
FROM node:24-bookworm-slim

# ffmpeg do Debian inclui libx264, AAC e libwebp, usados na compressão e na miniatura.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

# Sem root: o processo só precisa ler o código e escrever em /tmp.
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.ts"]
