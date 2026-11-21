import { createClient } from '@libsql/client';

const url = import.meta.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL;
const authToken = import.meta.env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

if (!url) {
    throw new Error("La variable d'environnement TURSO_DATABASE_URL n'est pas définie.");
}

export const db = createClient({
    url,
    authToken,
});
