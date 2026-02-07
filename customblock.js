/* customblock.js v2.9.5+rcsim
   RoboControl - RC Студія (Variant B) — "mini-blocks" builder + manager
   Adds (requested): everything except restriction modes.
   - Parameters for custom blocks (fields on the big block) + rc_param value block
   - Validation (pre-pack) + warnings UI
   - Templates / snippets (insert mini blocks)
   - Simulator (dry-run) + Step highlighting + log + sensor sliders
   - History (autosave snapshots + restore)
   - Mini-block quick actions (duplicate/copy/paste/convert)
   - Export / Import + Share link (URL hash import)
   Keeps:
   - PC only
   - 🧩 button only inside Scratch view (#view-builder), not joystick
   - Mini-config modal large, dark toolbox, no scrollbars shown, grid enabled
*/
(function(){
  'use strict';

  const RC = window.RC_CUSTOMBLOCK = window.RC_CUSTOMBLOCK || {};
  const VERSION = 'v2.9.5';


  // Expose version for debugging
  RC.version = VERSION;

  // Restore last mini-block preview JS (used by Simulator) if available
  try{
    if (!window.__rc_customblock_preview_js){
      const s = localStorage.getItem('rc_customblock_preview_js');
      if (s) window.__rc_customblock_preview_js = String(s);
    }
  }catch(e){}


  // Builder state holder (was missing in some broken uploads)
  const builder = RC.builder = RC.builder || {};

  // Safe storage wrapper (prevents crashes when Tracking Prevention blocks storage)
  const store = (function(){
    const s = { ok: true, warned: false };
    s.get = function(k){
      try{ return window.localStorage.getItem(k); }catch(e){ s.ok = false; return null; }
    };
    s.set = function(k,v){
      try{ window.localStorage.setItem(k,v); }catch(e){ s.ok = false; }
    };
    s.remove = function(k){
      try{ window.localStorage.removeItem(k); }catch(e){ s.ok = false; }
    };
    return s;
  })();


  const CFG = {
    storageKeyBlocks: 'rc_cb_blocks_v2',
    storageKeyDraft: 'rc_cb_builder_draft_v2',
    storageKeyHistoryPrefix: 'rc_cb_history_',
    storageKeyClipboard: 'rc_cb_clip_v1',
    storageKeyImportedHash: 'rc_cb_imported_hash_v1',
    customCategoryId: 'rc_custom_category',
    customCategoryName: '⭐ Мої блоки',
    customCategoryColour: '#F59E0B',
    defaultCustomBlockColour: '#FB923C',
    uiZ: 96,
    maxHistory: 14
  };

  // ------------------------------------------------------------
  // Optional: auto-load STM32 generator (stm32_cgen.js)
  // NOTE: index must include ONLY customblock.js; this file can load extras.
  // ------------------------------------------------------------
  (function loadStm32Cgen(){
    try{
      if (window.RC_STM32_CGEN) return;
      const existing = Array.from(document.scripts || []).some(s => (s.src || '').endsWith('/stm32_cgen.js') || (s.src || '').endsWith('stm32_cgen.js'));
      if (existing) return;
      const s = document.createElement('script');
      s.src = 'stm32_cgen.js';
      s.async = true;
      s.onload = ()=>{ try{ console.log('[RC_CUSTOMBLOCK] stm32_cgen.js loaded'); }catch(e){} };
      s.onerror = ()=>{ try{ console.warn('[RC_CUSTOMBLOCK] stm32_cgen.js not found (optional)'); }catch(e){} };
      document.head.appendChild(s);
    }catch(e){}
  })();
  // ------------------------------------------------------------
  // Optional: auto-load rc_sim2d.js (2D simulator tab, separate file)
  // ------------------------------------------------------------
  // ------------------------------------------------------------
// Optional: auto-load 2D simulator (split files)
// Loads in order:
//   1) rc_sim2d_online.js
//   2) rc_sim2d_core.js
//   3) rc_sim2d_3d_overlay.js
// ------------------------------------------------------------
(function loadRcSim2d(){
  try{
    if (window.RCSim2D) return;

    const needed = ['rc_sim2d_online.js','rc_sim2d_core.js','rc_sim2d_3d_overlay.js'];

    function hasScript(srcEnd){
      try{
        return Array.from(document.scripts || []).some(s => {
          const u = (s.src || '');
          return u.endsWith('/'+srcEnd) || u.endsWith(srcEnd);
        });
      }catch(e){ return false; }
    }

    function loadOne(name){
      return new Promise((resolve, reject)=>{
        if (hasScript(name)) return resolve();
        const s = document.createElement('script');
        s.src = name;
        s.async = false; // keep order
        s.onload = ()=> resolve();
        s.onerror = ()=> reject(new Error(name+' not found'));
        document.head.appendChild(s);
      });
    }

    // Load sequentially (order matters: online BEFORE core)
    (async ()=>{
      for (const f of needed){
        try{
          await loadOne(f);
          try{ console.log('[RC_CUSTOMBLOCK] '+f+' loaded'); }catch(e){}
        }catch(err){
          try{ console.warn('[RC_CUSTOMBLOCK] '+String(err.message||err)); }catch(e){}
        }
      }
    })();
  }catch(e){}
})();

// ------------------------------------------------------------
  // Desktop detect (PC only)
  // ------------------------------------------------------------
  function isDesktop(){
    try{
      const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
      const hover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
      const wide = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
      return !!(fine && hover && wide);
    }catch(e){
      return (navigator.maxTouchPoints || 0) === 0 && window.innerWidth >= 900;
    }
  }

  
  // ------------------------------------------------------------
  // Theme helper (reuse main workspace theme)
  // ------------------------------------------------------------
  function getMainTheme(Blockly){
    try{
      const ws = window.workspace || window._workspace || null;
      if (ws && ws.getTheme) return ws.getTheme();
    }catch(e){}
    try{
      if (Blockly && Blockly.Themes && Blockly.Themes.myTheme) return Blockly.Themes.myTheme;
    }catch(e){}
    return undefined;
  }

  // ------------------------------------------------------------
  // Theme helper for RC Студія UI (force dark toolbox + flyout)
  // ------------------------------------------------------------
  let __rcCbTheme = null;
  function getCBTheme(Blockly){
    if (__rcCbTheme) return __rcCbTheme;
    const base = getMainTheme(Blockly) || (Blockly && Blockly.Themes && (Blockly.Themes.Classic || Blockly.Themes.Zelos || Blockly.Themes.Modern));
    try{
      if (Blockly && Blockly.Theme && typeof Blockly.Theme.defineTheme === 'function'){
        __rcCbTheme = Blockly.Theme.defineTheme('rcCbDark', {
          base: base || undefined,
          componentStyles: {
            workspaceBackgroundColour: 'rgba(2,6,23,.35)',
            toolboxBackgroundColour: '#0b1220',
            toolboxForegroundColour: '#e2e8f0',
            flyoutBackgroundColour: '#0b1220',
            flyoutForegroundColour: '#e2e8f0',
            flyoutOpacity: 0.96,
            scrollbarColour: '#334155',
            scrollbarOpacity: 0.55,
            insertionMarkerColour: '#60a5fa',
            insertionMarkerOpacity: 0.35,
            cursorColour: '#60a5fa'
          }
        });
        return __rcCbTheme;
      }
    }catch(e){}
    __rcCbTheme = base;
    return __rcCbTheme;
  }


// ------------------------------------------------------------
  // Utils
  // ------------------------------------------------------------
  const u = {
    uid(prefix='id'){
      return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
    },
    jparse(str, fallback){
      try { return JSON.parse(str); } catch(e){ return fallback; }
    },
    jstring(obj){
      try { return JSON.stringify(obj); } catch(e){ return 'null'; }
    },
    el(tag, attrs={}, children=[]){
      const n = document.createElement(tag);
      for (const [k,v] of Object.entries(attrs||{})){
        if (k === 'class') n.className = v;
        else if (k === 'style') n.setAttribute('style', v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined) n.setAttribute(k, String(v));
      }
      for (const c of (Array.isArray(children)?children:[children])){
        if (c === null || c === undefined) continue;
        if (typeof c === 'string') n.appendChild(document.createTextNode(c));
        else n.appendChild(c);
      }
      return n;
    },
    debounce(fn, ms){
      let t=null;
      return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
    },
    clamp(n, a, b){ n = Number(n); if (!isFinite(n)) return a; return Math.max(a, Math.min(b, n)); },
    nowLabel(){
      const d = new Date();
      const p = (x)=>String(x).padStart(2,'0');
      return `${p(d.getDate())}.${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },
    downloadText(filename, text, mime='application/json'){
      const blob = new Blob([text], { type:mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
    },
    async copyText(txt){
      try{ await navigator.clipboard.writeText(txt); return true; }
      catch(e){
        try{
          const ta = document.createElement('textarea');
          ta.value = txt;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          return true;
        }catch(_){ return false; }
      }
    },
    b64enc(str){
      // UTF-8 safe base64
      const bytes = new TextEncoder().encode(str);
      let bin='';
      bytes.forEach(b=>bin += String.fromCharCode(b));
      return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    },
    b64dec(b64url){
      try{
        const b64 = b64url.replace(/-/g,'+').replace(/_/g,'/');
        const pad = b64.length % 4 ? '='.repeat(4 - (b64.length%4)) : '';
        const bin = atob(b64 + pad);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      }catch(e){ return null; }
    }
  };

  // ------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------
  let toastT=null;
  function toast(msg){
    const id='rcCbToast';
    let el = document.getElementById(id);
    if (!el){
      el = u.el('div', { id, style: `
        position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
        background: rgba(2,6,23,.85);
        border: 1px solid rgba(148,163,184,.18);
        color: #e2e8f0;
        padding: 10px 12px;
        border-radius: 14px;
        font-weight: 900;
        z-index: ${CFG.uiZ+100};
        display:none;
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 60px rgba(0,0,0,.55);
      `});
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display='block';
    clearTimeout(toastT);
    toastT = setTimeout(()=>{ el.style.display='none'; }, 1400);
  }

  // Warn once if browser blocks storage (then saving won't persist)
  function warnStorageIfNeeded(){
    try{
      if (!store.ok && !store.warned){
        store.warned = true;
        toast('⚠️ Браузер блокує сховище (Tracking Prevention) — збереження може не працювати. Відкрий сайт у звичайному браузері/вкладці без блокування.');
      }
    }catch(e){}
  }



  // ------------------------------------------------------------
  // Storage + defs map
  // ------------------------------------------------------------
  RC._defsByType = RC._defsByType || new Map();
  RC._paramCtx = null; // used during JS generation
  RC._currentParamOptions = []; // for rc_param dropdown in config modal

  function loadBlocks(){
    const raw = store.get(CFG.storageKeyBlocks);
    const data = u.jparse(raw, []);
    return Array.isArray(data) ? data : [];
  }
  function saveBlocks(arr){ store.set(CFG.storageKeyBlocks, u.jstring(arr || [])); }
  function rebuildDefsMap(){
    RC._defsByType.clear();
    for (const d of loadBlocks()){
      if (d && d.blockType) RC._defsByType.set(d.blockType, d);
    }
  }
  function updateDef(blockType, patch){
    const defs = loadBlocks();
    const idx = defs.findIndex(d => d.blockType === blockType);
    if (idx < 0) return false;
    defs[idx] = Object.assign({}, defs[idx], patch || {}, { updatedAt: Date.now() });
    saveBlocks(defs);
    rebuildDefsMap();
    return true;
  }
  function deleteDef(blockType){
    const defs = loadBlocks().filter(d => d.blockType !== blockType);
    saveBlocks(defs);
    rebuildDefsMap();
  }

  // ------------------------------------------------------------
  // CSS
  // ------------------------------------------------------------
  function injectCss(){
    if (document.getElementById('rc-cb-css')) return;
    const s = document.createElement('style');
    s.id='rc-cb-css';
    s.textContent = `
html.rcSimOpen, body.rcSimOpen{ overflow:hidden !important; }
/* Bigger label only for custom category */
.rcCustomCatRow .blocklyTreeLabel{
  font-size: 18px !important;
  font-weight: 1000 !important;
  letter-spacing: .02em !important;
}

/* PC-only 🧩 floating button in Scratch view */
#rcCbOpenBtn{
  position: absolute;
  width: 40px;
  height: 36px;
  top: 12px;
  right: 12px;
  border-radius: 10px;
  border: 1px solid rgba(148,163,184,.16);
  background: rgba(30,41,59,.78);
  color: #e2e8f0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 20px 45px rgba(0,0,0,.45);
  z-index: 20;
  backdrop-filter: blur(8px);
}
#rcCbOpenBtn:active{ transform: scale(.97); }

/* RC Студія view */
#view-customblocks{
  background: rgba(2,6,23,.22);
}
#rcCustomBlocksTop{
  display:flex;
  align-items:center;
  gap:10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148,163,184,.10);
  background: rgba(2,6,23,.28);

  /* force single-row topbar (no wrapping); scroll horizontally if needed */
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scrollbar-width: none;
}
#rcCustomBlocksTop::-webkit-scrollbar{ height:0; width:0; }
#rcCustomBlocksTop .lbl{ font-size: 11px; font-weight: 900; color: #cbd5e1; flex:0 0 auto; }
#rcCustomBlocksTop input[type="text"]{
  min-width: 140px;
  max-width: 280px;
  flex: 0 1 240px;
  height: 42px;
  background: rgba(2,6,23,.55);
  border: 1px solid rgba(148,163,184,.16);
  border-radius: 12px;
  padding: 10px 10px;
  color: #fff;
  outline: none;
  font-weight: 900;
}
#rcCustomBlocksTop input[type="color"]{
  width: 48px;
  height: 42px;
  border: none;
  background: transparent;
  flex: 0 0 auto;
}
#rcCustomBlocksTop .btn{
  height: 42px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(148,163,184,.14);
  background: rgba(30,41,59,.74);
  color: #e2e8f0;
  font-weight: 950;
  cursor: pointer;
  user-select:none;
  flex: 0 0 auto;
  white-space: nowrap;
  gap:8px;
}
#rcCustomBlocksTop .btn:hover{
  filter: brightness(1.06);
  box-shadow: 0 0 0 1px rgba(148,163,184,.12), 0 0 12px rgba(59,130,246,.12);
}
#rcCustomBlocksTop .btn.primary{
  background: rgba(59,130,246,.86);
  border-color: rgba(59,130,246,.55);
  color: #fff;
  box-shadow: 0 0 0 1px rgba(96,165,250,.40), 0 0 18px rgba(59,130,246,.22);
}
#rcCustomBlocksTop .btn:active{ transform: scale(.99); }
#rcCustomBlocksTop .btn.rcBackBtn{ padding:10px 12px; background: rgba(15,23,42,.55); }
#rcCustomBlocksTop .btn.rcBackBtn i{ font-size: 14px; }
#rcCustomBlocksDiv{ flex:1; min-height:0; background: rgba(2,6,23,.35); }

/* Dot-grid background (visible "сітка") */
#view-customblocks .blocklySvg{
  background: radial-gradient(circle at 1px 1px, rgba(148,163,184,.18) 1px, transparent 1px);
  background-size: 26px 26px;
}
#rcMiniModal .blocklySvg{
  background: radial-gradient(circle at 1px 1px, rgba(148,163,184,.18) 1px, transparent 1px);
  background-size: 26px 26px;
}

/* Dark toolbox for builder workspace (isolate from global toolbox styles) */
#view-customblocks .blocklyToolboxDiv{
  background: rgba(2,6,23,.92) !important;
  border-right: 1px solid rgba(148,163,184,.14) !important;
  width: 260px !important;
  min-width: 260px !important;
  max-width: 340px !important;

  /* cancel global "bottom drawer toolbox" styles from index */
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  height: auto !important;
  transform: none !important;
  display: block !important;
  flex-direction: column !important;
  align-items: stretch !important;
  justify-content: flex-start !important;
  border-radius: 0 !important;
  padding: 10px 8px !important;
  z-index: 6 !important;
}
#view-customblocks .blocklyToolboxContents{ padding: 0 !important; }
#view-customblocks .blocklyTreeRow{
  height: 44px !important;
  margin: 6px 4px !important;
  border-radius: 14px !important;
  background: transparent !important;
  border: 1px solid transparent !important;
}
#view-customblocks .blocklyTreeRow:hover{
  background: rgba(148,163,184,.10) !important;
  border-color: rgba(148,163,184,.12) !important;
}
#view-customblocks .blocklyTreeSelected .blocklyTreeRow{
  background: rgba(59,130,246,.18) !important;
  border-color: rgba(96,165,250,.55) !important;
}
#view-customblocks .blocklyTreeLabel{
  color:#e2e8f0 !important;
  font-weight: 950 !important;
  font-size: 15px !important;
}
#view-customblocks .blocklyFlyoutBackground{ fill: rgba(2,6,23,.60) !important; }
#view-customblocks .blocklyMainBackground{ fill: rgba(2,6,23,.30) !important; }
#view-customblocks .blocklyGridLine{ stroke: rgba(148,163,184,.28) !important; }

/* Generic modal */
.rcModalBackdrop{
  position:fixed; inset:0; background:rgba(0,0,0,.58);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  z-index:${CFG.uiZ+20}; display:none;
}
.rcModal{
  position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(980px,calc(100vw - 20px)); height:min(82vh,740px);
  background:rgba(15,23,42,.96);
  border:1px solid rgba(148,163,184,.16);
  border-radius:18px; overflow:hidden;
  z-index:${CFG.uiZ+21}; display:none;
  box-shadow:0 28px 90px rgba(0,0,0,.6);
}
.rcModal .hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.14);}
.rcModal .hdr .ttl{display:flex;align-items:center;gap:10px;color:#e2e8f0;font-weight:950;letter-spacing:.08em;text-transform:uppercase;font-size:12px;}
.rcModal .hdr .ttl .dot{width:10px;height:10px;border-radius:4px;background:${CFG.customCategoryColour};box-shadow:0 0 12px rgba(245,158,11,.45);}
.rcModal .hdr .x{width:42px;height:42px;margin-left:10px;margin-right:6px;border-radius:14px;border:1px solid rgba(148,163,184,.15);background:rgba(30,41,59,.70);color:#e2e8f0;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.rcModal .bar{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(148,163,184,.10);background:rgba(2,6,23,.28);}
.rcModal .bar .btn{padding:10px 12px;border-radius:14px;border:1px solid rgba(148,163,184,.14);background:rgba(30,41,59,.74);color:#e2e8f0;font-weight:950;cursor:pointer;}
.rcModal .bar .btn.primary{background:rgba(59,130,246,.85);border-color:rgba(59,130,246,.55);color:#fff;}
.rcModal .body{padding:12px 14px;overflow:auto;height: calc(100% - 110px);}
.rcModal .body{scrollbar-width:none;-ms-overflow-style:none;}
.rcModal .body::-webkit-scrollbar{width:0!important;height:0!important;}

/* List rows */
.rcRow{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:14px;background:rgba(30,41,59,.35);margin-bottom:10px;}
.rcRow .name{flex:1;color:#e2e8f0;font-weight:950;}
.rcRow .meta{color:#94a3b8;font-size:12px;font-weight:800;}
.rcRow .sw{width:16px;height:16px;border-radius:6px;border:1px solid rgba(148,163,184,.18);}
.rcRow .act{display:flex;gap:8px;align-items:center;}
.rcRow .act .btn{padding:8px 10px;border-radius:12px;border:1px solid rgba(148,163,184,.14);background:rgba(30,41,59,.74);color:#e2e8f0;font-weight:950;cursor:pointer;}
.rcRow .act .btn.danger{border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.12);color:#fecaca;}

/* Validation list */
.rcIssue{padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:14px;background:rgba(2,6,23,.35);margin-bottom:10px;}
.rcIssue .t{font-weight:950;color:#e2e8f0;}
.rcIssue .d{font-weight:800;color:#94a3b8;font-size:12px;margin-top:4px;}

/* Simulator */
#rcSimGrid{display:grid;grid-template-columns:320px 1fr;gap:12px;height:100%;min-height:0;}
#rcSimLeft{border-right:1px solid rgba(148,163,184,.12);padding-right:12px;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:12px;}
#rcSimRight{min-height:0;overflow:hidden;display:flex;flex-direction:column;}
#rcSimLog{flex:1;background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px;color:#e2e8f0;font-size:12px;line-height:1.35;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
#rcSimLog{scrollbar-width:none;-ms-overflow-style:none;}
#rcSimLog::-webkit-scrollbar{width:0!important;height:0!important;}

/* Mini config modal bigger + dark toolbox */
#rcMiniBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.58);backdrop-filter:blur(8px);z-index:${CFG.uiZ+2};display:none;}
#rcMiniModal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1460px,calc(100vw - 14px));height:min(92vh,880px);
background:rgba(15,23,42,.96);border:1px solid rgba(148,163,184,.16);border-radius:18px;overflow:hidden;z-index:${CFG.uiZ+3};display:none;box-shadow:0 28px 90px rgba(0,0,0,.6);}
#rcMiniModal .hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.14);}
#rcMiniModal .ttl{color:#e2e8f0;font-weight:950;letter-spacing:.08em;text-transform:uppercase;font-size:12px;display:flex;gap:10px;align-items:center;}
#rcMiniModal .ttl .dot{width:10px;height:10px;border-radius:4px;background:${CFG.defaultCustomBlockColour};box-shadow:0 0 12px rgba(251,146,60,.5);}
#rcMiniModal .x{width:42px;height:42px;border-radius:14px;border:1px solid rgba(148,163,184,.15);background:rgba(30,41,59,.70);color:#e2e8f0;cursor:pointer;display:flex;align-items:center;justify-content:center;}
#rcMiniModal .bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(148,163,184,.10);background:rgba(2,6,23,.28);color:#cbd5e1;font-weight:800;font-size:12px;}
#rcMiniModal code{padding:2px 7px;border-radius:999px;background:rgba(30,41,59,.75);border:1px solid rgba(148,163,184,.14);color:#e2e8f0;font-size:11px;}
#rcMiniModal .btn{padding:10px 12px;border-radius:14px;border:1px solid rgba(148,163,184,.14);background:rgba(30,41,59,.74);color:#e2e8f0;font-weight:950;cursor:pointer;}
#rcMiniModal .btn.primary{background:rgba(59,130,246,.85);border-color:rgba(59,130,246,.55);color:#fff;}
#rcMiniModal .body{height:calc(100% - 100px);display:grid;grid-template-columns:360px 1fr;min-height:0;}
#rcMiniModal .left,#rcMiniModal .right{min-height:0;overflow:hidden;}
#rcMiniModal .left{border-right:1px solid rgba(148,163,184,.12);padding:12px 12px 12px 14px;display:flex;flex-direction:column;gap:12px;}
#rcMiniModal .right{padding:12px;display:flex;flex-direction:column;min-height:0;}
#rcMiniModal pre{margin:0;background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px;color:#e2e8f0;font-size:12px;line-height:1.35;overflow:auto;min-height:200px;max-height:46vh;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
#rcMiniModal pre,#rcMiniModal .left,#rcMiniModal .right{scrollbar-width:none;-ms-overflow-style:none;}
#rcMiniModal pre::-webkit-scrollbar,#rcMiniModal .left::-webkit-scrollbar,#rcMiniModal .right::-webkit-scrollbar{width:0!important;height:0!important;}
#rcMiniBlocklyHost{flex:1;min-height:640px;border-radius:14px;border:1px solid rgba(148,163,184,.14);overflow:hidden;background:rgba(2,6,23,.35);}
#rcMiniBlockly{width:100%;height:100%;}
#rcMiniModal .blocklyToolboxDiv{background:rgba(2,6,23,.92)!important;border-right:1px solid rgba(148,163,184,.14)!important;width:250px!important;min-width:250px!important;max-width:340px!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;height:auto!important;transform:none!important;display:block!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;border-radius:0!important;padding:10px 8px!important;z-index:6!important;}
#rcMiniModal .blocklyTreeLabel{color:#e2e8f0!important;font-weight:900!important;}
#rcMiniModal .blocklyToolboxContents{padding:0!important;}
#rcMiniModal .blocklyTreeRow{height:44px!important;margin:6px 4px!important;border-radius:14px!important;background:transparent!important;border:1px solid transparent!important;}
#rcMiniModal .blocklyTreeRow:hover{background:rgba(148,163,184,.10)!important;border-color:rgba(148,163,184,.12)!important;}
#rcMiniModal .blocklyTreeSelected .blocklyTreeRow{background:rgba(59,130,246,.18)!important;border-color:rgba(96,165,250,.55)!important;}
#rcMiniModal .blocklyTreeLabel{font-weight:950!important;font-size:15px!important;}
#rcMiniModal .blocklyGridLine{stroke:rgba(148,163,184,.28)!important;}

#rcMiniModal .blocklyFlyoutBackground{fill:rgba(2,6,23,.55)!important;}
#rcMiniModal .blocklyMainBackground{fill:rgba(2,6,23,.35)!important;}

/* Hide ALL scrollbars inside CustomBlocks (toolbox + flyout + textareas) */
#view-customblocks .blocklyToolboxDiv,
#view-customblocks .blocklyToolboxDiv .blocklyToolboxContents,
#view-customblocks .blocklyToolboxDiv .blocklyTreeRoot,
#rcMiniModal .blocklyToolboxDiv,
#rcMiniModal .blocklyToolboxDiv .blocklyToolboxContents,
#rcMiniModal .blocklyToolboxDiv .blocklyTreeRoot{
  scrollbar-width:none !important;
  -ms-overflow-style:none !important;
}
#view-customblocks .blocklyToolboxDiv::-webkit-scrollbar,
#view-customblocks .blocklyToolboxDiv .blocklyToolboxContents::-webkit-scrollbar,
#view-customblocks .blocklyToolboxDiv .blocklyTreeRoot::-webkit-scrollbar,
#rcMiniModal .blocklyToolboxDiv::-webkit-scrollbar,
#rcMiniModal .blocklyToolboxDiv .blocklyToolboxContents::-webkit-scrollbar,
#rcMiniModal .blocklyToolboxDiv .blocklyTreeRoot::-webkit-scrollbar{
  width:0 !important;
  height:0 !important;
}

/* Hide Blockly SVG scrollbars (workspace scroll handles) */
#view-customblocks .blocklyScrollbarHorizontal,
#view-customblocks .blocklyScrollbarVertical,
#view-customblocks .blocklyScrollbarHandle,
#view-customblocks .blocklyScrollbarBackground,
#rcMiniModal .blocklyScrollbarHorizontal,
#rcMiniModal .blocklyScrollbarVertical,
#rcMiniModal .blocklyScrollbarHandle,
#rcMiniModal .blocklyScrollbarBackground{
  opacity:0 !important;
  }

/* Hide textarea scrollbars in our modals (export/import/etc.) */
.rcModal textarea,
#rcMiniModal textarea{
  scrollbar-width:none !important;
  -ms-overflow-style:none !important;
}
.rcModal textarea::-webkit-scrollbar,
#rcMiniModal textarea::-webkit-scrollbar{
  width:0 !important;
  height:0 !important;
}
`;
    document.head.appendChild(s);
  }
  // ------------------------------------------------------------
  // Scratch-like navigation for Blockly:
  // - Wheel => zoom workspace (no page scroll)
  // - Drag background with LMB/MMB => pan
  // Scrollbars stay enabled but visually hidden (opacity 0), so Blockly drag-pan works too.
  // ------------------------------------------------------------
  function enableScratchPan(ws){
    try{
      if (!ws || ws.__rcScratchPan) return;
      ws.__rcScratchPan = true;

      const div = (ws.getInjectionDiv && ws.getInjectionDiv()) || null;
      if (!div) return;
      const svg = div.querySelector && div.querySelector('svg.blocklySvg');
      if (!svg) return;

      let down = false;
      let lastX = 0, lastY = 0;

      const isIn = (t, sel)=>{
        try{ return !!(t && t.closest && t.closest(sel)); }catch(e){ return false; }
      };

      const canStartPan = (t)=>{
        if (!t) return false;
        if (isIn(t, '.blocklyToolboxDiv')) return false;
        if (isIn(t, '.blocklyFlyout') || isIn(t, '.blocklyFlyoutWrapper')) return false;
        if (isIn(t, '.blocklyScrollbarHandle') || isIn(t, '.blocklyScrollbarBackground')) return false;
        if (isIn(t, '.blocklyWidgetDiv') || isIn(t, '.blocklyDropdownMenu')) return false;
        if (isIn(t, '.blocklyDraggable')) return false;

        if (t.classList && t.classList.contains('blocklyMainBackground')) return true;
        if (isIn(t, '.blocklyMainBackground')) return true;
        if (t.classList && (t.classList.contains('blocklyGridLine') || t.classList.contains('blocklyGridPattern'))) return true;
        return true;
      };

      const scrollBy = (dx, dy)=>{
        if (typeof ws.scroll === 'function'){
          ws.scroll(dx, dy);
          return;
        }
        const sb = ws.scrollbar;
        if (sb && typeof sb.set === 'function'){
          const curX = (typeof sb.x === 'number') ? sb.x : 0;
          const curY = (typeof sb.y === 'number') ? sb.y : 0;
          sb.set(curX + dx, curY + dy);
        }
      };

      const onDown = (e)=>{
        if (e.button !== 0 && e.button !== 1) return; // LMB / MMB
        if (!canStartPan(e.target)) return;
        down = true;
        lastX = e.clientX;
        lastY = e.clientY;
        e.preventDefault();
        e.stopPropagation();
      };

      const onMove = (e)=>{
        if (!down) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        scrollBy(-dx, -dy);
        e.preventDefault();
      };

      const onUp = ()=>{ down = false; };

      svg.addEventListener('mousedown', onDown, true);
      window.addEventListener('mousemove', onMove, { passive:false });
      window.addEventListener('mouseup', onUp, true);
    }catch(e){}
  }

  function enableScratchWheel(ws){
    try{
      if (!ws || ws.__rcScratchWheel) return;
      ws.__rcScratchWheel = true;

      const div = (ws.getInjectionDiv && ws.getInjectionDiv()) || null;
      if (!div) return;
      const svg = div.querySelector && div.querySelector('svg.blocklySvg');
      if (!svg) return;

      const isIn = (t, sel)=>{
        try{ return !!(t && t.closest && t.closest(sel)); }catch(e){ return false; }
      };

      const isWorkspaceWheel = (t)=>{
        if (!t) return false;
        if (isIn(t, '.blocklyToolboxDiv')) return false;
        if (isIn(t, '.blocklyFlyout') || isIn(t, '.blocklyFlyoutWrapper')) return false;
        if (isIn(t, '.blocklyWidgetDiv') || isIn(t, '.blocklyDropdownMenu')) return false;
        return true;
      };

      const zoomAt = (clientX, clientY, amount)=>{
        try{
          const rect = svg.getBoundingClientRect();
          const x = clientX - rect.left;
          const y = clientY - rect.top;
          if (typeof ws.zoom === 'function') ws.zoom(x, y, amount);
          else if (typeof ws.zoomCenter === 'function') ws.zoomCenter(amount);
        }catch(e){}
      };

      const onWheel = (e)=>{
        if (!isWorkspaceWheel(e.target)) return;
        e.preventDefault();
        e.stopPropagation();

        const mul = (e.deltaMode === 1) ? 16 : (e.deltaMode === 2 ? 120 : 1);
        const dy = (e.deltaY || 0) * mul;

        const amount = (dy < 0) ? 1 : -1;
        zoomAt(e.clientX, e.clientY, amount);
      };

      div.addEventListener('wheel', onWheel, { capture:true, passive:false });
    }catch(e){}
  }


  // ------------------------------------------------------------
  // Toolbox category: ⭐ Мої блоки
  // ------------------------------------------------------------
  function ensureCustomCategory(){
    const toolboxXml = document.getElementById('toolbox');
    if (!toolboxXml) return null;

    const exists = Array.from(toolboxXml.children).find(n =>
      n.tagName?.toLowerCase()==='category' && (n.getAttribute('id')||'')===CFG.customCategoryId
    );
    if (exists) return exists;

    const cat = document.createElement('category');
    cat.setAttribute('id', CFG.customCategoryId);
    cat.setAttribute('name', CFG.customCategoryName);
    cat.setAttribute('colour', CFG.customCategoryColour);
    toolboxXml.appendChild(cat);
    return cat;
  }

  function rebuildCustomCategory(workspace){
    const toolboxXml = document.getElementById('toolbox');
    if (!toolboxXml || !workspace) return;

    const cat = ensureCustomCategory();
    if (!cat) return;

    while (cat.firstChild) cat.removeChild(cat.firstChild);

    const blocks = loadBlocks();
    for (const b of blocks){
      const blockEl = document.createElement('block');
      blockEl.setAttribute('type', b.blockType);
      cat.appendChild(blockEl);
    }

    try { workspace.updateToolbox(toolboxXml); }
    catch(e){ try { workspace.updateToolbox(toolboxXml.outerHTML); } catch(_){ } }

    setTimeout(()=>{
      try { markCustomCategoryRow(workspace); } catch(e){}
      try {
        const tb = workspace.getToolbox && workspace.getToolbox();
        tb && tb.refreshSelection && tb.refreshSelection();
      } catch(e){}
    }, 60);
  }

  function markCustomCategoryRow(workspace){
    const tb = workspace && workspace.getToolbox && workspace.getToolbox();
    if (!tb || !tb.getToolboxItems) return;
    const items = tb.getToolboxItems();
    for (const it of items){
      try{
        if (typeof it.getId === 'function' && it.getId() === CFG.customCategoryId){
          const div = it.getDiv && it.getDiv();
          if (div) div.classList.add('rcCustomCatRow');
        }
      }catch(e){}
    }
  }

  function selectCustomCategory(workspace){
    try{
      const tb = workspace.getToolbox && workspace.getToolbox();
      if (tb && typeof tb.selectItem === 'function'){
        tb.selectItem(CFG.customCategoryId);
      }
      tb && tb.refreshSelection && tb.refreshSelection();
    }catch(e){}
  }

  // ------------------------------------------------------------
  // Mini blocks + rc_param block
  // ------------------------------------------------------------
  const GEAR_SVG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18">
  <rect width="18" height="18" rx="4" ry="4" fill="none"/>
  <text x="9" y="13" text-anchor="middle" font-size="14">⚙</text>
</svg>`);

  function getAllBlockTypesDropdown(){
    try {
      const Blockly = window.Blockly;
      if (!Blockly || !Blockly.Blocks) return [['(нема)', '']];
      const types = Object.keys(Blockly.Blocks)
        .filter(t => !t.startsWith('rc_'))
        .sort((a,b)=>a.localeCompare(b,'en'));
      const res = types.map(t => [t, t]);
      return res.length ? res : [['(нема)', '']];
    } catch(e){
      return [['(нема)', '']];
    }
  }

  function getParamOptions(){
    const opts = RC._currentParamOptions || [];
    if (!opts.length) return [['(нема)', '']];
    return opts.map(p => [p.name, p.name]);
  }

  function defineMiniAndParamBlocks(Blockly){
    if (Blockly.Blocks['rc_mini']) return;

    function addGearField(input, miniBlockRefGetter){
      const field = new Blockly.FieldImage(GEAR_SVG, 16, 16, '⚙', function(){
        const b = miniBlockRefGetter();
        if (b) openMiniConfigModal(b);
      });
      input.appendField(field, 'GEAR');
    }

    
    // NOTE: In this build we DO NOT expose WRAP_TYPE dropdown anymore.
    // Mini blocks store a whole inner-workspace (JSON/XML) in block.data.
    Blockly.Blocks['rc_mini'] = {
      init: function(){
        const input = this.appendDummyInput();
        input.appendField('🧩')
          .appendField(new Blockly.FieldTextInput('mini'), 'LABEL');
        addGearField(input, ()=>this);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour('#64748B');
        this.setTooltip('Міні-блок: зберігає маленький фрагмент програми (внутрішній workspace)');
        this.data = this.data || '';
        // Persist internal state in workspace serialization:
        this.saveExtraState = ()=>({ rcMini: this.data || '' });
        this.loadExtraState = (st)=>{ if (st && typeof st.rcMini === 'string') this.data = st.rcMini; };
        // Back-compat for XML-only builds:
        this.mutationToDom = ()=>{
          const m = document.createElement('mutation');
          m.setAttribute('rcMini', this.data || '');
          return m;
        };
        this.domToMutation = (xml)=>{
          const v = xml && xml.getAttribute && xml.getAttribute('rcMini');
          if (v !== null && v !== undefined) this.data = v;
        };
      }
    };

    Blockly.Blocks['rc_mini_value'] = {
      init: function(){
        const input = this.appendDummyInput();
        input.appendField('🔹')
          .appendField(new Blockly.FieldTextInput('val'), 'LABEL');
        addGearField(input, ()=>this);
        this.setOutput(true, null);
        this.setColour('#475569');
        this.setTooltip('Міні-значення: зберігає value-вираз (внутрішній workspace)');
        this.data = this.data || '';
        this.saveExtraState = ()=>({ rcMini: this.data || '' });
        this.loadExtraState = (st)=>{ if (st && typeof st.rcMini === 'string') this.data = st.rcMini; };
        this.mutationToDom = ()=>{
          const m = document.createElement('mutation');
          m.setAttribute('rcMini', this.data || '');
          return m;
        };
        this.domToMutation = (xml)=>{
          const v = xml && xml.getAttribute && xml.getAttribute('rcMini');
          if (v !== null && v !== undefined) this.data = v;
        };
      }
    };


    // Parameter block (value)
    Blockly.Blocks['rc_param'] = {
      init: function(){
        this.appendDummyInput()
          .appendField('🔧')
          .appendField(new Blockly.FieldDropdown(getParamOptions), 'PNAME');
        this.setOutput(true, null);
        this.setColour('#0EA5E9');
        this.setTooltip('Параметр кастом-блоку (значення з великого блоку)');
      }
    };

    // Context menu items for mini blocks (quick actions)
    if (Blockly.ContextMenuRegistry && Blockly.ContextMenuRegistry.registry){
      const reg = Blockly.ContextMenuRegistry.registry;

      const isMini = (b)=> b && (b.type==='rc_mini' || b.type==='rc_mini_value');

      if (!reg.getItem('rc_mini_config')){
        reg.register({
          id: 'rc_mini_config',
          scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
          displayText: ()=> '⚙ Налаштувати міні-блок…',
          preconditionFn: (scope)=> isMini(scope.block) ? 'enabled' : 'hidden',
          callback: (scope)=> openMiniConfigModal(scope.block),
          weight: 120
        });
      }
      if (!reg.getItem('rc_mini_dup')){
        reg.register({
          id: 'rc_mini_dup',
          scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
          displayText: ()=> '📄 Дублювати',
          preconditionFn: (scope)=> isMini(scope.block) ? 'enabled' : 'hidden',
          callback: (scope)=> duplicateMini(scope.block),
          weight: 121
        });
      }
      if (!reg.getItem('rc_mini_copy_state')){
        reg.register({
          id: 'rc_mini_copy_state',
          scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
          displayText: ()=> '📋 Копіювати стан',
          preconditionFn: (scope)=> isMini(scope.block) ? 'enabled' : 'hidden',
          callback: (scope)=> copyMiniState(scope.block),
          weight: 122
        });
      }
      if (!reg.getItem('rc_mini_paste_state')){
        reg.register({
          id: 'rc_mini_paste_state',
          scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
          displayText: ()=> '📥 Вставити стан',
          preconditionFn: (scope)=> isMini(scope.block) ? 'enabled' : 'hidden',
          callback: (scope)=> pasteMiniState(scope.block),
          weight: 123
        });
      }
      if (!reg.getItem('rc_mini_convert')){
        reg.register({
          id: 'rc_mini_convert',
          scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
          displayText: (scope)=> scope.block?.type==='rc_mini' ? '🔁 Зробити VALUE' : '🔁 Зробити STATEMENT',
          preconditionFn: (scope)=> isMini(scope.block) ? 'enabled' : 'hidden',
          callback: (scope)=> convertMini(scope.block),
          weight: 124
        });
      }
    }

    const jsGen = Blockly.JavaScript || Blockly.javascriptGenerator;
    if (!jsGen) return;

    // hidden ws for generator bridge
    let hiddenWs = null;
    function ensureHiddenWs(){
      if (hiddenWs) return hiddenWs;
      const div = document.createElement('div');
      div.style.position='fixed'; div.style.left='-99999px'; div.style.top='-99999px';
      div.style.width='10px'; div.style.height='10px'; div.style.opacity='0';
      document.body.appendChild(div);
      hiddenWs = Blockly.inject(div, { toolbox:'<xml></xml>', readOnly:false, scrollbars:false, trashcan:false });
      return hiddenWs;
    }

    function serializeBlock(block){
      try { if (Blockly.serialization?.blocks?.save) return { kind:'json', payload: Blockly.serialization.blocks.save(block) }; }
      catch(e){}
      try {
        const xml = Blockly.Xml.blockToDom(block, true);
        return { kind:'xml', payload: Blockly.Xml.domToText(xml) };
      } catch(e){}
      return null;
    }

    function deserializeBlockTo(ws, wrapType, stateObj){
      ws.clear();
      let b = null;

      if (stateObj && stateObj.kind === 'json' && Blockly.serialization?.blocks?.load){
        try{
          Blockly.serialization.blocks.load(stateObj.payload, ws);
          b = ws.getTopBlocks(true)[0] || null;
        }catch(e){ b=null; }
      }
      if (!b){
        try{
          b = ws.newBlock(wrapType);
          b.initSvg(); b.render();
          if (stateObj && stateObj.kind === 'xml'){
            const dom = Blockly.Xml.textToDom(stateObj.payload);
            ws.clear();
            const loaded = Blockly.Xml.domToBlock(dom, ws);
            b = loaded || b;
            b.initSvg(); b.render();
          }
        }catch(e){
          try{ b = ws.newBlock(wrapType); b.initSvg(); b.render(); }catch(_){ b=null; }
        }
      }
      return b;
    }

    // Workspace-level serialization for mini blocks (preferred).
    function serializeWorkspace(ws){
      try{
        if (Blockly.serialization?.workspaces?.save){
          return { kind:'wsjson', payload: Blockly.serialization.workspaces.save(ws) };
        }
      }catch(e){}
      try{
        const xml = Blockly.Xml.workspaceToDom(ws);
        return { kind:'wsxml', payload: Blockly.Xml.domToText(xml) };
      }catch(e){}
      return { kind:'wsxml', payload: '<xml></xml>' };
    }

    function deserializeWorkspaceTo(ws, stateObj){
      if (!ws) return;
      try { ws.clear(); } catch(e){}
      if (!stateObj) return;

      // New explicit kinds
      const kind = stateObj.kind;
      if ((kind === 'wsjson') || (kind === 'json' && stateObj.payload && stateObj.payload.blocks)){
        if (Blockly.serialization?.workspaces?.load){
          try{ Blockly.serialization.workspaces.load(stateObj.payload, ws); return; }catch(e){}
        }
      }
      if ((kind === 'wsxml') || (kind === 'xml' && typeof stateObj.payload === 'string' && stateObj.payload.trim().startsWith('<xml'))){
        try{
          const dom = Blockly.Xml.textToDom(stateObj.payload);
          Blockly.Xml.domToWorkspace(dom, ws);
          return;
        }catch(e){}
      }

      // Legacy single-block formats (block json/xml)
      if (kind === 'json' && Blockly.serialization?.blocks?.load){
        try{ Blockly.serialization.blocks.load(stateObj.payload, ws); return; }catch(e){}
      }
      if (kind === 'xml' && typeof stateObj.payload === 'string'){
        try{
          const dom = Blockly.Xml.textToDom(stateObj.payload);
          Blockly.Xml.domToBlock(dom, ws);
          return;
        }catch(e){}
      }
    }

    RC._miniSerialize = serializeBlock;         // legacy: one block
    RC._miniDeserializeTo = deserializeBlockTo; // legacy: one block
    RC._miniSerializeWS = serializeWorkspace;   // new: whole workspace
    RC._miniDeserializeWS = deserializeWorkspaceTo;


    jsGen.forBlock = jsGen.forBlock || {};

    
    // Helper: load mini state (workspace JSON/XML OR legacy single-block JSON/XML) into a workspace.
    function loadMiniStateIntoWs(ws, state){
      if (!ws) return;
      try { ws.clear(); } catch(e){}
      if (!state) return;

      // Preferred (new): workspace serialization
      if (RC._miniDeserializeWS){
        try { RC._miniDeserializeWS(ws, state); return; } catch(e){}
      }

      // Legacy: single block serialization
      try{
        if (state.kind === 'json' && Blockly.serialization?.blocks?.load){
          Blockly.serialization.blocks.load(state.payload, ws);
          return;
        }
      }catch(e){}
      try{
        if (state.kind === 'xml' && typeof state.payload === 'string'){
          const dom = Blockly.Xml.textToDom(state.payload);
          ws.clear();
          Blockly.Xml.domToBlock(dom, ws);
          return;
        }
      }catch(e){}
    }

    jsGen.forBlock['rc_mini'] = function(block, generator){
      const state = u.jparse(block.data || '', null);
      const ws = ensureHiddenWs();
      loadMiniStateIntoWs(ws, state);

      let code = '';
      try{
        // workspaceToCode outputs code for all top blocks (safe for stacks under start_hat)
        code = (jsGen.workspaceToCode ? jsGen.workspaceToCode(ws) : '') || '';
      }catch(e){ code=''; }

      if (typeof code !== 'string') code = String(code || '');
      if (code && !code.endsWith('\n')) code += '\n';
      return code;
    };

    jsGen.forBlock['rc_mini_value'] = function(block, generator){
      const state = u.jparse(block.data || '', null);
      const ws = ensureHiddenWs();
      loadMiniStateIntoWs(ws, state);

      let target = null;
      try{
        const tops = ws.getTopBlocks(true);
        target = tops.find(b => b && b.outputConnection);
        if (!target){
          const all = ws.getAllBlocks(false) || [];
          target = all.find(b => b && b.outputConnection) || null;
        }
      }catch(e){ target=null; }

      if (!target){
        return ['0', jsGen.ORDER_ATOMIC || 0];
      }

      let out = '';
      let order = jsGen.ORDER_ATOMIC || 0;
      try{
        const r = (jsGen.blockToCode ? jsGen.blockToCode(target) : generator.blockToCode(target));
        if (Array.isArray(r)){ out = r[0] || ''; order = r[1] || order; }
        else out = r || '';
      }catch(e){ out = '0'; }

      if (typeof out !== 'string') out = String(out || '0');
      return [out, order];
    };


    jsGen.forBlock['rc_param'] = function(block, generator){
      const name = block.getFieldValue('PNAME') || '';
      const ctx = RC._paramCtx || {};
      const lit = ctx[name];
      // lit is already JS literal string
      return [ (lit !== undefined ? String(lit) : '0'), jsGen.ORDER_ATOMIC || 0 ];
    };
  }

  // ------------------------------------------------------------
  // Custom macro block types (stored) — dynamic fields from params
  // ------------------------------------------------------------
  function buildParamInputs(block, def){
    const Blockly = window.Blockly;
    const params = Array.isArray(def?.params) ? def.params : [];
    if (!params.length) return;

    for (const p of params){
      const pname = (p?.name||'').trim();
      if (!pname) continue;
      const kind = p.kind || 'number';

      const input = block.appendDummyInput('P_' + pname);

      input.appendField(pname + ':');
      if (kind === 'boolean'){
        input.appendField(new Blockly.FieldCheckbox(p.default ? 'TRUE':'FALSE'), 'PV_' + pname);
      } else if (kind === 'text'){
        input.appendField(new Blockly.FieldTextInput(String(p.default ?? '')), 'PV_' + pname);
      } else if (kind === 'dropdown'){
        const opts = Array.isArray(p.options) && p.options.length ? p.options : ['A','B'];
        const dd = new Blockly.FieldDropdown(opts.map(o=>[String(o), String(o)]));
        input.appendField(dd, 'PV_' + pname);
      } else { // number
        // Some Blockly versions don't have FieldNumber. Use text with validator.
        const validator = (v)=>{
          const n = Number(v);
          if (!isFinite(n)) return String(p.default ?? 0);
          const mn = (p.min !== undefined ? Number(p.min) : -1e9);
          const mx = (p.max !== undefined ? Number(p.max) :  1e9);
          return String(u.clamp(n, mn, mx));
        };
        input.appendField(new Blockly.FieldTextInput(String(p.default ?? 0), validator), 'PV_' + pname);
      }
    }
  }

  function collectParamCtxFromBlock(block, def){
    const params = Array.isArray(def?.params) ? def.params : [];
    const ctx = {};
    for (const p of params){
      const name = (p?.name||'').trim();
      if (!name) continue;
      const kind = p.kind || 'number';
      const fv = block.getFieldValue('PV_' + name);
      if (kind === 'boolean'){
        ctx[name] = (fv === 'TRUE' || fv === true || fv === 'true') ? 'true' : 'false';
      } else if (kind === 'text'){
        ctx[name] = JSON.stringify(String(fv ?? ''));
      } else if (kind === 'dropdown'){
        ctx[name] = JSON.stringify(String(fv ?? ''));
      } else {
        const n = Number(fv);
        ctx[name] = isFinite(n) ? String(n) : String(p.default ?? 0);
      }
    }
    return ctx;
  }

  function defineCustomBlockType(Blockly, blockType){
    if (!blockType) return;
    if (Blockly.Blocks[blockType]) return;

    Blockly.Blocks[blockType] = {
      init: function(){
        const def = RC._defsByType.get(blockType) || {};
        this.appendDummyInput('H').appendField('⭐').appendField(def.name || 'Custom');
        buildParamInputs(this, def);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(def.colour || CFG.defaultCustomBlockColour);
        this.setTooltip('Користувацький блок (збережений)');
      }
    };

    const jsGen = Blockly.JavaScript || Blockly.javascriptGenerator;
    if (!jsGen) return;
    jsGen.forBlock = jsGen.forBlock || {};
    jsGen.forBlock[blockType] = function(block, generator){
      const Blockly = window.Blockly;
      if (!Blockly) return '';
      const def = RC._defsByType.get(blockType);
      if (!def) return '';

      // Build param context for rc_param generator
      RC._paramCtx = collectParamCtxFromBlock(block, def);

      const div = document.createElement('div');
      div.style.position='fixed';
      div.style.left='-99999px';
      div.style.top='-99999px';
      div.style.width='10px';
      div.style.height='10px';
      div.style.opacity='0';
      document.body.appendChild(div);

      let tmpWs = null;
      try{
        tmpWs = Blockly.inject(div, { toolbox:'<xml></xml>', readOnly:false, scrollbars:false, trashcan:false });
        if (def.program && def.program.kind === 'json' && Blockly.serialization?.workspaces?.load){
          Blockly.serialization.workspaces.load(def.program.payload, tmpWs);
        } else if (def.program && def.program.kind === 'xml'){
          const dom = Blockly.Xml.textToDom(def.program.payload);
          Blockly.Xml.domToWorkspace(dom, tmpWs);
        }

        const tops = tmpWs.getTopBlocks(true);
        tops.sort((a,b)=>a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);

        let out = '';
        for (const t of tops){
          let c = '';
          try { c = (jsGen.blockToCode ? jsGen.blockToCode(t) : generator.blockToCode(t)) || ''; } catch(e){ c=''; }
          if (Array.isArray(c)) c = c[0] || '';
          if (typeof c !== 'string') c = String(c||'');
          out += c;
          if (out && !out.endsWith('\n')) out += '\n';
        }
        return out;
      } finally {
        RC._paramCtx = null;
        try { tmpWs && tmpWs.dispose(); } catch(e){}
        try { div.remove(); } catch(e){}
      }
    };
  }

  // ------------------------------------------------------------
  // Mini-block quick actions helpers
  // ------------------------------------------------------------
  
  function copyMiniState(block){
    if (!block) return;
    const state = {
      type: block.type,
      label: block.getFieldValue('LABEL') || '',
      data: block.data || ''
    };
    store.set(CFG.storageKeyClipboard, u.jstring(state));
    toast('Стан скопійовано');
  }
  function pasteMiniState(block){
    if (!block) return;
    const raw = store.get(CFG.storageKeyClipboard);
    const st = u.jparse(raw, null);
    if (!st) return toast('Буфер порожній');

    try{
      if (st.label) block.setFieldValue(st.label, 'LABEL');
      block.data = st.data || '';

      // Tell Blockly that block state changed (important for autosave/undo)
      const Blockly = window.Blockly;
      if (Blockly?.Events?.isEnabled && Blockly.Events.isEnabled()){
        try{ Blockly.Events.fire(new Blockly.Events.BlockChange(block, 'mutation', 'rcMini', '', block.data || '')); }catch(e){}
      }
      try{ if (typeof saveDraft === 'function') saveDraft(); }catch(e){}
      toast('Вставлено');
    }catch(e){ toast('Не вдалось вставити'); }
  }
  function duplicateMini(block){
    if (!block || !block.workspace) return;
    const ws = block.workspace;
    try{
      const xy = block.getRelativeToSurfaceXY();
      const nb = ws.newBlock(block.type);
      nb.initSvg(); nb.render();
      nb.moveBy(xy.x + 30, xy.y + 30);
      nb.setFieldValue(block.getFieldValue('LABEL') || '', 'LABEL');
      nb.data = block.data || '';
      toast('Дубль');
    }catch(e){}
  }
  function convertMini(block){
    if (!block || !block.workspace) return;
    const ws = block.workspace;
    const newType = (block.type === 'rc_mini') ? 'rc_mini_value' : 'rc_mini';
    try{
      const xy = block.getRelativeToSurfaceXY();
      const nb = ws.newBlock(newType);
      nb.initSvg(); nb.render();
      nb.moveBy(xy.x + 20, xy.y + 20);
      nb.setFieldValue(block.getFieldValue('LABEL') || '', 'LABEL');
      nb.data = block.data || '';
      block.dispose(true);
      toast('Конвертовано');
    }catch(e){}
  }


  // ------------------------------------------------------------
  // Mini config modal (large) + grid + add "Параметри" category
  // ------------------------------------------------------------
  const miniUI = { backdrop:null, modal:null, wsDiv:null, ws:null, current:null, metaType:null, metaKind:null, pre:null };

  function ensureMiniModal(){
    if (miniUI.modal) return;
    injectCss();

    miniUI.backdrop = u.el('div', { id:'rcMiniBackdrop' });
    miniUI.modal = u.el('div', { id:'rcMiniModal' });

    const hdr = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('span',{class:'dot'}), 'НАЛАШТУВАННЯ МІНІ-БЛОКУ' ]),
      u.el('button', { class:'x', onclick: closeMiniModal }, '✕')
    ]);

    miniUI.metaType = u.el('code', {}, '—');
    miniUI.metaKind = u.el('code', {}, '—');

    const btnSave = u.el('button', { class:'btn primary', onclick: saveMini }, 'Зберегти');
    const btnReset= u.el('button', { class:'btn', onclick: resetMini }, 'Скинути');

    const bar = u.el('div', { class:'bar' }, [
      u.el('div', { style:'display:flex; gap:10px; align-items:center; flex-wrap:wrap;' }, [
        u.el('span', { style:'opacity:.85;' }, 'Block type:'),
        miniUI.metaType,
        miniUI.metaKind
      ]),
      u.el('div', { style:'display:flex; gap:10px; align-items:center;' }, [btnReset, btnSave])
    ]);

    const tips = u.el('div', { style:'font-size:12px;color:#cbd5e1;line-height:1.35;' }, [
      u.el('div', { style:'font-weight:950; letter-spacing:.08em; text-transform:uppercase; font-size:11px; color:#94a3b8; margin-bottom:8px;' }, 'ПІДКАЗКИ'),
      u.el('ul', { style:'margin: 6px 0 0 16px; padding:0;' }, [
        u.el('li', {}, 'Тут справжній Blockly — можеш вставляти числа, змінні, PID, сенсори, if/цикли.'),
        u.el('li', {}, 'Після “Зберегти” всередині міні-блоку зберігається серіалізація (JSON/XML).'),
        u.el('li', {}, 'Категорія “Параметри” дає значення з великого кастом-блоку (rc_param).')
      ])
    ]);

    miniUI.pre = u.el('pre', {}, '// (empty)');
    const copyBtn = u.el('button', {
      class:'btn',
      style:'align-self:flex-start;',
      onclick: async ()=>{
        const txt = miniUI.pre.textContent || '';
        const ok = await u.copyText(txt);
        toast(ok ? 'Скопійовано' : 'Не вдалось');
      }
    }, 'Copy');

    const left = u.el('div', { class:'left' }, [
      tips,
      u.el('div', { style:'display:flex; align-items:center; justify-content:space-between; gap:10px;' }, [
        u.el('div', { style:'font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#a5b4fc; font-weight:950;' }, 'PREVIEW JS'),
        copyBtn
      ]),
      miniUI.pre
    ]);

    const host = u.el('div', { id:'rcMiniBlocklyHost' }, [ miniUI.wsDiv = u.el('div', { id:'rcMiniBlockly' }) ]);
    const right = u.el('div', { class:'right' }, [ host ]);

    const body = u.el('div', { class:'body' }, [ left, right ]);

    miniUI.modal.appendChild(hdr);
    miniUI.modal.appendChild(bar);
    miniUI.modal.appendChild(body);

    document.body.appendChild(miniUI.backdrop);
    document.body.appendChild(miniUI.modal);

    miniUI.backdrop.addEventListener('click', closeMiniModal);
    document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && miniUI.modal.style.display==='block') closeMiniModal(); });

    const ro = new ResizeObserver(u.debounce(()=>{
      try { miniUI.ws && window.Blockly && window.Blockly.svgResize(miniUI.ws); } catch(e){}
    }, 30));
    ro.observe(host);
  }

  function openMiniConfigModal(miniBlock){
    ensureMiniModal();
    const Blockly = window.Blockly;
    if (!Blockly || !miniUI.modal) return;
    miniUI.current = miniBlock;
    const kind = miniBlock.type === 'rc_mini_value' ? 'VALUE' : 'STATEMENT';
    miniUI.metaType.textContent = '—';
    miniUI.metaKind.textContent = kind;

    miniUI.backdrop.style.display='block';
    miniUI.modal.style.display='block';

    // recreate ws
    try { miniUI.ws && miniUI.ws.dispose(); } catch(e){}
    miniUI.ws = null;
    miniUI.wsDiv.innerHTML='';

    // Build toolbox = main toolbox clone + add "Параметри" category on top
    const baseToolbox = document.getElementById('toolbox')?.cloneNode(true);
    const toolboxXml = baseToolbox || document.createElement('xml');

    // Update param options based on currently edited custom block in builder
    RC._currentParamOptions = getBuilderParams();

    try{
      const cat = document.createElement('category');
      cat.setAttribute('name','Параметри');
      cat.setAttribute('colour','#0EA5E9');
      const b = document.createElement('block');
      b.setAttribute('type','rc_param');
      cat.appendChild(b);
      toolboxXml.insertBefore(cat, toolboxXml.firstChild);
    }catch(e){}

    miniUI.ws = Blockly.inject(miniUI.wsDiv, {
      toolbox: toolboxXml,
      theme: getCBTheme(Blockly),
      toolboxPosition: 'start',
      trashcan: false,
      scrollbars: true,
      zoom: { controls: false, wheel: false, startScale: 0.95, maxScale: 2, minScale: 0.5, scaleSpeed: 1.1 },
      move: { scrollbars: true, drag: true, wheel: false },
      grid: { spacing: 26, length: 3, colour: 'rgba(148,163,184,.22)', snap: true },
      renderer: 'zelos'
    });

    // Scratch-like navigation (pan with drag, zoom with wheel)
    enableScratchPan(miniUI.ws);
    enableScratchWheel(miniUI.ws);

    // Force dark toolbox/flyout for Mini-Blockly too
    try{
      const tb = miniUI.ws && miniUI.ws.getToolbox && miniUI.ws.getToolbox();
      if (tb && tb.HtmlDiv) tb.HtmlDiv.style.background = 'rgba(2,6,23,.94)';
    }catch(e){}
    try{
      const fl = miniUI.ws && miniUI.ws.getFlyout && miniUI.ws.getFlyout();
      if (fl && fl.svgBackground_) fl.svgBackground_.setAttribute('fill', 'rgba(2,6,23,.94)');
    }catch(e){}

    restoreMiniInner(miniBlock);

    const updatePreview = u.debounce(()=>{
      try{
        const jsGen = Blockly.JavaScript || Blockly.javascriptGenerator;
        miniUI.pre.textContent = (jsGen && miniUI.ws) ? ((jsGen.workspaceToCode(miniUI.ws) || '').trim() || '// (empty)') : '// (no generator)';
      }catch(e){ miniUI.pre.textContent='// (error)'; }
    }, 100);
    miniUI.ws.addChangeListener(updatePreview);

    setTimeout(()=>{ try{ Blockly.svgResize(miniUI.ws); }catch(e){} }, 80);
    setTimeout(()=>{ try{ Blockly.svgResize(miniUI.ws); }catch(e){} }, 180);
    updatePreview();
  }

  function closeMiniModal(){
    if (!miniUI.modal) return;
    miniUI.backdrop.style.display='none';
    miniUI.modal.style.display='none';
    miniUI.current = null;
    try { miniUI.ws && miniUI.ws.dispose(); } catch(e){}
    miniUI.ws = null;
  }

  
  function restoreMiniInner(miniBlock, forceFresh=false){
    const Blockly = window.Blockly;
    if (!Blockly || !miniUI.ws) return;
    try{ miniUI.ws.clear(); }catch(e){}

    let state = null;
    if (!forceFresh) state = u.jparse(miniBlock.data || '', null);

    // Load saved inner workspace if possible
    if (state && RC._miniDeserializeWS){
      try{ RC._miniDeserializeWS(miniUI.ws, state); }catch(e){}
    } else if (state && RC._miniDeserializeTo){
      // Back-compat: legacy single-block state
      try{ RC._miniDeserializeTo(miniUI.ws, 'start_hat', state); }catch(e){}
    }

    // If still empty — create a default starter block
    let blocksCount = 0;
    try{ blocksCount = (miniUI.ws.getAllBlocks(false) || []).length; }catch(e){ blocksCount = 0; }
    if (!blocksCount){
      const isVal = (miniBlock.type === 'rc_mini_value');
      const defaultType = isVal ? (Blockly.Blocks?.math_number ? 'math_number' : null)
                                : (Blockly.Blocks?.start_hat ? 'start_hat' : (Blockly.Blocks?.controls_if ? 'controls_if' : null));
      if (defaultType){
        try{
          const b = miniUI.ws.newBlock(defaultType);
          b.initSvg(); b.render();
          b.moveBy(60, 60);
        }catch(e){}
      }
    }

    // Arrange tops a bit (nice)
    try{
      const tops = miniUI.ws.getTopBlocks(true);
      let y = 40;
      for (const t of tops){
        t.moveBy(40, y);
        y += 80;
      }
    }catch(e){}

    // Update modal meta: show what types exist inside
    try{
      if (miniUI.metaType){
        const tops = miniUI.ws.getTopBlocks(true);
        const types = tops.map(b=>b.type).filter(Boolean);
        miniUI.metaType.textContent = types.length ? types.slice(0,3).join(', ') + (types.length>3?'…':'') : '—';
      }
    }catch(e){}

    try{ Blockly.svgResize(miniUI.ws); }catch(e){}
  }

  function saveMini(){
    const b = miniUI.current;
    if (!b || !miniUI.ws) return;

    const oldData = b.data || '';

    // Save whole workspace (preferred)
    const ser = (RC._miniSerializeWS ? RC._miniSerializeWS(miniUI.ws) : null);
    b.data = ser ? u.jstring(ser) : '';

    // Tell Blockly “this block changed” (needed for autosave + undo)
    try{
      const Blockly = window.Blockly;
      if (Blockly?.Events?.isEnabled && Blockly.Events.isEnabled()){
        Blockly.Events.fire(new Blockly.Events.BlockChange(b, 'mutation', 'rcMini', oldData, b.data || ''));
      }
    }catch(e){}

    // Force save draft immediately (fixes: changes inside inner if/stack)
    try{ if (typeof saveDraft === 'function') saveDraft(); }catch(e){}

    let cnt = 0;
    try{ cnt = (miniUI.ws.getAllBlocks(false) || []).length; }catch(e){ cnt = 0; }
    
    // Also generate & publish preview JS for Simulator (auto, no manual copy needed)
    try{
      const Blockly = window.Blockly;
      const jsGen = (Blockly && (Blockly.JavaScript || Blockly.javascriptGenerator)) ? (Blockly.JavaScript || Blockly.javascriptGenerator) : null;
      const js = (jsGen && miniUI.ws) ? String(jsGen.workspaceToCode(miniUI.ws) || '') : '';
      window.__rc_customblock_preview_js = js;
      try{ localStorage.setItem('rc_customblock_preview_js', js); }catch(e){}
      // helpful for debugging
      window.__rc_customblock_preview_ts = Date.now();
    }catch(e){}

toast(`Збережено: ${cnt} блоків`);
    closeMiniModal();
  }

  function resetMini(){
    const b = miniUI.current;
    if (!b || !miniUI.ws) return;
    const oldData = b.data || '';
    b.data = '';
    try{
      const Blockly = window.Blockly;
      if (Blockly?.Events?.isEnabled && Blockly.Events.isEnabled()){
        Blockly.Events.fire(new Blockly.Events.BlockChange(b, 'mutation', 'rcMini', oldData, ''));
      }
    }catch(e){}
    try{ if (typeof saveDraft === 'function') saveDraft(); }catch(e){}
    restoreMiniInner(b, true);
    toast('Скинуто');
  }


  function ensureCustomBlocksView(){
    if (builder.section) return;
    injectCss();

    const main = document.querySelector('main.flex-1.relative') || document.querySelector('main');
    if (!main) return;

    builder.section = u.el('section', {
      id: 'view-customblocks',
      class: 'absolute inset-0 flex flex-col hidden opacity-0 transition-opacity duration-300'
    });

        builder.backBtn = u.el('button', {
      class: 'btn rcBackBtn',
      title: 'Назад до блоків',
      onclick: ()=> RC.closeCustomBuilder()
    }, [u.el('i', { class: 'fa-solid fa-arrow-left' }), u.el('span', {style:'margin-left:8px;'}, 'Назад')]);

    builder.btnMgr = u.el('button', { class:'btn', onclick: ()=> openManager() }, 'Мої блоки');
    builder.btnParams = u.el('button', { class:'btn', onclick: ()=> openParams() }, 'Параметри');
    builder.btnTemplates = u.el('button', { class:'btn', onclick: ()=> openTemplates() }, 'Шаблони');
    builder.btnValidate = u.el('button', { class:'btn', onclick: ()=> openValidation() }, 'Перевірити');
    builder.btnSim = u.el('button', { class:'btn', onclick: ()=> openSimulator() }, 'Симулятор');
    builder.btnHistory = u.el('button', { class:'btn', onclick: ()=> openHistory() }, 'Історія');
    // Removed per user request: hide C/STM32 generation entry from the top bar.
    builder.btnC = null;

    const topBar = u.el('div', { id:'rcCustomBlocksTop' }, [
      builder.backBtn,
      u.el('span', { class:'lbl' }, 'Назва'),
      builder.nameInput = u.el('input', { type:'text', value:'Мій блок' }),
      u.el('span', { class:'lbl', style:'margin-left:10px;' }, 'Колір'),
      builder.colourInput = u.el('input', { type:'color', value: CFG.defaultCustomBlockColour }),
      u.el('div', { style:'flex:1;' }),
      builder.btnMgr,
      builder.btnParams,
      builder.btnTemplates,
      builder.btnValidate,
      builder.btnSim,
      builder.btnHistory,
      u.el('button', { class:'btn primary', onclick: ()=> packOrUpdateCustomBlock() }, 'Спакувати блок')
    ]);

    builder.wsDiv = u.el('div', { id:'rcCustomBlocksDiv' });

    builder.section.appendChild(topBar);
    builder.section.appendChild(builder.wsDiv);

    const viewBuilder = document.getElementById('view-builder');
    if (viewBuilder && viewBuilder.parentElement === main) main.insertBefore(builder.section, viewBuilder.nextSibling);
    else main.appendChild(builder.section);
  }

  function ensureBuilderWorkspace(){
    ensureCustomBlocksView();
    const Blockly = window.Blockly;
    if (!Blockly || !builder.section || !builder.wsDiv) return;
    if (builder.ws) return;

    // Toolbox: ONLY 2 mini blocks
    const toolbox = document.createElement('xml');
    toolbox.innerHTML = `
      <category name="Міні" colour="#64748B">
        <block type="rc_mini"></block>
        <block type="rc_mini_value"></block>
      </category>
    `;

    builder.ws = Blockly.inject(builder.wsDiv, {
      toolbox,
      theme: getCBTheme(Blockly),
      toolboxPosition: 'start',
      trashcan: false,
      scrollbars: true,
      zoom: { controls: false, wheel: false, startScale: 0.95, maxScale: 2, minScale: 0.5, scaleSpeed: 1.1 },
      move: { scrollbars: true, drag: true, wheel: false },
      grid: { spacing: 26, length: 3, colour: 'rgba(148,163,184,.22)', snap: true },
      renderer: 'zelos'
    });

    // Scratch-like navigation (pan with drag, zoom with wheel)
    enableScratchPan(builder.ws);
    enableScratchWheel(builder.ws);

    // Force dark toolbox/flyout in case global styles override theme (index styles can be aggressive)
    try{
      const tb = builder.ws && builder.ws.getToolbox && builder.ws.getToolbox();
      if (tb && tb.HtmlDiv) tb.HtmlDiv.style.background = 'rgba(2,6,23,.94)';
    }catch(e){}
    try{
      const fl = builder.ws && builder.ws.getFlyout && builder.ws.getFlyout();
      if (fl && fl.svgBackground_) fl.svgBackground_.setAttribute('fill', 'rgba(2,6,23,.94)');
    }catch(e){}

    // Autosave draft + history snapshots debounced
    builder.ws.addChangeListener(u.debounce(()=>{
      saveDraft();
    }, 450));

    const ro = new ResizeObserver(u.debounce(()=>{
      try { builder.ws && Blockly.svgResize(builder.ws); } catch(e){}
    }, 40));
    ro.observe(builder.wsDiv);

    setTimeout(()=>{ try{ Blockly.svgResize(builder.ws); }catch(e){} }, 120);
  }

  function showView(el){
    if (!el) return;
    el.classList.remove('hidden');
    setTimeout(()=>{
      el.classList.remove('opacity-0');
      el.classList.add('opacity-100');
    }, 10);
  }
  function hideView(el){
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('opacity-100');
    el.classList.add('opacity-0');
  }

  function clearBuilder(){
    try { builder.ws && builder.ws.clear(); } catch(e){}
    builder.editingType = null;
    if (builder.nameInput) builder.nameInput.value = 'Мій блок';
    if (builder.colourInput) builder.colourInput.value = CFG.defaultCustomBlockColour;
    setBuilderParams([]);
  }

  // ------------------------------------------------------------
  // Draft + History
  // ------------------------------------------------------------
  function getDraftKey(){
    return CFG.storageKeyDraft + ':' + (builder.editingType || 'new');
  }
  function saveDraft(){
    const Blockly = window.Blockly;
    if (!Blockly || !builder.ws) return;
    let payload = null;
    try{ if (Blockly.serialization?.workspaces?.save) payload = { kind:'json', payload: Blockly.serialization.workspaces.save(builder.ws) }; }catch(e){}
    if (!payload){
      try{
        const xml = Blockly.Xml.workspaceToDom(builder.ws);
        payload = { kind:'xml', payload: Blockly.Xml.domToText(xml) };
      }catch(e){ payload = { kind:'xml', payload:'<xml></xml>' }; }
    }
    const draft = {
      ts: Date.now(),
      name: builder.nameInput?.value || '',
      colour: builder.colourInput?.value || CFG.defaultCustomBlockColour,
      params: getBuilderParams(),
      program: payload
    };
    store.set(getDraftKey(), u.jstring(draft));

    // Also push to short history list (only when meaningful)
    pushHistorySnapshot(draft);
  }

  function loadDraft(){
    const raw = store.get(getDraftKey());
    const d = u.jparse(raw, null);
    if (!d) return false;
    applyDraft(d);
    return true;
  }

  function applyDraft(d){
    const Blockly = window.Blockly;
    ensureBuilderWorkspace();
    if (!Blockly || !builder.ws || !d) return;
    builder.nameInput.value = d.name || 'Мій блок';
    builder.colourInput.value = d.colour || CFG.defaultCustomBlockColour;
    setBuilderParams(Array.isArray(d.params)?d.params:[]);

    builder.ws.clear();
    if (d.program?.kind === 'json' && Blockly.serialization?.workspaces?.load){
      try{ Blockly.serialization.workspaces.load(d.program.payload, builder.ws); }catch(e){}
    } else if (d.program?.kind === 'xml'){
      try{
        const dom = Blockly.Xml.textToDom(d.program.payload);
        Blockly.Xml.domToWorkspace(dom, builder.ws);
      }catch(e){}
    }
    setTimeout(()=>{ try{ Blockly.svgResize(builder.ws); }catch(e){} }, 60);
  }

  function historyKey(){
    return CFG.storageKeyHistoryPrefix + (builder.editingType || 'new');
  }
  function getHistory(){
    const raw = store.get(historyKey());
    const arr = u.jparse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }
  function setHistory(arr){
    store.set(historyKey(), u.jstring(arr || []));
  }
  function pushHistorySnapshot(draft){
    // push only if changed enough (basic hash)
    const arr = getHistory();
    const sig = u.jstring({ name:draft.name, colour:draft.colour, params:draft.params, program:draft.program });
    const last = arr[0];
    if (last && last.sig === sig) return;
    arr.unshift({ ts: draft.ts, label: u.nowLabel(), sig, draft });
    if (arr.length > CFG.maxHistory) arr.length = CFG.maxHistory;
    setHistory(arr);
  }

  // ------------------------------------------------------------
  // Parameters (builder state)
  // ------------------------------------------------------------
  let builderParams = [];
  function setBuilderParams(arr){
    builderParams = Array.isArray(arr) ? arr : [];
    // update current param options for rc_param dropdown
    RC._currentParamOptions = builderParams.map(p => ({ name: String(p.name||'').trim(), kind:p.kind }))
      .filter(p=>p.name);
  }
  function getBuilderParams(){ return builderParams.slice(); }

  // ------------------------------------------------------------
  // Open/close custom builder view
  // ------------------------------------------------------------
  RC.openCustomBuilder = function(){
    if (!isDesktop()) return;
    ensureBuilderWorkspace();
    const el = document.getElementById('view-customblocks');
    if (!el) return;

    if (typeof window.switchView === 'function') window.switchView('view-customblocks');
    else showView(el);

    if (typeof window.toggleScratchMode === 'function') window.toggleScratchMode(true);

    setTimeout(()=>{ try { window.Blockly && builder.ws && window.Blockly.svgResize(builder.ws); } catch(e){} }, 140);
  };

  RC.closeCustomBuilder = function(){
    const el = document.getElementById('view-customblocks');
    if (!el) return;
    if (typeof window.switchView === 'function'){
      const btn = document.querySelector('button.nav-btn[title="Блоки"]') || null;
      window.switchView('view-builder', btn);
    } else {
      hideView(el);
      const vb = document.getElementById('view-builder');
    showView(vb);
    }
    setTimeout(()=>{ try { window.Blockly && window.workspace && window.Blockly.svgResize(window.workspace); } catch(e){} }, 120);
  };

  // ------------------------------------------------------------
  // Floating 🧩 button in Scratch view only
  // ------------------------------------------------------------
  function ensureOpenButton(){
    if (!isDesktop()) return;
    injectCss();

    const vb = document.getElementById('view-builder');
    if (!vb) return;
    // ensure container for absolute-positioned 🧩 button
    try{ if (getComputedStyle(vb).position==='static') vb.style.position='relative'; }catch(e){}

    let btn = document.getElementById('rcCbOpenBtn');
    if (!btn){
      btn = u.el('button', { id:'rcCbOpenBtn', title:'RC Студія' }, '🧩');
      btn.addEventListener('click', ()=> RC.openCustomBuilder());
      vb.appendChild(btn);
    }

    const update = ()=>{
      const hidden = vb.classList.contains('hidden');
      const builderActive = (vb && !vb.classList.contains('hidden') && vb.offsetParent !== null);
      btn.style.display = builderActive ? 'inline-flex' : 'none';
    };
    update();

    const mo = new MutationObserver(u.debounce(update, 20));
    mo.observe(vb, { attributes:true, attributeFilter:['class','style'] });

    hookSwitchView();
  }

  // ------------------------------------------------------------
  // Hook switchView to show/hide view-customblocks
  // ------------------------------------------------------------
  let switchHooked = false;
  function hookSwitchView(){
    if (switchHooked) return;
    if (typeof window.switchView !== 'function') return;

    switchHooked = true;
    const orig = window.switchView;

    window.switchView = function(viewId, btnElement){
      const custom = document.getElementById('view-customblocks');
      if (custom && viewId !== 'view-customblocks') hideView(custom);

      const res = orig.call(this, viewId, btnElement);

      if (viewId === 'view-customblocks'){
        ensureBuilderWorkspace();
        showView(custom);
        if (typeof window.toggleScratchMode === 'function') window.toggleScratchMode(true);
        setTimeout(()=>{ try { window.Blockly && builder.ws && window.Blockly.svgResize(builder.ws); } catch(e){} }, 120);
      } else {
        if (typeof window.toggleScratchMode === 'function'){
          if (viewId !== 'view-builder') window.toggleScratchMode(false);
        }
      }
      return res;
    };
  }

  // ------------------------------------------------------------
  // Manager modal (existing blocks) + share link
  // ------------------------------------------------------------
  const mgr = { backdrop:null, modal:null, list:null, fileInput:null };

  function ensureManager(){
    if (mgr.modal) return;
    injectCss();

    mgr.backdrop = u.el('div', { class:'rcModalBackdrop', id:'rcCbMgrBackdrop' });
    mgr.modal = u.el('div', { class:'rcModal', id:'rcCbMgrModal' });

    const hdr = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('span',{class:'dot'}), 'МОЇ КАСТОМНІ БЛОКИ' ]),
      u.el('button', { class:'x', onclick: closeManager }, '✕')
    ]);

    const btnExport = u.el('button', { class:'btn', onclick: ()=>{
      const defs = loadBlocks();
      u.downloadText('custom_blocks.json', u.jstring({ version: VERSION, defs }));
      toast('Export готовий');
    }}, 'Export');

    const btnShare = u.el('button', { class:'btn', onclick: async ()=>{
      const defs = loadBlocks();
      const payload = u.jstring({ version: VERSION, defs });
      const b64 = u.b64enc(payload);
      const url = location.origin + location.pathname + '#cb=' + b64;
      const ok = await u.copyText(url);
      toast(ok ? 'Лінк скопійовано' : 'Не вдалось');
    }}, 'Share');

    mgr.fileInput = u.el('input', { type:'file', accept:'application/json', style:'display:none;' });
    mgr.fileInput.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      await importDefsFromText(await f.text());
      mgr.fileInput.value='';
    });

    const btnImport = u.el('button', { class:'btn', onclick: ()=> mgr.fileInput.click() }, 'Import');

    const btnNew = u.el('button', { class:'btn primary', onclick: ()=>{
      RC.openCustomBuilder();
      clearBuilder();
      closeManager();
      // Try load last draft for new
      setTimeout(()=> loadDraft(), 120);
    }}, 'Новий');

    const bar = u.el('div', { class:'bar' }, [
      u.el('div', { style:'display:flex; gap:10px; align-items:center;' }, [btnExport, btnShare, btnImport, mgr.fileInput]),
      u.el('div', { style:'display:flex; gap:10px; align-items:center;' }, [btnNew])
    ]);

    mgr.list = u.el('div', { class:'body', style:'height: calc(100% - 110px);' });

    mgr.modal.appendChild(hdr);
    mgr.modal.appendChild(bar);
    mgr.modal.appendChild(mgr.list);

    document.body.appendChild(mgr.backdrop);
    document.body.appendChild(mgr.modal);

    mgr.backdrop.addEventListener('click', closeManager);
    document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && mgr.modal.style.display==='block') closeManager(); });
  }

  async function importDefsFromText(txt){
    try{
      const obj = u.jparse(txt, null);
      const incoming = obj && (obj.defs || obj.blocks || obj);
      if (!Array.isArray(incoming)) throw new Error('bad format');
      const existing = loadBlocks();
      const byType = new Map(existing.map(d=>[d.blockType,d]));
      for (const d of incoming){
        if (!d || !d.blockType) continue;
        byType.set(d.blockType, d);
      }
      const merged = Array.from(byType.values());
      saveBlocks(merged);
      rebuildDefsMap();
      // Register missing types
      const Blockly = window.Blockly;
      if (Blockly){
        for (const d of merged) defineCustomBlockType(Blockly, d.blockType);
      }
      const mainWs = window.workspace || window._workspace;
      mainWs && rebuildCustomCategory(mainWs);
      toast('Імпортовано');
      refreshManagerList();
    }catch(err){
      toast('Помилка імпорту');
    }
  }

  function openManager(){
    ensureManager();
    refreshManagerList();
    mgr.backdrop.style.display='block';
    mgr.modal.style.display='block';
  }
  function closeManager(){
    if (!mgr.modal) return;
    mgr.backdrop.style.display='none';
    mgr.modal.style.display='none';
  }

  function refreshManagerList(){
    if (!mgr.list) return;
    mgr.list.innerHTML='';

    const defs = loadBlocks().sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
    if (!defs.length){
      mgr.list.appendChild(u.el('div',{style:'color:#94a3b8;font-weight:900;padding:10px;'},'Нема кастомних блоків. Натисни "Новий".'));
      return;
    }

    for (const d of defs){
      const sw = u.el('div', { class:'sw', style:`background:${d.colour || CFG.defaultCustomBlockColour};` });
      const name = u.el('div', { class:'name' }, d.name || d.blockType);
      const meta = u.el('div', { class:'meta' }, (d.blockType||'').slice(0,26));

      const btnEdit = u.el('button', { class:'btn', onclick: ()=>{
        closeManager();
        RC.openCustomBuilder();
        setTimeout(()=> loadProgramIntoBuilder(d), 120);
      }}, 'Редаг.');

      const btnRename = u.el('button', { class:'btn', onclick: ()=>{
        const n = prompt('Нова назва блоку:', d.name || '');
        if (n === null) return;
        const newName = (n || '').trim();
        if (!newName) return toast('Порожня назва');
        updateDef(d.blockType, { name: newName });
        toast('Перейменовано');
        const mainWs = window.workspace || window._workspace;
        mainWs && rebuildCustomCategory(mainWs);
        refreshManagerList();
      }}, 'Назва');

      const colorInput = u.el('input', { type:'color', value: d.colour || CFG.defaultCustomBlockColour, style:'width:38px;height:34px;border:none;background:transparent;cursor:pointer;' });

      // Don't refresh/rebuild on every "input" event — it closes the native color picker popup.
      colorInput.addEventListener('input', ()=>{
        try{ sw.style.background = colorInput.value; }catch(e){}
      });
      colorInput.addEventListener('change', ()=>{
        updateDef(d.blockType, { colour: colorInput.value });
        const mainWs = window.workspace || window._workspace;
        mainWs && rebuildCustomCategory(mainWs);
        refreshManagerList();
      });

      const btnDel = u.el('button', { class:'btn danger', onclick: ()=>{
        if (!confirm('Видалити цей блок?')) return;
        deleteDef(d.blockType);
        const mainWs = window.workspace || window._workspace;
        mainWs && rebuildCustomCategory(mainWs);
        toast('Видалено');
        refreshManagerList();
      }}, 'Видал.');

      mgr.list.appendChild(
        u.el('div', { class:'rcRow' }, [
          sw, name, meta,
          u.el('div', { class:'act' }, [btnEdit, btnRename, colorInput, btnDel])
        ])
      );
    }
  }

  // ------------------------------------------------------------
  // Params modal (for current builder block)
  // ------------------------------------------------------------
  const paramsUI = { backdrop:null, modal:null, body:null };

  function ensureParams(){
    if (paramsUI.modal) return;
    injectCss();
    paramsUI.backdrop = u.el('div', { class:'rcModalBackdrop', id:'rcParamsBackdrop' });
    paramsUI.modal = u.el('div', { class:'rcModal', id:'rcParamsModal' });

    const hdr = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('span',{class:'dot'}), 'ПАРАМЕТРИ БЛОКУ' ]),
      u.el('button', { class:'x', onclick: closeParams }, '✕')
    ]);

    const btnAdd = u.el('button', { class:'btn primary', onclick: ()=> addParamRow() }, '+ Додати');
    const btnClear = u.el('button', { class:'btn', onclick: ()=>{ if(confirm('Очистити параметри?')){ setBuilderParams([]); renderParams(); } } }, 'Очистити');

    const bar = u.el('div', { class:'bar' }, [
      u.el('div', { style:'color:#94a3b8;font-weight:900;' }, 'Параметри з’являються як поля на великому ⭐-блоці.'),
      u.el('div', { style:'display:flex; gap:10px; align-items:center;' }, [btnClear, btnAdd])
    ]);

    paramsUI.body = u.el('div', { class:'body' });

    paramsUI.modal.appendChild(hdr);
    paramsUI.modal.appendChild(bar);
    paramsUI.modal.appendChild(paramsUI.body);

    document.body.appendChild(paramsUI.backdrop);
    document.body.appendChild(paramsUI.modal);

    paramsUI.backdrop.addEventListener('click', closeParams);
  }

  function openParams(){
    ensureParams();
    renderParams();
    paramsUI.backdrop.style.display='block';
    paramsUI.modal.style.display='block';
  }
  function closeParams(){
    if (!paramsUI.modal) return;
    paramsUI.backdrop.style.display='none';
    paramsUI.modal.style.display='none';
    saveDraft(); // keep params in draft
  }

  function renderParams(){
    if (!paramsUI.body) return;
    paramsUI.body.innerHTML='';

    const params = getBuilderParams();
    const head = u.el('div',{style:'display:grid;grid-template-columns: 1fr 160px 220px 120px; gap:10px; padding:8px 10px; color:#94a3b8; font-weight:900; font-size:12px;'},
      ['Назва','Тип','Default/Options','Дії'].map(t=>u.el('div',{},t))
    );
    paramsUI.body.appendChild(head);

    if (!params.length){
      paramsUI.body.appendChild(u.el('div',{style:'padding:10px;color:#94a3b8;font-weight:900;'},'Нема параметрів. Натисни “+ Додати”.'));
      return;
    }

    params.forEach((p, idx)=>{
      const row = u.el('div',{style:'display:grid;grid-template-columns: 1fr 160px 220px 120px; gap:10px; align-items:center; padding:10px; border:1px solid rgba(148,163,184,.12); border-radius:14px; background:rgba(30,41,59,.35); margin:8px 0;'});

      const name = u.el('input',{type:'text', value:p.name||'', style:'background:rgba(2,6,23,.55); border:1px solid rgba(148,163,184,.16); border-radius:12px; padding:10px; color:#fff; font-weight:900; outline:none;'});
      const type = u.el('select',{style:'background:rgba(2,6,23,.55); border:1px solid rgba(148,163,184,.16); border-radius:12px; padding:10px; color:#fff; font-weight:900; outline:none;'},
        ['number','boolean','text','dropdown'].map(k=>u.el('option',{value:k, selected:(p.kind||'number')===k},k))
      );
      const extra = u.el('input',{type:'text', value: p.kind==='dropdown' ? (Array.isArray(p.options)?p.options.join(','):(p.options||'')) : (p.default ?? ''),
        placeholder: p.kind==='dropdown' ? 'opt1,opt2' : 'default',
        style:'background:rgba(2,6,23,.55); border:1px solid rgba(148,163,184,.16); border-radius:12px; padding:10px; color:#fff; font-weight:900; outline:none;'});

      const btnUp = u.el('button',{class:'btn', style:'padding:8px 10px;', onclick:()=> moveParam(idx,-1)},'↑');
      const btnDn = u.el('button',{class:'btn', style:'padding:8px 10px;', onclick:()=> moveParam(idx, 1)},'↓');
      const btnDel = u.el('button',{class:'btn', style:'padding:8px 10px; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.12); color:#fecaca;', onclick:()=> removeParam(idx)},'✕');

      const act = u.el('div',{style:'display:flex; gap:8px; justify-content:flex-end;'},[btnUp, btnDn, btnDel]);

      const commit = ()=>{
        const params2 = getBuilderParams();
        const nn = (name.value||'').trim();
        const kk = type.value;
        let defv = null;
        let options = null;
        if (kk === 'dropdown'){
          options = (extra.value||'').split(',').map(s=>s.trim()).filter(Boolean);
          if (!options.length) options = ['A','B'];
        } else if (kk === 'boolean'){
          defv = String(extra.value||'').toLowerCase().includes('t');
        } else if (kk === 'text'){
          defv = String(extra.value||'');
        } else { // number
          const n = Number(extra.value);
          defv = isFinite(n) ? n : 0;
        }
        params2[idx] = { name: nn || ('p'+(idx+1)), kind: kk, default: defv, options };
        setBuilderParams(params2);
      };

      name.addEventListener('input', u.debounce(()=>{ commit(); }, 180));
      type.addEventListener('change', ()=>{ commit(); renderParams(); });
      extra.addEventListener('input', u.debounce(()=>{ commit(); }, 180));

      row.appendChild(name);
      row.appendChild(type);
      row.appendChild(extra);
      row.appendChild(act);
      paramsUI.body.appendChild(row);
    });
  }

  function addParamRow(){
    const params = getBuilderParams();
    params.push({ name:'param'+(params.length+1), kind:'number', default:0 });
    setBuilderParams(params);
    renderParams();
  }
  function removeParam(idx){
    const params = getBuilderParams();
    params.splice(idx,1);
    setBuilderParams(params);
    renderParams();
  }
  function moveParam(idx, dir){
    const params = getBuilderParams();
    const j = idx + dir;
    if (j<0 || j>=params.length) return;
    const t = params[idx]; params[idx]=params[j]; params[j]=t;
    setBuilderParams(params);
    renderParams();
  }

  // ------------------------------------------------------------
  // Templates modal
  // ------------------------------------------------------------
  const tplUI = { backdrop:null, modal:null, body:null };

  function ensureTemplates(){
    if (tplUI.modal) return;
    injectCss();
    tplUI.backdrop = u.el('div', { class:'rcModalBackdrop', id:'rcTplBackdrop' });
    tplUI.modal = u.el('div', { class:'rcModal', id:'rcTplModal' });

    const hdr = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('span',{class:'dot'}), 'ШАБЛОНИ' ]),
      u.el('button', { class:'x', onclick: closeTemplates }, '✕')
    ]);

    const bar = u.el('div', { class:'bar' }, [
      u.el('div', { style:'color:#94a3b8;font-weight:900;' }, 'Швидко додає міні-блоки (без зайвих кліків).'),
      u.el('div', { style:'display:flex; gap:10px; align-items:center;' }, [
        u.el('button', { class:'btn', onclick: ()=>{ insertTemplate('if'); } }, 'IF'),
        u.el('button', { class:'btn', onclick: ()=>{ insertTemplate('repeat'); } }, 'REPEAT'),
        u.el('button', { class:'btn', onclick: ()=>{ insertTemplate('while'); } }, 'WHILE'),
        u.el('button', { class:'btn', onclick: ()=>{ insertTemplate('number'); } }, 'NUMBER')
      ])
    ]);

    tplUI.body = u.el('div', { class:'body' });
    tplUI.modal.appendChild(hdr);
    tplUI.modal.appendChild(bar);
    tplUI.modal.appendChild(tplUI.body);
    document.body.appendChild(tplUI.backdrop);
    document.body.appendChild(tplUI.modal);
    tplUI.backdrop.addEventListener('click', closeTemplates);
  }

  function openTemplates(){
    ensureTemplates();
    renderTemplates();
    tplUI.backdrop.style.display='block';
    tplUI.modal.style.display='block';
  }
  function closeTemplates(){
    if (!tplUI.modal) return;
    tplUI.backdrop.style.display='none';
    tplUI.modal.style.display='none';
  }

  function renderTemplates(){
    if (!tplUI.body) return;
    tplUI.body.innerHTML='';
    const Blockly = window.Blockly;
    const available = Blockly && Blockly.Blocks ? new Set(Object.keys(Blockly.Blocks)) : new Set();

    const templates = [
      { id:'if', name:'IF (умова)', desc:'Додає міні-блок з controls_if', wrap:'controls_if', kind:'stmt' },
      { id:'repeat', name:'REPEAT N', desc:'Додає міні-блок з controls_repeat_ext', wrap:'controls_repeat_ext', kind:'stmt' },
      { id:'while', name:'WHILE/UNTIL', desc:'Додає міні-блок з controls_whileUntil', wrap:'controls_whileUntil', kind:'stmt' },
      { id:'number', name:'NUMBER 0', desc:'Додає value міні-блок з math_number', wrap:'math_number', kind:'val', preset:{ field:'NUM', value:'0' } },
    ];

    // Try to detect project blocks to offer
    const extra = [];
    for (const t of Array.from(available)){
      if (/pid/i.test(t)) extra.push({ id:'pid', name:'PID блок', desc:`Знайдений: ${t}`, wrap:t, kind:'stmt' });
      if (/distance/i.test(t)) extra.push({ id:'dist', name:'Distance блок', desc:`Знайдений: ${t}`, wrap:t, kind:'stmt' });
    }

    const all = templates.concat(extra.slice(0,6));

    for (const t of all){
      const ok = t.wrap ? available.has(t.wrap) : true;
      const row = u.el('div', { class:'rcRow', style: ok ? '' : 'opacity:.45;' }, [
        u.el('div', { class:'sw', style:`background:${ok?'rgba(59,130,246,.55)':'rgba(148,163,184,.25)'};` }),
        u.el('div', { class:'name' }, t.name),
        u.el('div', { class:'meta' }, t.desc),
        u.el('div', { class:'act' }, [
          u.el('button', { class:'btn', onclick: ()=> ok && insertTemplate(t.id, t) }, ok ? 'Додати' : 'Нема')
        ])
      ]);
      tplUI.body.appendChild(row);
    }
  }

  
  function insertTemplate(id, tmpl=null){
    const Blockly = window.Blockly;
    ensureBuilderWorkspace();
    if (!Blockly || !builder.ws) return;

    const t = tmpl || ({ id });
    const kind = t.kind || (id==='number'?'val':'stmt');
    const type = (kind==='val') ? 'rc_mini_value' : 'rc_mini';
    const wrap = t.wrap || (id==='if'?'controls_if': id==='repeat'?'controls_repeat_ext': id==='while'?'controls_whileUntil':'math_number');

    const nb = builder.ws.newBlock(type);
    nb.initSvg(); nb.render();
    nb.setFieldValue(kind==='val'?'val':'mini', 'LABEL');

    // Build a default inner workspace for the template and serialize it into nb.data
    try{
      if (RC._miniSerializeWS && wrap){
        const tmpDiv = document.createElement('div');
        tmpDiv.style.position='fixed'; tmpDiv.style.left='-99999px'; tmpDiv.style.top='-99999px';
        tmpDiv.style.width='10px'; tmpDiv.style.height='10px'; tmpDiv.style.opacity='0';
        document.body.appendChild(tmpDiv);

        const ws = Blockly.inject(tmpDiv, { toolbox:'<xml></xml>', readOnly:false, scrollbars:false, trashcan:false });

        if (kind === 'stmt' && Blockly.Blocks?.start_hat){
          const start = ws.newBlock('start_hat');
          start.initSvg(); start.render();
          start.moveBy(60, 60);

          const inner = ws.newBlock(wrap);
          inner.initSvg(); inner.render();
          inner.moveBy(60, 140);

          // Connect start -> inner if possible
          try{
            if (start.nextConnection && inner.previousConnection){
              start.nextConnection.connect(inner.previousConnection);
            }
          }catch(e){}
        } else {
          const b = ws.newBlock(wrap);
          b.initSvg(); b.render();
          b.moveBy(60, 60);
          if (t.preset && t.preset.field){
            try{ b.setFieldValue(t.preset.value, t.preset.field); }catch(e){}
          }
        }

        const ser = RC._miniSerializeWS(ws);
        nb.data = ser ? u.jstring(ser) : '';
        try { ws.dispose(); } catch(e){}
        try { tmpDiv.remove(); } catch(e){}
      }
    }catch(e){}

    const mtr = builder.ws.getMetrics && builder.ws.getMetrics();
    const x = (mtr ? mtr.viewLeft + mtr.viewWidth/2 : 120);
    const y = (mtr ? mtr.viewTop + 120 : 120);
    nb.moveBy(x, y);

    try{ if (typeof saveDraft === 'function') saveDraft(); }catch(e){}
    toast('Шаблон додано');
  }

  // ------------------------------------------------------------
  // Validation modal

  // ------------------------------------------------------------
  const valUI = { backdrop:null, modal:null, body:null };

  function ensureValidation(){
    if (valUI.modal) return;
    injectCss();
    valUI.backdrop = u.el('div', { class:'rcModalBackdrop', id:'rcValBackdrop' });
    valUI.modal = u.el('div', { class:'rcModal', id:'rcValModal' });

    const hdr = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('span',{class:'dot'}), 'ПЕРЕВІРКА' ]),
      u.el('button', { class:'x', onclick: closeValidation }, '✕')
    ]);

    const bar = u.el('div', { class:'bar' }, [
      u.el('div', { style:'color:#94a3b8;font-weight:900;' }, 'Показує помилки, які часто ламають кастом-блоки.'),
      u.el('div', { style:'display:flex; gap:10px; align-items:center;' }, [
        u.el('button', { class:'btn', onclick: ()=>{ renderValidation(); } }, 'Оновити')
      ])
    ]);

    valUI.body = u.el('div', { class:'body' });
    valUI.modal.appendChild(hdr);
    valUI.modal.appendChild(bar);
    valUI.modal.appendChild(valUI.body);
    document.body.appendChild(valUI.backdrop);
    document.body.appendChild(valUI.modal);
    valUI.backdrop.addEventListener('click', closeValidation);
  }

  function openValidation(){
    ensureValidation();
    renderValidation();
    valUI.backdrop.style.display='block';
    valUI.modal.style.display='block';
  }
  function closeValidation(){
    if (!valUI.modal) return;
    valUI.backdrop.style.display='none';
    valUI.modal.style.display='none';
  }

  
  function validateBuilder(){
    const issues = [];
    const Blockly = window.Blockly;
    if (!Blockly || !builder.ws) return [{ level:'error', title:'Blockly не готовий', detail:'Нема builder workspace.' }];

    const tops = builder.ws.getTopBlocks(true);
    if (!tops.length){
      issues.push({ level:'error', title:'Порожньо', detail:'Додай хоча б один міні-блок.' });
    }

    function countBlocksInState(st){
      if (!st) return 0;
      const p = st.payload;

      // workspace xml
      if ((st.kind === 'wsxml') || (st.kind === 'xml' && typeof p === 'string' && p.trim().startsWith('<xml'))){
        try { return (p.match(/<block\b/g) || []).length; } catch(e){ return 0; }
      }

      // workspace json (or legacy json that is actually workspace json)
      if ((st.kind === 'wsjson') || (st.kind === 'json' && p && p.blocks)){
        let count = 0;
        const walk = (o)=>{
          if (!o) return;
          if (Array.isArray(o)) return o.forEach(walk);
          if (typeof o === 'object'){
            if (typeof o.type === 'string') count++;
            for (const k in o) walk(o[k]);
          }
        };
        try { walk(p); } catch(e){}
        return count;
      }

      // legacy single-block
      if (st.kind === 'json' && p && typeof p.type === 'string') return 1;
      if (st.kind === 'xml' && typeof p === 'string' && p.includes('<block')) return 1;
      return 0;
    }

    const all = builder.ws.getAllBlocks(false);
    for (const b of all){
      if (b.type === 'rc_mini' || b.type === 'rc_mini_value'){
        const st = u.jparse(b.data || '', null);
        if (!st){
          issues.push({ level:'warn', title:'Міні-блок без збереження', detail:`Використай ⚙ і натисни “Зберегти”.` });
          continue;
        }
        const cnt = countBlocksInState(st);
        if (cnt <= 0){
          issues.push({ level:'warn', title:'Порожній міні-блок', detail:'Всередині немає блоків.' });
        } else if (cnt === 1){
          const isOnlyStart =
            (st.kind === 'wsxml' && typeof st.payload === 'string' && st.payload.includes('type="start_hat"')) ||
            ((st.kind === 'wsjson' || (st.kind === 'json' && st.payload?.blocks)) && JSON.stringify(st.payload).includes('"type":"start_hat"'));
          if (isOnlyStart){
            issues.push({ level:'warn', title:'Збережено лише START', detail:'Переконайся, що блоки знизу реально “прилипли” до старту (є клац). Потім знову ⚙ → Зберегти.' });
          }
        }
      }
    }

    // params: duplicate names
    const params = getBuilderParams();
    const names = params.map(p=>String(p.name||'').trim()).filter(Boolean);
    const dup = names.filter((n,i)=>names.indexOf(n)!==i);
    if (dup.length) issues.push({ level:'warn', title:'Дубль параметрів', detail:`Однакові назви: ${Array.from(new Set(dup)).join(', ')}` });

    // simulator risk: detect while(true) in generated code
    const code = generateBuilderCodeSafe();
    if (code && /while\s*\(\s*true\s*\)/.test(code) && !/(_shouldStop|shouldStop)/.test(code)){
      issues.push({ level:'warn', title:'Можливий зависон', detail:'Є while(true) без перевірки stop. У симуляторі може підвиснути.' });
    }

    return issues;
  }

  function renderValidation(){
    if (!valUI.body) return;
    valUI.body.innerHTML='';

    const issues = validateBuilder();
    if (!issues.length){
      valUI.body.appendChild(u.el('div',{style:'color:#94a3b8;font-weight:900;padding:10px;'},'Все ок ✅'));
      return;
    }

    for (const it of issues){
      const tag = it.level === 'error' ? '❌' : it.level === 'warn' ? '⚠️' : 'ℹ️';
      valUI.body.appendChild(u.el('div',{class:'rcIssue'},[
        u.el('div',{class:'t'}, `${tag} ${it.title}`),
        u.el('div',{class:'d'}, it.detail || '')
      ]));
    }
  }

  // ------------------------------------------------------------
  // Simulator modal (dry-run) + step highlight
  // ------------------------------------------------------------
  const simUI = { backdrop:null, modal:null, log:null, sliders:[], running:false, stepIdx:0, stop:false, lastCode:'' };

  function ensureSimulator(){
    if (simUI.modal) return;
    injectCss();
    simUI.backdrop = u.el('div', { class:'rcModalBackdrop', id:'rcSimBackdrop' });
    simUI.modal = u.el('div', { class:'rcModal', id:'rcSimModal', style:'width:min(1180px,calc(100vw - 20px));height:min(86vh,780px);' });

    const hdr = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('span',{class:'dot'}), 'СИМУЛЯТОР' ]),
      u.el('button', { class:'x', onclick: closeSimulator }, '✕')
    ]);

    const btnRun = u.el('button', { class:'btn primary', onclick: ()=> simRunAll() }, 'Run');
    const btnStep = u.el('button', { class:'btn', onclick: ()=> simStep() }, 'Step');
    const btnStop = u.el('button', { class:'btn', onclick: ()=> simStop() }, 'Stop');
    const btnClear = u.el('button', { class:'btn', onclick: ()=>{ simUI.log.textContent=''; } }, 'Clear log');

    const bar = u.el('div', { class:'bar' }, [
      u.el('div', { style:'color:#94a3b8;font-weight:900;' }, 'Виконує міні-блоки по черзі і логить “команди”.'),
      u.el('div', { style:'display:flex; gap:10px; align-items:center;' }, [btnClear, btnStop, btnStep, btnRun])
    ]);

    const body = u.el('div', { class:'body', style:'padding:12px; height: calc(100% - 110px);' });
    const grid = u.el('div', { id:'rcSimGrid' });

    const left = u.el('div', { id:'rcSimLeft' });
    left.appendChild(u.el('div',{style:'color:#e2e8f0;font-weight:950;letter-spacing:.08em;text-transform:uppercase;font-size:12px;'},'Сенсори'));

    const makeSlider = (i)=>{
      const wrap = u.el('div',{style:'display:flex;flex-direction:column;gap:6px; padding:10px; border:1px solid rgba(148,163,184,.12); border-radius:14px; background:rgba(30,41,59,.35);'});
      const top = u.el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:10px;'},[
        u.el('div',{style:'color:#e2e8f0;font-weight:950;'},`S${i+1}`),
        u.el('div',{style:'color:#94a3b8;font-weight:900;', id:`rcSimVal${i}`},'0')
      ]);
      const s = u.el('input',{type:'range', min:'0', max:'100', value:'0', style:'width:100%;'});
      s.addEventListener('input', ()=>{
        document.getElementById(`rcSimVal${i}`).textContent = s.value;
      });
      wrap.appendChild(top);
      wrap.appendChild(s);
      simUI.sliders[i]=s;
      return wrap;
    };
    for (let i=0;i<4;i++) left.appendChild(makeSlider(i));

    left.appendChild(u.el('div',{style:'color:#94a3b8;font-weight:900;font-size:12px;line-height:1.35;'},'Порада: якщо всередині є while(true) без stop — симулятор може підвиснути.'));

    const right = u.el('div', { id:'rcSimRight' });
    right.appendChild(u.el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:10px; margin-bottom:10px;'},[
      u.el('div',{style:'color:#e2e8f0;font-weight:950;letter-spacing:.08em;text-transform:uppercase;font-size:12px;'},'LOG'),
      u.el('div',{style:'color:#94a3b8;font-weight:900;font-size:12px;'},'Step підсвічує міні-блок')
    ]));
    simUI.log = u.el('div', { id:'rcSimLog' }, '');
    right.appendChild(simUI.log);

    grid.appendChild(left);
    grid.appendChild(right);
    body.appendChild(grid);

    simUI.modal.appendChild(hdr);
    simUI.modal.appendChild(bar);
    simUI.modal.appendChild(body);

    document.body.appendChild(simUI.backdrop);
    document.body.appendChild(simUI.modal);
    simUI.backdrop.addEventListener('click', closeSimulator);
  }

  function openSimulator(){
    warnStorageIfNeeded();

    // Prefer new 2D simulator (rc_sim2d.js) as a separate "tab"/screen (no modal).
    try{
      if (window.RCSim2D && typeof window.RCSim2D.open === 'function'){
        if (!window.RCSim2D.__rcHooked){
          window.RCSim2D.__rcHooked = true;
          const _origClose = window.RCSim2D.close;
          window.RCSim2D.close = function(){
            try{ document.documentElement.classList.remove('rcSimOpen'); document.body.classList.remove('rcSimOpen'); }catch(e){}
            try{ if (builder.btnSim) builder.btnSim.classList.remove('primary'); }catch(e){}
            return (typeof _origClose === 'function') ? _origClose.apply(this, arguments) : undefined;
          };
        }

        // Toggle
        if (document.documentElement.classList.contains('rcSimOpen')){
          try{ window.RCSim2D.close(); }catch(e){}
          return;
        }

        try{ document.documentElement.classList.add('rcSimOpen'); document.body.classList.add('rcSimOpen'); }catch(e){}
        try{ if (builder.btnSim) builder.btnSim.classList.add('primary'); }catch(e){}
        window.RCSim2D.open();
        // Start 3D overlay once (if available)
        try{
          if (window.RCSim2D3D && typeof window.RCSim2D3D.start === 'function' && !window.RCSim2D3D.__started){
            window.RCSim2D3D.__started = true;
            window.RCSim2D3D.start({ assetBase: './rc3d_assets' });
          }
        }catch(e){}
        return;
      }
    }catch(e){}

    // Fallback: old modal simulator
    ensureSimulator();
    simUI.stepIdx = 0;
    simUI.stop = false;
    simUI.backdrop.style.display='block';
    simUI.modal.style.display='block';
    toast('Симулятор готовий');
  }
  function closeSimulator(){
    // If new simulator exists, close it
    try{
      if (window.RCSim2D && typeof window.RCSim2D.close === 'function'){
        window.RCSim2D.close();
        return;
      }
    }catch(e){}

    if (!simUI.modal) return;
    simUI.stop = true;
    simUI.backdrop.style.display='none';
    simUI.modal.style.display='none';
  }
  function simStop(){
    simUI.stop = true;
    window._shouldStop = true;
    logSim('== STOP ==');
  }

  function getSimSensorData(){
    const arr = [];
    for (let i=0;i<4;i++) arr[i] = Number(simUI.sliders[i]?.value || 0);
    return arr;
  }

  function logSim(line){
    if (!simUI.log) return;
    const ts = new Date().toLocaleTimeString();
    simUI.log.textContent += `[${ts}] ${line}\n`;
    simUI.log.scrollTop = simUI.log.scrollHeight;
  }

  function highlightMiniAt(idx){
    try{
      const tops = builder.ws.getTopBlocks(true)
        .filter(b=>b.type==='rc_mini' || b.type==='rc_mini_value')
        .sort((a,b)=>a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);
      const b = tops[idx];
      if (!b) return;
      builder.ws.highlightBlock(null);
      builder.ws.highlightBlock(b.id);
      b.select && b.select();
    }catch(e){}
  }

  function generateBuilderCodeSafe(){
    const Blockly = window.Blockly;
    if (!Blockly || !builder.ws) return '';
    try{
      const jsGen = Blockly.JavaScript || Blockly.javascriptGenerator;
      if (!jsGen) return '';
      const code = (jsGen.workspaceToCode(builder.ws) || '').trim();
      return code;
    }catch(e){ return ''; }
  }

  async function runSnippet(code){
    // Sandbox: patch common functions to log instead of send
    const old = {
      sendDrivePacket: window.sendDrivePacket,
      sendMotorPacket: window.sendMotorPacket,
      sendPacket: window.sendPacket,
      btSend: window.btSend,
      bluetoothSend: window.bluetoothSend,
      sendToRobot: window.sendToRobot
    };

    try{
      window.sensorData = getSimSensorData();
      window._shouldStop = false;

      const stub = (...args)=> logSim(`send(${args.map(a=>u.jstring(a)).join(', ')})`);
      window.sendDrivePacket = stub;
      window.sendMotorPacket = stub;
      window.sendPacket = stub;
      window.btSend = stub;
      window.bluetoothSend = stub;
      window.sendToRobot = stub;

      // Provide helpers
      window.wait = (ms)=> new Promise(res=>setTimeout(res, Number(ms)||0));
      window.delay = window.wait;

      // Execute as async function (supports await)
      const fn = new Function(`return (async()=>{\n${code}\n})()`);
      await fn();
      return true;
    }catch(e){
      logSim('ERROR: ' + (e?.message || e));
      return false;
    }finally{
      // restore
      window.sendDrivePacket = old.sendDrivePacket;
      window.sendMotorPacket = old.sendMotorPacket;
      window.sendPacket = old.sendPacket;
      window.btSend = old.btSend;
      window.bluetoothSend = old.bluetoothSend;
      window.sendToRobot = old.sendToRobot;
    }
  }

  async function simStep(){
    ensureBuilderWorkspace();
    simUI.stop = false;
    const Blockly = window.Blockly;
    if (!Blockly || !builder.ws) return;

    const tops = builder.ws.getTopBlocks(true)
      .filter(b=>b.type==='rc_mini' || b.type==='rc_mini_value')
      .sort((a,b)=>a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);

    if (simUI.stepIdx >= tops.length){
      simUI.stepIdx = 0;
      logSim('== END, reset step ==');
      return;
    }

    highlightMiniAt(simUI.stepIdx);

    const jsGen = Blockly.JavaScript || Blockly.javascriptGenerator;
    let snippet = '';
    try{
      snippet = jsGen.blockToCode(tops[simUI.stepIdx]);
      if (Array.isArray(snippet)) snippet = snippet[0] || '';
      snippet = String(snippet||'').trim();
    }catch(e){ snippet = ''; }

    if (!snippet){
      logSim(`Step ${simUI.stepIdx+1}: empty`);
      simUI.stepIdx++;
      return;
    }

    logSim(`Step ${simUI.stepIdx+1}: run`);
    await runSnippet(snippet);
    simUI.stepIdx++;
  }

  async function simRunAll(){
    ensureBuilderWorkspace();
    simUI.stop = false;
    const Blockly = window.Blockly;
    if (!Blockly || !builder.ws) return;

    const tops = builder.ws.getTopBlocks(true)
      .filter(b=>b.type==='rc_mini' || b.type==='rc_mini_value')
      .sort((a,b)=>a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);

    if (!tops.length){ logSim('No blocks'); return; }

    simUI.stepIdx = 0;
    for (let i=0;i<tops.length;i++){
      if (simUI.stop) { logSim('== STOPPED =='); break; }
      highlightMiniAt(i);
      const jsGen = Blockly.JavaScript || Blockly.javascriptGenerator;
      let snippet = '';
      try{
        snippet = jsGen.blockToCode(tops[i]);
        if (Array.isArray(snippet)) snippet = snippet[0] || '';
        snippet = String(snippet||'').trim();
      }catch(e){ snippet = ''; }
      if (!snippet){ logSim(`Block ${i+1}: empty`); continue; }
      logSim(`Block ${i+1}: run`);
      await runSnippet(snippet);
      await new Promise(r=>setTimeout(r, 30));
    }
    builder.ws.highlightBlock(null);
    logSim('== DONE ==');
  }

  // ------------------------------------------------------------
  // History modal
  // ------------------------------------------------------------
  const histUI = { backdrop:null, modal:null, body:null };

  function ensureHistory(){
    if (histUI.modal) return;
    injectCss();
    histUI.backdrop = u.el('div', { class:'rcModalBackdrop', id:'rcHistBackdrop' });
    histUI.modal = u.el('div', { class:'rcModal', id:'rcHistModal' });

    const hdr = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('span',{class:'dot'}), 'ІСТОРІЯ' ]),
      u.el('button', { class:'x', onclick: closeHistory }, '✕')
    ]);

    const btnSave = u.el('button',{class:'btn primary', onclick: ()=>{ saveDraft(); toast('Збережено'); renderHistory(); }}, 'Зберегти точку');
    const btnClear = u.el('button',{class:'btn', onclick: ()=>{ if(confirm('Очистити історію?')){ setHistory([]); renderHistory(); } }}, 'Очистити');

    const bar = u.el('div', { class:'bar' }, [
      u.el('div',{style:'color:#94a3b8;font-weight:900;'},'Автозбереження. Натисни на запис, щоб відновити.'),
      u.el('div',{style:'display:flex;gap:10px;align-items:center;'},[btnClear, btnSave])
    ]);

    histUI.body = u.el('div', { class:'body' });
    histUI.modal.appendChild(hdr);
    histUI.modal.appendChild(bar);
    histUI.modal.appendChild(histUI.body);
    document.body.appendChild(histUI.backdrop);
    document.body.appendChild(histUI.modal);
    histUI.backdrop.addEventListener('click', closeHistory);
  }

  function openHistory(){
    ensureHistory();
    renderHistory();
    histUI.backdrop.style.display='block';
    histUI.modal.style.display='block';
  }
  function closeHistory(){
    if (!histUI.modal) return;
    histUI.backdrop.style.display='none';
    histUI.modal.style.display='none';
  }

  function renderHistory(){
    if (!histUI.body) return;
    histUI.body.innerHTML='';
    const arr = getHistory();
    if (!arr.length){
      histUI.body.appendChild(u.el('div',{style:'color:#94a3b8;font-weight:900;padding:10px;'},'Історія порожня.'));
      return;
    }
    for (const it of arr){
      const row = u.el('div',{class:'rcRow'},[
        u.el('div',{class:'sw', style:'background:rgba(34,197,94,.35);'}),
        u.el('div',{class:'name'}, it.label),
        u.el('div',{class:'meta'}, new Date(it.ts).toLocaleString()),
        u.el('div',{class:'act'},[
          u.el('button',{class:'btn', onclick: ()=>{ applyDraft(it.draft); toast('Відновлено'); closeHistory(); }}, 'Відновити')
        ])
      ]);
      histUI.body.appendChild(row);
    }
  }

  // ------------------------------------------------------------
  // Load program into builder for editing
  // ------------------------------------------------------------
  function loadProgramIntoBuilder(def){
    const Blockly = window.Blockly;
    ensureBuilderWorkspace();
    if (!Blockly || !builder.ws || !def) return;

    clearBuilder();
    builder.editingType = def.blockType;
    builder.nameInput.value = def.name || 'Мій блок';
    builder.colourInput.value = def.colour || CFG.defaultCustomBlockColour;
    setBuilderParams(Array.isArray(def.params)?def.params:[]);

    builder.ws.clear();
    if (def.program && def.program.kind === 'json' && Blockly.serialization?.workspaces?.load){
      try{ Blockly.serialization.workspaces.load(def.program.payload, builder.ws); }catch(e){}
    } else if (def.program && def.program.kind === 'xml'){
      try{
        const dom = Blockly.Xml.textToDom(def.program.payload);
        Blockly.Xml.domToWorkspace(dom, builder.ws);
      }catch(e){}
    }
    setTimeout(()=>{ try{ Blockly.svgResize(builder.ws); }catch(e){} }, 80);
  }

  // ------------------------------------------------------------
  // Pack / update custom block def
  // ------------------------------------------------------------
  function packOrUpdateCustomBlock(){
    const Blockly = window.Blockly;
    const mainWs = window.workspace || window._workspace;
    if (!Blockly || !builder.ws || !mainWs) return;

    const issues = validateBuilder();
    const hasError = issues.some(i=>i.level==='error');
    if (hasError){
      openValidation();
      toast('Є помилки');
      return;
    }

    const name = (builder.nameInput.value || '').trim() || 'Мій блок';
    const colour = builder.colourInput.value || CFG.defaultCustomBlockColour;
    const params = getBuilderParams();

    let program = null;
    try{ if (Blockly.serialization?.workspaces?.save) program = { kind:'json', payload: Blockly.serialization.workspaces.save(builder.ws) }; }catch(e){}
    if (!program){
      try{
        const xml = Blockly.Xml.workspaceToDom(builder.ws);
        program = { kind:'xml', payload: Blockly.Xml.domToText(xml) };
      }catch(e){ program = { kind:'xml', payload: '<xml></xml>' }; }
    }

    if (builder.editingType && RC._defsByType.has(builder.editingType)){
      // update existing
      updateDef(builder.editingType, { name, colour, params, program });
      rebuildCustomCategory(mainWs);
      toast('Оновлено');
      setTimeout(()=> selectCustomCategory(mainWs), 80);
      refreshManagerList();
      return;
    }

    // create new
    const blockType = 'rc_user_' + u.uid('b').replaceAll('-','_');
    const def = { id: u.uid('def'), name, colour, params, blockType, program, createdAt: Date.now() };

    const defs = loadBlocks();
    defs.push(def);
    saveBlocks(defs);
    rebuildDefsMap();

    defineCustomBlockType(Blockly, blockType);
    rebuildCustomCategory(mainWs);
    setTimeout(()=> selectCustomCategory(mainWs), 80);

    toast('Додано в ⭐ Мої блоки');
    refreshManagerList();
    builder.editingType = blockType;
  }

  
  // ------------------------------------------------------------
  // STM32 C Generator (export for embedding)
  // ------------------------------------------------------------
  const cUI = { backdrop:null, modal:null, tabs:null, area:null };

  let _cArtifacts = null;
  let _cTab = 'c';
  let _cMainPatched = null;
  let _cMainPatchedName = null;



  // ------------------------------------------------------------
  // STM32 export help (click the yellow dot in the header)
  // ------------------------------------------------------------
  const cInfoUI = { backdrop:null, modal:null };

  function ensureCInfo(){
    if (cInfoUI.modal) return;
    injectCss();

    // IMPORTANT: this help modal opens *on top of* the STM32 export modal.
    // The backdrop must sit above the export modal so that the export window is blurred/dimmed,
    // while the instruction modal itself stays sharp.
    cInfoUI.backdrop = u.el('div', {
      class:'rcModalBackdrop',
      style:`z-index:${CFG.uiZ+60};`,
      onclick: ()=> closeCInfo()
    });
    cInfoUI.modal = u.el('div', {
      class:'rcModal',
      style:`z-index:${CFG.uiZ+61}; width:min(860px, 96vw); height:min(82vh, 820px);`
    });

    const hdr = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('div',{class:'dot'}), u.el('div',{}, 'ІНСТРУКЦІЯ: STM32 C EXPORT') ]),
      u.el('button', { class:'x', onclick: closeCInfo, title:'Закрити' }, '✕')
    ]);

    const body = u.el('div', { class:'body', style:'overflow:auto;' });

    const text = [
      'Що це за вікно?',
      '— Воно генерує файли C для STM32 (HAL / CubeMX). Це НЕ заміна CubeMX, а “добавка” з логікою + платформа.',
      '',
      'Що означають вкладки:',
      '• .c / .h — твій код віртуальної машини/програми (логіка).',
      '• platform .c / platform .h — “міст” до HAL: PWM/ADC/GPIO + rc_millis().',
      '• board .h (rc_board_conf.h) — мапінг: який TIM/канали/піни/ADC ти використовуєш.',
      '• main.c — ПАТЧ (опціонально). Він вставляє 3–4 шматки в USER CODE твого CubeMX main.c.',
      '',
      'Кроки (рекомендований шлях):',
      '1) CubeMX:',
      '   - Налаштуй таймер(и) TIMx як PWM на потрібних каналах (CH1..CH4).',
      '   - Якщо є реверс: додай GPIO піни DIR як Output.',
      '   - Якщо сенсори аналогові: увімкни ADC і канали.',
      '   - Generate Code → відкрий проект у STM32CubeIDE.',
      '',
      '2) Додай файли в CubeIDE:',
      '   - rc_cb_.c        → Core/Src',
      '   - rc_cb_.h        → Core/Inc',
      '   - platform.c      → Core/Src',
      '   - platform.h      → Core/Inc',
      '   - board.h (rc_board_conf.h) → Core/Inc',
      '   (Назви можуть відрізнятися, але суть така: .c в Src, .h в Inc)',
      '',
      '3) Налаштуй rc_board_conf.h (board.h):',
      '   - який TIM використовується для PWM (наприклад TIM2)',
      '   - які канали (CH1..CH4) відповідають моторам',
      '   - RC_PWM_MAX = Period таймера (наприклад Period=999 → RC_PWM_MAX 999)',
      '   - які піни/ADC канали використовуються для сенсорів',
      '',
      '4) Підключи до main.c (дві опції):',
      '   A) Автоматично: натисни “Load main.c” → вибери Core/Src/main.c → відкрий вкладку main.c → Download/Copy.',
      '   B) Вручну: встав у свій main.c в USER CODE:',
      '      - include rc_platform.h + rc_cb_.h',
      '      - створити rc_vm_t my_vm;',
      '      - у USER CODE BEGIN 2: rc_platform_init(); rc_cb__init(&my_vm);',
      '      - у while(1): rc_cb__step(&my_vm);',
      '',
      '5) Build → Flash → Run.',
      '',
      'Якщо “не їде”:',
      '• Перевір, що PWM реально стартує (HAL_TIM_PWM_Start) — або в platform_init(), або в main.c.',
      '• Перевір RC_PWM_MAX і масштаб швидкості (0..100) → CCR (0..RC_PWM_MAX).',
      '• Перевір мапінг каналів і DIR піни.',
      '• Якщо програма порожня/STOP — моторів не буде.',
    ].join('\n');

    body.appendChild(u.el('div', { style:'color:#e2e8f0;font-weight:1000;font-size:14px;margin-bottom:10px;' }, 'Як користуватись'));
    body.appendChild(u.el('div', { style:'white-space:pre-wrap;color:#cbd5e1;font-weight:800;line-height:1.55;font-size:13px;' }, text));

    cInfoUI.modal.appendChild(hdr);
    cInfoUI.modal.appendChild(body);

    document.body.appendChild(cInfoUI.backdrop);
    document.body.appendChild(cInfoUI.modal);
  }

  function openCInfo(){
    ensureCInfo();
    cInfoUI.backdrop.style.display='block';
    cInfoUI.modal.style.display='block';
  }
  function closeCInfo(){
    if (!cInfoUI.modal) return;
    cInfoUI.backdrop.style.display='none';
    cInfoUI.modal.style.display='none';
  }


  function ensureCModal(){
    if (cUI.modal) return;

    cUI.backdrop = u.el('div', { class:'rcModalBackdrop', onclick: ()=> closeCModal() });
    cUI.modal = u.el('div', { class:'rcModal', style:'width:min(1200px, 96vw); height:min(84vh, 860px);' });

    const header = u.el('div', { class:'hdr' }, [
      u.el('div', { class:'ttl' }, [ u.el('button',{class:'dot',title:'Інструкція',style:'border:0;padding:0;margin:0;cursor:pointer;',onclick:(ev)=>{ev.stopPropagation(); openCInfo();}},''), u.el('div',{}, 'STM32 C Export') ]),
      u.el('button', { class:'x', onclick: ()=> closeCModal(), title:'Закрити' }, '✕')
    ]);

    const bar = u.el('div', { class:'bar' });

    function tabBtn(label, key){
      return u.el('button', { class:'btn', onclick: ()=> selectCTab(key) }, label);
    }
    cUI.tabs = {
      c: tabBtn('.c', 'c'),
      h: tabBtn('.h', 'h'),
      platc: tabBtn('platform .c', 'platc'),
      plath: tabBtn('platform .h', 'plath'),
      board: tabBtn('board .h', 'board'),
      main: tabBtn('main.c', 'main')
    };

    const tabsWrap = u.el('div',{style:'display:flex;gap:8px;flex-wrap:wrap;align-items:center;'}, [cUI.tabs.c,cUI.tabs.h,cUI.tabs.platc,cUI.tabs.plath,cUI.tabs.board,cUI.tabs.main]);
    cUI.fileInfo = u.el('div',{style:'color:#94a3b8;font-weight:900;font-size:11px;margin-left:8px;'}, '');
    tabsWrap.appendChild(cUI.fileInfo);

    cUI.fileInput = u.el('input',{type:'file', accept:'.c,.txt', style:'display:none', onchange:(e)=> loadCubeMainC(e) });

    const actionWrap = u.el('div',{style:'display:flex;gap:8px;align-items:center;'},[
      u.el('button',{class:'btn', onclick: ()=> cUI.fileInput && cUI.fileInput.click() }, 'Load main.c'),
      u.el('button',{class:'btn', onclick: ()=> copyCText() }, 'Copy'),
      u.el('button',{class:'btn primary', onclick: ()=> downloadCArtifacts() }, 'Download')
    ]);

    bar.appendChild(tabsWrap);
    bar.appendChild(actionWrap);
    bar.appendChild(cUI.fileInput);

    const body = u.el('div', { class:'body', style:'display:flex;flex-direction:column;gap:10px;overflow:hidden;' });

    cUI.area = u.el('textarea', { style:'flex:1; width:100%; min-height:0; resize:none; background:rgba(2,6,23,.55); color:#e2e8f0; border:1px solid rgba(148,163,184,.14); border-radius:14px; padding:12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; line-height:1.4; outline:none; overflow:auto;' });
    body.appendChild(cUI.area);

    cUI.modal.appendChild(header);
    cUI.modal.appendChild(bar);
    cUI.modal.appendChild(body);

    document.body.appendChild(cUI.backdrop);
    document.body.appendChild(cUI.modal);
  }

  function openCPreviewForBuilder(){
    ensureCModal();
    const name = (builder.nameInput && builder.nameInput.value ? builder.nameInput.value : 'custom_block').trim() || 'custom_block';
    const params = getBuilderParams();

    // Prefer dedicated STM32 generator (stm32_cgen.js) if it exists.
    if (window.RC_STM32_CGEN && typeof window.RC_STM32_CGEN.generateArtifacts === 'function'){
      try{
        _cArtifacts = window.RC_STM32_CGEN.generateArtifacts(builder.ws, { name, params });
      }catch(e){
        const js = generateBuilderCodeSafe();
        _cArtifacts = generateSTM32Artifacts(name, params, js);
      }
    }else{
      const js = generateBuilderCodeSafe();
      _cArtifacts = generateSTM32Artifacts(name, params, js);
    }

    _cTab = 'c';
    renderCTab();

    cUI.backdrop.style.display='block';
    cUI.modal.style.display='block';
  }


  function closeCModal(){
    if (!cUI.modal) return;
    cUI.backdrop.style.display='none';
    cUI.modal.style.display='none';
  }

  function selectCTab(k){ _cTab = k; renderCTab(); }

  function renderCTab(){
    if (!cUI.area) return;
    const a = _cArtifacts || {};
    const map = { c: a.c || '', h: a.h || '', platc: a.platformC || '', plath: a.platformH || '', board: a.boardConfH || '', main: a.mainC || _cMainPatched || '' };
    cUI.area.value = map[_cTab] || '';
    // highlight active tab
    for (const [k,btn] of Object.entries(cUI.tabs||{})){
      btn.classList.toggle('primary', k===_cTab);
    }
  }

  function copyCText(){
    try{
      cUI.area.select();
      document.execCommand('copy');
    }catch(e){}
  }

  function downloadText(filename, content){
    const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }

  function downloadCArtifacts(){
    if (!_cArtifacts) return;
    downloadText(_cArtifacts.files.c, _cArtifacts.c);
    downloadText(_cArtifacts.files.h, _cArtifacts.h);
    downloadText(_cArtifacts.files.platformC, _cArtifacts.platformC);
    downloadText(_cArtifacts.files.platformH, _cArtifacts.platformH);
    if (_cArtifacts.boardConfH) downloadText((_cArtifacts.files.boardConfH || 'rc_board_conf.h'), _cArtifacts.boardConfH);
    const mc = _cArtifacts.mainC || _cMainPatched;
    if (mc){
      const fn = (_cArtifacts.files.mainC || _cMainPatchedName || 'main.c').re
  function _rcInsertUnique(body, snippet, token){
    const s = String(body||'');
    if (token && s.indexOf(token) >= 0) return s;
    const needsNL = (s.length && !s.endsWith('\n')) ? '\n' : '';
    return s + needsNL + snippet + '\n';
  }

  function _rcPatchSection(src, beginMarker, endMarker, snippet, token){
    const text = String(src||'');
    const b = text.indexOf(beginMarker);
    if (b < 0) return text;
    const e = text.indexOf(endMarker, b + beginMarker.length);
    if (e < 0) return text;
    const pre = text.slice(0, b + beginMarker.length);
    const mid = text.slice(b + beginMarker.length, e);
    const post = text.slice(e);
    const mid2 = _rcInsertUnique(mid, snippet, token);
    return pre + mid2 + post;
  }

  function patchCubeMXMainC(mainC, cbBase){
    const cb = String(cbBase||'').trim();
    if (!cb) return String(mainC||'');

    let out = String(mainC||'');

    // 1) Includes
    out = _rcPatchSection(
      out,
      '/* USER CODE BEGIN Includes */',
      '/* USER CODE END Includes */',
      '\\n#include "' + cb + '.h"\\n#include "rc_platform.h"\\n',
      cb + '.h'
    );

    // 2) Private variables
    out = _rcPatchSection(
      out,
      '/* USER CODE BEGIN PV */',
      '/* USER CODE END PV */',
      '\\nstatic rc_vm_t rc_vm;\\n',
      'static rc_vm_t rc_vm'
    );

    // 3) Init section
    out = _rcPatchSection(
      out,
      '/* USER CODE BEGIN 2 */',
      '/* USER CODE END 2 */',
      '\\n  rc_platform_init();\\n  ' + cb + '_init(&rc_vm);\\n',
      cb + '_init(&rc_vm)'
    );

    // 4) While loop
    out = _rcPatchSection(
      out,
      '/* USER CODE BEGIN WHILE */',
      '/* USER CODE END WHILE */',
      '\\n    ' + cb + '_step(&rc_vm);\\n    HAL_Delay(1);\\n',
      cb + '_step(&rc_vm)'
    );

    return out;
  }

  function loadCubeMainC(e){
    try{
      const f = e && e.target && e.target.files && e.target.files[0];
      if (!f) return;
      _cMainPatchedName = f.name || 'main.c';

      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result || '');
        const cbHeader = (_cArtifacts && _cArtifacts.files && _cArtifacts.files.h) ? String(_cArtifacts.files.h) : '';
        const cbBase = cbHeader.replace(/\.h$/i,'') || 'rc_cb_custom_block';

        const patched = patchCubeMXMainC(src, cbBase);

        _cMainPatched = patched;
        if (_cArtifacts){
          _cArtifacts.mainC = patched;
          _cArtifacts.files.mainC = _cMainPatchedName;
        }

        if (cUI.fileInfo) cUI.fileInfo.textContent = 'Loaded: ' + _cMainPatchedName;
        _cTab = 'main';
        renderCTab();
      };
      reader.readAsText(f);
    }catch(err){}
  }

place(/\.c$/i,'_patched.c');
      downloadText(fn, mc);
    }
  }

  function sanitizeCIdent(name){
    return String(name||'cb')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g,'_')
      .replace(/^([^a-z_])/, '_$1')
      .replace(/_+/g,'_')
      .slice(0, 48) || 'cb';
  }

  function cTypeForParam(p){
    const kind = p?.kind || 'number';
    if (kind === 'boolean') return 'bool';
    if (kind === 'text') return 'const char*';
    if (kind === 'dropdown') return sanitizeCIdent(p?.name||'opt') + '_t';
    return 'float';
  }

  function buildEnumForDropdown(p){
    const name = sanitizeCIdent(p?.name||'mode');
    const opts = Array.isArray(p?.options) ? p.options : [];
    const clean = opts.map(o=>String(o)).filter(Boolean);
    if (!clean.length) return '';
    const lines = [];
    lines.push('typedef enum {');
    clean.forEach((o,i)=>{
      const id = (name + '_' + sanitizeCIdent(o).toUpperCase()).toUpperCase();
      lines.push(`  ${id} = ${i},`);
    });
    lines.push(`} ${name}_t;`);
    return lines.join('\n');
  }

  // Practical approach: generate JS from Blockly, then "C-ize" it into STM32-friendly template.
  function jsToC(js){
    let c = String(js || '');
    c = c.replace(/\r\n/g,'\n');

    // await wait(x) / await delay(x) -> rc_delay_ms(x);
    c = c.replace(/await\s+(wait|delay)\s*\(([^\)]*)\)\s*;?/g, 'rc_delay_ms($2);');
    c = c.replace(/\b(wait|delay)\s*\(([^\)]*)\)\s*;?/g, 'rc_delay_ms($2);');

    // window.sensorData[...] -> rc_sensor_data[...]
    c = c.replace(/window\.sensorData\s*\[/g, 'rc_sensor_data[');

    // stop flags in preview code -> return;
    c = c.replace(/throw\s+["'][^"']+["']\s*;?/g, 'return;');

    // const/let -> float by default
    c = c.replace(/^\s*(const|let)\s+/gm, 'float ');

    // parseInt(x) -> (int32_t)(x)
    c = c.replace(/parseInt\s*\(/g, '(int32_t)(');

    // Math helpers
    c = c.replace(/Math\.min\s*\(/g, 'RC_MIN(');
    c = c.replace(/Math\.max\s*\(/g, 'RC_MAX(');
    c = c.replace(/Math\.abs\s*\(/g, 'RC_ABS(');

    // ===/!== -> ==/!=
    c = c.replace(/===/g, '==').replace(/!==/g, '!=');

    // window. -> remove
    c = c.replace(/\bwindow\./g, '');

    // send functions (keep names but snake_case)
    c = c.replace(/\bsendDrivePacket\s*\(/g, 'rc_send_drive_packet(');
    c = c.replace(/\bsendMotorPacket\s*\(/g, 'rc_send_motor_packet(');

    return c.trim();
  }

  function generateSTM32Artifacts(blockName, params, jsCode){
    const id = sanitizeCIdent(blockName);
    const guard = ('RC_CB_' + id + '_H_').toUpperCase();

    const enumDecls = [];
    for (const p of (params||[])){
      if ((p?.kind||'') === 'dropdown'){
        const e = buildEnumForDropdown(p);
        if (e) enumDecls.push(e);
      }
    }

    const structLines = [];
    structLines.push('typedef struct {');
    for (const p of (params||[])){
      const n = sanitizeCIdent(p?.name||'p');
      const t = cTypeForParam(p);
      const comment = (p?.kind==='dropdown' && Array.isArray(p?.options)) ? `// options: ${p.options.map(x=>String(x)).join(', ')}` : '';
      structLines.push(`  ${t} ${n}; ${comment}`.trim());
    }
    if (!(params||[]).length) structLines.push('  uint8_t _unused;');
    structLines.push(`} rc_cb_${id}_params_t;`);

    const h = [
      '/* Auto-generated by customblock.js ' + VERSION + ' */',
      '#ifndef ' + guard,
      '#define ' + guard,
      '',
      '#include <stdint.h>',
      '#include <stdbool.h>',
      '',
      ... (enumDecls.length ? [enumDecls.join('\n\n'), ''] : []),
      ...structLines,
      '',
      'void rc_cb_' + id + '(const rc_cb_' + id + '_params_t* p);',
      '',
      '#endif /* ' + guard + ' */',
      ''
    ].join('\n');

    const cBody = jsToC(jsCode);

    const c = [
      '/* Auto-generated by customblock.js ' + VERSION + ' */',
      '/* Block: ' + blockName + ' */',
      '',
      '#include "main.h"  // STM32Cube HAL',
      '#include "rc_platform.h"',
      '#include "' + ('rc_cb_' + id + '.h') + '"',
      '',
      '#ifndef RC_MIN',
      '#define RC_MIN(a,b) (( (a) < (b) ) ? (a) : (b))',
      '#endif',
      '#ifndef RC_MAX',
      '#define RC_MAX(a,b) (( (a) > (b) ) ? (a) : (b))',
      '#endif',
      '#ifndef RC_ABS',
      '#define RC_ABS(a)   (( (a) < 0 ) ? -(a) : (a))',
      '#endif',
      '',
      'void rc_cb_' + id + '(const rc_cb_' + id + '_params_t* p){',
      '  (void)p;',
      '  // NOTE: This body is converted from the JS generator output.',
      '  // Adjust types and replace rc_* hooks with your real motor/sensor drivers.',
      '',
      (cBody ? cBody.split('\n').map(l=>'  ' + l).join('\n') : '  // (empty)'),
      '',
      '}',
      ''
    ].join('\n');

    const platformH = [
      '/* Platform hooks for generated blocks (STM32 HAL template) */',
      '#ifndef RC_PLATFORM_H',
      '#define RC_PLATFORM_H',
      '',
      '#include <stdint.h>',
      '#include <stdbool.h>',
      '',
      'extern volatile int16_t rc_sensor_data[4];',
      '',
      'uint32_t rc_millis(void);',
      'void rc_delay_ms(uint32_t ms);',
      'bool rc_should_stop(void);',
      '',
      'void rc_send_drive_packet(int16_t m1, int16_t m2, int16_t m3, int16_t m4);',
      'void rc_send_motor_packet(int16_t a, int16_t b, int16_t c, int16_t d);',
      'void rc_bt_send(const uint8_t* data, uint16_t len);',
      '',
      '#endif',
      ''
    ].join('\n');

    const platformC = [
      '/* STM32 HAL platform template */',
      '#include "main.h"',
      '#include "rc_platform.h"',
      '',
      'volatile int16_t rc_sensor_data[4] = {0,0,0,0};',
      'static volatile bool g_should_stop = false;',
      '',
      'uint32_t rc_millis(void){ return HAL_GetTick(); }',
      'void rc_delay_ms(uint32_t ms){ HAL_Delay(ms); }',
      'bool rc_should_stop(void){ return g_should_stop; }',
      '',
      'void rc_send_drive_packet(int16_t m1, int16_t m2, int16_t m3, int16_t m4){',
      '  (void)m1; (void)m2; (void)m3; (void)m4;',
      '  // TODO: build frame + send via UART/BLE',
      '}',
      'void rc_send_motor_packet(int16_t a, int16_t b, int16_t c, int16_t d){',
      '  (void)a; (void)b; (void)c; (void)d;',
      '}',
      'void rc_bt_send(const uint8_t* data, uint16_t len){',
      '  (void)data; (void)len;',
      '}',
      ''
    ].join('\n');

    return {
      c, h, platformC, platformH,
      files: {
        c: `rc_cb_${id}.c`,
        h: `rc_cb_${id}.h`,
        platformC: 'rc_platform_stm32_hal.c',
        platformH: 'rc_platform.h'
      }
    };
  }

// ------------------------------------------------------------
  // Hash import (share link)
  // ------------------------------------------------------------
  function maybeImportFromHash(){
    const h = location.hash || '';
    const m = h.match(/#cb=([A-Za-z0-9\-_]+)/);
    if (!m) return;
    const b64 = m[1];
    const already = store.get(CFG.storageKeyImportedHash);
    if (already === b64) return;
    const txt = u.b64dec(b64);
    if (!txt) return;
    const ok = confirm('Імпортувати кастомні блоки з лінка?');
    if (!ok) return;
    importDefsFromText(txt);
    store.set(CFG.storageKeyImportedHash, b64);
  }

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  function initWhenReady(){
    if (!isDesktop()){
      RC.version = VERSION;
      RC.enabled = false;
      return true;
    }

    const Blockly = window.Blockly;
    const ws = window.workspace || window._workspace || null;
    if (!Blockly || !ws) return false;

    injectCss();
    warnStorageIfNeeded();
    hookSwitchView();
    ensureCustomBlocksView();

    rebuildDefsMap();

    // Ensure category + define blocks
    ensureCustomCategory();
    defineMiniAndParamBlocks(Blockly);

    // Register existing custom blocks
    for (const d of loadBlocks()){
      defineCustomBlockType(Blockly, d.blockType);
    }

    rebuildCustomCategory(ws);
    setTimeout(()=>{ try{ markCustomCategoryRow(ws); }catch(e){} }, 140);

    ensureOpenButton();

    // Try import from hash link if present
    setTimeout(()=>{ try{ maybeImportFromHash(); }catch(e){} }, 200);

    RC.version = VERSION;
    RC.enabled = true;
    RC.openManager = openManager;

    return true;
  }

  if (!initWhenReady()){
    let tries = 0;
    const t = setInterval(()=>{
      tries++;
      if (initWhenReady() || tries > 120) clearInterval(t);
    }, 150);
  }

})();
