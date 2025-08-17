import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1) Carrega .env (primeiro do CWD; se não achar, tenta ao lado do script)
let loaded = dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (loaded.error) {
  loaded = dotenv.config({ path: path.resolve(__dirname, '.env') });
}

// 2) Helpers de credencial (JSON no .env ou arquivo)
function loadSaJsonFromEnv() {
  const b64 = process.env.GCP_SA_JSON_BASE64;
  const raw = process.env.GCP_SA_JSON;

  if (b64) {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  }
  if (raw) {
    return JSON.parse(raw);
  }
  return null;
}

function buildStorageClient() {
  const sa = loadSaJsonFromEnv();
  if (sa) {
    // corrige \n escapado no Windows
    const private_key = sa.private_key?.includes('\\n')
      ? sa.private_key.replace(/\\n/g, '\n')
      : sa.private_key;

    return new Storage({
      projectId: sa.project_id, // opcional; a lib descobre também
      credentials: {
        client_email: sa.client_email,
        private_key,
      },
    });
  }

  // fallback: usar caminho do arquivo via GOOGLE_APPLICATION_CREDENTIALS
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile) {
    // valida existência só pra erro melhor
    if (!fs.existsSync(keyFile)) {
      throw new Error(`GOOGLE_APPLICATION_CREDENTIALS aponta para um arquivo que não existe: ${keyFile}`);
    }
    return new Storage({ keyFilename: keyFile });
  }

  // último fallback: ADC (Application Default Credentials)
  return new Storage();
}

const {
  GCS_BUCKET,
  GCS_SIGNED_URL_EXPIRES = '3600',
} = process.env;

if (!GCS_BUCKET) {
  throw new Error(
    'GCS_BUCKET não definido. Verifique seu .env (dica: rode o script no mesmo diretório do .env ou ajuste o path no dotenv.config).'
  );
}

const storage = buildStorageClient();
const bucket = storage.bucket(GCS_BUCKET);

async function uploadFile(localPath, destination) {
  const abs = path.isAbsolute(localPath)
    ? localPath
    : path.resolve(process.cwd(), localPath);

  if (!fs.existsSync(abs)) {
    throw new Error(`Arquivo local não encontrado: ${abs}`);
  }
  await bucket.upload(abs, {
    destination,
    resumable: true,
    validation: 'crc32c',
    metadata: { cacheControl: 'private, max-age=0, no-transform' },
  });
  console.log(`OK: upload ${abs} -> gs://${GCS_BUCKET}/${destination}`);
}


async function getSignedReadUrl(objectName, seconds = Number(GCS_SIGNED_URL_EXPIRES)) {
  const [url] = await bucket.file(objectName).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + seconds * 1000,
  });
  return url;
}

// CLI: node gcs.mjs upload <arquivo_local> <destino_no_bucket>
//      node gcs.mjs url <destino_no_bucket>
const [, , cmd, a, b] = process.argv;
(async () => {
  try {
    if (cmd === 'upload') {
      if (!a || !b) throw new Error('Uso: node gcs.mjs upload <arquivo_local> <destino_no_bucket>');
      await uploadFile(a, b);
    } else if (cmd === 'url') {
      if (!a) throw new Error('Uso: node gcs.mjs url <destino_no_bucket>');
      const url = await getSignedReadUrl(a);
      console.log(url);
    } else {
      console.log('Comandos:');
      console.log('  upload <arquivo_local> <destino_no_bucket>');
      console.log('  url <destino_no_bucket>');
    }
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  }
})();
