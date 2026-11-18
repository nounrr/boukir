import assert from 'node:assert/strict';
import test from 'node:test';

import { clientVerdictFromNotes, parseMissionNotes } from './missionNotes.ts';

test('les commentaires du Maalem sont lus avec date, problème et photo', () => {
  const notes = parseMissionNotes('[17/11 09:05] Arrivé\n[17/11 10:12] PROBLÈME : Tuyau cassé (photo jointe)');
  assert.deepEqual(notes[0], { at: '17/11 10:12', text: 'Tuyau cassé', photo: true, problem: true });
  assert.deepEqual(notes[1], { at: '17/11 09:05', text: 'Arrivé', photo: false, problem: false });
  assert.deepEqual(parseMissionNotes(null), []);
  // Old free text (written before the dated lines) still shows.
  assert.equal(parseMissionNotes('RAS')[0].text, 'RAS');
});

test('le dernier avis du client est retrouvé dans les notes', () => {
  const notes = [
    { body: 'Instruction équipe', created_at: '2026-11-16' },
    { body: 'Travaux validés par le client', actor_name: 'Client A', created_at: '2026-11-17' },
    { body: 'RÉCLAMATION CLIENT : joint qui fuit encore', actor_name: 'Client A', created_at: '2026-11-18' },
  ];
  assert.deepEqual(clientVerdictFromNotes(notes), { kind: 'complaint', comment: 'joint qui fuit encore', at: '2026-11-18', by: 'Client A', rating: null });
  assert.deepEqual(clientVerdictFromNotes(notes.slice(0, 2)), { kind: 'validated', comment: null, at: '2026-11-17', by: 'Client A', rating: null });
  // With the stars given in the same step.
  assert.deepEqual(clientVerdictFromNotes([{ body: 'Travaux validés par le client · ★ 4/5 : Très propre', actor_name: 'B', created_at: 'x' }]),
    { kind: 'validated', comment: 'Très propre', at: 'x', by: 'B', rating: 4 });
  assert.equal(clientVerdictFromNotes([{ body: 'RÉCLAMATION CLIENT · ★ 1/5 : Fuite', created_at: 'y' }])?.rating, 1);
  assert.equal(clientVerdictFromNotes([]), null);
});
