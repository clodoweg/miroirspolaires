/**
 * POST /api/auth/github/logout : fin de la session admin (voir `login-flow.ts`).
 *
 * POURQUOI POST : un GET pourrait être déclenché par une image d'une autre page ; le middleware refuse
 * en plus les requêtes inter-sites vers `/api/auth/**`.
 */
import type { APIRoute } from 'astro';
import { logout } from '@/lib/admin/auth/login-flow';

export const prerender = false;

export const POST: APIRoute = () => logout();
