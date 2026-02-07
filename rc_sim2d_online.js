/* RoboScratch 2D - Online Multiplayer Module */
(function(){
  'use strict';

// === ONLINE GLOBALS ===
window.isOnline = false; 
window.serverWs = null;
window.onlineState = "offline";
window.useServerPhysics = false; // TRUE = сервер керує позицією, FALSE = локальна фізика

// ХТО Я? (Сервер скаже: "p1" або "p2")
window.myPID = null; 

// КООРДИНАТИ від сервера
window.serverBotData = { x: 0, y: 0, a: 0 }; // Моя машинка
window.enemyBotData = { x: 0, y: 0, a: 0 };  // Суперник

// === ПІДКЛЮЧЕННЯ ДО СЕРВЕРА ===
window.connectToSumo = function() {
    console.log("Connecting to sumo server...");
    window.onlineState = "connecting";
    
    // WebSocket адреса вашого сервера
    window.serverWs = new WebSocket("wss://rc-sumo-server.kafrdrapv1.workers.dev/ws?room=default");

    window.serverWs.onopen = () => {
        window.isOnline = true;
        window.onlineState = "online";
        window.useServerPhysics = true; // Вмикаємо серверну фізику
        console.log("✅ ONLINE MODE ACTIVATED!"); 
        alert("🟢 З'єднано! Чекаємо розподілу ролей...");
    };

    window.serverWs.onmessage = (e) => {
        try {
            const d = JSON.parse(e.data);

            // 1. СЕРВЕР КАЖЕ, ХТО ТИ (Приходить одразу при вході)
            if (d.t === "hello") {
                window.myPID = d.pid; // "p1" або "p2"
                console.log(`✅ ТВОЯ РОЛЬ: ${window.myPID}`);
                alert(`Ти граєш за гравця: ${window.myPID.toUpperCase()}`);
            }

            // 2. ОТРИМУЄМО КООРДИНАТИ (Приходить постійно ~10Hz)
            if (d.t === "state" && d.bots) {
                // Якщо сервер ще не сказав, хто ми — ігноруємо
                if (!window.myPID) return;

                const me = window.myPID;                 
                const enemy = (me === "p1") ? "p2" : "p1";

                // Оновлюємо СЕБЕ (координати для відображення)
                if (d.bots[me]) {
                    window.serverBotData = {
                        x: d.bots[me].x,
                        y: d.bots[me].y,
                        a: d.bots[me].a
                    };
                }

                // Оновлюємо ВОРОГА (щоб знати де він)
                if (d.bots[enemy]) {
                    window.enemyBotData = {
                        x: d.bots[enemy].x,
                        y: d.bots[enemy].y,
                        a: d.bots[enemy].a
                    };
                }
            }
        } catch(err){
            console.error("WebSocket message error:", err);
        }
    };

    window.serverWs.onerror = () => {
        window.isOnline = false;
        window.onlineState = "offline";
        window.useServerPhysics = false;
        console.error("❌ WebSocket error");
    };

    window.serverWs.onclose = () => {
        window.isOnline = false;
        window.onlineState = "offline";
        window.useServerPhysics = false;
        window.myPID = null;
        console.log("🔴 OFFLINE MODE"); 
        alert("🔴 OFFLINE. Зв'язок втрачено.");
    };
    
    // Періодичний лог статусу
    setInterval(() => {
        if (window.isOnline && window.myPID) {
            console.log(`🆔 Я ГРАЮ ЗА: [ ${window.myPID.toUpperCase()} ]`);
        }
    }, 1000);
};

// === ВІДПРАВКА КОМАНД НА СЕРВЕР ===
window.sendInputToServer = function(leftWheel, rightWheel) {
    if (window.isOnline && window.serverWs && window.serverWs.readyState === WebSocket.OPEN) {
        try {
            window.serverWs.send(JSON.stringify({
                t: "input",
                l: leftWheel,   // -100 до 100
                r: rightWheel   // -100 до 100
            }));
        } catch(e) {
            console.error("Failed to send input:", e);
        }
    }
};

// === МІНІ-КНОПКА ОНЛАЙН (крапка біля "Сумо онлайн") ===
(function mountOnlineDotNearSumoTab(){
  function createDotBtn(){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'rcsim2dOnlineDotBtn';
    btn.className = 'rcsim2d-topBtn';
    btn.style.cssText = `
      margin-left:8px;
      width:34px;
      height:34px;
      padding:0;
      border-radius:12px;
      display:flex;
      align-items:center;
      justify-content:center;
    `;

    const dot = document.createElement('span');
    dot.className = 'rcsim2d-onlineDot red';
    btn.appendChild(dot);

    function apply(){
      const st = window.onlineState || (window.isOnline ? 'online' : 'offline');
      dot.classList.remove('red','green','yellow');
      if (st === 'online') dot.classList.add('green');
      else if (st === 'connecting') dot.classList.add('yellow');
      else dot.classList.add('red');

      btn.title = (st === 'online') ? 'ONLINE (клік — вимкнути)' :
                  (st === 'connecting') ? 'CONNECTING...' :
                  'OFFLINE (клік — підключитись)';
    }

    btn.addEventListener('click', ()=>{
      const st = window.onlineState || (window.isOnline ? 'online' : 'offline');
      if (st !== 'online'){
        // connect
        try{
          window.onlineState = 'connecting';
          apply();
          window.connectToSumo && window.connectToSumo();
        }catch(e){
          window.onlineState = 'offline';
          apply();
        }
      } else {
        // disconnect
        try{
          if (window.serverWs) window.serverWs.close();
        }catch(e){}
        window.onlineState = 'offline';
        window.isOnline = false;
        window.useServerPhysics = false;
        apply();
      }
    });

    // keep color in sync
    setInterval(apply, 300);
    apply();
    return btn;
  }

  function findSumoTab(){
    const els = Array.from(document.querySelectorAll('button,a,div,span'));
    return els.find(el => (el.innerText || '').trim() === 'Сумо онлайн');
  }

  function tryMount(){
    if (document.getElementById('rcsim2dOnlineDotBtn')) return true;
    const tab = findSumoTab();
    if (!tab) return false;
    const btn = createDotBtn();
    tab.insertAdjacentElement('afterend', btn);
    return true;
  }

  let tries = 0;
  const t = setInterval(()=>{
    tries++;
    if (tryMount() || tries > 80) clearInterval(t);
  }, 250);

  const mo = new MutationObserver(()=>{
    if (!document.getElementById('rcsim2dOnlineDotBtn')) tryMount();
  });
  mo.observe(document.body, { childList:true, subtree:true });
})();

console.log("✅ RCSim2D Online Module loaded");

})();
