import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Cell,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Label,
} from 'recharts';
import type { Photo } from '@/lib/photos';
import { Compass } from 'lucide-react';
import CustomSelect from './CustomSelect';
import HeatmapChart from './HeatmapChart';
import { theme, dividerStyle } from '@/lib/theme';
import { ChartCard, ChartLegend, ChartTooltip, RotatedAxisTick, ChartTypeToggle, type ChartType } from './charts';
import {
    type PhotoWithImage,
    type AxisMode,
    AXIS_X_OPTIONS,
    AXIS_Y_OPTIONS,
    COLOR_OPTIONS,
    stringToColor,
    getPhotoValue,
    getFilterType,
    formatAxisLabel,
} from './chartUtils';

interface Props {
    photos: PhotoWithImage[];
}

export default function DataExplorer({ photos }: Props) {
    const [xAxis, setXAxis] = useState<AxisMode>('year');
    const [yAxis, setYAxis] = useState<AxisMode>('integrationSeconds');
    const [colorMode, setColorMode] = useState<AxisMode>('filterType');
    const [chartType, setChartType] = useState<ChartType>('bar');
    const [hoveredPhoto, setHoveredPhoto] = useState<PhotoWithImage | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    // Responsive check
    React.useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const chartMarginBottom = isMobile ? 40 : 60;
    const xAxisHeight = isMobile ? 50 : 60;

    // Prepare categorical mapping for Scatter
    const categoricalMaps = useMemo(() => {
        const maps: Record<string, string[]> = {};
        const fields: AxisMode[] = [
            'constellation',
            'rawFilters',
            'filterType',
            'filterString',
            'locations',
            'type',
            'telescope',
            'camera',
            'mount',
            'observatory',
        ];

        fields.forEach((field) => {
            const uniqueValues = Array.from(new Set(photos.map((p) => String(getPhotoValue(p, field))))).sort();
            maps[field] = uniqueValues;
        });
        return maps;
    }, [photos]);

    const getNumericalValue = (p: Photo, mode: AxisMode): number => {
        const val = getPhotoValue(p, mode);
        if (typeof val === 'number') return val;

        if (categoricalMaps[mode]) {
            return categoricalMaps[mode].indexOf(String(val));
        }
        return 0;
    };

    // Prepare SCATTER data
    const scatterData = useMemo(() => {
        return photos.map((p) => ({
            ...p,
            x: getNumericalValue(p, xAxis),
            y: getNumericalValue(p, yAxis),
            colorGroup: String(getPhotoValue(p, colorMode)),
        }));
    }, [photos, xAxis, yAxis, colorMode, categoricalMaps]);

    // Prepare BAR/LINE/AREA/DONUT data
    const barData = useMemo(() => {
        if (chartType === 'scatter') return [];
        const groups: Record<string, any> = {};

        const needsFilterExplosion =
            xAxis === 'filterType' ||
            colorMode === 'filterType' ||
            xAxis === 'rawFilters' ||
            colorMode === 'rawFilters';

        if (needsFilterExplosion) {
            photos.forEach((p) => {
                p.acquisitionDetails.forEach((acq) => {
                    const filterType = getFilterType(acq.filter);
                    const rawFilter = acq.filter || 'Aucun';

                    let valToAdd: number;
                    if (yAxis === 'frames') {
                        valToAdd = acq.number;
                    } else if (yAxis === 'photoCount') {
                        valToAdd = 1;
                    } else {
                        valToAdd = (acq.duration * acq.number) / 3600;
                    }

                    let xLabel: string;
                    if (xAxis === 'filterType') xLabel = filterType;
                    else if (xAxis === 'rawFilters') xLabel = rawFilter;
                    else xLabel = String(getPhotoValue(p, xAxis));

                    let cGroup: string;
                    if (colorMode === 'filterType') cGroup = filterType;
                    else if (colorMode === 'rawFilters') cGroup = rawFilter;
                    else cGroup = String(getPhotoValue(p, colorMode));

                    if (!groups[xLabel]) groups[xLabel] = { x: xLabel };
                    groups[xLabel][cGroup] = (groups[xLabel][cGroup] || 0) + valToAdd;
                });
            });
        } else {
            photos.forEach((p) => {
                const xLabel = String(getPhotoValue(p, xAxis));
                const yVal = typeof getPhotoValue(p, yAxis) === 'number' ? (getPhotoValue(p, yAxis) as number) : 1;
                const cGroup = String(getPhotoValue(p, colorMode));

                if (!groups[xLabel]) groups[xLabel] = { x: xLabel };
                groups[xLabel][cGroup] = (groups[xLabel][cGroup] || 0) + yVal;
            });
        }

        return Object.values(groups).sort((a: any, b: any) => {
            if (!isNaN(Number(a.x)) && !isNaN(Number(b.x))) return Number(a.x) - Number(b.x);
            return String(a.x).localeCompare(String(b.x));
        });
    }, [photos, xAxis, yAxis, colorMode, chartType]);

    // Unique groups for legend
    const legendGroups = useMemo(() => {
        if (colorMode === 'filterType') {
            const types = new Set<string>();
            photos.forEach((p) => {
                p.acquisitionDetails.forEach((acq) => {
                    types.add(getFilterType(acq.filter));
                });
            });
            return Array.from(types).sort();
        }
        if (colorMode === 'rawFilters') {
            const filters = new Set<string>();
            photos.forEach((p) => {
                p.acquisitionDetails.forEach((acq) => {
                    filters.add(acq.filter || 'Aucun');
                });
            });
            return Array.from(filters).sort();
        }
        return Array.from(new Set(photos.map((p) => String(getPhotoValue(p, colorMode))))).sort();
    }, [photos, colorMode]);

    // Prepare DONUT data
    const donutData = useMemo(() => {
        if (chartType !== 'donut') return [];
        return legendGroups
            .map((group) => {
                const value = barData.reduce((acc, item) => acc + (Number(item[group]) || 0), 0);
                return { name: group, value };
            })
            .filter((d) => d.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [barData, chartType, legendGroups]);

    const donutTotal = useMemo(() => donutData.reduce((acc, curr) => acc + curr.value, 0), [donutData]);

    const currentXLabel = AXIS_X_OPTIONS.find((o) => o.value === xAxis)?.label || xAxis;
    const currentYLabel = AXIS_Y_OPTIONS.find((o) => o.value === yAxis)?.label || yAxis;

    // Shared XAxis tick component
    const renderAxisTick = (props: any) => <RotatedAxisTick {...props} axisMode={xAxis} />;

    if (!photos || photos.length === 0) {
        return (
            <ChartCard>
                <div className="flex items-center justify-center p-12 text-mp-text-muted">
                    Aucune photo disponible pour l'analyse.
                </div>
            </ChartCard>
        );
    }

    return (
        <ChartCard>
            {/* Header */}
            <div className="mb-8 flex flex-col gap-6 pb-6" style={dividerStyle}>
                <h3
                    className="flex items-center gap-2 font-serif text-xl font-light"
                    style={{ color: theme.text.heading }}
                >
                    <Compass className="h-5 w-5" style={{ color: theme.accent.primary }} />
                    Explorateur de données
                </h3>

                <div className="flex w-full flex-wrap items-end gap-4 lg:gap-6">
                    <div className="w-full min-w-chart-tooltip sm:w-auto">
                        <CustomSelect
                            label={chartType === 'heatmap' || chartType === 'donut' ? 'Valeur' : 'Axe Y'}
                            value={yAxis}
                            onChange={(v) => setYAxis(v as AxisMode)}
                            options={AXIS_Y_OPTIONS}
                        />
                    </div>

                    {chartType === 'heatmap' && (
                        <div className="w-full min-w-chart-tooltip sm:w-auto">
                            <CustomSelect
                                label="Axe Y"
                                value={colorMode}
                                onChange={(v) => setColorMode(v as AxisMode)}
                                options={COLOR_OPTIONS}
                            />
                        </div>
                    )}

                    {chartType !== 'donut' && (
                        <div className="w-full min-w-chart-tooltip sm:w-auto">
                            <CustomSelect
                                label="Axe X"
                                value={xAxis}
                                onChange={(v) => setXAxis(v as AxisMode)}
                                options={AXIS_X_OPTIONS}
                            />
                        </div>
                    )}

                    {chartType !== 'line' && chartType !== 'heatmap' && (
                        <div className="w-full min-w-chart-tooltip sm:w-auto">
                            <CustomSelect
                                label="Détails"
                                value={colorMode}
                                onChange={(v) => setColorMode(v as AxisMode)}
                                options={COLOR_OPTIONS}
                            />
                        </div>
                    )}
                </div>

                <ChartTypeToggle chartType={chartType} onChartTypeChange={setChartType} />
            </div>

            {/* Chart Area */}
            <div
                className={`relative w-full overflow-hidden ${chartType === 'donut' ? 'min-h-chart-sm' : 'min-h-chart-lg'}`}
            >
                {/* Scatter: Hover Card */}
                {chartType === 'scatter' && hoveredPhoto && (
                    <div
                        className="pointer-events-none absolute top-4 right-4 z-20 w-64 rounded-lg p-3 shadow-xl backdrop-blur-xl transition-all duration-300"
                        style={{ backgroundColor: theme.bg.glassSolid, border: `1px solid ${theme.border.light}` }}
                    >
                        <img
                            src={hoveredPhoto.resolvedImageUrl || `/${hoveredPhoto.imagePath}`}
                            alt={hoveredPhoto.title}
                            className="mb-3 h-32 w-full rounded-sm object-cover"
                            style={{ border: `1px solid ${theme.border.light}` }}
                        />
                        <h4 className="mb-1 line-clamp-1 text-sm font-bold" style={{ color: theme.text.heading }}>
                            {hoveredPhoto.title}
                        </h4>
                        <div className="space-y-1 text-xs" style={{ color: theme.text.muted }}>
                            <div className="flex justify-between">
                                <span>Constellation:</span>
                                <span>{hoveredPhoto.constellation}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Date:</span>
                                <span>{hoveredPhoto.year}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Expo:</span>
                                <span>{hoveredPhoto.integrationTime}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* SCATTER CHART */}
                {chartType === 'scatter' && (
                    <ResponsiveContainer width="100%" height={500}>
                        <ScatterChart margin={{ top: 20, right: 30, bottom: chartMarginBottom, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.border.light} />
                            <XAxis
                                type="number"
                                dataKey="x"
                                name={currentXLabel}
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(val) => formatAxisLabel(val, xAxis, categoricalMaps)}
                                stroke={theme.border.light}
                                fontSize={12}
                                interval={0}
                                height={xAxisHeight}
                                tick={renderAxisTick}
                            />
                            <YAxis
                                type="number"
                                dataKey="y"
                                name={currentYLabel}
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(val) => formatAxisLabel(val, yAxis)}
                                stroke={theme.border.light}
                                fontSize={12}
                            />
                            <Tooltip content={() => null} />
                            <Scatter
                                data={scatterData}
                                onMouseMove={(prev: any) => {
                                    if (prev?.payload) setHoveredPhoto(prev.payload);
                                }}
                                onMouseLeave={() => setHoveredPhoto(null)}
                            >
                                {scatterData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={stringToColor(entry.colorGroup)} />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                )}

                {/* BAR CHART */}
                {chartType === 'bar' && (
                    <ResponsiveContainer width="100%" height={500}>
                        <BarChart data={barData} margin={{ top: 20, right: 30, bottom: chartMarginBottom, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.border.light} vertical={false} />
                            <XAxis
                                dataKey="x"
                                stroke={theme.border.light}
                                fontSize={11}
                                interval={0}
                                height={xAxisHeight}
                                tick={renderAxisTick}
                            />
                            <YAxis
                                stroke={theme.border.light}
                                fontSize={12}
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => formatAxisLabel(val, yAxis)}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const total = payload.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
                                    return (
                                        <ChartTooltip
                                            label={`${label} (${formatAxisLabel(total, yAxis)})`}
                                            entries={payload.map((p) => ({
                                                name: String(p.name),
                                                value: Number(p.value) || 0,
                                                color: String(p.color || p.fill),
                                            }))}
                                            valueMode={yAxis}
                                        />
                                    );
                                }}
                                cursor={{ fill: theme.chart.cursor }}
                            />
                            {legendGroups.map((group, index) => (
                                <Bar
                                    key={group}
                                    dataKey={group}
                                    stackId="a"
                                    fill={stringToColor(group)}
                                    name={group}
                                    radius={index === legendGroups.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                )}

                {/* LINE CHART */}
                {chartType === 'line' && (
                    <ResponsiveContainer width="100%" height={500}>
                        <LineChart data={barData} margin={{ top: 20, right: 30, bottom: chartMarginBottom, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.border.light} vertical={false} />
                            <XAxis
                                dataKey="x"
                                stroke={theme.border.light}
                                fontSize={11}
                                interval={0}
                                height={xAxisHeight}
                                tick={renderAxisTick}
                            />
                            <YAxis
                                stroke={theme.border.light}
                                fontSize={12}
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => formatAxisLabel(val, yAxis)}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    return (
                                        <ChartTooltip
                                            label={label}
                                            entries={payload.map((p) => ({
                                                name: String(p.name),
                                                value: Number(p.value) || 0,
                                                color: String(p.color),
                                            }))}
                                            valueMode={yAxis}
                                        />
                                    );
                                }}
                            />
                            {legendGroups.map((group) => (
                                <Line
                                    key={group}
                                    type="monotone"
                                    dataKey={group}
                                    stroke={stringToColor(group)}
                                    name={group}
                                    strokeWidth={2}
                                    dot={{ r: 3, strokeWidth: 1 }}
                                    activeDot={{ r: 6 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {/* AREA CHART */}
                {chartType === 'area' && (
                    <ResponsiveContainer width="100%" height={500}>
                        <AreaChart data={barData} margin={{ top: 20, right: 30, bottom: chartMarginBottom, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.border.light} vertical={false} />
                            <XAxis
                                dataKey="x"
                                stroke={theme.border.light}
                                fontSize={11}
                                interval={0}
                                height={xAxisHeight}
                                tick={renderAxisTick}
                            />
                            <YAxis
                                stroke={theme.border.light}
                                fontSize={12}
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => formatAxisLabel(val, yAxis)}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    return (
                                        <ChartTooltip
                                            label={label}
                                            entries={payload.map((p) => ({
                                                name: String(p.name),
                                                value: Number(p.value) || 0,
                                                color: String(p.color),
                                            }))}
                                            valueMode={yAxis}
                                        />
                                    );
                                }}
                            />
                            {legendGroups.map((group) => (
                                <Area
                                    key={group}
                                    type="monotone"
                                    dataKey={group}
                                    stackId="1"
                                    stroke={stringToColor(group)}
                                    fill={stringToColor(group)}
                                    fillOpacity={0.6}
                                    name={group}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                )}

                {/* DONUT CHART */}
                {chartType === 'donut' && (
                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie
                                data={donutData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {donutData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={stringToColor(entry.name)} />
                                ))}
                                <Label
                                    value={formatAxisLabel(donutTotal, yAxis)}
                                    position="center"
                                    fill={theme.text.heading}
                                    style={{ fontSize: '18px', fontWeight: 'bold' }}
                                />
                            </Pie>
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const data = payload[0];
                                    return (
                                        <ChartTooltip
                                            entries={[
                                                {
                                                    name: String(data.name),
                                                    value: Number(data.value),
                                                    color: String(data.payload?.fill),
                                                },
                                            ]}
                                            valueMode={yAxis}
                                            sortByValue={false}
                                        />
                                    );
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                )}

                {/* HEATMAP CHART */}
                {chartType === 'heatmap' && (
                    <HeatmapChart photos={photos} xAxis={xAxis} yAxis={colorMode} valueMode={yAxis} />
                )}
            </div>

            {/* Legend */}
            {chartType !== 'heatmap' && (
                <ChartLegend items={legendGroups.map((g) => ({ name: g, color: stringToColor(g) }))} />
            )}
        </ChartCard>
    );
}
