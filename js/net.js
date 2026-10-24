import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 60 }, heartbeatIntervalMs: 15000 },
});

// A room is one Supabase Realtime channel: presence tracks who is here,
// broadcast carries game messages. No database rows are needed to play.
// If the connection drops, the room rejoins on its own with the same id.
export class Room {
  constructor(code, me, { onMsg, onPresence, onStatus }) {
    this.code = code;
    this.me = me;
    this.joinedAt = Date.now();
    this.handlers = { onMsg, onPresence, onStatus };
    this.meta = { name: me.name, role: me.role, dim: me.dim };
    this.retry = 0;
    this.closed = false;
    this.connected = false;
    this.onVisible = () => { if (!document.hidden && !this.connected && !this.closed) this.reconnect(0); };
    document.addEventListener('visibilitychange', this.onVisible);
    addEventListener('online', this.onVisible);
    this.connect();
  }

  connect() {
    const ch = sb.channel('dimensional:' + this.code, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.me.id } },
    });
    this.ch = ch;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      if (ch !== this.ch) return;
      if (payload && typeof payload.t === 'string') this.handlers.onMsg(payload.t, payload.d || {});
    })
      .on('presence', { event: 'sync' }, () => { if (ch === this.ch) this.handlers.onPresence(this.roster()); })
      .subscribe(async status => {
        if (ch !== this.ch) return;
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          this.retry = 0;
          this.handlers.onStatus?.('connected');
          await ch.track({ ...this.meta, joinedAt: this.joinedAt });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connected = false;
          if (this.closed) return;
          this.handlers.onStatus?.('reconnecting');
          this.reconnect();
        }
      });
  }

  reconnect(delay) {
    clearTimeout(this.timer);
    const wait = delay ?? Math.min(10000, 800 * 2 ** this.retry++);
    this.timer = setTimeout(() => {
      if (this.closed) return;
      const old = this.ch;
      this.ch = null;
      sb.removeChannel(old);
      this.connect();
    }, wait);
  }

  // update what other players see about me (name, role, chosen dimension)
  async update(meta) {
    Object.assign(this.meta, meta);
    if (this.connected) await this.ch.track({ ...this.meta, joinedAt: this.joinedAt });
  }

  send(t, d) {
    if (this.connected) this.ch.send({ type: 'broadcast', event: 'm', payload: { t, d } });
  }

  roster() {
    const state = this.ch.presenceState();
    return Object.entries(state)
      .map(([id, metas]) => {
        const m = metas[metas.length - 1] || {};
        return { id, name: String(m.name || 'Player').slice(0, 14), joinedAt: Number(m.joinedAt) || 0,
          role: typeof m.role === 'string' ? m.role : 'runner', dim: typeof m.dim === 'string' ? m.dim : '' };
      })
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
  }

  leave() {
    this.closed = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
    removeEventListener('online', this.onVisible);
    if (this.ch) sb.removeChannel(this.ch);
  }
}

export async function fetchLeaderboard(mode = 'story') {
  let q = sb.from('dim_clears').select('players,player_count,time_ms,score,created_at').eq('mode', mode);
  q = mode === 'survival' ? q.order('score', { ascending: false }).order('time_ms', { ascending: true }) : q.order('time_ms', { ascending: true });
  const { data, error } = await q.limit(mode === 'survival' ? 5 : 8);
  if (error) throw error;
  return data;
}

export async function recordClear(room, players, ms, mode = 'story', score = null) {
  const { error } = await sb.from('dim_clears').insert({ room, players, player_count: players.length, time_ms: ms, mode, score });
  if (error) console.warn('leaderboard insert failed', error);
}
