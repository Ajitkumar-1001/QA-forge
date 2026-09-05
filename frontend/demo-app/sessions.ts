/** In-memory session store for the demo app (PRD §24) — a real store is out of scope; the point
 * of this fixture is the middleware bug below, not persistence. */
export const sessions = new Map<string, { username: string }>();
