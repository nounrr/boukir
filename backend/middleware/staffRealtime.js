import { areaOf, isMutation, staffEventOf } from '../utils/staffEvents.js';

/**
 * After every change that succeeded (a bon, a payment, a product, a contact...):
 *  - every open team app is told which part to reload (`staff:changed`), so nobody has to refresh by hand;
 *  - the important actions also become a notification on the team's phones (see utils/staffEvents.js).
 * One place for the whole API: the routes themselves are not touched.
 */
export function createStaffRealtime(deps = {}) {
  return function notifyStaffChanges(req, res, next) {
    // Read now: inside a mounted router Express shortens req.path, and the answer is sent from in there.
    const { method, path } = req;
    const area = isMutation(method) ? areaOf(path) : null;
    if (!area) return next();

    // Keep what the route answers (the new bon's number, the payment's amount) for the notification text.
    let answered;
    const json = res.json.bind(res);
    res.json = (body) => {
      answered = body;
      return json(body);
    };

    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const user = req.user ?? null;
      const isStaff = Boolean(user?.role) && user?.type_compte == null;
      const actorId = isStaff ? (Number(user.id) || null) : null;
      void (async () => {
        try {
          const emitChange = deps.emitChange ?? (await import('../socket/socketServer.js')).emitStaffChange;
          emitChange({ area, method, path, actorId, at: new Date().toISOString() });
        } catch (error) {
          console.warn('Staff realtime signal failed:', error?.message || error);
        }
        try {
          const event = staffEventOf({ method, path, query: req.query, body: req.body, response: answered, user });
          if (!event) return;
          const staffNotify = deps.notify && deps.nameOf ? null : await import('../utils/staffNotify.js');
          // The author's name is read only when there is something to announce.
          if (event.actor === null && actorId) event.actor = await (deps.nameOf ?? staffNotify.employeeName)(actorId);
          await (deps.notify ?? staffNotify.notifyStaff)(event, { actorId });
        } catch (error) {
          console.warn('Staff notification failed:', error?.message || error);
        }
      })();
    });

    next();
  };
}

export const notifyStaffChanges = createStaffRealtime();
