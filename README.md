# Trakto • Video Processor (NestJS + React + Google Cloud Storage)

Aplicação full-stack para **upload de vídeos**, armazenamento no **Google Cloud Storage (GCS)**, **transcoding para low-res** e **listagem/ download** via UI.  
Pensada para rodar **localmente** e **via Docker**.

---

## Sumário

- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Recursos](#recursos)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Backend (API NestJS)](#backend-api-nestjs)
  - [Variáveis de ambiente](#variáveis-de-ambiente)
  - [Endpoints](#endpoints)
  - [Pipeline de processamento](#pipeline-de-processamento)
- [Frontend (React + Vite + Tailwind)](#frontend-react--vite--tailwind)
- [Setup do Google Cloud](#setup-do-google-cloud)
  - [Bucket, Service Account e permissões](#bucket-service-account-e-permissões)
  - [CORS do bucket](#cors-do-bucket)
  - [Smoke (opcional)](#smoke-opcional)
- [Como rodar](#como-rodar)
  - [Docker (recomendado)](#docker-recomendado)
  - [Dev local](#dev-local)
- [Comandos úteis](#comandos-úteis)
- [Troubleshooting](#troubleshooting)
- [Próximos passos](#próximos-passos)
- [Licença](#licença)

---

## Arquitetura

```
[Browser]
   │
   │ UI (upload) → solicita URL pré-assinada (PUT)
   ▼
[Web:8080]  ── proxy /api → API:3000
   │
   ├─ POST /api/videos/presign      → { id, uploadUrl }
   ├─ PUT uploadUrl (GCS direto)    → CORS do bucket
   └─ POST /api/videos/complete     → inicia transcode
                               │
                               ▼
                        [API NestJS :3000]
                         ├─ Assina URLs (v4)
                         ├─ Transcoding (ffmpeg)
                         ├─ Envia low-res ao GCS
                         └─ Gera URLs de download
                               │
                               ▼
                    [Google Cloud Storage]
                    ├─ original/<id>.mp4
                    └─ low/<id>_low.mp4
```

---

## Stack

- **API:** Node 20 · NestJS 11 · `@google-cloud/storage` · `fluent-ffmpeg` · Multer (local opcional)
- **Front:** React 19 · Vite · Tailwind 3 (tema escuro inspirado na Trakto)
- **Transcode:** `ffmpeg` (instalado na imagem Docker)
- **Infra dev:** Docker + docker compose + Nginx (serve front e faz proxy de API)

---

## Recursos

- Upload direto para GCS via **URL pré-assinada (V4)**.
- Geração automática de **low-res** (mantendo proporções, sufixo `_low`).
- Lista paginada com status, tamanho e **links de download** (original e low).
- **Download via API** (stream + `Content-Disposition`) com barra de progresso no front.
- UI responsiva com drag-and-drop, progresso de upload e UX consistente com a identidade da Trakto.

---

## Estrutura do projeto

```
.
├─ api/                         # NestJS
│  ├─ src/
│  │  ├─ videos/
│  │  │  ├─ videos.controller.ts
│  │  │  ├─ videos.service.ts
│  │  │  └─ videos.module.ts
│  │  ├─ storage/gcs.service.ts
│  │  ├─ app.module.ts
│  │  └─ main.ts
│  ├─ scripts/cors.json         # CORS do bucket (dev)
│  ├─ Dockerfile
│  └─ package.json
├─ web/                         # React + Vite + Tailwind
│  ├─ src/
│  │  ├─ api/client.ts
│  │  └─ App.tsx
│  ├─ nginx.conf
│  ├─ Dockerfile
│  └─ package.json
├─ secrets/                     # (ignorada no git)
│  └─ gcp_sa.json               # chave da service account
├─ docker-compose.yml
└─ README.md
```

---

## Backend (API NestJS)

### Variáveis de ambiente

```dotenv
# API
PORT=3000

# GCS
GCS_BUCKET=<seu-bucket>
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcp_sa.json
GCS_SIGNED_URL_EXPIRES=3600
```

> **Docker:** o compose monta `./secrets/gcp_sa.json` no caminho `/run/secrets/gcp_sa.json` como **read-only**.

### Endpoints

| Método & Rota                                 | Descrição                                                                                     | Body/Query                                     | Resposta |
|----------------------------------------------|------------------------------------------------------------------------------------------------|------------------------------------------------|----------|
| `GET  /api/videos?page=&pageSize=`           | Lista paginada dos processamentos                                                             | `page` (1), `pageSize` (10)                    | `{ items, total, page, pageSize }` |
| `GET  /api/videos/:id`                       | Detalhe de um processamento                                                                   | —                                              | Objeto do vídeo |
| `POST /api/videos/presign`                   | Gera URL pré-assinada (V4) para o **PUT** do original direto no GCS                           | `{ filename, contentType }`                    | `{ id, uploadUrl }` |
| `POST /api/videos/complete`                  | Finaliza: baixa original, **ffmpeg → low**, sobe low, atualiza status                         | `{ id, size? }`                                | Objeto do vídeo |
| `GET  /api/videos/:id/download/original`     | **Download via API** do original (stream com `Content-Disposition`)                           | —                                              | binário |
| `GET  /api/videos/:id/download/low`          | **Download via API** da versão low                                                            | —                                              | binário |

**Regras/validações**:
- Aceita `video/*` (mp4, mov, mkv, avi).
- Tamanho máximo: **200 MB** (ajustável).
- URLs de download são assinadas (TTL configurável por `GCS_SIGNED_URL_EXPIRES`).

### Pipeline de processamento

1. Front chama `POST /presign` → recebe `{ id, uploadUrl }`.
2. Front faz `PUT uploadUrl` (GCS) — **CORS do bucket** deve permitir a origin do front.
3. Front chama `POST /complete { id }`.
4. API baixa original (temp), executa **ffmpeg** (mantém proporção, bitrate reduzido) e faz upload do **low** para `low/<id>_low.mp4`.
5. API atualiza metadados (mock in-memory) e assina URLs de download.

---

## Frontend (React + Vite + Tailwind)

- **Tema dark** com tonalidades azuis/ardósia alinhadas à Trakto.
- **Drag-and-drop** + seleção de arquivo; preview de nome/tamanho.
- **Progresso de upload** (PUT → GCS) e **progresso de download** (GET → API).
- **Histórico** com paginação e badges de status (`done`, `pending`, `error`).

Config (`web/src/api/client.ts`):
- `baseURL = window.location.origin` (o Nginx do front faz **proxy** de `/api` para a API).
- Helper para compor URLs de arquivo quando necessário.

---

## Setup do Google Cloud

### Bucket, Service Account e permissões

### Configuração automatizada (recomendado)

> **Recomendado para times e para facilitar a renovação das credenciais.**

1. **Pré-requisitos:**  
   - [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/docs/install) instalada.
   - Permissão de Owner ou Editor no projeto GCP.

2. **Autentique-se no Google Cloud:**
   ```powershell
   gcloud auth login
   ```

3. **Execute o script de setup:**
   ```powershell
   # No PowerShell, na raiz do projeto:
   cd api
   powershell -ExecutionPolicy Bypass -File .\scripts\gcp-init.ps1
   ```
   O script irá:
   - Garantir que o bucket existe.
   - Garantir que a Service Account existe e tem permissão.
   - Gerar uma nova chave JSON em `C:\keys\trakto-uploader.json`.
   - Configurar CORS no bucket.
   - Exibir as variáveis para adicionar ao seu `.env`.

4. **Atualize o arquivo `.env` da API:**
   ```
   GOOGLE_APPLICATION_CREDENTIALS=C:\keys\trakto-uploader.json
   GCS_BUCKET=trakto-videos-469221
   GCS_SIGNED_URL_EXPIRES=3600
   ```

5. **Renovação das credenciais:**  
   Sempre que necessário (ex: chave expirada), basta rodar novamente o script.

---

### Bucket, Service Account e permissões (manual)

> **Use apenas se não quiser rodar o script automatizado.**

```bash
# Variáveis
PROJECT_ID="<seu-projeto>"
REGION="southamerica-east1"
BUCKET="trakto-videos-xxxxxx"
SA_NAME="trakto-videos-uploader"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"

# Bucket com UBLA
gcloud storage buckets create "gs://$BUCKET" \
  --location="$REGION" \
  --uniform-bucket-level-access

# Service Account
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Trakto Videos Uploader"

# Permissão (grava/le objetos)
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin"

# Chave JSON (salvar fora do git e depois copiar para ./secrets/gcp_sa.json)
gcloud iam service-accounts keys create "/c/keys/gcp_sa.json" \
  --iam-account="$SA_EMAIL"
```

Copie a chave para **`./secrets/gcp_sa.json`** (garanta que é **arquivo**, não diretório).

### CORS do bucket

`api/scripts/cors.json`
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "HEAD"],
    "responseHeader": ["Content-Type", "x-goog-resumable", "x-goog-meta-*"],
    "maxAgeSeconds": 3600
  }
]
```

Aplicar e verificar:

```bash
gcloud storage buckets update gs://$BUCKET --cors-file=api/scripts/cors.json
gcloud storage buckets describe gs://$BUCKET --format="json(cors_config)"
```

> Se rodar o front em outra porta (ex.: `5173` em dev), inclua a nova origin no JSON.

### Smoke (opcional)

Na pasta `api/`:

```bash
npm run gcs:smoke:cp   # cria test.txt e copia para gs://BUCKET/tests/test.txt
npm run gcs:smoke:ls   # lista gs://BUCKET/tests/
```

---

## Como rodar

### Docker (recomendado)

1. **Pré-requisitos**: Docker Desktop instalado.
2. **Chave GCP**: coloque sua chave em `./secrets/gcp_sa.json` (arquivo).
3. **Subir**:
   ```bash
   docker compose up -d --build
   ```
4. **Acessar**:
   - Web: `http://localhost:8080`
   - API (debug): `http://localhost:3000/api/videos`
5. **Testar**: faça upload de um `.mp4` pequeno → aguarde processamento → baixe **Original** e **Low**.

> **Dica**: se `/run/secrets/gcp_sa.json` aparecer como diretório no container, você criou uma pasta `secrets/gcp_sa.json/` ao invés de um **arquivo** `secrets/gcp_sa.json`.

### Dev local

**Pré-requisitos**: Node 20+, `ffmpeg` no PATH (ou `@ffmpeg-installer/ffmpeg`), `gcloud`.

```bash
# API
cd api
npm ci
npm run start:dev   # http://localhost:3000

# WEB
cd ../web
npm ci
npm run dev         # http://localhost:5173
```

> Ajuste o **CORS do bucket** para `http://localhost:5173` se usar o front do Vite em dev.

---

## Comandos úteis

**API**
```bash
npm run build           # compila
npm run start:prod      # roda dist
npm run start:dev       # watch
npm run lint            # eslint --fix
npm run format          # prettier
npm test                # jest
```

**WEB**
```bash
npm run dev
npm run build
npm run preview
npm run lint
```

**Docker**
```bash
docker compose up -d --build
docker compose logs -f api
docker compose exec api sh -lc 'ls -l /run/secrets && head -c 80 /run/secrets/gcp_sa.json && echo'
docker compose down
```

---

## Troubleshooting

- **`The file at /run/secrets/gcp_sa.json does not exist / not a file`**  
  O bind montou um **diretório**. Garanta que **existe** `./secrets/gcp_sa.json` (arquivo > 0 B), então:
  ```bash
  docker compose down && docker compose up -d --build
  ```

- **CORS no `PUT` da URL assinada**  
  Confirme CORS do bucket com origin `http://localhost:8080` (ou a porta do seu front).  
  Reaplique `api/scripts/cors.json`.

- **`invalid_grant: Invalid JWT Signature`**  
  Chave inválida/expirada, projeto incorreto ou relógio do SO. Gere nova key e atualize `./secrets/gcp_sa.json`.

- **`ffmpeg exited with code 1`**  
  Arquivo inválido/codec não suportado. Em Docker, `ffmpeg` é instalado via `apk add ffmpeg`.

- **Warning `version` no compose**  
  Remova a chave `version:` do `docker-compose.yml` (obsoleta).

---

## Próximos passos

- Persistir metadados em banco (PostgreSQL/Prisma) e orquestrar transcode com **BullMQ** (assíncrono).
- Geração de **thumbnails** e **múltiplas resoluções** (240p/360p/480p).
- Autenticação/autorização (JWT + RBAC).
- Observabilidade (p95/p99) e retries com backoff.

---

## Licença

Uso educacional para o desafio técnico. **Nunca** commitar chaves do GCP (`./secrets/` está no `.gitignore`).
