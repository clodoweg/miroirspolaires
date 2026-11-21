import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface OptionObject {
    value: string | number;
    label: string;
}

export type SelectOption = string | number | OptionObject;

interface CustomSelectProps {
    value: string | number;
    onChange: (value: string) => void;
    options: SelectOption[];
    label: string;
    placeholder?: string;
}

export default function CustomSelect({ value, onChange, options, label, placeholder = 'Tout' }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleSelect = (option: string | number) => {
        onChange(String(option));
        setIsOpen(false);
    };

    const hasAllOption = options.some((opt) => {
        const optValue = typeof opt === 'object' ? opt.value : opt;
        return String(optValue) === 'all' || String(optValue) === '';
    });

    const getDisplayLabel = () => {
        if (!value || value === 'all' || value === '') {
            const allOpt = options.find((opt) => {
                const optValue = typeof opt === 'object' ? opt.value : opt;
                return String(optValue) === 'all' || String(optValue) === '';
            });
            if (allOpt) return typeof allOpt === 'object' ? allOpt.label : String(allOpt);
            return placeholder;
        }
        const selectedOption = options.find((opt) => {
            const optValue = typeof opt === 'object' ? opt.value : opt;
            return String(optValue) === String(value);
        });
        if (!selectedOption) return String(value);
        return typeof selectedOption === 'object' ? selectedOption.label : String(selectedOption);
    };

    const displayValue = getDisplayLabel();

    return (
        <div className="relative" ref={containerRef}>
            <label className="meta-label mb-1 block text-xs font-medium text-mp-text-muted/70">{label}</label>

            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-all duration-200 hover:border-mp-accent/50 active:scale-[0.98] ${isOpen ? 'border-mp-accent bg-mp-accent/5 ring-1 ring-mp-accent' : 'border-mp-border-light bg-mp-bg'} ${value && value !== 'all' ? 'text-mp-text-heading' : 'text-mp-text-body'} `}
            >
                <span className="mr-2 truncate">{displayValue}</span>
                <ChevronDown
                    size={16}
                    className={`text-mp-text-muted transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown Menu */}
            <div
                className={`absolute top-full right-0 left-0 z-50 mt-2 origin-top overflow-hidden rounded-lg border border-mp-border-light bg-mp-bg-secondary shadow-xl transition-all duration-200 ${isOpen ? 'pointer-events-auto visible translate-y-0 scale-100 opacity-100' : 'pointer-events-none invisible -translate-y-2 scale-95 opacity-0'} `}
            >
                <div className="scrollbar-thin max-h-60 overflow-y-auto py-1">
                    {!hasAllOption && (
                        <button
                            type="button"
                            onClick={() => handleSelect('all')}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 active:bg-black/10 ${!value || value === 'all' ? 'text-mp-accent' : 'text-mp-text-muted'}`}
                        >
                            <span>{placeholder}</span>
                            {(!value || value === 'all') && <Check size={14} />}
                        </button>
                    )}

                    {options.map((opt) => {
                        const optValue = typeof opt === 'object' ? opt.value : opt;
                        const optLabel = typeof opt === 'object' ? opt.label : opt;
                        const isSelected =
                            String(optValue) === String(value) ||
                            ((value === 'all' || value === '' || !value) && (optValue === 'all' || optValue === ''));

                        return (
                            <button
                                type="button"
                                key={String(optValue)}
                                onClick={() => handleSelect(optValue)}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 active:bg-black/10 ${isSelected ? 'bg-mp-accent/10 font-medium text-mp-accent' : 'bg-transparent text-mp-text-body'}`}
                            >
                                <span className="truncate">{optLabel}</span>
                                {isSelected && <Check size={14} />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
