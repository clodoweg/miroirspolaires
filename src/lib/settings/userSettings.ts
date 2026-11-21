/**
 * Shared user-level preferences for the observation tools (catalogues,
 * recommendations, sky-map framing). Persisted in localStorage so the user
 * configures them once and gets the same defaults across pages.
 */

import { DEFAULT_LOCATION, type ObsLocation } from '@/lib/objects/observation';

export interface CameraSettings {
    /** Camera rotation around the optical axis, in degrees, 0 = sensor long-side aligned with celestial east-west. */
    rotationDeg: number;
    /** Sensor long side, in millimetres. */
    sensorWidthMm: number;
    /** Sensor short side, in millimetres. */
    sensorHeightMm: number;
    /** Telescope/lens effective focal length in millimetres — needed to derive the angular FOV. */
    focalLengthMm: number;
    /** Physical pixel pitch in micrometres — drives the on-sky sampling (″/px). */
    pixelSizeUm: number;
    /** Optional id of the picked camera model in the equipment catalog (display-only). */
    cameraId?: string;
    /** Optional id of the picked telescope model in the equipment catalog (display-only). */
    telescopeId?: string;
    /** Optional id of the picked accessory (focal reducer / Barlow) — display-only. */
    accessoryId?: string;
    /** Multiplier applied to focalLengthMm to get the effective focal length.
     *  1 = no accessory; 0.79 = 0.79× reducer; 2 = 2× Barlow; etc. */
    focalMultiplier: number;
}

export interface UserSettings {
    location: ObsLocation;
    camera: CameraSettings;
}

/** QHY600 (full-frame IMX455) on a PlaneWave CDK17 — owner's reference setup. */
const DEFAULT_CAMERA: CameraSettings = {
    rotationDeg: 0,
    sensorWidthMm: 36,
    sensorHeightMm: 24,
    focalLengthMm: 2939,
    pixelSizeUm: 3.76,
    cameraId: 'qhy600',
    telescopeId: 'pw-cdk17',
    focalMultiplier: 1,
};

/** Effective focal length once any reducer/Barlow is taken into account. */
export function effectiveFocalLengthMm(cam: CameraSettings): number {
    return cam.focalLengthMm * (cam.focalMultiplier ?? 1);
}

/** Angular field of view (degrees) for one sensor side at a given focal length. */
export function fovDegFor(sensorMm: number, focalMm: number): number {
    if (focalMm <= 0) return 0;
    return (2 * Math.atan(sensorMm / (2 * focalMm)) * 180) / Math.PI;
}

/** On-sky angular resolution per pixel (arcseconds) — small-angle approximation. */
export function arcsecPerPixel(pixelSizeUm: number, focalMm: number): number {
    if (focalMm <= 0) return 0;
    return (206.265 * pixelSizeUm) / focalMm;
}

export const DEFAULT_SETTINGS: UserSettings = {
    location: DEFAULT_LOCATION,
    camera: DEFAULT_CAMERA,
};

export const SETTINGS_KEY = 'mp:user-settings';
/** Legacy key — older versions persisted only the location here. Read once on
 *  first load and folded into the new shape, then deleted. */
export const LEGACY_LOCATION_KEY = 'mp:observer-location';

export function isLocationCustom(loc: ObsLocation): boolean {
    return loc.lat !== DEFAULT_LOCATION.lat || loc.lon !== DEFAULT_LOCATION.lon || loc.name !== DEFAULT_LOCATION.name;
}

export function isCameraCustom(cam: CameraSettings): boolean {
    return (
        cam.rotationDeg !== DEFAULT_CAMERA.rotationDeg ||
        cam.sensorWidthMm !== DEFAULT_CAMERA.sensorWidthMm ||
        cam.sensorHeightMm !== DEFAULT_CAMERA.sensorHeightMm ||
        cam.focalLengthMm !== DEFAULT_CAMERA.focalLengthMm ||
        cam.pixelSizeUm !== DEFAULT_CAMERA.pixelSizeUm ||
        cam.cameraId !== DEFAULT_CAMERA.cameraId ||
        cam.telescopeId !== DEFAULT_CAMERA.telescopeId ||
        cam.accessoryId !== DEFAULT_CAMERA.accessoryId ||
        cam.focalMultiplier !== DEFAULT_CAMERA.focalMultiplier
    );
}
