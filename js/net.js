import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 40 } },
});

// A room is one Supabase Realtime channel: presence tracks who is here,
// broadcast carries game messages. No database rows are needed to play.
export class Room {
  constructor(code, me, { onMsg, onPresence, onStatus }) {
    this.code = code;
    this.me = me;
    this.joinedAt = Date.now();
    this.ch = sb.channel('dimensional:' + code, {
      config: { broadcast: { self: false, ack: false }, presence: { key: me.id } },
    });
    this.ch
      .on('broadcast', { event: 'm' }, ({ payload }) => {
        if (payload && typeof payload.t === 'string') onMsg(payload.t, payload.d || {});
      })
      .on('presence', { event: 'sync' }, () => onPresence(this.roster()))
      .subscribe(async status => {
        onStatus?.(status);
        if (status === 'SUBSCRIBED') await this.ch.track({ name: me.name, joinedAt: this.joinedAt });
      });
  }
  send(t, d) {
    this.ch.send({ type: 'broadcast', event: 'm', payload: { t, d } });
  }
  roster() {
    const state = this.ch.presenceState();
    return Object.entries(state)
      .map(([id, metas]) => ({ id, name: String(metas[0]?.name || 'Player').slice(0, 14), joinedAt: Number(metas[0]?.joinedAt) || 0 }))
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
  }
  leave() {
    sb.removeChannel(this.ch);
  }
}

export async function fetchLeaderboard() {
  const { data, error } = await sb
    .from('dim_clears')
    .select('players,player_count,time_ms,created_at')
    .order('time_ms', { ascending: true })
    .limit(8);
  if (error) throw error;
  return data;
}

export async function recordClear(room, players, ms) {
  const { error } = await sb.from('dim_clears').insert({ room, players, player_count: players.length, time_ms: ms });
  if (error) console.warn('leaderboard insert failed', error);
}
