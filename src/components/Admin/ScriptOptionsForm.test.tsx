/**
 * Tests du formulaire d'options et de leur envoi au lancement d'un job distant.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RemoteJobsPanel from './RemoteJobsPanel';
import ScriptOptionsForm, { previewScriptArgs } from './ScriptOptionsForm';
import type { ScriptOption, ScriptOptionValues } from '@/lib/admin/scripts';

const OPTIONS: ScriptOption[] = [
    { id: 'only', kind: 'list', flag: '--only=', label: 'Catalogues', help: 'Liste.', pattern: '[a-z]+', maxItems: 5 },
    { id: 'reset', kind: 'flag', flag: '--reset', label: 'Repartir de zéro', help: 'Vide.', destructive: true },
    {
        id: 'maxMag',
        kind: 'number',
        flag: '--max-mag',
        label: 'Magnitude',
        help: 'Limite.',
        min: 1,
        max: 35,
        defaultValue: 30.8,
    },
];

function Harness({ onValues }: { onValues: (values: ScriptOptionValues) => void }) {
    const [values, setValues] = useState<ScriptOptionValues>({});
    return (
        <>
            <ScriptOptionsForm
                options={OPTIONS}
                values={values}
                onChange={(next) => {
                    setValues(next);
                    onValues(next);
                }}
            />
            <output>{previewScriptArgs(OPTIONS, values).join(' ')}</output>
        </>
    );
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('ScriptOptionsForm', () => {
    it('produit les valeurs et l’aperçu de commande, et signale une option destructive', () => {
        const onValues = vi.fn();
        render(<Harness onValues={onValues} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'messier, caldwell' } });
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '14' } });
        fireEvent.click(screen.getByRole('checkbox', { name: /Repartir de zéro/ }));

        expect(onValues).toHaveBeenLastCalledWith({ only: ['messier', 'caldwell'], maxMag: 14, reset: true });
        expect(screen.getByText('--only=messier,caldwell --reset --max-mag 14')).toBeInTheDocument();
        expect(screen.getByText(/Option destructive/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('checkbox', { name: /Repartir de zéro/ }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
        expect(onValues).toHaveBeenLastCalledWith({ maxMag: 14 });
    });

    it('n’affiche rien sans option', () => {
        const { container } = render(<ScriptOptionsForm options={[]} values={{}} onChange={() => {}} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('RemoteJobsPanel avec options', () => {
    it('envoie les options cochées au lancement', async () => {
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (url === '/api/admin/jobs' && init?.method === 'POST')
                return Response.json({ id: 'j', scriptId: 'update-catalogues', status: 'queued' }, { status: 201 });
            if (url === '/api/admin/jobs')
                return Response.json({
                    scripts: [
                        {
                            id: 'update-catalogues',
                            label: 'Catalogues',
                            description: '',
                            writes: true,
                            options: OPTIONS,
                        },
                    ],
                    jobs: [],
                });
            return Response.json({ job: { id: 'j', status: 'queued' }, logs: [] });
        });
        vi.stubGlobal('fetch', fetchMock);
        render(<RemoteJobsPanel />);
        fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'messier' } });
        fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
        const buttons = await screen.findAllByRole('button', { name: 'Lancer' });
        fireEvent.click(buttons[buttons.length - 1]);
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/admin/jobs',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ scriptId: 'update-catalogues', options: { only: ['messier'] } }),
                }),
            ),
        );
    });
});
