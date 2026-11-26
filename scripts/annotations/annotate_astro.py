#!/usr/bin/env python3
"""
Annotations d'une astrophoto en calque SVG

Responsabilité principale :
- Résout l'astrométrie de la photo avec nova.astrometry.net (WCS mis en cache par empreinte du fichier).
- Projette sur la photo les objets des catalogues OpenNGC (NGC, IC, Messier, addendum) et des
  instantanés du site (`src/data/catalogues/` : Sharpless, vdB, Barnard, LBN, RCW, Ced).
- Choisit les cibles les plus intéressantes (20 par défaut), place les étiquettes sans chevauchement
  et écrit un calque SVG aux dimensions de la photo, à superposer à l'image.

Rendu par défaut (repris des réglages par défaut d'InstaSlice Studio, code réécrit) : anneau fin avec
liseré sombre, couleur #EAF2FF, Inter 600, titre + « type · mag », soulignement relié à l'anneau par
un trait de rappel. Le texte est converti en tracés : le SVG ne dépend d'aucune police ni de la CSP.

Effet de bord : envoie la photo à nova.astrometry.net (soumission privée, `publicly_visible = n`).
Écrit seulement dans `temp/annotations/` (ignoré par git), sauf `--out`.

Prérequis :
  pip install -r scripts/annotations/requirements.txt
  ASTROMETRY_API_KEY dans `.env` ou l'environnement (clé sur https://nova.astrometry.net/api_help)

Options disponibles :
  <image>               : Photo à annoter (JPEG, PNG, TIFF…).
  --out=<fichier.svg>   : Chemin du calque (défaut : temp/annotations/<nom>.svg).
  --wcs=<fichier>       : En-tête WCS déjà connu (FITS) : aucune résolution en ligne.
  --solved-width=<px>   : Largeur de l'image résolue par ce WCS, si ce n'est pas la photo
                          elle-même (le WCS est alors remis à l'échelle).
  --count=<n>           : Nombre de cibles annotées (défaut 20, comme le niveau « Medium »).
  --color=<#hex>        : Couleur des marqueurs et des traits (défaut #EAF2FF).
  --no-sub              : N'affiche que le nom, sans la ligne « type · mag ».
  --ra=<deg> --dec=<deg> --radius=<deg> : Indices de position pour accélérer la résolution.
  --force-solve         : Ignore le WCS en cache et résout à nouveau.
  --preview             : Écrit aussi un HTML qui superpose le calque à la photo.
  --json                : Écrit aussi la liste des cibles retenues (positions, rayons, catalogues).

Exemples d'utilisation :
  python3 scripts/annotations/annotate_astro.py photo.jpg --preview
  python3 scripts/annotations/annotate_astro.py photo.jpg --count=12 --no-sub
  python3 scripts/annotations/annotate_astro.py photo.jpg --wcs=wcs.fits --out=public/annotations/ngc2014.svg
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import os
import re
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import requests
from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORK_DIR = PROJECT_ROOT / 'temp' / 'annotations'
SITE_CATALOGUES_DIR = PROJECT_ROOT / 'src' / 'data' / 'catalogues'
FONT_DIR = PROJECT_ROOT / 'public' / 'fonts' / 'inter'
NOVA_API = 'https://nova.astrometry.net/api'
NOVA_ROOT = 'https://nova.astrometry.net'
OPENNGC_BASE = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files'

# POURQUOI : au-delà, l'envoi est lent et nova réduit de toute façon l'image avant de chercher les étoiles.
SOLVE_MAX_EDGE = 2400

DEFAULT_COLOR = '#EAF2FF'
TITLE_FILL = '#F5F8FC'
SUB_FILL = '#DCE6F4'
KEYLINE = 'rgba(2,5,12,0.40)'
TEXT_HALO = 'rgba(2,6,14,0.82)'


# ---------------------------------------------------------------------------
# Catalogues
# ---------------------------------------------------------------------------

@dataclass
class SkyObject:
    id: str
    ra: float
    dec: float
    category: str            # nebula | cluster | galaxy | star | other
    type_label: str
    mag: float | None = None
    size_arcmin: float | None = None
    common_name: str | None = None
    source: str = ''
    # Rempli après projection
    x: float = 0.0
    y: float = 0.0
    radius_px: float = 0.0
    rank: float = 0.0
    extra: dict = field(default_factory=dict)


# Types OpenNGC → (catégorie, libellé français)
OPENNGC_TYPES = {
    '*': ('star', 'Étoile'), '**': ('star', 'Étoile double'), '*Ass': ('cluster', 'Association stellaire'),
    'OCl': ('cluster', 'Amas ouvert'), 'GCl': ('cluster', 'Amas globulaire'), 'Cl+N': ('cluster', 'Amas et nébuleuse'),
    'G': ('galaxy', 'Galaxie'), 'GPair': ('galaxy', 'Paire de galaxies'), 'GTrpl': ('galaxy', 'Triplet de galaxies'),
    'GGroup': ('galaxy', 'Groupe de galaxies'), 'PN': ('nebula', 'Nébuleuse planétaire'),
    'HII': ('nebula', 'Région H II'), 'DrkN': ('nebula', 'Nébuleuse obscure'), 'EmN': ('nebula', 'Nébuleuse en émission'),
    'Neb': ('nebula', 'Nébuleuse'), 'RfN': ('nebula', 'Nébuleuse par réflexion'), 'SNR': ('nebula', 'Rémanent de supernova'),
    'Nova': ('star', 'Nova'), 'Other': ('other', 'Objet'),
}

# Instantanés du site retenus : le reste (LDN, PN G, Skiff, galaxies UGC/Abell) noierait la photo de cibles obscures.
SITE_CATALOGUES = {
    'sharpless': 'nebula', 'vdb': 'nebula', 'barnard': 'nebula', 'lbn': 'nebula', 'rcw': 'nebula', 'ced': 'nebula',
}


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, '') else None
    except ValueError:
        return None


def _sexagesimal_to_deg(value: str, hours: bool) -> float:
    sign = -1 if value.strip().startswith('-') else 1
    parts = [abs(float(p)) for p in value.strip().lstrip('+-').split(':')]
    deg = parts[0] + parts[1] / 60 + parts[2] / 3600
    return sign * deg * (15 if hours else 1)


def ensure_openngc() -> Path:
    """Télécharge une fois OpenNGC (CC BY-SA 4.0, Mattia Verga) dans `temp/annotations/openngc/`.

    @returns Le dossier qui contient `NGC.csv` et `addendum.csv`.
    """
    folder = WORK_DIR / 'openngc'
    folder.mkdir(parents=True, exist_ok=True)
    for name in ('NGC.csv', 'addendum.csv'):
        target = folder / name
        if not target.exists():
            print(f'Téléchargement d’OpenNGC : {name}')
            urllib.request.urlretrieve(f'{OPENNGC_BASE}/{name}', target)
    return folder


def _openngc_id(name: str, messier: str) -> str:
    if messier:
        return f'M {int(messier)}'
    match = re.match(r'^(NGC|IC)(\d+)(.*)$', name)
    if match:
        return f'{match.group(1)} {int(match.group(2))}{match.group(3).strip()}'
    return name


def load_openngc() -> list[SkyObject]:
    folder = ensure_openngc()
    objects = []
    for name in ('NGC.csv', 'addendum.csv'):
        with open(folder / name, newline='', encoding='utf-8') as handle:
            for row in csv.DictReader(handle, delimiter=';'):
                kind = OPENNGC_TYPES.get(row['Type'])
                if not kind or not row['RA'] or not row['Dec']:
                    continue                                    # Dup, NonEx : doublons ou objets inexistants
                category, label = kind
                mag = _float(row['V-Mag']) if _float(row['V-Mag']) is not None else _float(row['B-Mag'])
                common = (row.get('Common names') or '').split(',')[0].strip() or None
                objects.append(SkyObject(
                    id=_openngc_id(row['Name'], row.get('M', '')),
                    ra=_sexagesimal_to_deg(row['RA'], hours=True),
                    dec=_sexagesimal_to_deg(row['Dec'], hours=False),
                    category=category, type_label=label, mag=mag,
                    size_arcmin=_float(row['MajAx']), common_name=common, source='OpenNGC',
                ))
    return objects


def load_site_catalogues() -> list[SkyObject]:
    objects = []
    for slug, category in SITE_CATALOGUES.items():
        path = SITE_CATALOGUES_DIR / f'{slug}.json'
        if not path.exists():
            continue
        for entry in json.loads(path.read_text(encoding='utf-8'))['entries']:
            if entry.get('ra') is None or entry.get('dec') is None:
                continue
            # POURQUOI : les types du site sont détaillés (« H II irrégulière ») ; on garde le premier niveau pour la sous-ligne.
            label = re.sub(r'\s*\(.*\)$', '', entry.get('type') or 'Nébuleuse')
            if label.startswith('H II'):
                label = 'Région H II'
            elif label.startswith('Nébuleuse') and label not in ('Nébuleuse obscure', 'Nébuleuse brillante', 'Nébuleuse diffuse'):
                label = 'Nébuleuse par réflexion' if slug == 'vdb' else 'Nébuleuse'
            objects.append(SkyObject(
                id=entry['id'], ra=float(entry['ra']), dec=float(entry['dec']), category=category,
                type_label=label, mag=entry.get('mag'), size_arcmin=entry.get('sizeArcmin'), source=slug,
            ))
    return objects


# ---------------------------------------------------------------------------
# Résolution astrométrique (nova.astrometry.net)
# ---------------------------------------------------------------------------

def read_api_key() -> str | None:
    if os.environ.get('ASTROMETRY_API_KEY'):
        return os.environ['ASTROMETRY_API_KEY'].strip()
    env_file = PROJECT_ROOT / '.env'
    if env_file.exists():
        for line in env_file.read_text(encoding='utf-8').splitlines():
            match = re.match(r'^\s*ASTROMETRY_API_KEY\s*=\s*["\']?([^"\'\s]+)', line)
            if match:
                return match.group(1)
    return None


def _nova_json(response: requests.Response) -> dict:
    response.raise_for_status()
    data = response.json()
    if data.get('status') == 'error':
        raise RuntimeError(f'nova.astrometry.net : {data.get("errormessage", data)}')
    return data


def solve_with_nova(image_path: Path, hints: dict, timeout_s: int = 900) -> tuple[fits.Header, int]:
    """Envoie la photo (réduite si besoin) à nova.astrometry.net et renvoie son WCS.

    @param image_path Photo à résoudre.
    @param hints Indices facultatifs `center_ra`, `center_dec`, `radius` (degrés).
    @param timeout_s Durée maximale d'attente de la résolution.
    @returns L'en-tête WCS et la largeur en pixels de l'image envoyée (à laquelle il se rapporte).
    """
    api_key = read_api_key()
    if not api_key:
        raise RuntimeError('ASTROMETRY_API_KEY absente (.env ou environnement). Clé : https://nova.astrometry.net/api_help')

    with Image.open(image_path) as img:
        img = img.convert('RGB')
        ratio = min(1.0, SOLVE_MAX_EDGE / max(img.size))
        if ratio < 1:
            img = img.resize((round(img.width * ratio), round(img.height * ratio)), Image.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, 'JPEG', quality=92)
        sent_width = img.width

    session = _nova_json(requests.post(f'{NOVA_API}/login', data={'request-json': json.dumps({'apikey': api_key})}, timeout=60))['session']
    # WARNING: soumission privée. `publicly_visible = n` évite que la photo apparaisse dans la galerie publique de nova.
    request = {'session': session, 'publicly_visible': 'n', 'allow_modifications': 'n', 'allow_commercial_use': 'n'}
    request.update({key: value for key, value in hints.items() if value is not None})
    print(f'Envoi à nova.astrometry.net ({sent_width} px de large)…')
    upload = _nova_json(requests.post(
        f'{NOVA_API}/upload',
        files={'request-json': (None, json.dumps(request)), 'file': (image_path.stem + '.jpg', buffer.getvalue(), 'application/octet-stream')},
        timeout=300,
    ))
    submission_id = upload['subid']
    print(f'Soumission {submission_id} : {NOVA_ROOT}/status/{submission_id}')

    started, job_id = time.time(), None
    while time.time() - started < timeout_s:
        time.sleep(5)
        if job_id is None:
            jobs = [j for j in _nova_json(requests.get(f'{NOVA_API}/submissions/{submission_id}', timeout=60)).get('jobs', []) if j]
            job_id = jobs[0] if jobs else None
            continue
        status = _nova_json(requests.get(f'{NOVA_API}/jobs/{job_id}', timeout=60)).get('status')
        print(f'  job {job_id} : {status}')
        if status == 'success':
            raw = requests.get(f'{NOVA_ROOT}/wcs_file/{job_id}', timeout=120)
            raw.raise_for_status()
            return fits.Header.fromstring(raw.content.decode('ascii', errors='ignore')), sent_width
        if status == 'failure':
            raise RuntimeError('nova.astrometry.net n’a pas trouvé de solution (essayer --ra/--dec/--radius).')
    raise RuntimeError('Résolution trop longue : relancer plus tard, la soumission reste visible sur nova.')


def load_or_solve_wcs(image_path: Path, args: argparse.Namespace) -> tuple[WCS, float]:
    """Renvoie le WCS et le facteur (pixels de la photo / pixels de l'image résolue)."""
    with Image.open(image_path) as img:
        width = img.width

    if args.wcs:
        header = fits.Header.fromfile(args.wcs) if not str(args.wcs).endswith('.json') else fits.Header(json.loads(Path(args.wcs).read_text()))
        solved_width = args.solved_width or width
    else:
        digest = hashlib.sha1(image_path.read_bytes()).hexdigest()[:16]
        cache_dir = WORK_DIR / 'wcs'
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_header, cache_meta = cache_dir / f'{digest}.fits', cache_dir / f'{digest}.json'
        if cache_header.exists() and not args.force_solve:
            print(f'WCS en cache : {cache_header.relative_to(PROJECT_ROOT)}')
            header = fits.Header.fromfile(cache_header)
            solved_width = json.loads(cache_meta.read_text())['solvedWidth']
        else:
            hints = {'center_ra': args.ra, 'center_dec': args.dec, 'radius': args.radius}
            header, solved_width = solve_with_nova(image_path, hints)
            header.tofile(cache_header, overwrite=True)
            cache_meta.write_text(json.dumps({'image': image_path.name, 'solvedWidth': solved_width}))
    return WCS(header), width / solved_width


# ---------------------------------------------------------------------------
# Projection et choix des cibles
# ---------------------------------------------------------------------------

def pixel_scale_deg(wcs: WCS) -> float:
    """Échelle moyenne de l'image résolue, en degrés par pixel."""
    return float(np.mean(proj_plane_pixel_scales(wcs.celestial)))


def project_objects(objects: list[SkyObject], wcs: WCS, factor: float, width: int, height: int) -> list[SkyObject]:
    ras = np.array([o.ra for o in objects])
    decs = np.array([o.dec for o in objects])
    # POURQUOI : écarte d'abord tout ce qui est loin du champ, la projection SIP diverge loin de l'image.
    center = wcs.pixel_to_world_values((width / factor) / 2, (height / factor) / 2)
    c_ra, c_dec = np.radians(center[0]), np.radians(center[1])
    cos_sep = np.sin(c_dec) * np.sin(np.radians(decs)) + np.cos(c_dec) * np.cos(np.radians(decs)) * np.cos(np.radians(ras) - c_ra)
    scale_deg = pixel_scale_deg(wcs)
    half_diag_deg = math.hypot(width, height) / factor / 2 * scale_deg
    near = cos_sep > math.cos(math.radians(min(89.0, half_diag_deg * 1.5 + 1)))

    idx = np.nonzero(near)[0]
    if not len(idx):
        return []
    xs, ys = wcs.all_world2pix(ras[idx], decs[idx], 0)
    arcsec_per_px = scale_deg * 3600 / factor
    kept = []
    for i, x, y in zip(idx, xs, ys):
        px, py = (x + 0.5) * factor - 0.5, (y + 0.5) * factor - 0.5
        if not (0 <= px < width and 0 <= py < height):
            continue
        obj = objects[i]
        obj.x, obj.y = float(px), float(py)
        obj.radius_px = (obj.size_arcmin or 0) * 60 / 2 / arcsec_per_px
        kept.append(obj)
    return kept


def score(obj: SkyObject, short_edge: float) -> float:
    """Classement inspiré d'InstaSlice : notoriété d'abord, puis éclat, taille apparente et type."""
    if obj.id.startswith('M '):
        fame = 60
    elif obj.common_name:
        fame = 38
    else:
        fame = 10
    brightness = obj.mag if obj.mag is not None else 13
    if obj.category == 'star':
        return fame * 1000 + 17 - brightness * 1.15
    known = 22 if obj.id.startswith('M ') else 3 if re.match(r'^(NGC|IC) \d', obj.id) else 0
    apparent = min(8, math.log2(1 + 75 * obj.radius_px / short_edge) * 2.4)
    nebula = 4 if obj.category == 'nebula' else 0
    # POURQUOI : une nébuleuse plus grande que la photo n'a pas de bord visible, l'anneau ne montrerait rien.
    oversize = -6 if obj.radius_px * 2 > short_edge * 1.6 else 0
    return fame * 1000 + 19 - brightness + known + (3 if obj.common_name else 0) + apparent + nebula + oversize


def is_duplicate(candidate: SkyObject, kept: list[SkyObject], arcsec_per_px: float) -> bool:
    """Même objet sous un autre nom dans un autre catalogue (Sh2-x = NGC y) : positions et tailles proches."""
    for other in kept:
        if candidate.source == other.source:
            continue                                            # POURQUOI : un même catalogue ne se cite pas deux fois (NGC 2032 ≠ NGC 2035).
        distance_arcmin = math.hypot(candidate.x - other.x, candidate.y - other.y) * arcsec_per_px / 60
        size_a, size_b = candidate.size_arcmin or 0, other.size_arcmin or 0
        tolerance = max(1.5, 0.3 * max(size_a, size_b))
        similar = not size_a or not size_b or max(size_a, size_b) / max(0.1, min(size_a, size_b)) < 3
        if distance_arcmin < tolerance and similar:
            return True
    return False


def select_targets(objects: list[SkyObject], count: int, width: int, height: int, arcsec_per_px: float) -> list[SkyObject]:
    short_edge = min(width, height)
    for obj in objects:
        obj.rank = score(obj, short_edge)
    # OpenNGC passe avant les instantanés à rang égal : ses positions sont plus précises.
    ordered = sorted(objects, key=lambda o: (-o.rank, o.source != 'OpenNGC', o.id))
    kept: list[SkyObject] = []
    for obj in ordered:
        if obj.category == 'star':
            continue                                            # POURQUOI : les étoiles du NGC sont des erreurs historiques, pas des cibles.
        if is_duplicate(obj, kept, arcsec_per_px):
            continue
        kept.append(obj)
        if len(kept) >= count:
            break
    return kept


# ---------------------------------------------------------------------------
# Texte en tracés (police Inter du site)
# ---------------------------------------------------------------------------

class FontPaths:
    """Convertit du texte en tracés SVG avec une police du site, et mesure sa largeur."""

    def __init__(self, path: Path):
        self.font = TTFont(path)
        self.cmap = self.font.getBestCmap()
        self.glyphs = self.font.getGlyphSet()
        self.hmtx = self.font['hmtx']
        self.upm = self.font['head'].unitsPerEm
        hhea = self.font['hhea']
        # POURQUOI : reproduit `textBaseline = 'top'` du canvas (haut de la boîte em) pour garder les proportions d'InstaSlice.
        self.top_to_baseline = hhea.ascent / (hhea.ascent - hhea.descent)

    def _glyph(self, char: str) -> str:
        return self.cmap.get(ord(char)) or self.cmap.get(ord('?'))

    def width(self, text: str, size: float) -> float:
        return sum(self.hmtx[self._glyph(c)][0] for c in text) * size / self.upm

    def path(self, text: str, size: float, x: float, top: float) -> str:
        scale = size / self.upm
        baseline = top + size * self.top_to_baseline
        pen = SVGPathPen(self.glyphs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
        cursor = x
        for char in text:
            name = self._glyph(char)
            self.glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
            cursor += self.hmtx[name][0] * scale
        return pen.getCommands()


# ---------------------------------------------------------------------------
# Mise en page des étiquettes
# ---------------------------------------------------------------------------

@dataclass
class Label:
    obj: SkyObject
    title: str
    sub: str
    ring_r: float
    w: float = 0
    h: float = 0
    rect: tuple[float, float, float, float] | None = None   # gauche, haut, largeur, hauteur
    end: tuple[float, float] | None = None                  # bout du soulignement où arrive le trait de rappel
    on_right: bool = True
    above: bool = True


def _rects_overlap(a, b, margin=0.0) -> bool:
    return not (a[0] + a[2] + margin <= b[0] or b[0] + b[2] + margin <= a[0] or a[1] + a[3] + margin <= b[1] or b[1] + b[3] + margin <= a[1])


def _circle_rect_overlap(cx, cy, r, rect) -> bool:
    nx = min(max(cx, rect[0]), rect[0] + rect[2])
    ny = min(max(cy, rect[1]), rect[1] + rect[3])
    return math.hypot(cx - nx, cy - ny) < r


def _segment_circle_overlap(p, q, cx, cy, r) -> bool:
    dx, dy = q[0] - p[0], q[1] - p[1]
    length2 = dx * dx + dy * dy or 1e-9
    t = max(0.0, min(1.0, ((cx - p[0]) * dx + (cy - p[1]) * dy) / length2))
    return math.hypot(p[0] + t * dx - cx, p[1] + t * dy - cy) < r


def _segments_cross(p1, p2, p3, p4) -> bool:
    def orient(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return orient(p1, p2, p3) * orient(p1, p2, p4) < 0 and orient(p3, p4, p1) * orient(p3, p4, p2) < 0


def _segment_rect_overlap(p, q, rect) -> bool:
    l, t, w, h = rect
    if _rects_overlap((min(p[0], q[0]), min(p[1], q[1]), abs(q[0] - p[0]) or 0.01, abs(q[1] - p[1]) or 0.01), rect) is False:
        return False
    if l <= p[0] <= l + w and t <= p[1] <= t + h:
        return True
    corners = [(l, t), (l + w, t), (l + w, t + h), (l, t + h)]
    return any(_segments_cross(p, q, corners[i], corners[(i + 1) % 4]) for i in range(4))


def layout_labels(labels: list[Label], width: int, height: int, tu: float) -> None:
    """Place chaque étiquette autour de son anneau : la plus proche, en haut à droite de préférence, sans recouvrement."""
    margin = tu * 0.35
    placed_rects: list[tuple] = []
    placed_leaders: list[tuple] = []
    rings = [(lb.obj.x, lb.obj.y, lb.ring_r) for lb in labels]
    # Directions essayées, de la préférée (haut-droite, réglage « tr » d'InstaSlice) à la moins naturelle.
    directions = [(-45, 0), (-135, 0.6), (45, 0.9), (135, 1.3), (0, 1.6), (180, 1.9), (-70, 1.2), (-110, 1.5), (70, 1.7), (110, 2.0)]
    gaps = [0.6, 1.2, 2.0, 3.2, 4.8, 7.0]

    for index, lb in enumerate(labels):
        cx, cy, R = lb.obj.x, lb.obj.y, lb.ring_r
        best = None
        for angle, preference in directions:
            ux, uy = math.cos(math.radians(angle)), math.sin(math.radians(angle))
            for gap_index, gap in enumerate(gaps):
                reach = R + gap * tu
                ex, ey = cx + ux * reach, cy + uy * reach
                on_right = ux >= -1e-6 if abs(ux) > 0.2 else angle in (-70, 70, 0)
                above = uy <= 0
                left = ex if on_right else ex - lb.w
                top = ey - lb.h if above else ey
                rect = (left, top, lb.w, lb.h)
                if left < margin * 0.5 or top < margin * 0.5 or left + lb.w > width - margin * 0.5 or top + lb.h > height - margin * 0.5:
                    continue
                start = (cx + ux * R, cy + uy * R)
                end = (ex, ey)
                penalty = preference * 1.5 + gap_index * 1.0
                if any(_rects_overlap(rect, other, margin) for other in placed_rects):
                    penalty += 60
                for j, (ox, oy, orr) in enumerate(rings):
                    if j == index:
                        if _circle_rect_overlap(ox, oy, orr + tu * 0.1, rect):
                            penalty += 40
                        continue
                    if _circle_rect_overlap(ox, oy, orr + tu * 0.15, rect):
                        penalty += 25
                    if _segment_circle_overlap(start, end, ox, oy, orr):
                        penalty += 10
                for leader in placed_leaders:
                    if _segment_rect_overlap(leader[0], leader[1], rect):
                        penalty += 30
                    if _segments_cross(start, end, leader[0], leader[1]):
                        penalty += 12
                for other in placed_rects:
                    if _segment_rect_overlap(start, end, other):
                        penalty += 20
                if best is None or penalty < best[0]:
                    best = (penalty, rect, end, on_right, above, start)
                if penalty < 3:
                    break
            if best and best[0] < 3:
                break
        if best is None:
            continue                                            # POURQUOI : aucune place dans le cadre, l'anneau reste seul.
        _, lb.rect, lb.end, lb.on_right, lb.above, start = best
        placed_rects.append(lb.rect)
        placed_leaders.append((start, lb.end))


# ---------------------------------------------------------------------------
# Rendu SVG
# ---------------------------------------------------------------------------

def _fmt(value: float) -> str:
    return f'{value:.1f}'.rstrip('0').rstrip('.')


def _escape(text: str) -> str:
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def format_sub(obj: SkyObject) -> str:
    if obj.mag is None:
        return obj.type_label
    return f'{obj.type_label} · mag {obj.mag:.1f}'.replace('.', ',')


def leader_path(start, label: Label, tu: float) -> str:
    """Trait de rappel et soulignement en un seul tracé, avec un coude arrondi (comme InstaSlice 3.36)."""
    left, top, w, h = label.rect
    shelf_y = top + h if label.above else top
    ex = label.end[0]
    far_x = left + w if label.on_right else left
    corner = (ex, shelf_y)
    length_leader = math.hypot(corner[0] - start[0], corner[1] - start[1])
    radius = min(tu * 0.9, length_leader * 0.45, abs(far_x - ex) * 0.45)
    if length_leader < 1 or radius < 0.5:
        return f'M{_fmt(start[0])} {_fmt(start[1])}L{_fmt(ex)} {_fmt(shelf_y)}L{_fmt(far_x)} {_fmt(shelf_y)}'
    # Points de tangence du coude : sur le trait de rappel, puis sur le soulignement.
    ux, uy = (start[0] - corner[0]) / length_leader, (start[1] - corner[1]) / length_leader
    vx = 1.0 if far_x > ex else -1.0
    cos_angle = ux * vx
    half = math.acos(max(-1.0, min(1.0, cos_angle))) / 2
    tangent = radius / math.tan(half) if half > 1e-3 else 0
    tangent = min(tangent, length_leader * 0.9, abs(far_x - ex) * 0.9)
    p1 = (corner[0] + ux * tangent, corner[1] + uy * tangent)
    p2 = (corner[0] + vx * tangent, corner[1])
    sweep = 1 if (ux * 0 - uy * vx) < 0 else 0
    return (f'M{_fmt(start[0])} {_fmt(start[1])}L{_fmt(p1[0])} {_fmt(p1[1])}'
            f'A{_fmt(radius)} {_fmt(radius)} 0 0 {sweep} {_fmt(p2[0])} {_fmt(p2[1])}L{_fmt(far_x)} {_fmt(shelf_y)}')


def render_svg(targets: list[SkyObject], width: int, height: int, color: str, show_sub: bool) -> tuple[str, list[Label]]:
    """Construit le calque. Toutes les tailles dépendent du petit côté de la photo, comme dans InstaSlice."""
    short_edge = min(width, height)
    u = max(13.0, short_edge * 0.030)                           # unité de base (baseUnit)
    tu = u                                                      # unité de texte (textUnit, image entière)
    line_w = max(1.1, tu * 0.05)
    keyline_w = line_w + max(1.4, line_w * 1.1)
    title_size = max(7.0, tu * 0.70)
    sub_size = max(6.0, title_size * 0.78)
    pad = 0.1 * tu

    title_font = FontPaths(FONT_DIR / 'inter-latin-600-normal.woff2')
    sub_font = FontPaths(FONT_DIR / 'inter-latin-400-normal.woff2')

    labels = []
    for obj in targets:
        # Anneau un peu plus grand que l'objet (1,2×), jamais plus petit qu'un repère lisible ni démesuré.
        rad_mult = max(0.5, min(8.0, obj.radius_px * 1.2 / (u * 1.05))) if obj.radius_px > 0 else 0.55
        ring_r = u * 1.05 * rad_mult * 0.96
        sub = format_sub(obj) if show_sub else ''
        lb = Label(obj=obj, title=obj.id, sub=sub, ring_r=ring_r)
        text_w = max(title_font.width(lb.title, title_size), sub_font.width(sub, sub_size) if sub else 0)
        lb.w = text_w + pad * 2
        lb.h = title_size * 1.22 + pad * 2 + (sub_size * 1.34 if sub else 0)
        labels.append(lb)

    layout_labels(labels, width, height, tu)

    halo_title = max(1.5, min(title_size * 0.16, 4.5))
    halo_sub = max(1.5, min(sub_size * 0.16, 4.5))
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'preserveAspectRatio="xMidYMid meet" role="img" aria-label="Objets annotés : {_escape(", ".join(t.id for t in targets))}">',
        f'<g fill="none" stroke-linecap="round" stroke-linejoin="round">',
    ]
    for lb in labels:
        obj = lb.obj
        out.append(f'<g class="annotation" data-id="{_escape(obj.id)}"><title>{_escape(obj.id + (" — " + lb.sub if lb.sub else ""))}</title>')
        shapes = [f'<circle cx="{_fmt(obj.x)}" cy="{_fmt(obj.y)}" r="{_fmt(lb.ring_r)}"/>']
        if lb.rect:
            ux, uy = lb.end[0] - obj.x, (lb.rect[1] + lb.rect[3] if lb.above else lb.rect[1]) - obj.y
            norm = math.hypot(ux, uy) or 1
            start = (obj.x + ux / norm * lb.ring_r, obj.y + uy / norm * lb.ring_r)
            shapes.append(f'<path d="{leader_path(start, lb, tu)}"/>')
        # Liseré sombre sous la couleur : garde les traits fins lisibles sur la nébulosité.
        out.append(f'<g stroke="{KEYLINE}" stroke-width="{_fmt(keyline_w)}">{"".join(shapes)}</g>')
        out.append(f'<g stroke="{color}" stroke-width="{_fmt(line_w)}">{"".join(shapes)}</g>')
        if lb.rect:
            left, top, w, _ = lb.rect
            text_x = (left + pad) if lb.on_right else None
            title_w = title_font.width(lb.title, title_size)
            tx = text_x if lb.on_right else left + w - pad - title_w
            y = top + pad
            title_d = title_font.path(lb.title, title_size, tx, y)
            out.append(f'<path d="{title_d}" fill="{TITLE_FILL}" stroke="{TEXT_HALO}" stroke-width="{_fmt(halo_title)}" paint-order="stroke"/>')
            if lb.sub:
                y += title_size * 1.22
                sub_w = sub_font.width(lb.sub, sub_size)
                sx = text_x if lb.on_right else left + w - pad - sub_w
                sub_d = sub_font.path(lb.sub, sub_size, sx, y)
                out.append(f'<path d="{sub_d}" fill="{SUB_FILL}" stroke="{TEXT_HALO}" stroke-width="{_fmt(halo_sub)}" paint-order="stroke"/>')
        out.append('</g>')
    out.append('</g></svg>')
    return '\n'.join(out), labels


def write_preview(image_path: Path, svg_path: Path) -> Path:
    html_path = svg_path.with_suffix('.html')
    image_rel = os.path.relpath(image_path.resolve(), html_path.parent.resolve())
    svg_rel = os.path.relpath(svg_path.resolve(), html_path.parent.resolve())
    html_path.write_text(f'''<!doctype html><meta charset="utf-8"><title>{_escape(image_path.stem)}</title>
<style>body{{margin:0;background:#0d1117}}figure{{position:relative;margin:0 auto;max-width:min(100vw,900px)}}
figure img{{display:block;width:100%;height:auto}}figure img+img{{position:absolute;inset:0}}</style>
<figure><img src="{image_rel}" alt=""><img src="{svg_rel}" alt="Annotations"></figure>
''', encoding='utf-8')
    return html_path


# ---------------------------------------------------------------------------

def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Calque SVG d’annotations pour une astrophoto (nova.astrometry.net).')
    parser.add_argument('image', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--wcs', type=Path)
    parser.add_argument('--solved-width', type=int)
    parser.add_argument('--count', type=int, default=20)
    parser.add_argument('--color', default=DEFAULT_COLOR)
    parser.add_argument('--no-sub', action='store_true')
    parser.add_argument('--ra', type=float)
    parser.add_argument('--dec', type=float)
    parser.add_argument('--radius', type=float)
    parser.add_argument('--force-solve', action='store_true')
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', args.color):
        parser.error('--color attend une couleur #RRGGBB')
    if args.count < 1:
        parser.error('--count doit être positif')
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    image_path = args.image.resolve()
    if not image_path.exists():
        print(f'Photo introuvable : {image_path}', file=sys.stderr)
        return 1
    with Image.open(image_path) as img:
        width, height = img.size

    try:
        wcs, factor = load_or_solve_wcs(image_path, args)
    except Exception as error:                                   # noqa: BLE001 — message lisible, code de sortie 1
        print(f'Échec de la résolution : {error}', file=sys.stderr)
        return 1

    center = [float(v) for v in wcs.pixel_to_world_values((width / factor) / 2, (height / factor) / 2)]
    arcsec_per_px = pixel_scale_deg(wcs) * 3600 / factor
    print(f'Centre RA {center[0]:.4f}° Dec {center[1]:+.4f}°, {arcsec_per_px:.2f}″/px, '
          f'champ {width * arcsec_per_px / 60:.1f}′ × {height * arcsec_per_px / 60:.1f}′')

    catalogue = load_openngc() + load_site_catalogues()
    in_frame = project_objects(catalogue, wcs, factor, width, height)
    targets = select_targets(in_frame, args.count, width, height, arcsec_per_px)
    print(f'{len(in_frame)} objets dans le champ, {len(targets)} annotés : {", ".join(t.id for t in targets)}')

    svg, labels = render_svg(targets, width, height, args.color.upper(), not args.no_sub)
    out_path = args.out or (WORK_DIR / f'{image_path.stem}.svg')
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(svg, encoding='utf-8')
    print(f'Calque : {out_path}')

    if args.json:
        json_path = out_path.with_suffix('.json')
        json_path.write_text(json.dumps({
            'image': image_path.name, 'width': width, 'height': height,
            'center': {'ra': center[0], 'dec': center[1]}, 'arcsecPerPixel': arcsec_per_px,
            'targets': [{'id': lb.obj.id, 'source': lb.obj.source, 'type': lb.obj.type_label, 'mag': lb.obj.mag,
                         'ra': lb.obj.ra, 'dec': lb.obj.dec, 'x': round(lb.obj.x, 1), 'y': round(lb.obj.y, 1),
                         'ringRadius': round(lb.ring_r, 1), 'labelled': lb.rect is not None} for lb in labels],
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'Liste : {json_path}')
    if args.preview:
        print(f'Aperçu : {write_preview(image_path, out_path)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
