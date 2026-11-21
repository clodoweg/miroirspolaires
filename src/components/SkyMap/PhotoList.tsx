import React, { useState, useMemo } from 'react';
import type { Photo } from '../../lib/photos';
import { normalizeCatalog } from '../../utils/normalize';
import { composeWorkerUrl, DEFAULT_IMAGE_WORKER_URL } from '../../utils/workerUrl';

/** Vignette de 48×48 px (96 px en DPR 2), demandée au worker en w_150. */
function photoThumbnailUrl(photo: Photo): string {
    if (photo.thumbnailUrl) return photo.thumbnailUrl;
    return composeWorkerUrl(DEFAULT_IMAGE_WORKER_URL, `astrophotographies/mini/${photo.imagePath}`, {
        width: 150,
        quality: 70,
    });
}

/**
 * Vignette d'une photo, remplacée par son slug si l'image ne charge pas.
 *
 * WARNING: le repli passe par React et non par `innerHTML` : le slug peut venir de la
 * recherche de l'utilisateur (`?search=`), l'injecter tel quel ouvrait une faille XSS.
 */
function PhotoThumbnail({ photo }: { photo: Photo }) {
    const [hasFailed, setHasFailed] = useState(false);
    if (hasFailed) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-mp-ui-black/40 font-mono text-xs text-mp-text-muted">
                {photo.slug}
            </div>
        );
    }
    return (
        <img
            src={photoThumbnailUrl(photo)}
            alt={photo.title}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setHasFailed(true)}
        />
    );
}

interface PhotoListProps {
    photos: Photo[];
    onSelectPhoto: (photo: Photo) => void;
    selectedPhotoId?: number;
}

const PhotoList: React.FC<PhotoListProps> = ({ photos, onSelectPhoto, selectedPhotoId }) => {
    const [searchTerm] = useState('');

    // Filter photos based on search term (title, constellation, id)
    const filteredPhotos = useMemo(() => {
        return photos.filter((photo) => {
            // Must have coordinates to be useful on the map
            const hasCoords = photo.raVal !== null && photo.decVal !== null;
            if (!hasCoords) return false;

            const term = normalizeCatalog(searchTerm.toLowerCase());
            const title = normalizeCatalog(photo.title.toLowerCase());
            const constellation = normalizeCatalog(photo.constellation.toLowerCase());

            return title.includes(term) || constellation.includes(term) || photo.id.toString().includes(term);
        });
    }, [photos, searchTerm]);

    return (
        <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
            {/* Scrollable List */}
            <div className="custom-scrollbar space-y-1 flex-1 overflow-y-auto p-2">
                {filteredPhotos.map((photo) => (
                    <button
                        key={photo.id}
                        onClick={() => onSelectPhoto(photo)}
                        className={`group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all duration-200 hover:bg-mp-accent-light ${
                            selectedPhotoId === photo.id
                                ? 'border-mp-accent bg-mp-accent-light'
                                : 'border-transparent bg-transparent'
                        }`}
                    >
                        {/* Thumbnail */}
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-mp-border-light bg-mp-ui-black/40">
                            <PhotoThumbnail photo={photo} />
                        </div>

                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-medium text-mp-text-heading">{photo.title}</h3>
                            <p className="mt-0.5 truncate text-xs text-mp-text-muted">
                                {[photo.year || null, photo.constellation].filter(Boolean).join(' · ')}
                            </p>
                        </div>
                    </button>
                ))}

                {filteredPhotos.length === 0 && (
                    <div className="py-8 text-center text-sm text-mp-text-muted">Aucun objet trouvé.</div>
                )}
            </div>
        </div>
    );
};

export default PhotoList;
