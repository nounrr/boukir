/**
 * What the Maalem and the client say about a mission, read back for the team.
 * - The Maalem's comments are dated lines in the report's observations (written by the app and the website);
 *   a line starting with "PROBLÈME : " is a problem the team must act on.
 * - The client's verdict on the finished work is a shared note starting with
 *   "Travaux validés par le client" or "RÉCLAMATION CLIENT".
 */

export type MissionNote = { at: string; text: string; photo: boolean; problem: boolean };

const LINE = /^\[(\d{2}\/\d{2} \d{2}:\d{2})\]\s?(.*)$/;
const PROBLEM_MARK = 'PROBLÈME : ';
const PHOTO_MARK = '(photo jointe)';

/** The Maalem's comments, newest first. */
export function parseMissionNotes(observations: string | null | undefined): MissionNote[] {
  const notes: MissionNote[] = [];
  for (const raw of (observations ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = LINE.exec(line);
    let body = match ? match[2] : line;
    const problem = body.startsWith(PROBLEM_MARK);
    if (problem) body = body.slice(PROBLEM_MARK.length);
    const photo = body.endsWith(PHOTO_MARK);
    notes.push({ at: match ? match[1] : '', text: photo ? body.slice(0, -PHOTO_MARK.length).trim() : body, photo, problem });
  }
  return notes.reverse();
}

export type ClientVerdict = { kind: 'validated' | 'complaint'; comment: string | null; at: string; by: string | null };

const VERDICT_PREFIX = { validated: 'Travaux validés par le client', complaint: 'RÉCLAMATION CLIENT' } as const;

/** The client's last verdict, from the request's notes (null when none yet). */
export function clientVerdictFromNotes(notes: Array<{ visibility?: string; body: string; actor_name?: string | null; created_at: string }>): ClientVerdict | null {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const note = notes[i];
    for (const kind of ['complaint', 'validated'] as const) {
      const prefix = VERDICT_PREFIX[kind];
      if (!note.body.startsWith(prefix)) continue;
      const rest = note.body.slice(prefix.length).replace(/^\s*:\s*/, '').trim();
      return { kind, comment: rest || null, at: note.created_at, by: note.actor_name ?? null };
    }
  }
  return null;
}
