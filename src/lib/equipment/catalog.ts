import { foldAccents } from '@/utils/normalize';
/**
 * Curated catalogue of common amateur astrophotography gear used to autofill
 * the camera/telescope panels. Hand-maintained — extend as needed. Specs come
 * from manufacturer datasheets; pixel sizes are square.
 */

export interface CameraModel {
    id: string;
    brand: string;
    name: string;
    /** Long sensor side, mm. */
    sensorWidthMm: number;
    /** Short sensor side, mm. */
    sensorHeightMm: number;
    /** Pixel pitch, µm. */
    pixelSizeUm: number;
    /** Free-form note (sensor model, intended use). */
    notes?: string;
}

export interface TelescopeModel {
    id: string;
    brand: string;
    name: string;
    /** Effective focal length in mm (with native focal reducer if part of the optical design). */
    focalLengthMm: number;
    /** Aperture in mm. */
    apertureMm: number;
    /** f/N — for display only, derived from focal/aperture. */
    focalRatio: number;
    /** Free-form note (design family). */
    notes?: string;
}

export interface AccessoryModel {
    id: string;
    brand: string;
    name: string;
    /** Focal length multiplier (0.5–5+). 0.79 = 0.79x reducer, 2 = 2x Barlow. */
    focalMultiplier: number;
    /** Free-form note (compatible scopes, back-focus). */
    notes?: string;
}

const CAMERAS: CameraModel[] = [
    // ZWO — mono and colour CMOS
    {
        id: 'asi120mm',
        brand: 'ZWO',
        name: 'ASI120MM-S',
        sensorWidthMm: 4.8,
        sensorHeightMm: 3.6,
        pixelSizeUm: 3.75,
        notes: 'Guidage / planétaire',
    },
    {
        id: 'asi174',
        brand: 'ZWO',
        name: 'ASI174MM/MC',
        sensorWidthMm: 11.3,
        sensorHeightMm: 7.1,
        pixelSizeUm: 5.86,
        notes: 'Solaire / lucky imaging',
    },
    { id: 'asi178', brand: 'ZWO', name: 'ASI178MM/MC', sensorWidthMm: 7.4, sensorHeightMm: 5.0, pixelSizeUm: 2.4 },
    {
        id: 'asi224',
        brand: 'ZWO',
        name: 'ASI224MC',
        sensorWidthMm: 4.9,
        sensorHeightMm: 3.7,
        pixelSizeUm: 3.75,
        notes: 'Planétaire',
    },
    {
        id: 'asi290',
        brand: 'ZWO',
        name: 'ASI290MM/MC',
        sensorWidthMm: 5.6,
        sensorHeightMm: 3.2,
        pixelSizeUm: 2.9,
        notes: 'Planétaire',
    },
    { id: 'asi385', brand: 'ZWO', name: 'ASI385MC', sensorWidthMm: 7.7, sensorHeightMm: 4.3, pixelSizeUm: 3.75 },
    { id: 'asi462', brand: 'ZWO', name: 'ASI462MC', sensorWidthMm: 5.6, sensorHeightMm: 3.2, pixelSizeUm: 2.9 },
    { id: 'asi585', brand: 'ZWO', name: 'ASI585MC', sensorWidthMm: 11.2, sensorHeightMm: 6.3, pixelSizeUm: 2.9 },
    { id: 'asi678', brand: 'ZWO', name: 'ASI678MC', sensorWidthMm: 7.7, sensorHeightMm: 4.3, pixelSizeUm: 2.0 },
    { id: 'asi183', brand: 'ZWO', name: 'ASI183MM/MC Pro', sensorWidthMm: 13.2, sensorHeightMm: 8.8, pixelSizeUm: 2.4 },
    {
        id: 'asi294',
        brand: 'ZWO',
        name: 'ASI294MM/MC Pro',
        sensorWidthMm: 19.1,
        sensorHeightMm: 13.0,
        pixelSizeUm: 4.63,
    },
    {
        id: 'asi533',
        brand: 'ZWO',
        name: 'ASI533MM/MC Pro',
        sensorWidthMm: 11.3,
        sensorHeightMm: 11.3,
        pixelSizeUm: 3.76,
        notes: 'Capteur carré IMX533',
    },
    { id: 'asi071', brand: 'ZWO', name: 'ASI071MC Pro', sensorWidthMm: 23.6, sensorHeightMm: 15.6, pixelSizeUm: 4.78 },
    {
        id: 'asi2400',
        brand: 'ZWO',
        name: 'ASI2400MC Pro',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 5.94,
        notes: 'Plein format IMX410',
    },
    {
        id: 'asi2600mc',
        brand: 'ZWO',
        name: 'ASI2600MC Pro',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
        notes: 'APS-C IMX571',
    },
    {
        id: 'asi2600mm',
        brand: 'ZWO',
        name: 'ASI2600MM Pro',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
        notes: 'APS-C IMX571 mono',
    },
    {
        id: 'asi6200mc',
        brand: 'ZWO',
        name: 'ASI6200MC Pro',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 3.76,
        notes: 'Plein format IMX455',
    },
    {
        id: 'asi6200mm',
        brand: 'ZWO',
        name: 'ASI6200MM Pro',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 3.76,
        notes: 'Plein format IMX455 mono',
    },
    // QHYCCD
    { id: 'qhy163', brand: 'QHYCCD', name: 'QHY163M/C', sensorWidthMm: 17.7, sensorHeightMm: 13.4, pixelSizeUm: 3.8 },
    { id: 'qhy183', brand: 'QHYCCD', name: 'QHY183M/C', sensorWidthMm: 13.2, sensorHeightMm: 8.8, pixelSizeUm: 2.4 },
    { id: 'qhy268c', brand: 'QHYCCD', name: 'QHY268C', sensorWidthMm: 23.5, sensorHeightMm: 15.7, pixelSizeUm: 3.76 },
    { id: 'qhy294', brand: 'QHYCCD', name: 'QHY294C', sensorWidthMm: 19.1, sensorHeightMm: 13.0, pixelSizeUm: 4.63 },
    { id: 'qhy410c', brand: 'QHYCCD', name: 'QHY410C', sensorWidthMm: 36.0, sensorHeightMm: 24.0, pixelSizeUm: 5.94 },
    { id: 'qhy600', brand: 'QHYCCD', name: 'QHY600M/C', sensorWidthMm: 36.0, sensorHeightMm: 24.0, pixelSizeUm: 3.76 },
    // Player One
    { id: 'po-mars-c', brand: 'Player One', name: 'Mars-C', sensorWidthMm: 5.6, sensorHeightMm: 3.2, pixelSizeUm: 2.9 },
    {
        id: 'po-uranus-c',
        brand: 'Player One',
        name: 'Uranus-C',
        sensorWidthMm: 7.7,
        sensorHeightMm: 4.3,
        pixelSizeUm: 2.0,
    },
    {
        id: 'po-poseidon-c',
        brand: 'Player One',
        name: 'Poseidon-C',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
        notes: 'IMX571',
    },
    {
        id: 'po-ares-c',
        brand: 'Player One',
        name: 'Ares-C',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
    },
    {
        id: 'po-zeus-m',
        brand: 'Player One',
        name: 'Zeus-M',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 3.76,
        notes: 'IMX455 mono',
    },
    // ZWO — guidage / mini
    {
        id: 'asi120mini',
        brand: 'ZWO',
        name: 'ASI120MM Mini',
        sensorWidthMm: 4.8,
        sensorHeightMm: 3.6,
        pixelSizeUm: 3.75,
    },
    {
        id: 'asi220mini',
        brand: 'ZWO',
        name: 'ASI220MM Mini',
        sensorWidthMm: 6.4,
        sensorHeightMm: 4.6,
        pixelSizeUm: 4.0,
    },
    {
        id: 'asi220mc-mini',
        brand: 'ZWO',
        name: 'ASI220MC Mini',
        sensorWidthMm: 6.4,
        sensorHeightMm: 4.6,
        pixelSizeUm: 4.0,
    },
    {
        id: 'asi533mc',
        brand: 'ZWO',
        name: 'ASI533MC (non Pro)',
        sensorWidthMm: 11.3,
        sensorHeightMm: 11.3,
        pixelSizeUm: 3.76,
    },
    {
        id: 'asi662mc-air',
        brand: 'ZWO',
        name: 'ASI662MC (USB3)',
        sensorWidthMm: 5.6,
        sensorHeightMm: 3.2,
        pixelSizeUm: 2.9,
    },
    { id: 'asi676mm', brand: 'ZWO', name: 'ASI676MM Cool', sensorWidthMm: 8.4, sensorHeightMm: 7.0, pixelSizeUm: 2.0 },
    // ZWO — modèles supplémentaires / récents
    {
        id: 'asi432',
        brand: 'ZWO',
        name: 'ASI432MM',
        sensorWidthMm: 11.3,
        sensorHeightMm: 11.3,
        pixelSizeUm: 9.0,
        notes: 'IMX432, ondelettes courtes',
    },
    { id: 'asi455', brand: 'ZWO', name: 'ASI455MC', sensorWidthMm: 36.0, sensorHeightMm: 24.0, pixelSizeUm: 3.76 },
    { id: 'asi553', brand: 'ZWO', name: 'ASI553MC Pro', sensorWidthMm: 11.3, sensorHeightMm: 11.3, pixelSizeUm: 3.76 },
    { id: 'asi676', brand: 'ZWO', name: 'ASI676MC', sensorWidthMm: 8.4, sensorHeightMm: 7.0, pixelSizeUm: 2.0 },
    { id: 'asi715', brand: 'ZWO', name: 'ASI715MC', sensorWidthMm: 7.7, sensorHeightMm: 4.3, pixelSizeUm: 1.45 },
    { id: 'asi662', brand: 'ZWO', name: 'ASI662MC', sensorWidthMm: 5.6, sensorHeightMm: 3.2, pixelSizeUm: 2.9 },
    // QHYCCD — compléments
    { id: 'qhy174', brand: 'QHYCCD', name: 'QHY174M/C', sensorWidthMm: 11.3, sensorHeightMm: 7.1, pixelSizeUm: 5.86 },
    { id: 'qhy533', brand: 'QHYCCD', name: 'QHY533M/C', sensorWidthMm: 11.3, sensorHeightMm: 11.3, pixelSizeUm: 3.76 },
    {
        id: 'qhy5iii678',
        brand: 'QHYCCD',
        name: 'QHY5III678',
        sensorWidthMm: 7.7,
        sensorHeightMm: 4.3,
        pixelSizeUm: 2.0,
    },
    {
        id: 'qhy367',
        brand: 'QHYCCD',
        name: 'QHY367C Pro',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 4.88,
    },
    {
        id: 'qhy461',
        brand: 'QHYCCD',
        name: 'QHY461M/C',
        sensorWidthMm: 53.4,
        sensorHeightMm: 40.0,
        pixelSizeUm: 3.76,
        notes: 'Format moyen IMX461',
    },
    {
        id: 'qhy411',
        brand: 'QHYCCD',
        name: 'QHY411M/C',
        sensorWidthMm: 53.4,
        sensorHeightMm: 40.0,
        pixelSizeUm: 3.76,
        notes: 'Format moyen IMX411',
    },
    // Player One — compléments
    {
        id: 'po-neptune-cii',
        brand: 'Player One',
        name: 'Neptune-C II',
        sensorWidthMm: 5.6,
        sensorHeightMm: 3.2,
        pixelSizeUm: 2.9,
    },
    {
        id: 'po-saturn-c',
        brand: 'Player One',
        name: 'Saturn-C SQR',
        sensorWidthMm: 11.3,
        sensorHeightMm: 11.3,
        pixelSizeUm: 3.76,
    },
    {
        id: 'po-apollo-m-max',
        brand: 'Player One',
        name: 'Apollo-M MAX',
        sensorWidthMm: 13.0,
        sensorHeightMm: 9.0,
        pixelSizeUm: 2.5,
    },
    {
        id: 'po-artemis-c',
        brand: 'Player One',
        name: 'Artemis-C Pro',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
    },
    // Atik (CCD/CMOS imaging)
    { id: 'atik-414ex', brand: 'Atik', name: '414EX', sensorWidthMm: 8.98, sensorHeightMm: 6.71, pixelSizeUm: 6.45 },
    { id: 'atik-460ex', brand: 'Atik', name: '460EX', sensorWidthMm: 12.49, sensorHeightMm: 9.99, pixelSizeUm: 4.54 },
    { id: 'atik-16200', brand: 'Atik', name: '16200', sensorWidthMm: 22.5, sensorHeightMm: 18.8, pixelSizeUm: 6.0 },
    {
        id: 'atik-horizon-ii',
        brand: 'Atik',
        name: 'Horizon II',
        sensorWidthMm: 17.7,
        sensorHeightMm: 13.4,
        pixelSizeUm: 3.8,
    },
    { id: 'atik-apx60', brand: 'Atik', name: 'Apx60', sensorWidthMm: 36.0, sensorHeightMm: 24.0, pixelSizeUm: 3.76 },
    // Moravian Instruments
    {
        id: 'moravian-g2-8300',
        brand: 'Moravian',
        name: 'G2-8300',
        sensorWidthMm: 17.96,
        sensorHeightMm: 13.52,
        pixelSizeUm: 5.4,
    },
    {
        id: 'moravian-g3-16200',
        brand: 'Moravian',
        name: 'G3-16200',
        sensorWidthMm: 22.5,
        sensorHeightMm: 18.8,
        pixelSizeUm: 6.0,
    },
    {
        id: 'moravian-c3-26000',
        brand: 'Moravian',
        name: 'C3-26000',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 3.76,
    },
    {
        id: 'moravian-c1-2000',
        brand: 'Moravian',
        name: 'C1-2000',
        sensorWidthMm: 11.3,
        sensorHeightMm: 11.3,
        pixelSizeUm: 3.76,
    },
    // Starlight Xpress
    {
        id: 'sx-trius-694',
        brand: 'Starlight Xpress',
        name: 'Trius PRO-694',
        sensorWidthMm: 12.49,
        sensorHeightMm: 9.99,
        pixelSizeUm: 4.54,
    },
    {
        id: 'sx-trius-825',
        brand: 'Starlight Xpress',
        name: 'Trius PRO-825',
        sensorWidthMm: 13.4,
        sensorHeightMm: 10.0,
        pixelSizeUm: 3.45,
    },
    {
        id: 'sx-trius-46',
        brand: 'Starlight Xpress',
        name: 'Trius PRO-46',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 4.54,
    },
    // FLI / Diffraction Limited (recherche)
    {
        id: 'fli-ml16200',
        brand: 'FLI',
        name: 'MicroLine ML16200',
        sensorWidthMm: 22.5,
        sensorHeightMm: 18.8,
        pixelSizeUm: 6.0,
    },
    {
        id: 'fli-ml50100',
        brand: 'FLI',
        name: 'MicroLine ML50100',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 6.0,
    },
    // SBIG / Aluma
    {
        id: 'sbig-aluma-694',
        brand: 'SBIG',
        name: 'Aluma 694',
        sensorWidthMm: 12.49,
        sensorHeightMm: 9.99,
        pixelSizeUm: 4.54,
    },
    {
        id: 'sbig-aluma-ac4040',
        brand: 'SBIG',
        name: 'Aluma AC4040',
        sensorWidthMm: 36.9,
        sensorHeightMm: 36.9,
        pixelSizeUm: 9.0,
        notes: 'Capteur scientifique CMOS',
    },
    // Altair / Touptek / Risingcam (clones IMX571 & IMX455)
    {
        id: 'altair-269c',
        brand: 'Altair',
        name: 'Hypercam 269C Pro',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
    },
    {
        id: 'altair-26c',
        brand: 'Altair',
        name: 'Hypercam 26C',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
    },
    {
        id: 'altair-60mc',
        brand: 'Altair',
        name: 'Hypercam 60M Pro',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 3.76,
    },
    {
        id: 'touptek-571c',
        brand: 'ToupTek',
        name: 'ATR3CMOS26000KPA',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
    },
    {
        id: 'risingcam-imx571c',
        brand: 'Risingcam',
        name: 'IMX571C',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
    },
    // Omegon
    {
        id: 'omegon-veloce-533c',
        brand: 'Omegon',
        name: 'Veloce 533C',
        sensorWidthMm: 11.3,
        sensorHeightMm: 11.3,
        pixelSizeUm: 3.76,
    },
    {
        id: 'omegon-veloce-571c',
        brand: 'Omegon',
        name: 'Veloce 571C',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
    },
    // DSLR / hybrides
    {
        id: 'canon-eos-ra',
        brand: 'Canon',
        name: 'EOS Ra',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 5.36,
        notes: 'Plein format défiltré',
    },
    { id: 'canon-r5', brand: 'Canon', name: 'EOS R5', sensorWidthMm: 36.0, sensorHeightMm: 24.0, pixelSizeUm: 4.39 },
    { id: 'canon-r6', brand: 'Canon', name: 'EOS R6', sensorWidthMm: 36.0, sensorHeightMm: 24.0, pixelSizeUm: 6.56 },
    {
        id: 'canon-6d-astro',
        brand: 'Canon',
        name: 'EOS 6D astrodon',
        sensorWidthMm: 35.8,
        sensorHeightMm: 23.9,
        pixelSizeUm: 6.55,
    },
    { id: 'nikon-z6ii', brand: 'Nikon', name: 'Z6 II', sensorWidthMm: 35.9, sensorHeightMm: 23.9, pixelSizeUm: 5.94 },
    { id: 'nikon-z7ii', brand: 'Nikon', name: 'Z7 II', sensorWidthMm: 35.9, sensorHeightMm: 23.9, pixelSizeUm: 4.34 },
    {
        id: 'nikon-d810a',
        brand: 'Nikon',
        name: 'D810A',
        sensorWidthMm: 35.9,
        sensorHeightMm: 24.0,
        pixelSizeUm: 4.88,
        notes: 'Plein format dédié astro',
    },
    { id: 'sony-a7iv', brand: 'Sony', name: 'α7 IV', sensorWidthMm: 35.6, sensorHeightMm: 23.8, pixelSizeUm: 3.76 },
    { id: 'sony-a7s3', brand: 'Sony', name: 'α7S III', sensorWidthMm: 35.6, sensorHeightMm: 23.8, pixelSizeUm: 8.41 },
    { id: 'sony-a7r5', brand: 'Sony', name: 'α7R V', sensorWidthMm: 35.7, sensorHeightMm: 23.8, pixelSizeUm: 3.76 },
    { id: 'fuji-xt5', brand: 'Fujifilm', name: 'X-T5', sensorWidthMm: 23.5, sensorHeightMm: 15.6, pixelSizeUm: 3.76 },
    // QHYCCD — guidage / planétaire / petits capteurs
    {
        id: 'qhy5l-ii-m',
        brand: 'QHYCCD',
        name: 'QHY5L-II-M',
        sensorWidthMm: 4.8,
        sensorHeightMm: 3.6,
        pixelSizeUm: 3.75,
        notes: 'Guidage',
    },
    {
        id: 'qhy5iii-462c',
        brand: 'QHYCCD',
        name: 'QHY5III-462C',
        sensorWidthMm: 5.6,
        sensorHeightMm: 3.2,
        pixelSizeUm: 2.9,
    },
    {
        id: 'qhy5iii-585c',
        brand: 'QHYCCD',
        name: 'QHY5III-585C',
        sensorWidthMm: 11.2,
        sensorHeightMm: 6.3,
        pixelSizeUm: 2.9,
    },
    {
        id: 'qhy5iii-715c',
        brand: 'QHYCCD',
        name: 'QHY5III-715C',
        sensorWidthMm: 7.7,
        sensorHeightMm: 4.3,
        pixelSizeUm: 1.45,
    },
    { id: 'qhy247', brand: 'QHYCCD', name: 'QHY247C', sensorWidthMm: 23.5, sensorHeightMm: 15.6, pixelSizeUm: 3.91 },
    { id: 'qhy128c', brand: 'QHYCCD', name: 'QHY128C', sensorWidthMm: 36.0, sensorHeightMm: 24.0, pixelSizeUm: 5.97 },
    { id: 'qhy16200', brand: 'QHYCCD', name: 'QHY16200A', sensorWidthMm: 22.5, sensorHeightMm: 18.8, pixelSizeUm: 6.0 },
    {
        id: 'qhy42pro',
        brand: 'QHYCCD',
        name: 'QHY42 Pro',
        sensorWidthMm: 13.2,
        sensorHeightMm: 13.2,
        pixelSizeUm: 6.5,
        notes: 'Capteur scientifique sCMOS',
    },
    // Player One — compléments
    { id: 'po-mars-m', brand: 'Player One', name: 'Mars-M', sensorWidthMm: 5.6, sensorHeightMm: 3.2, pixelSizeUm: 2.9 },
    {
        id: 'po-saturn-m',
        brand: 'Player One',
        name: 'Saturn-M SQR',
        sensorWidthMm: 11.3,
        sensorHeightMm: 11.3,
        pixelSizeUm: 3.76,
    },
    {
        id: 'po-apollo-m-pro',
        brand: 'Player One',
        name: 'Apollo-M PRO',
        sensorWidthMm: 11.3,
        sensorHeightMm: 11.3,
        pixelSizeUm: 9.0,
    },
    {
        id: 'po-pluto-m',
        brand: 'Player One',
        name: 'Pluto-M',
        sensorWidthMm: 4.8,
        sensorHeightMm: 3.6,
        pixelSizeUm: 3.75,
    },
    {
        id: 'po-mercury-m',
        brand: 'Player One',
        name: 'Mercury-M',
        sensorWidthMm: 4.9,
        sensorHeightMm: 3.7,
        pixelSizeUm: 3.75,
    },
    {
        id: 'po-helios',
        brand: 'Player One',
        name: 'Helios',
        sensorWidthMm: 4.96,
        sensorHeightMm: 3.72,
        pixelSizeUm: 3.45,
    },
    // Atik — compléments
    { id: 'atik-ace-13', brand: 'Atik', name: 'ACE 13', sensorWidthMm: 11.3, sensorHeightMm: 8.5, pixelSizeUm: 4.4 },
    { id: 'atik-ace-26', brand: 'Atik', name: 'ACE 26', sensorWidthMm: 23.5, sensorHeightMm: 15.7, pixelSizeUm: 3.76 },
    { id: 'atik-320e', brand: 'Atik', name: '320e', sensorWidthMm: 6.45, sensorHeightMm: 4.84, pixelSizeUm: 3.69 },
    // Touptek — compléments
    {
        id: 'touptek-imx585',
        brand: 'ToupTek',
        name: 'ATR3CMOS585KMA',
        sensorWidthMm: 11.2,
        sensorHeightMm: 6.3,
        pixelSizeUm: 2.9,
    },
    {
        id: 'touptek-imx676',
        brand: 'ToupTek',
        name: 'ATR3CMOS676KMA',
        sensorWidthMm: 8.4,
        sensorHeightMm: 7.0,
        pixelSizeUm: 2.0,
    },
    // Mallincam / Revolution
    {
        id: 'mallincam-ds16',
        brand: 'Mallincam',
        name: 'DS16',
        sensorWidthMm: 22.5,
        sensorHeightMm: 18.8,
        pixelSizeUm: 6.0,
    },
    {
        id: 'mallincam-skyraider',
        brand: 'Mallincam',
        name: 'SkyRaider DS26C',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        pixelSizeUm: 3.76,
    },
    // Apogee / Andor
    {
        id: 'apogee-aspen-cg47',
        brand: 'Apogee',
        name: 'Aspen CG47',
        sensorWidthMm: 13.3,
        sensorHeightMm: 13.3,
        pixelSizeUm: 13,
    },
    {
        id: 'andor-marana-4-2',
        brand: 'Andor',
        name: 'Marana 4.2 sCMOS',
        sensorWidthMm: 22.5,
        sensorHeightMm: 22.5,
        pixelSizeUm: 11,
        notes: 'Recherche',
    },
    // FLI / SBIG compléments
    {
        id: 'fli-kepler-4040',
        brand: 'FLI',
        name: 'Kepler 4040',
        sensorWidthMm: 36.9,
        sensorHeightMm: 36.9,
        pixelSizeUm: 9.0,
    },
    {
        id: 'sbig-stt-8300',
        brand: 'SBIG',
        name: 'STT-8300',
        sensorWidthMm: 17.96,
        sensorHeightMm: 13.52,
        pixelSizeUm: 5.4,
    },
    {
        id: 'sbig-stxl-11002',
        brand: 'SBIG',
        name: 'STXL-11002',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.7,
        pixelSizeUm: 9.0,
    },
    // Hybrides / DSLR — compléments
    {
        id: 'canon-5d4',
        brand: 'Canon',
        name: 'EOS 5D Mark IV',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 5.36,
    },
    { id: 'canon-r', brand: 'Canon', name: 'EOS R', sensorWidthMm: 36.0, sensorHeightMm: 24.0, pixelSizeUm: 5.36 },
    { id: 'canon-rp', brand: 'Canon', name: 'EOS RP', sensorWidthMm: 35.9, sensorHeightMm: 24.0, pixelSizeUm: 5.74 },
    { id: 'canon-90d', brand: 'Canon', name: 'EOS 90D', sensorWidthMm: 22.3, sensorHeightMm: 14.8, pixelSizeUm: 3.19 },
    { id: 'nikon-d850', brand: 'Nikon', name: 'D850', sensorWidthMm: 35.9, sensorHeightMm: 23.9, pixelSizeUm: 4.34 },
    { id: 'nikon-z5', brand: 'Nikon', name: 'Z5', sensorWidthMm: 35.9, sensorHeightMm: 23.9, pixelSizeUm: 5.94 },
    { id: 'nikon-zf', brand: 'Nikon', name: 'Zf', sensorWidthMm: 35.9, sensorHeightMm: 23.9, pixelSizeUm: 5.94 },
    { id: 'sony-a7iii', brand: 'Sony', name: 'α7 III', sensorWidthMm: 35.6, sensorHeightMm: 23.8, pixelSizeUm: 5.91 },
    { id: 'sony-a7c', brand: 'Sony', name: 'α7C', sensorWidthMm: 35.6, sensorHeightMm: 23.8, pixelSizeUm: 5.91 },
    { id: 'sony-a6700', brand: 'Sony', name: 'α6700', sensorWidthMm: 23.5, sensorHeightMm: 15.6, pixelSizeUm: 3.76 },
    { id: 'fuji-xh2', brand: 'Fujifilm', name: 'X-H2', sensorWidthMm: 23.5, sensorHeightMm: 15.6, pixelSizeUm: 3.13 },
    { id: 'fuji-xt4', brand: 'Fujifilm', name: 'X-T4', sensorWidthMm: 23.5, sensorHeightMm: 15.6, pixelSizeUm: 3.76 },
    { id: 'pentax-k1', brand: 'Pentax', name: 'K-1 II', sensorWidthMm: 35.9, sensorHeightMm: 24.0, pixelSizeUm: 4.86 },
    // Capteurs grand public génériques
    {
        id: 'canon-ff',
        brand: 'Canon/Nikon/Sony',
        name: 'Plein format générique',
        sensorWidthMm: 36.0,
        sensorHeightMm: 24.0,
        pixelSizeUm: 5.94,
    },
    {
        id: 'canon-aps-c',
        brand: 'Canon',
        name: 'APS-C Canon',
        sensorWidthMm: 22.3,
        sensorHeightMm: 14.9,
        pixelSizeUm: 3.72,
    },
    {
        id: 'sony-aps-c',
        brand: 'Sony/Nikon',
        name: 'APS-C Sony/Nikon',
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.6,
        pixelSizeUm: 3.76,
    },
    {
        id: 'm4-3',
        brand: 'Olympus / Panasonic',
        name: 'Micro 4/3',
        sensorWidthMm: 17.3,
        sensorHeightMm: 13.0,
        pixelSizeUm: 3.34,
    },
];

const TELESCOPES: TelescopeModel[] = [
    // Sky-Watcher
    {
        id: 'sw-evostar-72ed',
        brand: 'Sky-Watcher',
        name: 'Evostar 72ED',
        focalLengthMm: 420,
        apertureMm: 72,
        focalRatio: 5.83,
        notes: 'Doublet ED',
    },
    {
        id: 'sw-evostar-80ed',
        brand: 'Sky-Watcher',
        name: 'Evostar 80ED',
        focalLengthMm: 600,
        apertureMm: 80,
        focalRatio: 7.5,
    },
    {
        id: 'sw-evostar-100ed',
        brand: 'Sky-Watcher',
        name: 'Evostar 100ED',
        focalLengthMm: 900,
        apertureMm: 100,
        focalRatio: 9,
    },
    {
        id: 'sw-esprit-80',
        brand: 'Sky-Watcher',
        name: 'Esprit 80ED',
        focalLengthMm: 400,
        apertureMm: 80,
        focalRatio: 5,
        notes: 'Triplet ED',
    },
    {
        id: 'sw-esprit-100',
        brand: 'Sky-Watcher',
        name: 'Esprit 100ED',
        focalLengthMm: 550,
        apertureMm: 100,
        focalRatio: 5.5,
    },
    {
        id: 'sw-esprit-120',
        brand: 'Sky-Watcher',
        name: 'Esprit 120ED',
        focalLengthMm: 840,
        apertureMm: 120,
        focalRatio: 7,
    },
    {
        id: 'sw-esprit-150',
        brand: 'Sky-Watcher',
        name: 'Esprit 150ED',
        focalLengthMm: 1050,
        apertureMm: 150,
        focalRatio: 7,
    },
    {
        id: 'sw-quattro-150',
        brand: 'Sky-Watcher',
        name: 'Quattro 150P',
        focalLengthMm: 600,
        apertureMm: 150,
        focalRatio: 4,
    },
    {
        id: 'sw-quattro-200',
        brand: 'Sky-Watcher',
        name: 'Quattro 200P',
        focalLengthMm: 800,
        apertureMm: 200,
        focalRatio: 4,
    },
    {
        id: 'sw-quattro-250',
        brand: 'Sky-Watcher',
        name: 'Quattro 250P',
        focalLengthMm: 1000,
        apertureMm: 250,
        focalRatio: 4,
    },
    {
        id: 'sw-200pds',
        brand: 'Sky-Watcher',
        name: 'Newton 200/1000 PDS',
        focalLengthMm: 1000,
        apertureMm: 200,
        focalRatio: 5,
    },
    {
        id: 'sw-250pds',
        brand: 'Sky-Watcher',
        name: 'Newton 250/1200 PDS',
        focalLengthMm: 1200,
        apertureMm: 254,
        focalRatio: 4.7,
    },
    // William Optics
    {
        id: 'wo-redcat51',
        brand: 'William Optics',
        name: 'RedCat 51',
        focalLengthMm: 250,
        apertureMm: 51,
        focalRatio: 4.9,
        notes: 'Petzval',
    },
    {
        id: 'wo-redcat61',
        brand: 'William Optics',
        name: 'RedCat 61',
        focalLengthMm: 300,
        apertureMm: 61,
        focalRatio: 4.9,
    },
    {
        id: 'wo-redcat71',
        brand: 'William Optics',
        name: 'RedCat 71',
        focalLengthMm: 350,
        apertureMm: 71,
        focalRatio: 4.9,
    },
    {
        id: 'wo-z61',
        brand: 'William Optics',
        name: 'Zenithstar 61',
        focalLengthMm: 360,
        apertureMm: 61,
        focalRatio: 5.9,
    },
    {
        id: 'wo-z73',
        brand: 'William Optics',
        name: 'Zenithstar 73',
        focalLengthMm: 430,
        apertureMm: 73,
        focalRatio: 5.9,
    },
    {
        id: 'wo-z81',
        brand: 'William Optics',
        name: 'Zenithstar 81',
        focalLengthMm: 478,
        apertureMm: 81,
        focalRatio: 5.9,
    },
    {
        id: 'wo-z103',
        brand: 'William Optics',
        name: 'Zenithstar 103',
        focalLengthMm: 710,
        apertureMm: 103,
        focalRatio: 6.9,
    },
    {
        id: 'wo-z126',
        brand: 'William Optics',
        name: 'Zenithstar 126',
        focalLengthMm: 970,
        apertureMm: 126,
        focalRatio: 7.7,
    },
    { id: 'wo-gt81', brand: 'William Optics', name: 'GT 81 IV', focalLengthMm: 478, apertureMm: 81, focalRatio: 5.9 },
    // Takahashi
    { id: 'tak-fsq85', brand: 'Takahashi', name: 'FSQ-85ED', focalLengthMm: 450, apertureMm: 85, focalRatio: 5.3 },
    { id: 'tak-fsq106', brand: 'Takahashi', name: 'FSQ-106ED', focalLengthMm: 530, apertureMm: 106, focalRatio: 5 },
    { id: 'tak-fsq130', brand: 'Takahashi', name: 'FSQ-130ED', focalLengthMm: 650, apertureMm: 130, focalRatio: 5 },
    { id: 'tak-toa130', brand: 'Takahashi', name: 'TOA-130', focalLengthMm: 1000, apertureMm: 130, focalRatio: 7.7 },
    { id: 'tak-toa150', brand: 'Takahashi', name: 'TOA-150', focalLengthMm: 1100, apertureMm: 150, focalRatio: 7.3 },
    {
        id: 'tak-epsilon-160',
        brand: 'Takahashi',
        name: 'Epsilon 160ED',
        focalLengthMm: 530,
        apertureMm: 160,
        focalRatio: 3.3,
    },
    {
        id: 'tak-epsilon-180',
        brand: 'Takahashi',
        name: 'Epsilon 180ED',
        focalLengthMm: 500,
        apertureMm: 180,
        focalRatio: 2.8,
    },
    // Celestron
    {
        id: 'celestron-c8',
        brand: 'Celestron',
        name: 'C8 (8" SCT)',
        focalLengthMm: 2032,
        apertureMm: 203,
        focalRatio: 10,
    },
    {
        id: 'celestron-c925',
        brand: 'Celestron',
        name: 'C9.25 (SCT)',
        focalLengthMm: 2350,
        apertureMm: 235,
        focalRatio: 10,
    },
    {
        id: 'celestron-c11',
        brand: 'Celestron',
        name: 'C11 (SCT)',
        focalLengthMm: 2800,
        apertureMm: 280,
        focalRatio: 10,
    },
    {
        id: 'celestron-edgehd-8',
        brand: 'Celestron',
        name: 'EdgeHD 8"',
        focalLengthMm: 2032,
        apertureMm: 203,
        focalRatio: 10,
    },
    {
        id: 'celestron-edgehd-925',
        brand: 'Celestron',
        name: 'EdgeHD 9.25"',
        focalLengthMm: 2350,
        apertureMm: 235,
        focalRatio: 10,
    },
    {
        id: 'celestron-edgehd-11',
        brand: 'Celestron',
        name: 'EdgeHD 11"',
        focalLengthMm: 2800,
        apertureMm: 280,
        focalRatio: 10,
    },
    {
        id: 'celestron-edgehd-14',
        brand: 'Celestron',
        name: 'EdgeHD 14"',
        focalLengthMm: 3910,
        apertureMm: 356,
        focalRatio: 11,
    },
    { id: 'celestron-rasa-8', brand: 'Celestron', name: 'RASA 8"', focalLengthMm: 400, apertureMm: 203, focalRatio: 2 },
    {
        id: 'celestron-rasa-11',
        brand: 'Celestron',
        name: 'RASA 11"',
        focalLengthMm: 620,
        apertureMm: 279,
        focalRatio: 2.22,
    },
    {
        id: 'celestron-rasa-14',
        brand: 'Celestron',
        name: 'RASA 14"',
        focalLengthMm: 790,
        apertureMm: 356,
        focalRatio: 2.22,
    },
    // Askar
    { id: 'askar-fra300', brand: 'Askar', name: 'FRA300 Pro', focalLengthMm: 300, apertureMm: 60, focalRatio: 5 },
    { id: 'askar-fra400', brand: 'Askar', name: 'FRA400', focalLengthMm: 400, apertureMm: 72, focalRatio: 5.6 },
    { id: 'askar-fra500', brand: 'Askar', name: 'FRA500', focalLengthMm: 500, apertureMm: 90, focalRatio: 5.6 },
    { id: 'askar-fra600', brand: 'Askar', name: 'FRA600', focalLengthMm: 600, apertureMm: 108, focalRatio: 5.6 },
    { id: 'askar-65phq', brand: 'Askar', name: '65 PHQ', focalLengthMm: 416, apertureMm: 65, focalRatio: 6.4 },
    { id: 'askar-71f', brand: 'Askar', name: '71F', focalLengthMm: 490, apertureMm: 71, focalRatio: 6.9 },
    { id: 'askar-80phq', brand: 'Askar', name: '80 PHQ', focalLengthMm: 600, apertureMm: 80, focalRatio: 7.5 },
    { id: 'askar-130phq', brand: 'Askar', name: '130 PHQ', focalLengthMm: 1000, apertureMm: 130, focalRatio: 7.7 },
    // PlaneWave Instruments — CDK (Corrected Dall-Kirkham) et DeltaRho
    {
        id: 'pw-cdk12-5',
        brand: 'PlaneWave',
        name: 'CDK12.5',
        focalLengthMm: 2541,
        apertureMm: 318,
        focalRatio: 8,
        notes: 'Corrected Dall-Kirkham',
    },
    { id: 'pw-cdk14', brand: 'PlaneWave', name: 'CDK14', focalLengthMm: 2563, apertureMm: 356, focalRatio: 7.2 },
    { id: 'pw-cdk17', brand: 'PlaneWave', name: 'CDK17', focalLengthMm: 2939, apertureMm: 432, focalRatio: 6.8 },
    { id: 'pw-cdk20', brand: 'PlaneWave', name: 'CDK20', focalLengthMm: 3454, apertureMm: 508, focalRatio: 6.8 },
    { id: 'pw-cdk24', brand: 'PlaneWave', name: 'CDK24', focalLengthMm: 3962, apertureMm: 610, focalRatio: 6.5 },
    { id: 'pw-cdk600', brand: 'PlaneWave', name: 'CDK600', focalLengthMm: 3974, apertureMm: 600, focalRatio: 6.6 },
    { id: 'pw-cdk700', brand: 'PlaneWave', name: 'CDK700', focalLengthMm: 4540, apertureMm: 700, focalRatio: 6.5 },
    { id: 'pw-cdk1000', brand: 'PlaneWave', name: 'CDK1000', focalLengthMm: 6000, apertureMm: 1000, focalRatio: 6 },
    {
        id: 'pw-deltarho-350',
        brand: 'PlaneWave',
        name: 'Delta Rho 350',
        focalLengthMm: 1900,
        apertureMm: 350,
        focalRatio: 5.4,
        notes: 'Astrographe à champ plat',
    },
    // Vixen
    {
        id: 'vixen-vc200l',
        brand: 'Vixen',
        name: 'VC200L',
        focalLengthMm: 1800,
        apertureMm: 200,
        focalRatio: 9,
        notes: 'Catadioptrique VISAC',
    },
    {
        id: 'vixen-vsd90ss',
        brand: 'Vixen',
        name: 'VSD90SS',
        focalLengthMm: 495,
        apertureMm: 90,
        focalRatio: 5.5,
        notes: 'Astrographe à 5 lentilles',
    },
    { id: 'vixen-fl55ss', brand: 'Vixen', name: 'FL55SS', focalLengthMm: 300, apertureMm: 55, focalRatio: 5.5 },
    { id: 'vixen-ax103s', brand: 'Vixen', name: 'AX103S', focalLengthMm: 825, apertureMm: 103, focalRatio: 8 },
    // Astro-Physics
    {
        id: 'ap-stowaway-92',
        brand: 'Astro-Physics',
        name: 'Stowaway 92',
        focalLengthMm: 506,
        apertureMm: 92,
        focalRatio: 5.5,
    },
    { id: 'ap-130gtx', brand: 'Astro-Physics', name: '130GTX', focalLengthMm: 819, apertureMm: 130, focalRatio: 6.3 },
    { id: 'ap-155gtx', brand: 'Astro-Physics', name: '155GTX', focalLengthMm: 1085, apertureMm: 155, focalRatio: 7 },
    {
        id: 'ap-1100',
        brand: 'Astro-Physics',
        name: '1100 Riccardi-Honders',
        focalLengthMm: 1100,
        apertureMm: 175,
        focalRatio: 6.3,
    },
    // Tele Vue
    { id: 'tv-tv60', brand: 'Tele Vue', name: 'TV-60', focalLengthMm: 360, apertureMm: 60, focalRatio: 6 },
    { id: 'tv-tv76', brand: 'Tele Vue', name: 'TV-76', focalLengthMm: 480, apertureMm: 76, focalRatio: 6.3 },
    { id: 'tv-tv85', brand: 'Tele Vue', name: 'TV-85', focalLengthMm: 600, apertureMm: 85, focalRatio: 7 },
    {
        id: 'tv-np101is',
        brand: 'Tele Vue',
        name: 'NP101is',
        focalLengthMm: 540,
        apertureMm: 101,
        focalRatio: 5.4,
        notes: 'Petzval Nagler',
    },
    { id: 'tv-np127is', brand: 'Tele Vue', name: 'NP127is', focalLengthMm: 660, apertureMm: 127, focalRatio: 5.2 },
    // Stellarvue
    { id: 'sv-svx080t', brand: 'Stellarvue', name: 'SVX080T-3SV', focalLengthMm: 480, apertureMm: 80, focalRatio: 6 },
    { id: 'sv-svx102t', brand: 'Stellarvue', name: 'SVX102T-R', focalLengthMm: 714, apertureMm: 102, focalRatio: 7 },
    { id: 'sv-svx130t', brand: 'Stellarvue', name: 'SVX130T', focalLengthMm: 910, apertureMm: 130, focalRatio: 7 },
    { id: 'sv-svx140t', brand: 'Stellarvue', name: 'SVX140T', focalLengthMm: 980, apertureMm: 140, focalRatio: 7 },
    { id: 'sv-svx152', brand: 'Stellarvue', name: 'SVX152T', focalLengthMm: 1200, apertureMm: 152, focalRatio: 7.9 },
    { id: 'sv-svx180t', brand: 'Stellarvue', name: 'SVX180T', focalLengthMm: 1260, apertureMm: 180, focalRatio: 7 },
    // GSO Ritchey-Chrétien (vendu sous TS / Astro-Tech / Orion)
    {
        id: 'gso-rc6',
        brand: 'GSO',
        name: 'RC6',
        focalLengthMm: 1370,
        apertureMm: 152,
        focalRatio: 9,
        notes: 'Ritchey-Chrétien',
    },
    { id: 'gso-rc8', brand: 'GSO', name: 'RC8', focalLengthMm: 1624, apertureMm: 203, focalRatio: 8 },
    { id: 'gso-rc10', brand: 'GSO', name: 'RC10', focalLengthMm: 2000, apertureMm: 254, focalRatio: 8 },
    { id: 'gso-rc12', brand: 'GSO', name: 'RC12', focalLengthMm: 2432, apertureMm: 305, focalRatio: 8 },
    { id: 'gso-rc14', brand: 'GSO', name: 'RC14', focalLengthMm: 2845, apertureMm: 356, focalRatio: 8 },
    { id: 'gso-rc16', brand: 'GSO', name: 'RC16', focalLengthMm: 3251, apertureMm: 406, focalRatio: 8 },
    // Officina Stellare
    {
        id: 'os-rh200',
        brand: 'Officina Stellare',
        name: 'RH200',
        focalLengthMm: 600,
        apertureMm: 200,
        focalRatio: 3,
        notes: 'Riccardi-Honders',
    },
    { id: 'os-rh250', brand: 'Officina Stellare', name: 'RH250', focalLengthMm: 750, apertureMm: 250, focalRatio: 3 },
    {
        id: 'os-rh305',
        brand: 'Officina Stellare',
        name: 'RH305',
        focalLengthMm: 1110,
        apertureMm: 305,
        focalRatio: 3.6,
    },
    {
        id: 'os-rh400',
        brand: 'Officina Stellare',
        name: 'RH400',
        focalLengthMm: 1520,
        apertureMm: 400,
        focalRatio: 3.8,
    },
    {
        id: 'os-pro-rc500',
        brand: 'Officina Stellare',
        name: 'Pro RC500',
        focalLengthMm: 4000,
        apertureMm: 500,
        focalRatio: 8,
    },
    // ASA (Astrosysteme Austria)
    { id: 'asa-n8', brand: 'ASA', name: 'N8 Astrograph', focalLengthMm: 760, apertureMm: 200, focalRatio: 3.8 },
    { id: 'asa-n10', brand: 'ASA', name: 'N10 Astrograph', focalLengthMm: 950, apertureMm: 250, focalRatio: 3.8 },
    { id: 'asa-n12', brand: 'ASA', name: 'N12 Astrograph', focalLengthMm: 1140, apertureMm: 300, focalRatio: 3.8 },
    // TS Optics / Astro-Tech / Orion (rebranding GSO/Hangzhou)
    {
        id: 'ts-photoline-80',
        brand: 'TS Optics',
        name: 'Photoline 80mm Triplet',
        focalLengthMm: 480,
        apertureMm: 80,
        focalRatio: 6,
    },
    {
        id: 'ts-photoline-102',
        brand: 'TS Optics',
        name: 'Photoline 102mm Triplet',
        focalLengthMm: 714,
        apertureMm: 102,
        focalRatio: 7,
    },
    {
        id: 'ts-photoline-130',
        brand: 'TS Optics',
        name: 'Photoline 130mm Triplet',
        focalLengthMm: 910,
        apertureMm: 130,
        focalRatio: 7,
    },
    { id: 'at-at115', brand: 'Astro-Tech', name: 'AT115EDT', focalLengthMm: 805, apertureMm: 115, focalRatio: 7 },
    // Sharpstar
    { id: 'sharpstar-76edph', brand: 'Sharpstar', name: '76EDPH', focalLengthMm: 418, apertureMm: 76, focalRatio: 5.5 },
    { id: 'sharpstar-94edph', brand: 'Sharpstar', name: '94EDPH', focalLengthMm: 517, apertureMm: 94, focalRatio: 5.5 },
    {
        id: 'sharpstar-13028hnt',
        brand: 'Sharpstar',
        name: '13028 HNT',
        focalLengthMm: 392,
        apertureMm: 130,
        focalRatio: 3,
        notes: 'Newton hyperbolique',
    },
    {
        id: 'sharpstar-15028hnt',
        brand: 'Sharpstar',
        name: '15028 HNT',
        focalLengthMm: 420,
        apertureMm: 150,
        focalRatio: 2.8,
    },
    {
        id: 'sharpstar-20028hnt',
        brand: 'Sharpstar',
        name: '20028 HNT',
        focalLengthMm: 560,
        apertureMm: 200,
        focalRatio: 2.8,
    },
    // Sky-Watcher Maksutov-Cassegrain
    {
        id: 'sw-mak127',
        brand: 'Sky-Watcher',
        name: 'Skymax 127',
        focalLengthMm: 1500,
        apertureMm: 127,
        focalRatio: 11.8,
        notes: 'Maksutov-Cassegrain',
    },
    { id: 'sw-mak150', brand: 'Sky-Watcher', name: 'Skymax 150', focalLengthMm: 1800, apertureMm: 150, focalRatio: 12 },
    { id: 'sw-mak180', brand: 'Sky-Watcher', name: 'Skymax 180', focalLengthMm: 2700, apertureMm: 180, focalRatio: 15 },
    {
        id: 'sw-mak250',
        brand: 'Sky-Watcher',
        name: 'Skymax 250',
        focalLengthMm: 3250,
        apertureMm: 254,
        focalRatio: 12.8,
    },
    // Celestron NexStar / Maksutov / 6"-9.25" SCT
    {
        id: 'celestron-nx5se',
        brand: 'Celestron',
        name: 'NexStar 5SE',
        focalLengthMm: 1250,
        apertureMm: 125,
        focalRatio: 10,
    },
    {
        id: 'celestron-nx6se',
        brand: 'Celestron',
        name: 'NexStar 6SE',
        focalLengthMm: 1500,
        apertureMm: 150,
        focalRatio: 10,
    },
    {
        id: 'celestron-nx8se',
        brand: 'Celestron',
        name: 'NexStar 8SE',
        focalLengthMm: 2032,
        apertureMm: 203,
        focalRatio: 10,
    },
    {
        id: 'celestron-c6',
        brand: 'Celestron',
        name: 'C6 (6" SCT)',
        focalLengthMm: 1500,
        apertureMm: 150,
        focalRatio: 10,
    },
    {
        id: 'celestron-c14',
        brand: 'Celestron',
        name: 'C14 (SCT)',
        focalLengthMm: 3910,
        apertureMm: 356,
        focalRatio: 10,
    },
    // Meade
    { id: 'meade-acf-10', brand: 'Meade', name: 'ACF 10"', focalLengthMm: 2540, apertureMm: 254, focalRatio: 10 },
    { id: 'meade-acf-12', brand: 'Meade', name: 'ACF 12"', focalLengthMm: 3048, apertureMm: 305, focalRatio: 10 },
    { id: 'meade-acf-14', brand: 'Meade', name: 'ACF 14"', focalLengthMm: 3556, apertureMm: 356, focalRatio: 10 },
    // Borg
    { id: 'borg-71fl', brand: 'Borg', name: '71FL', focalLengthMm: 400, apertureMm: 71, focalRatio: 5.6 },
    { id: 'borg-89ed', brand: 'Borg', name: '89ED', focalLengthMm: 600, apertureMm: 89, focalRatio: 6.7 },
    { id: 'borg-107fl', brand: 'Borg', name: '107FL', focalLengthMm: 600, apertureMm: 107, focalRatio: 5.6 },
    // Lacerta / autres newtons astrographes
    {
        id: 'lacerta-200n',
        brand: 'Lacerta',
        name: 'Newton 200/800',
        focalLengthMm: 800,
        apertureMm: 200,
        focalRatio: 4,
    },
    {
        id: 'lacerta-250n',
        brand: 'Lacerta',
        name: 'Newton 250/1000',
        focalLengthMm: 1000,
        apertureMm: 250,
        focalRatio: 4,
    },
    // Bresser / Explore Scientific
    {
        id: 'es-ed102',
        brand: 'Explore Scientific',
        name: 'ED102 FCD-100',
        focalLengthMm: 714,
        apertureMm: 102,
        focalRatio: 7,
    },
    {
        id: 'es-ed127',
        brand: 'Explore Scientific',
        name: 'ED127 FCD-100',
        focalLengthMm: 952,
        apertureMm: 127,
        focalRatio: 7.5,
    },
    {
        id: 'es-ed152',
        brand: 'Explore Scientific',
        name: 'ED152 FCD-100',
        focalLengthMm: 1216,
        apertureMm: 152,
        focalRatio: 8,
    },
    // Vixen — réfracteurs SD
    { id: 'vixen-sd81s', brand: 'Vixen', name: 'SD81S II', focalLengthMm: 625, apertureMm: 81, focalRatio: 7.7 },
    { id: 'vixen-sd103s', brand: 'Vixen', name: 'SD103S', focalLengthMm: 795, apertureMm: 103, focalRatio: 7.7 },
    { id: 'vixen-sd115s', brand: 'Vixen', name: 'SD115S', focalLengthMm: 890, apertureMm: 115, focalRatio: 7.7 },
    {
        id: 'vixen-r200ss',
        brand: 'Vixen',
        name: 'R200SS',
        focalLengthMm: 800,
        apertureMm: 200,
        focalRatio: 4,
        notes: 'Newton astrographe',
    },
    // Sky-Watcher — compléments
    { id: 'sw-mak90', brand: 'Sky-Watcher', name: 'Skymax 90', focalLengthMm: 1250, apertureMm: 90, focalRatio: 13.9 },
    {
        id: 'sw-mak102',
        brand: 'Sky-Watcher',
        name: 'Skymax 102',
        focalLengthMm: 1300,
        apertureMm: 102,
        focalRatio: 12.7,
    },
    {
        id: 'sw-evostar-120ed',
        brand: 'Sky-Watcher',
        name: 'Evostar 120ED',
        focalLengthMm: 900,
        apertureMm: 120,
        focalRatio: 7.5,
    },
    {
        id: 'sw-evostar-150ed',
        brand: 'Sky-Watcher',
        name: 'Evostar 150ED',
        focalLengthMm: 1200,
        apertureMm: 150,
        focalRatio: 8,
    },
    {
        id: 'sw-150pds',
        brand: 'Sky-Watcher',
        name: 'Newton 150/750 PDS',
        focalLengthMm: 750,
        apertureMm: 150,
        focalRatio: 5,
    },
    {
        id: 'sw-130pds',
        brand: 'Sky-Watcher',
        name: 'Newton 130/650 PDS',
        focalLengthMm: 650,
        apertureMm: 130,
        focalRatio: 5,
    },
    {
        id: 'sw-stargate-450',
        brand: 'Sky-Watcher',
        name: 'Stargate 18" Dobson',
        focalLengthMm: 1900,
        apertureMm: 457,
        focalRatio: 4.2,
    },
    // William Optics — compléments
    {
        id: 'wo-pleiades-68',
        brand: 'William Optics',
        name: 'Pleiades 68',
        focalLengthMm: 396,
        apertureMm: 68,
        focalRatio: 5.8,
    },
    {
        id: 'wo-fluorostar-91',
        brand: 'William Optics',
        name: 'FluoroStar 91',
        focalLengthMm: 540,
        apertureMm: 91,
        focalRatio: 5.9,
    },
    {
        id: 'wo-fluorostar-132',
        brand: 'William Optics',
        name: 'FluoroStar 132',
        focalLengthMm: 925,
        apertureMm: 132,
        focalRatio: 7,
    },
    // Takahashi — compléments
    { id: 'tak-fc100', brand: 'Takahashi', name: 'FC-100DZ', focalLengthMm: 800, apertureMm: 100, focalRatio: 8 },
    { id: 'tak-fc76', brand: 'Takahashi', name: 'FC-76DCU', focalLengthMm: 570, apertureMm: 76, focalRatio: 7.5 },
    { id: 'tak-foa60', brand: 'Takahashi', name: 'FOA-60Q', focalLengthMm: 900, apertureMm: 60, focalRatio: 15 },
    {
        id: 'tak-mewlon-180',
        brand: 'Takahashi',
        name: 'Mewlon 180',
        focalLengthMm: 2160,
        apertureMm: 180,
        focalRatio: 12,
    },
    {
        id: 'tak-mewlon-210',
        brand: 'Takahashi',
        name: 'Mewlon 210',
        focalLengthMm: 2415,
        apertureMm: 210,
        focalRatio: 11.5,
    },
    {
        id: 'tak-mewlon-250',
        brand: 'Takahashi',
        name: 'Mewlon 250CRS',
        focalLengthMm: 3000,
        apertureMm: 250,
        focalRatio: 12,
    },
    {
        id: 'tak-mewlon-300',
        brand: 'Takahashi',
        name: 'Mewlon 300CRS',
        focalLengthMm: 3500,
        apertureMm: 300,
        focalRatio: 11.7,
    },
    { id: 'tak-ca250', brand: 'Takahashi', name: 'CA-250', focalLengthMm: 1250, apertureMm: 250, focalRatio: 5 },
    // Sharpstar — compléments
    {
        id: 'sharpstar-61edph',
        brand: 'Sharpstar',
        name: '61EDPH II',
        focalLengthMm: 335,
        apertureMm: 61,
        focalRatio: 5.5,
    },
    { id: 'sharpstar-107phq', brand: 'Sharpstar', name: '107PHQ', focalLengthMm: 749, apertureMm: 107, focalRatio: 7 },
    { id: 'sharpstar-140phq', brand: 'Sharpstar', name: '140PHQ', focalLengthMm: 980, apertureMm: 140, focalRatio: 7 },
    {
        id: 'sharpstar-z4-76',
        brand: 'Sharpstar',
        name: 'Z4 Petzval 76mm',
        focalLengthMm: 380,
        apertureMm: 76,
        focalRatio: 5,
    },
    // TS Optics — compléments
    { id: 'ts-cf-apo70', brand: 'TS Optics', name: 'CF-APO 70mm', focalLengthMm: 420, apertureMm: 70, focalRatio: 6 },
    { id: 'ts-cf-apo90', brand: 'TS Optics', name: 'CF-APO 90mm', focalLengthMm: 600, apertureMm: 90, focalRatio: 6.6 },
    {
        id: 'ts-cf-apo107',
        brand: 'TS Optics',
        name: 'CF-APO 107mm',
        focalLengthMm: 700,
        apertureMm: 107,
        focalRatio: 6.5,
    },
    { id: 'ts-square-72', brand: 'TS Optics', name: 'SQUARE 72mm', focalLengthMm: 432, apertureMm: 72, focalRatio: 6 },
    // Astro-Tech / Orion / Apertura
    { id: 'at-at60ed', brand: 'Astro-Tech', name: 'AT60ED', focalLengthMm: 360, apertureMm: 60, focalRatio: 6 },
    { id: 'at-at102ed', brand: 'Astro-Tech', name: 'AT102EDL', focalLengthMm: 714, apertureMm: 102, focalRatio: 7 },
    { id: 'at-at130edt', brand: 'Astro-Tech', name: 'AT130EDT', focalLengthMm: 910, apertureMm: 130, focalRatio: 7 },
    { id: 'orion-eon-110', brand: 'Orion', name: 'EON 110ED', focalLengthMm: 770, apertureMm: 110, focalRatio: 7 },
    { id: 'orion-ed80t-cf', brand: 'Orion', name: 'ED80T-CF', focalLengthMm: 480, apertureMm: 80, focalRatio: 6 },
    { id: 'apertura-dt8', brand: 'Apertura', name: 'DT8 Newton', focalLengthMm: 800, apertureMm: 200, focalRatio: 4 },
    {
        id: 'apertura-dt10',
        brand: 'Apertura',
        name: 'DT10 Newton',
        focalLengthMm: 1000,
        apertureMm: 254,
        focalRatio: 4,
    },
    // Bresser / Lacerta
    {
        id: 'bresser-ar102s',
        brand: 'Bresser',
        name: 'Messier AR-102S',
        focalLengthMm: 600,
        apertureMm: 102,
        focalRatio: 5.9,
    },
    {
        id: 'bresser-ar152',
        brand: 'Bresser',
        name: 'Messier AR-152S',
        focalLengthMm: 760,
        apertureMm: 152,
        focalRatio: 5,
    },
    { id: 'lacerta-72ed', brand: 'Lacerta', name: '72ED', focalLengthMm: 432, apertureMm: 72, focalRatio: 6 },
    { id: 'lacerta-d72', brand: 'Lacerta', name: 'D72/432 ED', focalLengthMm: 432, apertureMm: 72, focalRatio: 6 },
    {
        id: 'lacerta-300n',
        brand: 'Lacerta',
        name: 'Newton 300/1200 carbon',
        focalLengthMm: 1200,
        apertureMm: 300,
        focalRatio: 4,
    },
    // Officina Stellare — compléments
    {
        id: 'os-veloce-rh200',
        brand: 'Officina Stellare',
        name: 'Veloce RH200',
        focalLengthMm: 600,
        apertureMm: 200,
        focalRatio: 3,
    },
    {
        id: 'os-prorc1000',
        brand: 'Officina Stellare',
        name: 'Pro RC1000',
        focalLengthMm: 8000,
        apertureMm: 1000,
        focalRatio: 8,
    },
    // Solaire dédié
    {
        id: 'lunt-ls60mt',
        brand: 'Lunt',
        name: 'LS60MT/Hα',
        focalLengthMm: 500,
        apertureMm: 60,
        focalRatio: 8.3,
        notes: 'Hα solaire dédié',
    },
    { id: 'lunt-ls80mt', brand: 'Lunt', name: 'LS80MT/Hα', focalLengthMm: 560, apertureMm: 80, focalRatio: 7 },
    { id: 'lunt-ls100mt', brand: 'Lunt', name: 'LS100MT/Hα', focalLengthMm: 714, apertureMm: 100, focalRatio: 7.1 },
    { id: 'lunt-ls152', brand: 'Lunt', name: 'LS152THa', focalLengthMm: 900, apertureMm: 152, focalRatio: 6 },
    // RASA / FastNewt
    {
        id: 'sw-150-newton',
        brand: 'Sky-Watcher',
        name: 'Quattro 150/600 Newton',
        focalLengthMm: 600,
        apertureMm: 150,
        focalRatio: 4,
    },
    // Long Perng
    {
        id: 'lp-66-petzval',
        brand: 'Long Perng',
        name: '66/400 Petzval',
        focalLengthMm: 400,
        apertureMm: 66,
        focalRatio: 6,
    },
    { id: 'lp-80-petzval', brand: 'Long Perng', name: 'S 80/480', focalLengthMm: 480, apertureMm: 80, focalRatio: 6 },
    // Téléobjectifs courants
    { id: 'lens-200', brand: 'Téléobjectif', name: '200 mm', focalLengthMm: 200, apertureMm: 70, focalRatio: 2.8 },
    { id: 'lens-300', brand: 'Téléobjectif', name: '300 mm', focalLengthMm: 300, apertureMm: 107, focalRatio: 2.8 },
    { id: 'lens-400', brand: 'Téléobjectif', name: '400 mm', focalLengthMm: 400, apertureMm: 70, focalRatio: 5.6 },
    { id: 'lens-50', brand: 'Téléobjectif', name: '50 mm Samyang', focalLengthMm: 50, apertureMm: 36, focalRatio: 1.4 },
    {
        id: 'lens-135',
        brand: 'Téléobjectif',
        name: '135 mm Samyang/Sigma',
        focalLengthMm: 135,
        apertureMm: 75,
        focalRatio: 1.8,
    },
];

const ACCESSORIES: AccessoryModel[] = [
    // Génériques
    {
        id: 'generic-flat-1x',
        brand: 'Générique',
        name: 'Aplanisseur 1.0x (sans changement de focale)',
        focalMultiplier: 1.0,
    },
    { id: 'generic-red-085', brand: 'Générique', name: 'Réducteur 0.85x', focalMultiplier: 0.85 },
    { id: 'generic-red-080', brand: 'Générique', name: 'Réducteur 0.80x', focalMultiplier: 0.8 },
    { id: 'generic-red-079', brand: 'Générique', name: 'Réducteur 0.79x', focalMultiplier: 0.79 },
    { id: 'generic-red-075', brand: 'Générique', name: 'Réducteur 0.75x', focalMultiplier: 0.75 },
    { id: 'generic-red-072', brand: 'Générique', name: 'Réducteur 0.72x', focalMultiplier: 0.72 },
    { id: 'generic-red-067', brand: 'Générique', name: 'Réducteur 0.67x', focalMultiplier: 0.67 },
    { id: 'generic-red-050', brand: 'Générique', name: 'Réducteur 0.50x', focalMultiplier: 0.5 },
    { id: 'generic-barlow-2x', brand: 'Générique', name: 'Barlow 2x', focalMultiplier: 2.0 },
    { id: 'generic-barlow-3x', brand: 'Générique', name: 'Barlow 3x', focalMultiplier: 3.0 },
    { id: 'generic-barlow-5x', brand: 'Générique', name: 'Barlow 5x', focalMultiplier: 5.0 },
    // Celestron
    {
        id: 'celestron-edge-07x',
        brand: 'Celestron',
        name: 'EdgeHD 0.7x Reducer',
        focalMultiplier: 0.7,
        notes: 'Pour C8/C9.25/C11/C14 EdgeHD',
    },
    { id: 'celestron-sct-063', brand: 'Celestron', name: 'SCT f/6.3 Reducer/Corrector', focalMultiplier: 0.63 },
    { id: 'celestron-x-cel-2x', brand: 'Celestron', name: 'X-Cel LX Barlow 2x', focalMultiplier: 2.0 },
    // Sky-Watcher
    { id: 'sw-esprit-077', brand: 'Sky-Watcher', name: 'Esprit Reducer 0.77x', focalMultiplier: 0.77 },
    { id: 'sw-quattro-085', brand: 'Sky-Watcher', name: 'Quattro CC Reducer 0.85x', focalMultiplier: 0.85 },
    { id: 'sw-evostar-085', brand: 'Sky-Watcher', name: 'Evostar ED Reducer 0.85x', focalMultiplier: 0.85 },
    // Takahashi
    { id: 'tak-fsq-073', brand: 'Takahashi', name: 'FSQ-85/106 Reducer 0.73x', focalMultiplier: 0.73 },
    { id: 'tak-fsq-066', brand: 'Takahashi', name: 'FSQ Reducer QE 0.66x', focalMultiplier: 0.66 },
    { id: 'tak-toa-067', brand: 'Takahashi', name: 'TOA Reducer 67', focalMultiplier: 0.665 },
    { id: 'tak-toa-064', brand: 'Takahashi', name: 'TOA Reducer 645', focalMultiplier: 0.644 },
    // Tele Vue
    { id: 'tv-np-08', brand: 'Tele Vue', name: 'NP Reducer 0.8x', focalMultiplier: 0.8 },
    { id: 'tv-pmate-2x', brand: 'Tele Vue', name: 'Powermate 2x', focalMultiplier: 2.0 },
    { id: 'tv-pmate-25x', brand: 'Tele Vue', name: 'Powermate 2.5x', focalMultiplier: 2.5 },
    { id: 'tv-pmate-4x', brand: 'Tele Vue', name: 'Powermate 4x', focalMultiplier: 4.0 },
    { id: 'tv-pmate-5x', brand: 'Tele Vue', name: 'Powermate 5x', focalMultiplier: 5.0 },
    // Askar
    { id: 'askar-fra-07', brand: 'Askar', name: 'FRA Reducer 0.7x', focalMultiplier: 0.7 },
    { id: 'askar-phq-08', brand: 'Askar', name: 'PHQ Reducer 0.8x', focalMultiplier: 0.8 },
    // William Optics
    { id: 'wo-flat6a-08', brand: 'William Optics', name: 'Flat6A III Reducer 0.8x', focalMultiplier: 0.8 },
    { id: 'wo-redcat-08', brand: 'William Optics', name: 'RedCat Reducer 0.8x', focalMultiplier: 0.8 },
    // Baader / Astrozap
    {
        id: 'baader-ffc',
        brand: 'Baader',
        name: 'FluoritFlatField Converter (2.25–4x)',
        focalMultiplier: 2.25,
        notes: 'Réglable 2.25× → 4×',
    },
    { id: 'baader-q-225', brand: 'Baader', name: 'Q-Turret Barlow 2.25x', focalMultiplier: 2.25 },
    // Hyperstar (transforme un SCT en astrographe rapide)
    {
        id: 'starizona-hyperstar-c8',
        brand: 'Starizona',
        name: 'Hyperstar C8 (f/2)',
        focalMultiplier: 0.197,
        notes: 'Convertit C8 en 400 mm f/2',
    },
    {
        id: 'starizona-hyperstar-c11',
        brand: 'Starizona',
        name: 'Hyperstar C11 (f/2)',
        focalMultiplier: 0.197,
        notes: 'Convertit C11 en 540 mm f/2',
    },
    { id: 'starizona-hyperstar-c14', brand: 'Starizona', name: 'Hyperstar C14 (f/1.9)', focalMultiplier: 0.19 },
    { id: 'starizona-night-owl', brand: 'Starizona', name: 'Night Owl 0.4x SCT', focalMultiplier: 0.4 },
    { id: 'starizona-scc-075', brand: 'Starizona', name: 'SCT Corrector 0.75x', focalMultiplier: 0.75 },
    // Génériques supplémentaires (ratios courants intermédiaires)
    { id: 'generic-red-095', brand: 'Générique', name: 'Aplanisseur 0.95x', focalMultiplier: 0.95 },
    { id: 'generic-red-090', brand: 'Générique', name: 'Réducteur 0.90x', focalMultiplier: 0.9 },
    { id: 'generic-red-065', brand: 'Générique', name: 'Réducteur 0.65x', focalMultiplier: 0.65 },
    { id: 'generic-red-060', brand: 'Générique', name: 'Réducteur 0.60x', focalMultiplier: 0.6 },
    { id: 'generic-red-040', brand: 'Générique', name: 'Réducteur 0.40x', focalMultiplier: 0.4 },
    { id: 'generic-barlow-15x', brand: 'Générique', name: 'Barlow 1.5x', focalMultiplier: 1.5 },
    { id: 'generic-barlow-16x', brand: 'Générique', name: 'Barlow 1.6x', focalMultiplier: 1.6 },
    { id: 'generic-barlow-25x', brand: 'Générique', name: 'Barlow 2.5x', focalMultiplier: 2.5 },
    { id: 'generic-barlow-4x', brand: 'Générique', name: 'Barlow 4x', focalMultiplier: 4.0 },
    // Astro-Physics
    {
        id: 'ap-ccdt67',
        brand: 'Astro-Physics',
        name: 'CCDT67 Reducer 0.67x',
        focalMultiplier: 0.67,
        notes: 'Universel 4/4.5/5x',
    },
    { id: 'ap-bart-275', brand: 'Astro-Physics', name: 'BARCON Barlow 2.75x', focalMultiplier: 2.75 },
    { id: 'ap-2x-convertible', brand: 'Astro-Physics', name: 'Convertible Barlow 2x', focalMultiplier: 2.0 },
    // Riccardi (par Officina Stellare)
    { id: 'riccardi-075', brand: 'Riccardi', name: 'Comacorrector 0.75x', focalMultiplier: 0.75 },
    { id: 'riccardi-1x', brand: 'Riccardi', name: 'Comacorrector 1x (sans changement)', focalMultiplier: 1.0 },
    // Vixen
    { id: 'vixen-vc200l-079', brand: 'Vixen', name: 'VC200L Reducer 0.79x', focalMultiplier: 0.79 },
    { id: 'vixen-vsd-071', brand: 'Vixen', name: 'VSD Reducer 0.71x', focalMultiplier: 0.71 },
    // Explore Scientific
    { id: 'es-08x', brand: 'Explore Scientific', name: 'Field Flattener / Reducer 0.8x', focalMultiplier: 0.8 },
    { id: 'es-077x', brand: 'Explore Scientific', name: 'HRCC 0.7x Reducer', focalMultiplier: 0.7 },
    // TS Optics / TecnoSky
    { id: 'ts-079', brand: 'TS Optics', name: 'Photoline Reducer 0.79x', focalMultiplier: 0.79 },
    { id: 'ts-095', brand: 'TS Optics', name: 'Photoline Flattener 0.95x', focalMultiplier: 0.95 },
    { id: 'ts-2x-barlow', brand: 'TS Optics', name: 'ED Barlow 2x', focalMultiplier: 2.0 },
    // Lacerta
    { id: 'lacerta-mpcc-mk3', brand: 'Lacerta', name: 'MPCC MK3 Coma Corrector', focalMultiplier: 1.0 },
    { id: 'lacerta-c-corr-095', brand: 'Lacerta', name: 'Coma Corrector 0.95x', focalMultiplier: 0.95 },
    // Baader (compléments)
    { id: 'baader-rcc-i', brand: 'Baader', name: 'RCC I Newton Coma Corrector', focalMultiplier: 1.0 },
    { id: 'baader-mpcc-iii', brand: 'Baader', name: 'MPCC Mark III', focalMultiplier: 1.0 },
    { id: 'baader-classic-q-225', brand: 'Baader', name: 'Classic Q-Barlow 2.25x', focalMultiplier: 2.25 },
    // ZWO
    { id: 'zwo-flat-08x', brand: 'ZWO', name: 'Flattener / Reducer 0.8x', focalMultiplier: 0.8 },
    { id: 'zwo-barlow-2x', brand: 'ZWO', name: 'ADC Barlow 2x', focalMultiplier: 2.0 },
    // Antlia / Optolong
    { id: 'antlia-08x', brand: 'Antlia', name: 'Reducer 0.8x', focalMultiplier: 0.8 },
    { id: 'optolong-65x', brand: 'Optolong', name: 'Focal Reducer 0.65x', focalMultiplier: 0.65 },
    // Tele Vue (compléments)
    { id: 'tv-pmate-15x', brand: 'Tele Vue', name: 'Powermate 1.5x', focalMultiplier: 1.5 },
    { id: 'tv-bar-2x', brand: 'Tele Vue', name: 'Big Barlow 2x', focalMultiplier: 2.0 },
    // William Optics (compléments)
    { id: 'wo-flat73a', brand: 'William Optics', name: 'Flat73A Reducer 0.8x', focalMultiplier: 0.8 },
    { id: 'wo-flat6aiii', brand: 'William Optics', name: 'Flat6AIII Reducer 0.8x', focalMultiplier: 0.8 },
    // Askar (compléments)
    { id: 'askar-fma-08', brand: 'Askar', name: 'FMA Reducer 0.8x', focalMultiplier: 0.8 },
    { id: 'askar-200ph-08', brand: 'Askar', name: '200PH Reducer 0.8x', focalMultiplier: 0.8 },
    // Sharpstar
    { id: 'sharpstar-095', brand: 'Sharpstar', name: 'Reducer/Flattener 0.95x', focalMultiplier: 0.95 },
    { id: 'sharpstar-08', brand: 'Sharpstar', name: 'EDPH Reducer 0.8x', focalMultiplier: 0.8 },
    // Sky-Watcher (compléments)
    { id: 'sw-evostar-072', brand: 'Sky-Watcher', name: 'Evostar 72ED Reducer 0.85x', focalMultiplier: 0.85 },
    { id: 'sw-mpcc', brand: 'Sky-Watcher', name: 'Quattro MPCC Coma Corrector', focalMultiplier: 1.0 },
    // Pegasus / Misc
    { id: 'pegasus-coma', brand: 'Pegasus Astro', name: 'Quad Coma Corrector', focalMultiplier: 1.0 },
    // Bague Tele-converter (lentilles photo)
    { id: 'lens-tc-14x', brand: 'Téléconvertisseur', name: 'TC 1.4x', focalMultiplier: 1.4 },
    { id: 'lens-tc-17x', brand: 'Téléconvertisseur', name: 'TC 1.7x', focalMultiplier: 1.7 },
    { id: 'lens-tc-2x', brand: 'Téléconvertisseur', name: 'TC 2x', focalMultiplier: 2.0 },
    // PlaneWave Instruments
    {
        id: 'pw-066-cdk12-5',
        brand: 'PlaneWave',
        name: '0.66x Reducer pour CDK12.5',
        focalMultiplier: 0.66,
        notes: 'CDK12.5 → ~1677 mm f/5.3',
    },
    {
        id: 'pw-066-cdk14',
        brand: 'PlaneWave',
        name: '0.66x Reducer pour CDK14',
        focalMultiplier: 0.66,
        notes: 'CDK14 → ~1692 mm f/4.7',
    },
    {
        id: 'pw-066-cdk17',
        brand: 'PlaneWave',
        name: '0.66x Reducer pour CDK17',
        focalMultiplier: 0.66,
        notes: 'CDK17 → ~1940 mm f/4.5',
    },
    {
        id: 'pw-066-cdk20',
        brand: 'PlaneWave',
        name: '0.66x Reducer pour CDK20',
        focalMultiplier: 0.66,
        notes: 'CDK20 → ~2280 mm f/4.5',
    },
    {
        id: 'pw-066-cdk24',
        brand: 'PlaneWave',
        name: '0.66x Reducer pour CDK24',
        focalMultiplier: 0.66,
        notes: 'CDK24 → ~2615 mm f/4.3',
    },
    { id: 'pw-066-cdk600', brand: 'PlaneWave', name: '0.66x Reducer pour CDK600', focalMultiplier: 0.66 },
    {
        id: 'pw-deltarho-1x',
        brand: 'PlaneWave',
        name: 'Delta Rho 350 (intégré, sans changement)',
        focalMultiplier: 1.0,
    },
    // Optec
    {
        id: 'optec-lepus-062',
        brand: 'Optec',
        name: 'Lepus 0.62x Telecompressor',
        focalMultiplier: 0.62,
        notes: 'Pour SCT et RC',
    },
    { id: 'optec-nextgen-07', brand: 'Optec', name: 'NextGEN MaxField 0.7x', focalMultiplier: 0.7 },
    { id: 'optec-nextgen-05', brand: 'Optec', name: 'NextGEN WideField 0.5x', focalMultiplier: 0.5 },
    { id: 'optec-cnga-091', brand: 'Optec', name: 'NextGEN 0.91x', focalMultiplier: 0.91 },
    // Antares
    { id: 'antares-2x-barlow', brand: 'Antares', name: 'ED Barlow 2x', focalMultiplier: 2.0 },
    { id: 'antares-16x', brand: 'Antares', name: 'ED Barlow 1.6x', focalMultiplier: 1.6 },
    { id: 'antares-05', brand: 'Antares', name: 'Reducer 0.5x', focalMultiplier: 0.5 },
    // GSO / Hotech
    {
        id: 'gso-rc-075',
        brand: 'GSO',
        name: 'CCD Reducer 0.75x pour RC',
        focalMultiplier: 0.75,
        notes: 'Pour Ritchey-Chrétien',
    },
    { id: 'gso-rc-067', brand: 'GSO', name: 'Reducer 0.67x pour RC', focalMultiplier: 0.67 },
    { id: 'hotech-08', brand: 'Hotech', name: 'CT Reducer 0.8x', focalMultiplier: 0.8 },
    // Astro-Physics (compléments)
    { id: 'ap-67ccdtii', brand: 'Astro-Physics', name: 'CCDT67-II Reducer 0.67x', focalMultiplier: 0.67 },
    { id: 'ap-quad-corr', brand: 'Astro-Physics', name: 'Quad TCC 0.72x', focalMultiplier: 0.72 },
    { id: 'ap-155tcc', brand: 'Astro-Physics', name: '155 TCC Reducer 0.75x', focalMultiplier: 0.75 },
    // Officina Stellare (compléments)
    { id: 'os-rh-067', brand: 'Officina Stellare', name: 'RH Reducer 0.67x', focalMultiplier: 0.67 },
    // Stellarvue (compléments)
    { id: 'sv-svr80', brand: 'Stellarvue', name: 'SVR80 Reducer 0.8x', focalMultiplier: 0.8 },
    { id: 'sv-svrt-079', brand: 'Stellarvue', name: 'SVX Reducer 0.79x', focalMultiplier: 0.79 },
    // Tele Vue (compléments)
    { id: 'tv-fr-08', brand: 'Tele Vue', name: 'TRF-2008 Reducer 0.8x', focalMultiplier: 0.8 },
    // Borg
    { id: 'borg-77ed-074', brand: 'Borg', name: '77ED Reducer 0.74x', focalMultiplier: 0.74 },
    { id: 'borg-77504', brand: 'Borg', name: '77504 Reducer 0.85x', focalMultiplier: 0.85 },
    // Sharpstar (compléments)
    { id: 'sharpstar-2x-ext', brand: 'Sharpstar', name: 'HNT 2x Extender', focalMultiplier: 2.0 },
    // Takahashi (compléments)
    { id: 'tak-fc-076', brand: 'Takahashi', name: 'FC/FS Reducer 0.76x', focalMultiplier: 0.76 },
    { id: 'tak-foa-072', brand: 'Takahashi', name: 'FOA Reducer 0.72x', focalMultiplier: 0.72 },
    { id: 'tak-extender-q', brand: 'Takahashi', name: 'Extender-Q 1.6x', focalMultiplier: 1.6 },
    // Vixen (compléments)
    { id: 'vixen-fl55ss-079', brand: 'Vixen', name: 'FL55SS Reducer 0.79x', focalMultiplier: 0.79 },
    { id: 'vixen-ax103-077', brand: 'Vixen', name: 'AX103S Reducer 0.77x', focalMultiplier: 0.77 },
    // Celestron / Meade (compléments)
    { id: 'celestron-edge-7x-925', brand: 'Celestron', name: 'EdgeHD 0.7x Reducer (9.25/11)', focalMultiplier: 0.7 },
    { id: 'meade-7x-acf', brand: 'Meade', name: 'ACF Reducer 0.7x', focalMultiplier: 0.7 },
    { id: 'meade-63', brand: 'Meade', name: 'f/6.3 Reducer/Corrector', focalMultiplier: 0.63 },
    // ASA — correcteurs Wynne (utilisés sur les Newtons astrographes)
    { id: 'asa-2-corr-073', brand: 'ASA', name: '2" Wynne Reducer 0.73x', focalMultiplier: 0.73 },
    { id: 'asa-3-corr-095', brand: 'ASA', name: '3" Wynne Coma Corrector 0.95x', focalMultiplier: 0.95 },
    { id: 'asa-3-corr-073', brand: 'ASA', name: '3" Wynne Reducer 0.73x', focalMultiplier: 0.73 },
    { id: 'asa-4-corr-068', brand: 'ASA', name: '4" Reducer 0.68x', focalMultiplier: 0.68 },
    // Tele Vue Paracorr (correcteur de Newton)
    {
        id: 'tv-paracorr-2',
        brand: 'Tele Vue',
        name: 'Paracorr 2 (visuel)',
        focalMultiplier: 1.15,
        notes: 'Newton coma corrector — décale légèrement la focale',
    },
    // Constructeurs spécialisés
    { id: 'starizona-sct-coma', brand: 'Starizona', name: 'SCT Corrector III', focalMultiplier: 1.0 },
    {
        id: 'innovations-onag',
        brand: 'Innovations Foresight',
        name: 'ONAG (no focal change)',
        focalMultiplier: 1.0,
        notes: 'Prisme dichroïque pour autoguidage',
    },
    // Téléconvertisseurs spécifiques marques photo
    { id: 'canon-ef-14x-iii', brand: 'Canon', name: 'EF Extender 1.4x III', focalMultiplier: 1.4 },
    { id: 'canon-ef-2x-iii', brand: 'Canon', name: 'EF Extender 2x III', focalMultiplier: 2.0 },
    { id: 'nikon-tc-14e-iii', brand: 'Nikon', name: 'TC-14E III', focalMultiplier: 1.4 },
    { id: 'nikon-tc-17e-ii', brand: 'Nikon', name: 'TC-17E II', focalMultiplier: 1.7 },
    { id: 'nikon-tc-20e-iii', brand: 'Nikon', name: 'TC-20E III', focalMultiplier: 2.0 },
    { id: 'sony-tc-14', brand: 'Sony', name: 'SEL14TC', focalMultiplier: 1.4 },
    { id: 'sony-tc-2x', brand: 'Sony', name: 'SEL20TC', focalMultiplier: 2.0 },
    { id: 'sigma-tc-14x', brand: 'Sigma', name: 'TC-1411 1.4x', focalMultiplier: 1.4 },
    { id: 'sigma-tc-2x', brand: 'Sigma', name: 'TC-2011 2x', focalMultiplier: 2.0 },
    { id: 'kenko-mc4-14x', brand: 'Kenko', name: 'Teleplus MC4 1.4x', focalMultiplier: 1.4 },
    { id: 'kenko-mc7-2x', brand: 'Kenko', name: 'Teleplus MC7 2x', focalMultiplier: 2.0 },
    // Coma correctors photo (1x — laisse en référence)
    { id: 'tv-paracorr-2-photo', brand: 'Tele Vue', name: 'Paracorr 2 Photo', focalMultiplier: 1.15 },
    { id: 'gpu-coma', brand: 'GPU', name: 'Coma Corrector', focalMultiplier: 1.0 },
    { id: 'baader-mpcc-photo', brand: 'Baader', name: 'MPCC III Photo', focalMultiplier: 1.0 },
    // Iconaster / Wynne pour gros Newtons
    { id: 'wynne-3-073', brand: 'Wynne', name: '3" Wynne 0.73x (générique)', focalMultiplier: 0.73 },
    { id: 'wynne-2-095', brand: 'Wynne', name: '2" Coma Corrector 0.95x', focalMultiplier: 0.95 },
    // CCDT67 / autres compresseurs SCT
    { id: 'antares-ccdr-077', brand: 'Antares', name: 'CCDR 0.77x', focalMultiplier: 0.77 },
    { id: 'optec-cnga-085', brand: 'Optec', name: 'NextGEN 0.85x', focalMultiplier: 0.85 },
    // ZWO accessoires complémentaires
    { id: 'zwo-flat-073', brand: 'ZWO', name: 'CAA Flattener 0.73x', focalMultiplier: 0.73 },
    { id: 'zwo-2x-barlow-apo', brand: 'ZWO', name: '2x Barlow APO', focalMultiplier: 2.0 },
    // Meade / Celestron compléments
    { id: 'celestron-15x', brand: 'Celestron', name: 'Omni 1.5x Barlow', focalMultiplier: 1.5 },
    { id: 'celestron-2x', brand: 'Celestron', name: 'Omni 2x Barlow', focalMultiplier: 2.0 },
    { id: 'meade-2x-barlow', brand: 'Meade', name: '#140 2x APO Barlow', focalMultiplier: 2.0 },
    // Astro-Physics compléments très répandus
    { id: 'ap-130tcc', brand: 'Astro-Physics', name: '130TCC Reducer', focalMultiplier: 0.75 },
    { id: 'ap-bart', brand: 'Astro-Physics', name: 'Barcon 2x', focalMultiplier: 2.0 },
];

function normalize(s: string): string {
    return foldAccents(s);
}

function score<T extends { brand: string; name: string }>(item: T, qNorm: string): number {
    if (!qNorm) return 1;
    const haystack = normalize(`${item.brand} ${item.name}`);
    if (haystack.includes(qNorm)) {
        // Earlier match → higher score.
        return 1 + 1 / (haystack.indexOf(qNorm) + 1);
    }
    // Token-level match: every token of the query must appear somewhere.
    const tokens = qNorm.split(/\s+/).filter(Boolean);
    const allMatch = tokens.every((t) => haystack.includes(t));
    return allMatch ? 0.5 : 0;
}

export function searchCameras(query: string, limit = 10): CameraModel[] {
    const q = normalize(query.trim());
    const ranked = CAMERAS.map((c) => ({ c, s: score(c, q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((r) => r.c);
    return ranked;
}

export function searchTelescopes(query: string, limit = 10): TelescopeModel[] {
    const q = normalize(query.trim());
    const ranked = TELESCOPES.map((t) => ({ t, s: score(t, q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((r) => r.t);
    return ranked;
}

export function searchAccessories(query: string, limit = 10): AccessoryModel[] {
    const q = normalize(query.trim());
    const ranked = ACCESSORIES.map((a) => ({ a, s: score(a, q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((r) => r.a);
    return ranked;
}

export function findCamera(id: string | undefined): CameraModel | undefined {
    if (!id) return undefined;
    return CAMERAS.find((c) => c.id === id);
}

export function findTelescope(id: string | undefined): TelescopeModel | undefined {
    if (!id) return undefined;
    return TELESCOPES.find((t) => t.id === id);
}

export function findAccessory(id: string | undefined): AccessoryModel | undefined {
    if (!id) return undefined;
    return ACCESSORIES.find((a) => a.id === id);
}
