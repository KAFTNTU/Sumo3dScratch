export default {
  async fetch(req: Request, env: Env): Promise<Response> {
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
  },
};

type PID = "p1" | "p2";
type Bot = { x:number; y:number; a:number; vx:number; vy:number; wa:number; l:number; r:number; };
type InputMsg = { t:"input"; l:number; r:number; };

function clamp(v:number,a:number,b:number){ return v<a?a:(v>b?b:v); }

export class RoomDO {
  state: DurableObjectState;
  env: Env;

  // Збереження сокетів
  wsByPid: Record<PID, WebSocket | null> = { p1: null, p2: null };
  pidByWs = new Map<WebSocket, PID>();

  // Вхідні дані (керування)
  inputs: Record<PID, { l:number; r:number }> = { p1:{l:0,r:0}, p2:{l:0,r:0} };

  // Фізичні боти
  // ВІДСТАНЬ 100: від -50 до 50
  bots: Record<PID, Bot> = {
    p1:{x:-50,y:0,a:0,       vx:0,vy:0,wa:0,l:0,r:0},
    p2:{x: 50,y:0,a:Math.PI,vx:0,vy:0,wa:0,l:0,r:0},
  };

  tick = 0;
  loopStarted = false;

  // ФАЗИ ГРИ
  phase: "lobby" | "countdown" | "fight" | "end" = "lobby";
  fightStartTime: number = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // --- Helpers ---
  private connectedPids(): PID[] {
    const res: PID[] = [];
    if (this.wsByPid.p1) res.push("p1");
    if (this.wsByPid.p2) res.push("p2");
    return res;
  }

  private assignPid(): PID | null {
    if (!this.wsByPid.p1) return "p1";
    if (!this.wsByPid.p2) return "p2";
    return null;
  }

  // --- WebSocket Logic ---
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/ws") return new Response("ok");

    const pair = new WebSocketPair();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (pair as any)[0] as WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = (pair as any)[1] as WebSocket;

    server.accept();

    const pid = this.assignPid();
    if (!pid){
      server.close(1008, "room_full");
      return new Response("Room full", { status: 429 });
    }

    this.wsByPid[pid] = server;
    this.pidByWs.set(server, pid);

    // Привітання
    server.send(JSON.stringify({ 
      t:"hello", 
      pid, 
      bots:this.visibleBots(), 
      phase:this.phase 
    }));

    // МУЛЬТИПЛЕЄР: Старт тільки коли є ОБИДВА гравці
    if (this.wsByPid.p1 && this.wsByPid.p2 && this.phase === "lobby") {
      this.startCountdown();
    }

    server.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        const who: PID = this.pidByWs.get(server) || pid;

        if (data?.t === "input") {
          const m = data as InputMsg;
          this.inputs[who] = {
            l: clamp(Number(m.l) || 0, -100, 100),
            r: clamp(Number(m.r) || 0, -100, 100),
          };
        }
        
        if (data?.t === "restart" && this.phase === "end") {
           this.resetGame();
        }

      } catch (e) {}
    });

    server.addEventListener("close", () => {
      this.pidByWs.delete(server);
      if (this.wsByPid[pid] === server) {
        this.wsByPid[pid] = null;
      }
      
      // Якщо хтось вийшов під час гри
      if (this.phase !== "lobby") {
        this.endFight("opponent_left");
      }
    });

    if (!this.loopStarted) {
      this.loopStarted = true;
      await this.state.storage.setAlarm(Date.now() + 33);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // --- Game Loop ---
  async alarm() {
    // ЕКОНОМІЯ: Якщо нікого немає - спимо
    if (!this.wsByPid.p1 && !this.wsByPid.p2) {
      this.loopStarted = false; 
      return; 
    }

    const dt = 1/30;
    this.tick++;

    // Логіка таймера
    if (this.phase === "countdown") {
      if (Date.now() >= this.fightStartTime) {
        this.beginFight();
      }
    }

    // Застосування інпутів (тільки якщо бій)
    for (const pid of ["p1","p2"] as const) {
      const b = this.bots[pid];
      if (this.phase === "fight") {
        const inp = this.inputs[pid];
        b.l = inp.l; 
        b.r = inp.r;
      } else {
        b.l = 0; b.r = 0;
      }
    }

    // Фізика
    this.stepBot(this.bots.p1, dt);
    this.stepBot(this.bots.p2, dt);
    this.resolveCollision();

    // Переможець
    let winner: PID | "draw" | null = null;
    if (this.phase === "fight") {
      winner = this.checkWinner();
      if (winner) {
        this.endFight(winner === "draw" ? "draw" : "win_" + winner);
      }
    }

    // Broadcast (~10Hz)
    if (this.tick % 3 === 0) {
      const msLeft = (this.phase === "countdown") 
        ? Math.max(0, this.fightStartTime - Date.now()) 
        : 0;

      const payload = JSON.stringify({ 
        t:"state", 
        tick:this.tick, 
        bots:this.visibleBots(), 
        phase:this.phase,
        winner: winner, 
        msLeft 
      });
      
      this.broadcast(payload);
    }

    await this.state.storage.setAlarm(Date.now() + 33);
  }

  // --- Methods ---

  startCountdown() {
    this.phase = "countdown";
    this.fightStartTime = Date.now() + 3000;
    this.resetBots();
    this.broadcast(JSON.stringify({ t: "countdown", ms: 3000 }));
  }

  beginFight() {
    this.phase = "fight";
    this.broadcast(JSON.stringify({ t: "fight_start" }));
  }

  endFight(reason: string) {
    if (reason === "opponent_left") {
      this.phase = "lobby";
      this.resetBots();
    } else {
      this.phase = "end";
    }
    
    this.broadcast(JSON.stringify({ 
      t: "game_over", 
      reason,
      winner: reason.startsWith("win_") ? reason.split("_")[1] : null
    }));
  }

  resetGame() {
    this.phase = "lobby";
    this.resetBots();
    if (this.wsByPid.p1 && this.wsByPid.p2) {
      this.startCountdown();
    } else {
      this.broadcast(JSON.stringify({ t: "reset", phase: "lobby" }));
    }
  }

  resetBots(){
    // Скидаємо на позиції -50 та 50
    this.bots.p1 = {x:-50,y:0,a:0,       vx:0,vy:0,wa:0,l:0,r:0};
    this.bots.p2 = {x: 50,y:0,a:Math.PI,vx:0,vy:0,wa:0,l:0,r:0};
    this.inputs.p1 = {l:0,r:0}; 
    this.inputs.p2 = {l:0,r:0};
  }

  broadcast(msg: string){
    const pids = this.connectedPids();
    for (const pid of pids){
      const ws = this.wsByPid[pid];
      if (ws) ws.send(msg);
    }
  }

  visibleBots(){
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = {};
    const pids = this.connectedPids();
    for (const pid of pids){
      res[pid] = this.bots[pid];
    }
    return {
      p1: { x: this.bots.p1.x, y: this.bots.p1.y, a: this.bots.p1.a },
      p2: { x: this.bots.p2.x, y: this.bots.p2.y, a: this.bots.p2.a }
    };
  }

  stepBot(b: Bot, dt: number) {
    const maxSpeed = 240;
    const wheelBase = 60;
    const targVL = (b.l/100) * maxSpeed;
    const targVR = (b.r/100) * maxSpeed;
    
    const v = (targVL + targVR) * 0.5;
    const w = (targVR - targVL) / wheelBase;

    b.vx = Math.cos(b.a) * v;
    b.vy = Math.sin(b.a) * v;
    b.wa = w;

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.wa * dt;
  }

  resolveCollision() {
    const b1=this.bots.p1, b2=this.bots.p2;
    const r=22; 
    const minD=r*2;
    const dx=b2.x-b1.x, dy=b2.y-b1.y;
    const d=Math.hypot(dx,dy) || 0.001;
    
    if (d<minD){
      const push=(minD-d)*0.5;
      const nx=dx/d, ny=dy/d;
      b1.x -= nx*push; b1.y -= ny*push;
      b2.x += nx*push; b2.y += ny*push;
    }
  }

  checkWinner(): PID | "draw" | null {
    const R = 400;
    const r = 22;
    const d1 = Math.hypot(this.bots.p1.x, this.bots.p1.y);
    const d2 = Math.hypot(this.bots.p2.x, this.bots.p2.y);
    const out1 = d1 > (R - r);
    const out2 = d2 > (R - r);
    if (out1 && !out2) return "p2";
    if (out2 && !out1) return "p1";
    if (out1 && out2) return "draw";
    return null;
  }
}

export interface Env {
  ROOMS: DurableObjectNamespace;
}
