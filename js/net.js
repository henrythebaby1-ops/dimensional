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
  if (mode === 'daily') q = q.gte('created_at', new Date().toISOString().slice(0, 10) + 'T00:00:00Z');   // today's runs only
  q = mode === 'survival' ? q.order('score', { ascending: false }).order('time_ms', { ascending: true }) : q.order('time_ms', { ascending: true });
  const { data, error } = await q.limit(mode === 'survival' ? 5 : 8);
  if (error) throw error;
  return data;
}

export async function recordClear(room, players, ms, mode = 'story', score = null) {
  const { error } = await sb.from('dim_clears').insert({ room, players, player_count: players.length, time_ms: ms, mode, score });
  if (error) console.warn('leaderboard insert failed', error);
}

// Saved games given up by other players. One of them is the "help" against the Spectre.
export async function fetchGift() {
  const { data, error } = await sb.from('dim_gifts').select('name,level,created_at').order('created_at', { ascending: false }).limit(20);
  if (error || !data?.length) return null;
  return data[Math.floor(Math.random() * data.length)];
}

export async function giveGift(name, level) {
  const { error } = await sb.from('dim_gifts').insert({ name: String(name).slice(0, 14) || 'Traveler', level: Math.max(0, Math.min(100, level | 0)) });
  if (error) console.warn('gift failed', error);
}

// Public rooms: hosts of public rooms announce them on one shared channel (presence only),
// so Quick Play and the room browser can find a game without any database.
export class PublicBoard {
  constructor(onChange) {
    this.onChange = onChange;
    this.ready = false;
    this.ch = sb.channel('dimensional:public', { config: { presence: { key: 'b' + Math.random().toString(36).slice(2, 10) } } });
    this.ch.on('presence', { event: 'sync' }, () => { this.ready = true; this.onChange?.(this.list()); })
      .subscribe(status => { if (status === 'SUBSCRIBED') { this.subscribed = true; this.ch.track(this.pending || { viewer: true }); } });   // you only get the list once you're present yourself
  }
  list() {
    const out = [];
    for (const metas of Object.values(this.ch.presenceState())) {
      const m = metas[metas.length - 1];
      if (!m || typeof m.code !== 'string' || !/^[A-Z]{4}$/.test(m.code)) continue;
      out.push({ code: m.code, host: String(m.host || '?').slice(0, 14), mode: String(m.mode || ''), count: Math.max(0, m.count | 0), max: Math.max(1, m.max | 0), playing: !!m.playing });
    }
    return out.sort((a, b) => b.count - a.count);
  }
  // wait until the first presence sync (or give up after a moment) and return the rooms
  async rooms(timeout = 2500) {
    const t0 = Date.now();
    while (!this.ready && Date.now() - t0 < timeout) await new Promise(r => setTimeout(r, 100));
    return this.list();
  }
  async advertise(info) {
    this.pending = info;
    if (this.subscribed) await this.ch.track(info);
  }
  async stop() {
    this.pending = null;
    if (this.subscribed) await this.ch.track({ viewer: true });
  }
  close() { sb.removeChannel(this.ch); }
}

// ---------- accounts: username + password, progress saved in the cloud ----------
const rpc = async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
  return data;
};
export const signUp = (user, pass, save) => rpc('dim_signup', { p_user: user, p_pass: pass, p_save: save });
export const logIn = (user, pass) => rpc('dim_login', { p_user: user, p_pass: pass });
export const whoAmI = token => rpc('dim_me', { p_token: token });
export const cloudSave = (token, save) => rpc('dim_save', { p_token: token, p_save: save });
export const logOut = token => rpc('dim_logout', { p_token: token });

// ---------- player-made levels ----------
export const publishLevel = (token, name, data) => rpc('dim_publish_level', { p_token: token, p_name: name, p_data: data });
export async function browseLevels(sort = 'new') {
  const { data, error } = await sb.from('dim_levels').select('id,name,author,data,plays,likes,created_at')
    .order(sort === 'top' ? 'likes' : sort === 'played' ? 'plays' : 'created_at', { ascending: false }).limit(40);
  if (error) throw error;
  return data;
}
export async function getLevel(id) {
  const { data, error } = await sb.from('dim_levels').select('id,name,author,data,plays,likes').eq('id', id).single();
  if (error) throw error;
  return data;
}
export const levelPlayed = id => rpc('dim_level_played', { p_id: id }).catch(() => {});
export const likeLevel = id => rpc('dim_level_like', { p_id: id });

// ---------- friends ----------
export const friendRequest = (token, user) => rpc('dim_friend_request', { p_token: token, p_user: user });
export const friendRespond = (token, user, accept) => rpc('dim_friend_respond', { p_token: token, p_user: user, p_accept: accept });
export const friendList = token => rpc('dim_friend_list', { p_token: token });

// Who's online: logged-in players share their username and current room on one presence channel,
// and friends can send each other invites over it.
export class OnlineBoard {
  constructor(username, { onChange, onInvite }) {
    this.u = username;
    this.info = { u: username, room: '', mode: '' };
    this.ch = sb.channel('dimensional:online', { config: { presence: { key: username.toLowerCase() }, broadcast: { self: false } } });
    this.ch.on('presence', { event: 'sync' }, () => onChange?.(this.list()))
      .on('broadcast', { event: 'invite' }, ({ payload }) => { if (payload && String(payload.to).toLowerCase() === username.toLowerCase()) onInvite?.(payload); })
      .subscribe(st => { if (st === 'SUBSCRIBED') { this.ok = true; this.ch.track(this.info); } });
  }
  list() {
    const out = {};
    for (const [k, metas] of Object.entries(this.ch.presenceState())) { const m = metas[metas.length - 1]; if (m) out[k] = { room: /^[A-Z]{4}$/.test(m.room || '') ? m.room : '', mode: String(m.mode || '').slice(0, 30) }; }
    return out;
  }
  where(room, mode) { this.info = { ...this.info, room: room || '', mode: mode || '' }; if (this.ok) this.ch.track(this.info); }
  invite(to, room, mode) { this.ch.send({ type: 'broadcast', event: 'invite', payload: { to, from: this.u, room, mode } }); }
  close() { sb.removeChannel(this.ch); }
}
