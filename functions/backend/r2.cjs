const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

let _client = null;

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

function getClient() {
  if (_client) return _client;

  const endpoint = mustEnv("R2_ENDPOINT");
  const accessKeyId = mustEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = mustEnv("R2_SECRET_ACCESS_KEY");

  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _client;
}

function getBucket() {
  return mustEnv("R2_BUCKET");
}

function getPublicBaseUrl() {
  return String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function makePublicUrl(key) {
  const base = getPublicBaseUrl();
  if (!base) return "";
  return `${base}/${String(key || "").replace(/^\/+/, "")}`;
}

/**
 * Extrae la key (ruta dentro del bucket) desde:
 * - un publicUrl: https://media.enmipueblo.com/service_images/.../file.webp
 * - o una key directa: service_images/.../file.webp
 *
 * Devuelve null si no se puede determinar (ej: data:..., http(s) fuera del dominio de R2).
 */
function keyFromPublicUrl(urlOrKey) {
  if (!urlOrKey) return null;
  const raw = String(urlOrKey).trim();
  if (!raw) return null;

  // legacy / compat: no intentamos borrar data:
  if (/^data:/i.test(raw)) return null;

  // quitar query/hash
  const clean = raw.split(/[?#]/)[0];

  // Si coincide con el public base, extraemos key.
  const base = getPublicBaseUrl();
  if (base && clean.startsWith(base + "/")) {
    const k = clean.slice((base + "/").length);
    return k ? k.replace(/^\/+/, "") : null;
  }

  // Si no es URL http(s), asumimos que puede ser key.
  if (!/^https?:\/\//i.test(clean) && !clean.includes("://")) {
    return clean.replace(/^\/+/, "");
  }

  // Cualquier otra URL externa: no la tocamos.
  return null;
}

async function signPutObject({ key, contentType, cacheControl, expiresInSeconds = 60 }) {
  const client = getClient();
  const Bucket = getBucket();

  const cmd = new PutObjectCommand({
    Bucket,
    Key: key,
    ContentType: contentType || undefined,
    CacheControl: cacheControl || "public, max-age=31536000, immutable",
  });

  return await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
}

async function deleteObject(key) {
  const client = getClient();
  const Bucket = getBucket();

  const Key = String(key || "").replace(/^\/+/, "");
  if (!Key) return;

  const cmd = new DeleteObjectCommand({ Bucket, Key });
  await client.send(cmd);
}

module.exports = {
  signPutObject,
  makePublicUrl,
  keyFromPublicUrl,
  deleteObject,
};
