/**
 * Unified synchronization utility for astronomical data.
 *
 * Responsibility:
 * - Seeding: Ensures all IDs from the gallery CSV exist in astro_details.json.
 * - Enrichment: Fetches missing technical data (magnitude, distance, dimensions).
 * - Multi-source Scraping:
 *   1. Parses French Wikipedia prose for fallback values.
 *   2. Traverses to English Wikipedia for high-precision infobox data.
 * - Efficiency: Minimizes network requests by processing each object in a single pass.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const CSV_PATH = path.join(__dirname, '../../data/astrobin_clodoweg_gallery_python.csv');
const JSON_PATH = path.join(__dirname, '../../src/data/astro_details.json');

// --- Helper Functions (Parsed from original scripts) ---

/**
 * Attempts to derive a likely French Wikipedia URL from a photograph title.
 */
function guessWikipediaUrl(title) {
    if (!title) return null;
    let cleanTitle = title.replace(/\s*\([^)]*\)$/, '').trim();
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
    const safeTitle = cleanTitle.replace(/ /g, '_');
    return `https://fr.wikipedia.org/wiki/${encodeURIComponent(safeTitle)}`;
}

/**
 * Parses numerical magnitude from text.
 */
function parseMagnitude(text) {
    if (!text) return null;
    let clean = text.replace(/\[.*?\]/g, '').trim();
    const match = clean.match(/([-+]?\d*\.?\d+)/);
    return match ? parseFloat(match[1]) : null;
}

/**
 * Parses astronomical distance values (ly, kly, Mly).
 */
function parseDistance(text) {
    if (!text) return null;
    let clean = text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '');
    clean = clean.replace(/±\s*[\d,.]+/g, '').replace(/\+\/-\s*[\d,.]+/g, '');
    clean = clean.replace(/[~≈<>\s]/g, ' ').trim();
    clean = clean.replace(/\u00A0/g, ' ');

    const mly = clean.match(/([\d\s,.]+)\s*Mly/i) || clean.match(/([\d\s,.]+)\s*million\s*ly/i);
    if (mly) return parseFloat(mly[1].replace(/\s/g, '').replace(',', '.')) * 1_000_000;

    const kly = clean.match(/([\d\s,.]+)\s*kly/i);
    if (kly) return parseFloat(kly[1].replace(/\s/g, '').replace(',', '.')) * 1_000;

    const ly = clean.match(/([\d\s,.]+)\s*ly/i) || clean.match(/([\d\s,.]+)\s*années-lumière/i);
    if (ly) return parseFloat(ly[1].replace(/\s/g, '').replace(',', '.'));

    return null;
}

// --- Scraper Logic ---

/**
 * Extracts data from French Wikipedia body text as a fallback.
 */
function extractFromFrenchProse($, details, changes) {
    const content = $('.mw-parser-output').text();

    if (details.apparent_magnitude === null) {
        const magMatch = content.match(
            /magnitude(?:\s+apparente)?\s*(?:est)?\s*(?:de|:)?\s*([0-9,.]+)\s*(?!\s*absolue)/i,
        );
        if (magMatch) {
            let val = parseFloat(magMatch[1].replace(',', '.'));
            if (!isNaN(val) && val < 30) {
                details.apparent_magnitude = val;
                changes.push(`Mag (FR): ${val}`);
            }
        }
    }

    if (details.dimensions_ly === null) {
        const dimMatch = content.match(
            /(?:diamètre|taille|envergure|s'étend sur)\s*(?:est)?\s*(?:d['e]|:)?\s*([0-9\s,.]+)\s*(?:a\.?l\.?|années-lumière)/i,
        );
        if (dimMatch) {
            let val = parseDistance(dimMatch[0]);
            if (val) {
                details.dimensions_ly = Math.round(val);
                changes.push(`Dim (FR): ${details.dimensions_ly} ly`);
            }
        }
    }

    if (details.distance_ly === null) {
        const distMatch = content.match(
            /(?:située?|distant)\s*(?:à|de)\s*(?:environ)?\s*([0-9\s,.]+)\s*(?:a\.?l\.?|années-lumière)/i,
        );
        if (distMatch) {
            let val = parseDistance(distMatch[0]);
            if (val) {
                details.distance_ly = Math.round(val);
                changes.push(`Dist (FR): ${details.distance_ly} ly`);
            }
        }
    }
}

/**
 * Extracts high-precision data from English Wikipedia infobox.
 */
async function extractFromEnglishInfobox($, details, changes) {
    const infobox = $('.infobox');
    if (!infobox.length) return;

    const getVal = (regex) => {
        let val = null;
        $('tr', infobox).each((i, row) => {
            const th = $(row).find('th').text().trim();
            if (regex.test(th)) {
                val = $(row).find('td').text().trim();
                return false;
            }
        });
        return val;
    };

    if (details.apparent_magnitude === null) {
        const magText = getVal(/Apparent magnitude/i);
        const mag = parseMagnitude(magText);
        if (mag !== null) {
            details.apparent_magnitude = mag;
            changes.push(`Mag (EN): ${mag}`);
        }
    }

    if (details.distance_ly === null) {
        const distText = getVal(/Distance/i);
        const dist = parseDistance(distText);
        if (dist !== null) {
            details.distance_ly = Math.round(dist);
            changes.push(`Dist (EN): ${details.distance_ly} ly`);
        }
    }

    if (details.dimensions_ly === null) {
        let bestVal = null;
        let usedRadius = false;

        $('tr', infobox).each((i, row) => {
            const th = $(row).find('th').text().trim();
            const td = $(row).find('td').text().trim();
            const isRadius = /Radius/i.test(th);
            const isDim = /Diameter|Size|Dimensions/i.test(th);

            if (isRadius || isDim) {
                const val = parseDistance(td);
                if (val !== null) {
                    if (isRadius) {
                        bestVal = val * 2;
                        usedRadius = true;
                    } else {
                        bestVal = val;
                        usedRadius = false;
                    }
                    return false;
                }
            }
        });

        if (bestVal !== null) {
            details.dimensions_ly = Math.round(bestVal);
            changes.push(`Dim (EN): ${details.dimensions_ly} ly (${usedRadius ? 'Radius' : 'Diameter'})`);
        }
    }

    if (details.apparent_dimensions === null) {
        const appDimText = getVal(/Apparent\s*dimensions/i);
        if (appDimText) {
            const cleanAppDim = appDimText
                .replace(/\[.*?\]/g, '')
                .replace(/\.mw-parser-output.*/g, '')
                .trim();
            details.apparent_dimensions = cleanAppDim;
            changes.push(`AppDim (EN): ${cleanAppDim}`);
        }
    }
}

// --- Main Orchestrator ---

async function syncAstroDetails() {
    console.log('🚀 Starting Astronomical Data Synchronization...');

    // 1. Load Data
    if (!fs.existsSync(CSV_PATH)) {
        console.error('❌ CSV file not found at:', CSV_PATH);
        return;
    }
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const { data: photos } = Papa.parse(csvContent, { header: true, dynamicTyping: true });

    let details = {};
    if (fs.existsSync(JSON_PATH)) {
        details = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    }

    // 2. Seeding (from init_astro_details.js)
    let seededCount = 0;
    for (const row of photos) {
        if (!row.ID || !row.Title) continue;
        const id = String(row.ID);
        const guessedUrl = guessWikipediaUrl(row.Title);

        if (!details[id]) {
            details[id] = {
                id: id,
                discovery: null,
                object_type: null,
                dimensions_ly: null,
                distance_ly: null,
                apparent_dimensions: null,
                apparent_magnitude: null,
                apparent_radius: null,
                source_url: guessedUrl,
            };
            seededCount++;
        }
    }
    if (seededCount > 0) {
        console.log(`🌱 Seeded ${seededCount} new entries.`);
        fs.writeFileSync(JSON_PATH, JSON.stringify(details, null, 2));
    }

    // 3. Enrichment Loop
    const targets = Object.keys(details).filter((id) => {
        const e = details[id];
        return (
            e.source_url &&
            e.source_url.includes('wikipedia.org') &&
            (e.distance_ly === null || e.dimensions_ly === null || e.apparent_magnitude === null)
        );
    });

    console.log(`🔍 Scrutinizing ${targets.length} entries for missing data...`);
    let updatedEntriesCount = 0;

    for (const id of targets) {
        const entry = details[id];
        const changes = [];

        try {
            // Fetch French Wikipedia
            const frResp = await fetch(entry.source_url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!frResp.ok) throw new Error(`HTTP ${frResp.status}`);
            const frHtml = await frResp.text();
            const $fr = cheerio.load(frHtml);

            // A. Extract from French body text
            extractFromFrenchProse($fr, entry, changes);

            // B. Traverse to English if data still missing
            if (entry.distance_ly === null || entry.dimensions_ly === null || entry.apparent_magnitude === null) {
                const enLink = $fr('.interlanguage-link.interwiki-en a').attr('href');
                if (enLink) {
                    const enResp = await fetch(enLink, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (enResp.ok) {
                        const enHtml = await enResp.text();
                        const $en = cheerio.load(enHtml);
                        await extractFromEnglishInfobox($en, entry, changes);
                    }
                }
            }

            if (changes.length > 0) {
                console.log(`✅ [${id}] ${entry.source_url.split('/').pop()}: ${changes.join(', ')}`);
                updatedEntriesCount++;
                // Save incrementally to prevent data loss on crash
                fs.writeFileSync(JSON_PATH, JSON.stringify(details, null, 2));
            }

            // Small delay to be polite to Wikipedia
            await new Promise((r) => setTimeout(r, 200));
        } catch (e) {
            console.error(`❌ [${id}] Error: ${e.message}`);
        }
    }

    // 4. Reporting (from list_remaining_nulls.cjs)
    const missingData = Object.keys(details)
        .filter((id) => {
            const e = details[id];
            return e.distance_ly === null || e.dimensions_ly === null || e.apparent_magnitude === null;
        })
        .map((id) => {
            const e = details[id];
            const missing = [];
            if (e.distance_ly === null) missing.push('distance_ly');
            if (e.dimensions_ly === null) missing.push('dimensions_ly');
            if (e.apparent_magnitude === null) missing.push('apparent_magnitude');
            return { id, missing, url: e.source_url };
        });

    if (missingData.length > 0) {
        console.log(`\n⚠️  Found ${missingData.length} entries still missing data:`);
        missingData.forEach((t) => {
            console.log(`   [${t.id}] Missing: ${t.missing.join(', ')} | URL: ${t.url}`);
        });
    }

    console.log(`\n✨ Finished. Seeded: ${seededCount}, Updated: ${updatedEntriesCount}.`);
}

// POURQUOI : l'admin et update-photos.mjs jugent le succès sur le code de sortie.
syncAstroDetails().catch((error) => {
    console.error(error);
    process.exit(1);
});
