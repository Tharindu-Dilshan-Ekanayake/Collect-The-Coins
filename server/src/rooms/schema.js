import { ArraySchema, MapSchema, Schema, defineTypes } from '@colyseus/schema'

/**
 * Synced state. Only what other clients need to see is here; the coin pool itself is
 * sent as messages (a 4,000-byte snapshot on join, then small "taken" deltas).
 */

export class LobbyPlayer extends Schema {
  constructor() {
    super()
    this.name = 'Guest'
    /** Verified Boxity account id ('' for guests): matches chat message senders. */
    this.uid = ''
    this.look = '{}'
    /** Dancing after a map clear (set for a few seconds, then cleared). */
    this.dance = false
    this.x = 0
    this.y = 0.9
    this.z = 14
    this.ry = 0
    this.speed = 0
    this.shirt = '#3b82c4'
    this.pants = '#2f3e5c'
    this.skin = '#f0c39a'
    /** Party slot the player is standing on, -1 when none. */
    this.slot = -1
  }
}
defineTypes(LobbyPlayer, {
  name: 'string',
  uid: 'string',
  look: 'string',
  dance: 'boolean',
  x: 'float32',
  y: 'float32',
  z: 'float32',
  ry: 'float32',
  speed: 'float32',
  shirt: 'string',
  pants: 'string',
  skin: 'string',
  slot: 'int8',
})

export class Slot extends Schema {
  constructor() {
    super()
    /** Session id of the party host, '' when the slot is free. */
    this.host = ''
    this.modeId = ''
    this.difficulty = 'easy'
    this.size = 4
    /** Seconds until the party leaves for the stage (server clock, so no skew). */
    this.left = 0
    this.members = new ArraySchema()
  }
}
defineTypes(Slot, {
  host: 'string',
  modeId: 'string',
  difficulty: 'string',
  size: 'uint8',
  left: 'uint8',
  members: ['string'],
})

export class LobbyState extends Schema {
  constructor() {
    super()
    this.players = new MapSchema()
    this.slots = new ArraySchema()
  }
}
defineTypes(LobbyState, { players: { map: LobbyPlayer }, slots: [Slot] })

export class StagePlayer extends Schema {
  constructor() {
    super()
    this.name = 'Guest'
    this.uid = ''
    this.look = '{}'
    this.x = 0
    this.y = 0.9
    this.z = 0
    this.ry = 0
    this.speed = 0
    this.shirt = '#3b82c4'
    this.pants = '#2f3e5c'
    this.skin = '#f0c39a'
    this.tool = 'hands'
    this.tools = new ArraySchema('hands')
    this.bag = 0
    this.bank = 0
    this.banking = false
    this.levels = new MapSchema()
    /** Last grab seq the server processed: the client drops its predictions up to here. */
    this.ack = 0
    /** Coins this player banked this run (by hand or by sprites): what they keep. */
    this.earned = 0
  }
}
defineTypes(StagePlayer, {
  name: 'string',
  uid: 'string',
  look: 'string',
  x: 'float32',
  y: 'float32',
  z: 'float32',
  ry: 'float32',
  speed: 'float32',
  shirt: 'string',
  pants: 'string',
  skin: 'string',
  tool: 'string',
  tools: ['string'],
  bag: 'uint32',
  bank: 'uint32',
  banking: 'boolean',
  levels: { map: 'uint8' },
  ack: 'uint32',
  earned: 'uint32',
})

/** A goblin helper; the room moves it, clients draw it. */
export class GoblinState extends Schema {
  constructor() {
    super()
    this.owner = ''
    this.x = 0
    this.z = 0
    this.ry = 0
    this.phase = 0
    this.carry = 0
  }
}
defineTypes(GoblinState, { owner: 'string', x: 'float32', z: 'float32', ry: 'float32', phase: 'uint8', carry: 'uint16' })

export class StageState extends Schema {
  constructor() {
    super()
    this.players = new MapSchema()
    this.goblins = new ArraySchema()
    this.modeId = 'story'
    this.difficulty = 'easy'
    this.goal = 0
    /** Coins banked by the whole party: the shared objective. */
    this.cleared = 0
    this.poolLeft = 0
    this.startedAt = 0
    this.endsAt = 0
    this.finished = false
  }
}
defineTypes(StageState, {
  players: { map: StagePlayer },
  goblins: [GoblinState],
  modeId: 'string',
  difficulty: 'string',
  goal: 'uint32',
  cleared: 'uint32',
  poolLeft: 'uint32',
  startedAt: 'float64',
  endsAt: 'float64',
  finished: 'boolean',
})
