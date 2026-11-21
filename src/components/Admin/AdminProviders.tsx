import type { ReactNode } from 'react';
import { ToastProvider } from './Toast';
import { ConfirmProvider } from './ConfirmDialog';

/**
 * Wraps an admin React island with the toast + confirm providers so any
 * descendant can `useToast()` / `useConfirm()`.
 *
 * Each Astro page mounts its own React tree (one per `client:only` island),
 * so providers live INSIDE each editor's root component rather than in the
 * Astro layout.
 */
export default function AdminProviders({ children }: { children: ReactNode }) {
    return (
        <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
    );
}
