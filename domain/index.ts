// The shared package `server/` and `web/` both import. Importing anything from `domain/` by a
// deeper path is how the two sides start disagreeing about what the model is.

export type { Catalogue, CatalogueMeeting, CatalogueSession } from './catalogue.ts';
export type {
  Compound,
  Driver,
  DriverNumber,
  DriverState,
  Flag,
  Lap,
  LapDetail,
  LapSector,
  Mode,
  OpenedDriver,
  RaceControlMessage,
  Radio,
  Reading,
  ReplayClock,
  Sector,
  SectorBests,
  SectorStatus,
  Sectors,
  Separation,
  SessionClock,
  SessionIdentity,
  SessionState,
  Stint,
  Tyre,
  Weather,
} from './session-state.ts';
export { byPosition } from './ordering.ts';
export { applyChange, clientControl } from './wire.ts';
export type {
  ClientControl,
  GlobalField,
  OpenControl,
  ReplayControl,
  SessionChange,
  SessionChangeMessage,
  SessionStateMessage,
  WireMessage,
} from './wire.ts';
