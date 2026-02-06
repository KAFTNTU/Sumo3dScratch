export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Додав команду аварійного скидання: /reset
    if (url.pathname === "/reset") {
      const room = url.searchParams.get("room") || "default";
      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);
      return stub.fetch(req);
    }

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

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    
    // Зберігаємо підключення
    this.sockets = new Map(); // Map<WebSocket, { pid: string }>
    
    // Стан роботів (ЗМІНЕНО НА 100)
    this.bots = {
      p1: { x: -100, y: 0, a: 0, vx: 0, vy: 0, wa: 0, l: 0, r: 0 },
      p2: { x: 100, y: 0, a: Math.PI, vx: 0, vy: 0, wa: 0, l: 0, r: 0 }
    };
    
    this.inputs = { p1: { l: 0, r: 0 }, p2: { l: 0, r: 0 } };
    this.tick = 0;
    this.loopStarted = false;
    this.phase = "lobby";
    this.ready = { p1: false, p2: false };
    this.startDeadline = null;
  }

  async fetch(req) {
    const url = new URL(req.url);

    // Логіка скидання (RESET)
    if (url.pathname === "/reset") {
      for (const [ws] of this.sockets) {
        try { ws.close(1000, "reset"); } catch {}
      }
      this.sockets.clear();
      this.loopStarted = false;
      this.phase = "lobby";
      this.resetBots();
      await this.state.storage.deleteAll();
      return new Response("Room reset and stopped.");
    }

    if (url.pathname !== "/ws") return new Response("ok");

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    // Визначаємо PID (хто це: гравець 1 чи 2)
    const existingPids = Array.from(this.sockets.values()).map(d => d.pid);
    let pid = null;
    if (!existingPids.includes("p1")) pid = "p1";
    else if (!existingPids.includes("p2")) pid = "p2";

    if (!pid) {
      server.close(1008, "room_full");
      return new Response("Room full", { status: 429 });
    }

    this.sockets.set(server, { pid });

    server.send(JSON.stringify({ 
      t: "hello", pid, bots: this.bots, tick: this.tick, phase: this.phase, ready: this.ready 
    }));

    server.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const userData = this.sockets.get(server);
        const who = userData ? userData.pid : pid;

        if (data.t === "input") {
          if (this.phase !== "fight") return;
          this.inputs[who] = {
            l: clamp(Number(data.l) || 0, -100, 100),
            r: clamp(Number(data.r) || 0, -100, 100)
          };
        }

        if (data.t === "control") {
          if (data.op === "start") {
             const p1Present = Array.from(this.sockets.values()).some(d => d.pid === "p1");
             const p2Present = Array.from(this.sockets.values()).some(d => d.pid === "p2");

             if (!p1Present || !p2Present) {
               this.ready[who] = true;
               this.broadcast({ t:"control", op:"start", phase:"waiting_opponent", ready:this.ready });
               return;
             }
             
             this.ready[who] = true;
             if (!this.startDeadline) this.startDeadline = Date.now() + 5000;
             
             if (this.ready.p1 && this.ready.p2) {
               this.beginFight();
             } else {
               this.broadcast({ t:"control", op:"start", phase:"pending", ready:this.ready });
             }
          }
          if (data.op === "stop") {
            this.endFight("manual");
          }
        }
      } catch (e) {}
    });

    server.addEventListener("close", async () => {
      this.sockets.delete(server);
      
      // Якщо це був бій — зупиняємо
      if (this.phase === "fight") {
        this.endFight("opponent_left");
      }

      // --- ГОЛОВНЕ ВИПРАВЛЕННЯ ---
      // Якщо всі вийшли — зупиняємо сервер миттєво
      if (this.sockets.size === 0) {
        this.loopStarted = false;
        await this.state.storage.deleteAlarm();
      }
    });

    if (!this.loopStarted) {
      this.loopStarted = true;
      await this.state.storage.setAlarm(Date.now() + 33);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    // --- ГОЛОВНЕ ВИПРАВЛЕННЯ ---
    // Якщо нікого немає — виходимо і НЕ ставимо будильник
    if (this.sockets.size === 0) {
      this.loopStarted = false;
      // Не викликаємо setAlarm, просто return
      return; 
    }

    this.tick++;
    const dt = 1/30;

    // Тайм-аут лобі
    if (this.phase === "lobby" && this.startDeadline && Date.now() > this.startDeadline) {
      this.endFight("timeout");
    }

    // Застосування входів
    for (const pid of ["p1", "p2"]) {
      const b = this.bots[pid];
      const inp = this.inputs[pid];
      b.l = inp.l; 
      b.r = inp.r;
    }

    // Фізика тільки в бою
    if (this.phase === "fight") {
      this.stepBot(this.bots.p1, dt);
      this.stepBot(this.bots.p2, dt);
      this.resolveCollision();
    }

    const winner = (this.phase === "fight") ? this.checkWinner() : null;

    if (this.tick % 3 === 0) {
      const payload = JSON.stringify({ 
        t: "state", tick: this.tick, bots: this.bots, winner, phase: this.phase, ready: this.ready 
      });
      for (const [ws] of this.sockets) {
        try { ws.send(payload); } catch {}
      }
    }

    await this.state.storage.setAlarm(Date.now() + 33);
  }

  stepBot(b, dt) {
    const maxSpeed = 240;
    const wheelBase = 60;
    const targVL = (b.l / 100) * maxSpeed;
    const targVR = (b.r / 100) * maxSpeed;
    const v = (targVL + targVR) * 0.5;
    const w = (targVR - targVL) / wheelBase;
    
    b.a += w * dt;
    b.vx = Math.cos(b.a) * v;
    b.vy = Math.sin(b.a) * v;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  resolveCollision() {
    const b1 = this.bots.p1; 
    const b2 = this.bots.p2;
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
    const minD = 44; // 22 + 22
    
    if (dist < minD) {
      const push = (minD - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      b1.x -= nx * push; b1.y -= ny * push;
      b2.x += nx * push; b2.y += ny * push;
    }
  }

  checkWinner() {
    const R = 400;
    const r = 22;
    const d1 = Math.sqrt(this.bots.p1.x**2 + this.bots.p1.y**2);
    const d2 = Math.sqrt(this.bots.p2.x**2 + this.bots.p2.y**2);
    const out1 = d1 > (R - r);
    const out2 = d2 > (R - r);
    
    if (out1 && !out2) return "p2";
    if (out2 && !out1) return "p1";
    if (out1 && out2) return "draw";
    return null;
  }
  
  broadcast(obj) {
      const payload = JSON.stringify(obj);
      for (const [ws] of this.sockets) {
        try { ws.send(payload); } catch {}
      }
  }
  
  resetBots() {
    // ЗМІНЕНО НА 100
    this.bots.p1 = { x: -100, y: 0, a: 0, vx: 0, vy: 0, wa: 0, l: 0, r: 0 };
    this.bots.p2 = { x: 100, y: 0, a: Math.PI, vx: 0, vy: 0, wa: 0, l: 0, r: 0 };
    this.inputs = { p1: { l: 0, r: 0 }, p2: { l: 0, r: 0 } };
  }
  
  beginFight() {
      this.phase = "fight";
      this.startDeadline = null;
      this.ready = { p1:false, p2:false };
      this.resetBots();
      this.broadcast({ t:"control", op:"start", phase:"fight" });
  }

  endFight(reason) {
      this.phase = "lobby";
      this.startDeadline = null;
      this.ready = { p1:false, p2:false };
      this.resetBots();
      this.broadcast({ t:"control", op:"stop", reason, phase:"lobby" });
  }
}
