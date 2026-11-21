import { render } from '@testing-library/react';
import { describe, it, vi } from 'vitest';
import BlogEditor from './BlogEditor';

// Mock fetch globally so that it doesn't fail on network requests
global.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
    }),
);

describe('BlogEditor Component', () => {
    it('renders without crashing', () => {
        render(<BlogEditor />);
        console.log('Successfully mounted BlogEditor without crashing!');
    });
});
