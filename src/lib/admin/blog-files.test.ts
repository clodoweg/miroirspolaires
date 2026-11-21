import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';

// Mock promises from node:fs safely with robust synchronous mock
vi.mock('node:fs', () => {
    const mockReadFile = vi.fn().mockImplementation(async (filePath: any, _options: any) => {
        const pathStr = String(filePath);
        if (pathStr.endsWith('blog.json')) return '{}';
        if (pathStr.endsWith('alt.json'))
            return JSON.stringify({
                '/assets/blog/2026/test/test-img.jpg': 'Un magnifique paysage de test roumain',
                '/assets/blog/2026/test/existing-alt.jpg': 'Un alt existant',
            });
        return '';
    });

    const mockWriteFile = vi.fn().mockResolvedValue(undefined);
    const mockAccess = vi.fn().mockImplementation(async (p: any) => {
        if (String(p).includes('new-slug')) {
            throw new Error('File not found');
        }
        return undefined;
    });
    const mockMkdir = vi.fn().mockResolvedValue(undefined);
    const mockReaddir = vi.fn().mockResolvedValue([]);
    const mockStat = vi.fn().mockResolvedValue({ isDirectory: () => false });
    const mockUnlink = vi.fn().mockResolvedValue(undefined);
    const mockRm = vi.fn().mockResolvedValue(undefined);
    const mockRename = vi.fn().mockResolvedValue(undefined);

    const mockPromises = {
        readFile: mockReadFile,
        writeFile: mockWriteFile,
        access: mockAccess,
        mkdir: mockMkdir,
        readdir: mockReaddir,
        stat: mockStat,
        unlink: mockUnlink,
        rm: mockRm,
        rename: mockRename,
    };

    return {
        promises: mockPromises,
        default: {
            promises: mockPromises,
        },
    };
});

// Mock sharp
vi.mock('sharp', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            resize: vi.fn().mockReturnThis(),
            jpeg: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from('mockBuffer')),
        })),
    };
});

import { enrichPostMetadataAndAlts, renamePostAssets } from './blog-files';

describe('enrichPostMetadataAndAlts pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should generate reading time and fallback to word count if needed', async () => {
        const fm = {
            title: 'Road Trip en Transylvanie',
            date: '2026-05-22',
            categories: ['Récits de voyage'],
            description: 'Un super voyage en Transylvanie.',
            image: '',
        };
        const body = 'Un long article de test avec plein de mots intéressants pour estimer le temps.';

        const result = await enrichPostMetadataAndAlts('2026', 'test', fm, body);

        expect(result.frontmatter.title).toBe('Road Trip en Transylvanie');
        expect(result.readingTime).toMatch(/min$/);
        expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should replace empty image alts using alt.json matched key', async () => {
        const fm = {
            title: 'Road Trip en Transylvanie',
            date: '2026-05-22',
            categories: ['Récits de voyage'],
            description: 'Un super voyage en Transylvanie.',
            image: '',
        };
        const body =
            'Mon image vide : ![](/assets/blog/2026/test/test-img.jpg) et mon image avec alt existant : ![Alt existant](/assets/blog/2026/test/existing-alt.jpg)';

        const result = await enrichPostMetadataAndAlts('2026', 'test', fm, body);

        // Verifies empty alt was successfully replaced
        expect(result.body).toContain('![Un magnifique paysage de test roumain](/assets/blog/2026/test/test-img.jpg)');
        // Verifies existing alt is unchanged
        expect(result.body).toContain('![Alt existant](/assets/blog/2026/test/existing-alt.jpg)');
    });

    it('should always align seoDescription to match description strictly', async () => {
        const fm = {
            title: 'Test Alignement SEO',
            date: '2026-05-22',
            categories: ['Voyages'],
            description: 'Ma superbe description courte.',
            image: '',
        };
        const body = '# Un titre\nVoici un texte de blog très intéressant.';

        const result = await enrichPostMetadataAndAlts('2026', 'test', fm, body);

        expect(result.frontmatter.seoDescription).toBe('Ma superbe description courte.');
    });
});

describe('enrichPostMetadataAndAlts : chemins d’images hors src/assets', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('ne lit pas un fichier désigné par une traversée de chemin', async () => {
        const fm = { title: 'Piège', date: '2026-05-22', categories: [], description: 'd', image: '' };
        const body = 'Image piégée : ![](/assets/../../.env)';

        const result = await enrichPostMetadataAndAlts('2026', 'test', fm, body);

        expect(result.body).toContain('![](/assets/../../.env)');
        const readPaths = vi.mocked(fs.readFile).mock.calls.map(([filePath]) => String(filePath));
        expect(readPaths.some((filePath) => filePath.endsWith('.env'))).toBe(false);
    });
});

describe('renamePostAssets', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should rename assets directory if year or slug changes', async () => {
        await renamePostAssets('2026', 'old-slug', '2026', 'new-slug');
        expect(fs.rename).toHaveBeenCalled();
    });

    it('should not rename assets directory if old and new paths are identical', async () => {
        await renamePostAssets('2026', 'old-slug', '2026', 'old-slug');
        expect(fs.rename).not.toHaveBeenCalled();
    });
});
