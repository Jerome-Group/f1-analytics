// The shared package `server/` and `web/` both import. Importing anything from `domain/` by a
// deeper path is how the two sides start disagreeing about what the model is.

export type {
  Compound,
  Driver,
  DriverNumber,
  Sector,
  SectorBests,
  SectorStatus,
  Sectors,
  Separation,
  SessionState,
  Tyre,
} from './session-state.ts';
export type { SessionStateMessage } from './wire.ts';
