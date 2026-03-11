import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SERVICES_DIR = join(import.meta.dirname, '.');

// Get all service JS files (exclude test files)
const serviceFiles = readdirSync(SERVICES_DIR)
    .filter(f => f.endsWith('.js') && !f.includes('.test.'));

describe('service module cached imports', () => {
    it('fs() helper must not call itself recursively', () => {
        for (const file of serviceFiles) {
            const code = readFileSync(join(SERVICES_DIR, file), 'utf-8');

            // If the file defines an async function fs(), check it doesn't call fs() inside
            const fsMatch = code.match(/async function fs\(\)\s*\{([^}]+)\}/);
            if (!fsMatch) continue;

            const body = fsMatch[1];
            // The body should contain `await import(` — not `= fs()`
            expect(body, `${file}: fs() must not call itself`).not.toMatch(/=\s*fs\(\)/);
            expect(body, `${file}: fs() must use await import()`).toMatch(/await import\(/);
        }
    });

    it('all fs() call sites must use await', () => {
        for (const file of serviceFiles) {
            const code = readFileSync(join(SERVICES_DIR, file), 'utf-8');

            // Skip files without fs() helper
            if (!code.includes('async function fs()')) continue;

            const lines = code.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Skip the fs() function definition itself
                if (line.match(/async function fs\(\)/)) continue;
                // If line calls fs(), it must be awaited
                if (line.match(/=\s*fs\(\)/) && !line.match(/await\s+fs\(\)/)) {
                    expect.fail(`${file}:${i + 1}: fs() called without await: ${line.trim()}`);
                }
            }
        }
    });
});

describe('store shallowEqual', () => {
    it('detects identical Firestore-style arrays as equal', async () => {
        const { set, get, subscribe } = await import('../store.js');
        let callCount = 0;
        const unsub = subscribe('_test_arr', () => callCount++);

        const arr1 = [{ id: '1', name: 'Alice', amount: 100 }, { id: '2', name: 'Bob', amount: 200 }];
        const arr2 = [{ id: '1', name: 'Alice', amount: 100 }, { id: '2', name: 'Bob', amount: 200 }];

        set('_test_arr', arr1);
        expect(callCount).toBe(1); // first set always fires

        set('_test_arr', arr2); // same data, new references
        expect(callCount).toBe(1); // should NOT fire again

        // But a real change should fire
        const arr3 = [{ id: '1', name: 'Alice', amount: 999 }, { id: '2', name: 'Bob', amount: 200 }];
        set('_test_arr', arr3);
        expect(callCount).toBe(2);

        unsub();
    });
});
