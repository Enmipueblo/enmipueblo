const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta env ${name}`);
  return v;
}

let _client = null;
function getR2Client() {
  if (_client) return _client;

  const endpoint = must("R2_ENDPOINT");
  const accessKeyId = must("R2_ACCESS_KEY_ID");
  const secretAccessKey = must("R2_SECRET_ACCESS_KEY");

  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _client;
}

function sanitizeFolder(folder) {
  const f = String(folder || "otros")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return f.replace(/[^a-zA-Z0-9/_-]/g, "_");
}

function sanitizeFilename(name) {
  const base = String(name || "archivo")
    .replace(/[\/\\]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 160);
  return base || "archivo";
}

function buildKey({ folder, uid, filename }) {
  const f = sanitizeFolder(folder);
  const safe = sanitizeFilename(filename);
  const ts = Date.now();
  const rnd = crypto.randomBytes(6).toString("hex");
  return `${f}/${uid}/${ts}_${rnd}_${safe}`;
}

function getPublicUrl(key) {
  const base = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${key}`;
}

async function signPutObject({ key, contentType }) {
  const Bucket = must("R2_BUCKET");
  const client = getR2Client();

  const cmd = new PutObjectCommand({
    Bucket,
    Key: key,
    ContentType: contentType || "application/octet-stream",
    CacheControl: "public, max-age=31536000, immutable",
  });

  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 60 });

  return {
    uploadUrl,
    key,
    publicUrl: getPublicUrl(key),
  };
}

module.exports = { buildKey, signPutObject };
