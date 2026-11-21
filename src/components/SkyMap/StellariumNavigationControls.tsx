import React from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Plus, Minus, Compass, Home } from 'lucide-react';
import { ControlButton, ControlPanel, ControlDivider } from './shared';

interface StellariumNavigationControlsProps {
    engine: any;
    className?: string;
    onPan: (dYaw: number, dPitch: number) => void;
    onZoom: (dFov: number) => void;
    onReset: () => void;
    onResetSouth: () => void;
    onResetCenter: () => void;
}

const StellariumNavigationControls: React.FC<StellariumNavigationControlsProps> = ({
    engine,
    className,
    onPan,
    onZoom,
    onReset,
    onResetSouth,
    onResetCenter,
}) => {
    // Dynamic Step Calculation
    const getSteps = () => {
        let pan = 5 * (Math.PI / 180);
        let zoom = 5 * (Math.PI / 180);

        if (engine) {
            const core = engine.core || engine;
            if (core.fov !== undefined) {
                pan = core.fov * 0.05;
                zoom = core.fov * 0.1;
            }
        }
        return { pan, zoom };
    };

    // Keyboard Shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            const { pan, zoom } = getSteps();

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    onPan(-pan, 0);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    onPan(pan, 0);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    onPan(0, pan);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    onPan(0, -pan);
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    onZoom(-zoom);
                    break;
                case '-':
                case '_':
                    e.preventDefault();
                    onZoom(zoom);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onPan, onZoom, engine]);

    return (
        <ControlPanel className={className}>
            {/* Directional Controls Group */}
            <div className="flex items-center gap-1">
                <ControlButton
                    onClick={() => onPan(-getSteps().pan, 0)}
                    icon={<ChevronLeft size={14} />}
                    title="Pan Left (-RA)"
                    style={{ minWidth: '24px', width: '24px', minHeight: '52px' }}
                    className="p-0"
                />

                <div className="flex flex-col gap-1">
                    <ControlButton
                        onClick={() => onPan(0, getSteps().pan)}
                        icon={<ChevronUp size={14} />}
                        title="Pan Up (+Dec)"
                        style={{ minWidth: '42px', minHeight: '24px', height: '24px' }}
                        className="p-0"
                    />
                    <ControlButton
                        onClick={() => onPan(0, -getSteps().pan)}
                        icon={<ChevronDown size={14} />}
                        title="Pan Down (-Dec)"
                        style={{ minWidth: '42px', minHeight: '24px', height: '24px' }}
                        className="p-0"
                    />
                </div>

                <ControlButton
                    onClick={() => onPan(getSteps().pan, 0)}
                    icon={<ChevronRight size={14} />}
                    title="Pan Right (+RA)"
                    style={{ minWidth: '24px', width: '24px', minHeight: '52px' }}
                    className="p-0"
                />
            </div>

            <ControlDivider />

            {/* Zoom Control Group */}
            <div className="flex flex-col gap-1">
                <ControlButton
                    onClick={() => onZoom(-getSteps().zoom)}
                    icon={<Plus size={14} />}
                    title="Zoom In"
                    style={{ minWidth: '24px', width: '24px', minHeight: '24px', height: '24px' }}
                    className="p-0"
                />
                <ControlButton
                    onClick={() => onZoom(getSteps().zoom)}
                    icon={<Minus size={14} />}
                    title="Zoom Out"
                    style={{ minWidth: '24px', width: '24px', minHeight: '24px', height: '24px' }}
                    className="p-0"
                />
            </div>

            <ControlDivider />

            {/* Reset Buttons */}
            <ControlButton
                onClick={onReset}
                icon={<Compass size={20} />}
                label="Nord"
                title="Position Initiale (Nord)"
                style={{ minWidth: '48px', minHeight: '52px' }}
            />
            <ControlButton
                onClick={onResetCenter}
                icon={<Home size={20} />}
                label="Centre"
                title="Position Initiale (Centre)"
                style={{ minWidth: '48px', minHeight: '52px' }}
            />
            <ControlButton
                onClick={onResetSouth}
                icon={<Compass size={20} className="rotate-180 transform" />}
                label="Sud"
                title="Position Initiale (Sud)"
                style={{ minWidth: '48px', minHeight: '52px' }}
            />
        </ControlPanel>
    );
};

export default StellariumNavigationControls;
