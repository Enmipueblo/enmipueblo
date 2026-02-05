// functions/setAdminRole.cjs
// ⚠️ DEPRECADO: este script usaba Firebase Admin para asignar custom claims.
// EnMiPueblo ya NO usa Firebase.
//
// Ahora los admins se gestionan por variable de entorno en el backend:
//   ADMIN_EMAILS="admin1@dominio.com,admin2@dominio.com"
//
// Si necesitas más granularidad en el futuro (roles, suscripciones, etc.),
// lo haremos en Mongo (colección users/subscriptions) sin Firebase.

console.error("Este proyecto ya no usa Firebase. Usa ADMIN_EMAILS en el backend para admins.");
process.exit(1);
