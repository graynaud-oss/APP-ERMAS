import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
    '../../supabase/migrations/20260818000000_automatic_first_device_enrollment.sql',
    import.meta.url
);
const migration = await readFile(migrationUrl, 'utf8');
const sqlWithoutComments = migration
    .replace(/--.*$/gm, '')
    .trim();

test('V10 versionne uniquement le default serveur du premier enrôlement', () => {
    assert.equal(
        sqlWithoutComments,
        'ALTER TABLE public.profiles\nALTER COLUMN device_enrollment_allowed SET DEFAULT true;'
    );
});

test('V10 ne modifie ni données, ni RPC, ni sécurité Supabase', () => {
    assert.doesNotMatch(sqlWithoutComments, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    assert.doesNotMatch(sqlWithoutComments, /\b(?:CREATE|DROP|GRANT|REVOKE)\b/i);
    assert.doesNotMatch(sqlWithoutComments, /\b(?:POLICY|FUNCTION|TRIGGER|RLS)\b/i);
});
