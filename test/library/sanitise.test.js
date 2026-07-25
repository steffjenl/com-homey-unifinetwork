'use strict';

const { sanitise, formatForLog } = require('../../library/sanitise');

describe('sanitise()', () => {
    it('redacts top-level sensitive keys', () => {
        const result = sanitise({ pass: 'secret', host: '192.168.1.1' });
        expect(result.pass).toBe('[REDACTED]');
        expect(result.host).toBe('192.168.1.1');
    });

    it('redacts all known sensitive keys', () => {
        const input = {
            password: 'pw',
            token: 'tok',
            apiKey: 'key',
            cookie: 'ck',
            unifises: 'ses',
            pass: 'p',
        };
        const result = sanitise(input);
        for (const key of Object.keys(input)) {
            expect(result[key]).toBe('[REDACTED]');
        }
    });

    it('redacts nested sensitive keys', () => {
        const result = sanitise({ settings: { pass: 'secret', site: 'default' } });
        expect(result.settings.pass).toBe('[REDACTED]');
        expect(result.settings.site).toBe('default');
    });

    it('handles arrays containing objects', () => {
        const result = sanitise([{ pass: 'x', name: 'alice' }]);
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].pass).toBe('[REDACTED]');
        expect(result[0].name).toBe('alice');
    });

    it('returns primitives unchanged', () => {
        expect(sanitise('hello')).toBe('hello');
        expect(sanitise(42)).toBe(42);
        expect(sanitise(null)).toBeNull();
        expect(sanitise(true)).toBe(true);
    });

    it('does not mutate the original object', () => {
        const original = { pass: 'secret', name: 'test' };
        sanitise(original);
        expect(original.pass).toBe('secret');
    });

    it('handles circular references without overflowing the stack', () => {
        const original = { name: 'loop' };
        original.self = original;

        const result = sanitise(original);

        expect(result.name).toBe('loop');
        expect(result.self).toBe('[Circular]');
    });

    it('formats log output safely for BigInt values', () => {
        const result = formatForLog({ count: 1n, nested: { pass: 'secret' } });

        expect(result).toBe('{"count":"1","nested":{"pass":"[REDACTED]"}}');
    });
});

