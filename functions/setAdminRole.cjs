const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const email = process.argv[2];
const role = process.argv[3] || "admin";

if (!email) {
  console.error("Uso: node setAdminRole.cjs email@dominio.com [role]");
  process.exit(1);
}

async function main() {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role });

    console.log(`✅ Asignado role="${role}" a ${email} (uid=${user.uid})`);
    console.log("El usuario debe cerrar sesión y volver a entrar para refrescar el token.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err?.message || err);

    console.log("\nSI ESTÁS EN TU PC (local), hacé esto UNA VEZ y reintentá:");
    console.log("1) Instalar Google Cloud SDK (si no lo tenés)");
    console.log("2) Ejecutar: gcloud auth application-default login");
    console.log("3) Reintentar: node setAdminRole.cjs email@dominio.com admin\n");

    process.exit(1);
  }
}

main();
