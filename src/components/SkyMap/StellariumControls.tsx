import React, { useState } from 'react';
import { Type, Globe, Sparkles, Square } from 'lucide-react';
import { ControlButton, ControlPanel, ControlDivider } from './shared';

interface StellariumControlsProps {
    engine: any;
    className?: string;
}

const StellariumControls: React.FC<StellariumControlsProps> = ({ engine, className }) => {
    const [config, setConfig] = useState({
        lines: true,
        labels: true,
        bounds: false,
        equatorialGrid: true,
        dso: true,
    });

    const PROP_PATHS: Record<string, string> = {
        lines: 'constellations.lines_visible',
        labels: 'constellations.labels_visible',
        bounds: 'constellations.bounds_visible',
        equatorialGrid: 'lines.equatorial.visible',
        dso: 'dsos.visible',
    };

    const toggle = (key: keyof typeof config) => {
        if (!engine) return;
        const newValue = !config[key];

        const paths = key === 'labels' ? ['constellations.labels_visible', 'stars.hints_visible'] : [PROP_PATHS[key]];

        try {
            const core = engine.core || engine;

            paths.forEach((path) => {
                const parts = path.split('.');
                let obj = core;

                for (let i = 0; i < parts.length - 1; i++) {
                    if (obj[parts[i]]) {
                        obj = obj[parts[i]];
                    } else {
                        console.warn(`Path part ${parts[i]} not found in`, obj);
                        return;
                    }
                }

                const lastProp = parts[parts.length - 1];
                if (obj && (lastProp in obj || obj[lastProp] === undefined)) {
                    obj[lastProp] = newValue;

                    if (path.includes('stars') && typeof obj.v !== 'undefined') {
                        obj.v++;
                    }
                }
            });

            setConfig((prev) => ({ ...prev, [key]: newValue }));
        } catch (err) {
            console.error(`Error toggling ${key}:`, err);
        }
    };

    if (!engine) return null;

    return (
        <ControlPanel className={className || 'absolute bottom-6 left-1/2 z-20 -translate-x-1/2'}>
            <ControlButton
                active={config.lines}
                onClick={() => toggle('lines')}
                icon={<Sparkles size={20} />}
                label="Const."
                title="Constellations"
            />
            <ControlButton
                active={config.labels}
                onClick={() => toggle('labels')}
                icon={<Type size={20} />}
                label="Noms"
                title="Noms"
            />
            <ControlButton
                active={config.bounds}
                onClick={() => toggle('bounds')}
                icon={<Square size={20} />}
                label="Frontières"
                title="Frontières"
            />
            <ControlDivider />
            <ControlButton
                active={config.equatorialGrid}
                onClick={() => toggle('equatorialGrid')}
                icon={<Globe size={20} />}
                label="Grille Eq"
                title="Grille Équatoriale"
            />
        </ControlPanel>
    );
};

export default StellariumControls;
