// functions/setAdminRole.cjs
const admin = require("firebase-admin");
const path = require("path");

// Carga de credenciales desde el JSON que descargaste
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const email = process.argv[2];
const role = process.argv[3] || "admin";

if (!email) {
  console.error("Uso: node setAdminRole.cjs email@dominio.com [role]");
  process.exit(1);
}

async function main() {
  try {
    const user = await admin.auth().getUserByEmail(email);
    const claims = { role };

    await admin.auth().setCustomUserClaims(user.uid, claims);

    console.log(
      `✅ Asignado role="${role}" al usuario ${email} (uid=${user.uid})`
    );
    console.log(
      "Recuerda que el usuario debe cerrar sesión y volver a entrar para que el rol se refleje en el token."
    );
    process.exit(0);
  } catch (err) {
    console.error("❌ Error asignando rol:", err);
    process.exit(1);
  }
}

main();
