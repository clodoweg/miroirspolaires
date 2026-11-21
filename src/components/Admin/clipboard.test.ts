import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

function mockClipboard(writeText?: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: writeText ? { writeText } : undefined,
    });
}

function mockExecCommand(result: boolean | Error) {
    const execCommand = vi.fn(() => {
        if (result instanceof Error) throw result;
        return result;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    return execCommand;
}

afterEach(() => {
    vi.restoreAllMocks();
    expect(document.querySelector('textarea')).toBeNull();
});

describe('copyToClipboard', () => {
    it("utilise l'API du presse-papiers quand elle fonctionne", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        mockClipboard(writeText);
        const execCommand = mockExecCommand(true);

        await expect(copyToClipboard('journal')).resolves.toBe(true);

        expect(writeText).toHaveBeenCalledWith('journal');
        expect(execCommand).not.toHaveBeenCalled();
    });

    it("passe au repli quand l'écriture est refusée", async () => {
        mockClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
        const execCommand = mockExecCommand(true);

        await expect(copyToClipboard('journal')).resolves.toBe(true);

        expect(execCommand).toHaveBeenCalledWith('copy');
    });

    it("passe au repli quand l'API est absente", async () => {
        mockClipboard();
        mockExecCommand(true);

        await expect(copyToClipboard('journal')).resolves.toBe(true);
    });

    it('signale un échec quand le repli échoue aussi', async () => {
        mockClipboard();
        mockExecCommand(false);
        await expect(copyToClipboard('journal')).resolves.toBe(false);

        mockExecCommand(new Error('refus'));
        await expect(copyToClipboard('journal')).resolves.toBe(false);
    });
});
