// db.js
// Ten cuidado con el uso de `import` vs `require` en el backend.
// Si tu `package.json` tiene `"type": "commonjs"`, entonces usa `require`.
// Si tiene `"type": "module"`, entonces usa `import`.
// Para este setup, `"type": "commonjs"` con `require` es lo que usamos.
const { MongoClient } = require('mongodb'); // Usar require para commonjs

const uri =
  process.env.MONGO_URI ||
  'mongodb+srv://demipueblo:Guarani2658@demipueblo.wlp7oro.mongodb.net/?retryWrites=true&w=majority&appName=demipueblo';
const client = new MongoClient(uri);
const dbName = 'demipueblo';

let collection;

async function connectToDB() {
  if (!collection) {
    await client.connect();
    const db = client.db(dbName);
    collection = db.collection('servicios');
    console.log(`✅ Conectado a MongoDB`);
  }
  return collection;
}

module.exports = { connectToDB }; // Exportar como commonjs
