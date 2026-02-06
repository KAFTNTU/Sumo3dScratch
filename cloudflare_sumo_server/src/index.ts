// Sumo Bots Server - Safe Spawn Fix
// Змінено стартові координати на +/- 100

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === "/ws") {
      if ((req.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }
      const room = url.searchParams.get("room") || "default";
      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);
      return stub.fetch(req);
    }
    return new Response("Not found", { status: 404 });
  }
};

function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
function asText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  return "";
}

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.wsByPid = { p1: null, p2: null };
    this.pidByWs = new Map();
    this.inputs = { p1: { l: 0, r: 0 }, p2: { l: 0, r: 0 } };
    
    // ПОЧАТКОВІ КООРДИНАТИ (безпечні)
    this.bots = {
      p1: { x: -100, y: 0, a: 0, vx: 0, vy: 0, wa: 0, l: 0, r: 0 },
      p2: { x: 100, y: 0, a: Math.PI, vx: 0, vy: 0, wa: 0, l: 0, r: 0 }
    };
    
    this.tick = 0;
    this.loopStarted = false;
    this.phase = "lobby";
    this.ready = { p1: false, p2: false };
    this.startDeadline = null;
  }

  connectedPids() {
    const res = [];
    if (this.wsByPid.p1) res.push("p1");
    if (this.wsByPid.p2) res.push("p2");
    return res;
  }

  bothPlayersPresent() { return !!(this.wsByPid.p1 && this.wsByPid.p2); }

  assignPid() {
    if (!this.wsByPid.p1) return "p1";
    if (!this.wsByPid.p2) return "p2";
    return null;
  }

  attachSocket(ws, pid) {
    if (this.wsByPid[pid]) this.pidByWs.delete(this.wsByPid[pid]);
    this.wsByPid[pid] = ws;
    this.pidByWs.set(ws, pid);
  }

  detachSocket(ws) {
    const pid = this.pidByWs.get(ws);
    if (!pid) return;
    this.pidByWs.delete(ws);
    if (this.wsByPid[pid] === ws) this.wsByPid[pid] = null;
  }

  visibleBots() {
    const res = {};
    for (const pid of this.connectedPids()) res[pid] = this.bots[pid];
    return res;
  }

  broadcast(obj) {
    const payload = JSON.stringify(obj);
    for (const pid of this.connectedPids()) {
      const ws = this.wsByPid[pid];
      if (ws) { try { ws.send(payload); } catch {} }
    }
  }

  broadcastRaw(payload) {
    for (const pid of this.connectedPids()) {
      const ws = this.wsByPid[pid];
      if (ws) { try { ws.send(payload); } catch {} }
    }
  }

  sendLog(ws, msg) {
    try { ws.send(JSON.stringify({ t: "debug_log", msg })); } catch {}
  }

  // СКИНДАННЯ ПОЗИЦІЙ ПЕРЕД БОЄМ
  resetBots() {
    // p1 зліва (-100), дивиться вправо (0)
    this.bots.p1 = { x: -100, y: 0, a: 0, vx: 0, vy: 0, wa: 0, l: 0, r: 0 };
    // p2 справа (100), дивиться вліво (PI)
    this.bots.p2 = { x: 100, y: 0, a: Math.PI, vx: 0, vy: 0, wa: 0, l: 0, r: 0 };
    
    this.inputs.p1 = { l: 0, r: 0 };
    this.inputs.p2 = { l: 0, r: 0 };
  }

  beginFight() {
    if (!this.bothPlayersPresent()) return;
    this.phase = "fight";
    this.startDeadline = null;
    this.ready = { p1: false, p2: false };
    this.resetBots();
    this.broadcast({ t: "control", op: "start", phase: "fight" });
  }

  endFight(reason) {
    this.phase = "lobby";
    this.startDeadline = null;
    this.ready = { p1: false, p2: false };
    this.resetBots();
    this.broadcast({ t: "control", op: "stop", reason, phase: "lobby", ready: this.ready, msLeft: 0 });
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/ws") return new Response("Use /ws endpoint");

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const pid = this.assignPid();
    if (!pid) {
      server.close(1008, "Room is full");
      return new Response("Room full", { status: 429 });
    }

    this.attachSocket(server, pid);

    server.send(JSON.stringify({
      t: "hello",
      pid,
      bots: this.visibleBots(),
      tick: this.tick,
      phase: this.phase,
      ready: this.ready
    }));

    server.addEventListener("message", (ev) => {
      try {
        const raw = asText(ev.data);
        if (!raw) return;
        const data = JSON.parse(raw);
        const who = this.pidByWs.get(server) || pid;

        if (data?.t === "input") {
          if (this.phase === "fight") {
            this.inputs[who] = {
              l: clamp(Number(data.l) || 0, -100, 100),
              r: clamp(Number(data.r) || 0, -100, 100)
            };
          }
          return;
        }

        if (data?.t === "control") {
          // this.sendLog(server, `Processing control op: "${data.op}" from ${who}`);

          if (data.op === "reset_room") {
             this.wsByPid = { p1: null, p2: null };
             this.pidByWs = new Map();
             this.ready = { p1: false, p2: false };
             this.phase = "lobby";
             this.loopStarted = false;
             this.startDeadline = null;
             this.broadcast({ t: "debug_log", msg: "ROOM FORCE RESET" });
             return;
          }

          if (data.op === "start") {
            this.ready[who] = true;
            // this.sendLog(server, `Set ready for ${who} to true.`);

            if (!this.bothPlayersPresent()) {
              // this.sendLog(server, "Waiting for opponent...");
              this.broadcast({ t: "control", op: "start", phase: "waiting_opponent", ready: this.ready, msLeft: 0 });
              return;
            }

            if (!this.startDeadline) this.startDeadline = Date.now() + 5000;

            if (this.ready.p1 && this.ready.p2) {
              // this.sendLog(server, "Both ready, starting fight!");
              this.beginFight();
            } else {
              // this.sendLog(server, "Opponent not ready yet.");
              this.broadcast({
                t: "control", op: "start", phase: "pending", ready: this.ready, msLeft: Math.max(0, this.startDeadline - Date.now())
              });
            }
            return;
          }

          if (data.op === "stop") {
            this.endFight("manual");
            return;
          }
        }
      } catch (e) {
        this.sendLog(server, `Error: ${e.message}`);
      }
    });

    server.addEventListener("close", () => {
      const leftPid = this.pidByWs.get(server) || pid;
      this.detachSocket(server);
      if (this.phase === "fight") {
        this.endFight("opponent_left");
      } else {
        if (leftPid) this.ready[leftPid] = false;
        this.startDeadline = null;
        this.broadcast({ t: "control", op: "stop", reason: "opponent_left", phase: "lobby", ready: this.ready, msLeft: 0 });
      }
    });

    if (!this.loopStarted) {
      this.loopStarted = true;
      this.state.storage.setAlarm(Date.now() + 33);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    this.tick++;
    if (this.connectedPids().length === 0) { this.loopStarted = false; return; }
    if (this.phase === "lobby" && this.startDeadline && Date.now() > this.startDeadline) { this.endFight("timeout"); }

    for (const pid of ["p1", "p2"]) {
        const b = this.bots[pid];
        const inp = this.inputs[pid];
        b.l = inp.l; b.r = inp.r;
    }

    if (this.phase === "fight") {
      this.stepBot(this.bots.p1, 1/30);
      this.stepBot(this.bots.p2, 1/30);
      this.resolveCollision();
    }

    const winner = this.phase === "fight" ? this.checkWinner() : null;
    if (winner) this.endFight(`winner_${winner}`);

    if (this.tick % 3 === 0) { 
      this.broadcastRaw(JSON.stringify({
        t: "state", tick: this.tick, bots: this.visibleBots(), winner,
        phase: this.phase, ready: this.ready,
        msLeft: this.startDeadline ? Math.max(0, this.startDeadline - Date.now()) : 0
      }));
    }
    await this.state.storage.setAlarm(Date.now() + 33);
  }

  stepBot(b, dt) {
    const maxSpeed = 240, wheelBase = 60;
    const targVL = (b.l / 100) * maxSpeed, targVR = (b.r / 100) * maxSpeed;
    const v = (targVL + targVR) * 0.5, w = (targVR - targVL) / wheelBase;
    b.vx = Math.cos(b.a) * v; b.vy = Math.sin(b.a) * v; b.wa = w;
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.wa * dt;
  }

  resolveCollision() {
    const b1 = this.bots.p1, b2 = this.bots.p2;
    const dx = b2.x - b1.x, dy = b2.y - b1.y, d = Math.hypot(dx, dy) || 1e-6;
    // Радіус колізії 44 = радіус робота (22) + радіус робота (22)
    if (d < 44) {
      const nx = dx / d, ny = dy / d, push = (44 - d) * 0.5;
      b1.x -= nx * push; b1.y -= ny * push;
      b2.x += nx * push; b2.y += ny * push;
    }
  }

  checkWinner() {
    // Радіус арени 400, радіус робота 22. Поріг вильоту = 400 - 22 = 378.
    const d1 = Math.hypot(this.bots.p1.x, this.bots.p1.y), d2 = Math.hypot(this.bots.p2.x, this.bots.p2.y);
    if (d1 > 378 && d2 <= 378) return "p2";
    if (d2 > 378 && d1 <= 378) return "p1";
    if (d1 > 378 && d2 > 378) return "draw";
    return null;
  }
}
