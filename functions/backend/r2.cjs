const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
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
  return `${base}/${key}`;
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

module.exports = {
  signPutObject,
  makePublicUrl,
};
