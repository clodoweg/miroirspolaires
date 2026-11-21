/// <reference types="astro/client" />

declare module '*?raw' {
    const content: string;
    export default content;
}

declare module '*.csv' {
    const content: string;
    export default content;
}

interface ImportMetaEnv {
    readonly R2_URL: string;
    readonly FORCE_LOCAL_IMAGES: string;
    readonly IMAGE_WORKER_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare namespace App {
    interface Locals {
        /** Verdict du middleware pour `/admin` et `/api/admin` (voir `src/lib/admin/auth/access.ts`). */
        adminAccess?: import('./lib/admin/auth/access').AdminAccess;
    }
}
