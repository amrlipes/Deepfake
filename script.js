/* ═══════════════════════════════════════════════════════════════════
   script.js — SYNTH::DETECT (Vanilla JS, zero dependências)

   Arquitetura modular:
     ├── PixelArt            → injeta pixel-art provisória nos slots .icon-pixel-*
     ├── HeroFace            → retrato REAL×SINTÉTICO (grid 16×16 + glitches)
     ├── Terminal            → camada de I/O: echo / type (typewriter) / progress
     ├── MediaCatalog        → metadados das mídias        [futuro: GET /api/media]
     ├── ScanProfiles        → roteiros + vereditos       [futuro: GET /api/profiles]
     ├── fetchScanProfile()  → ÚNICO ponto de troca local → remoto
     ├── Simulator           → orquestra seleção, varredura e veredito
     ├── Shell               → comandos digitáveis no terminal
     └── boot                → ligação de tudo
═════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const $  = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => [...(c || document).querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches; // respeita reduced-motion

/* ────────────────────────────────────────────────────────────────
   PixelArt — placeholders provisórios dos ícones.
   Se o slot já contiver um <img> (a arte definitiva do designer),
   o módulo não toca em nada.
──────────────────────────────────────────────────────────────── */
const PixelArt = (() => {
  const MAP = { '#': '1', o: '2', x: '3' }; // caractere → classe de cor

  const ART = {
    voice: [          // equalizer de voz
      "...#....","...#....","...#.#.#",".#.#.#.#",
      ".#.#.###","##.#.###","########","########"],
    bot: [            // robô do enxame
      "...#....",".######.",".#o##o#.",".######.",
      "..####..",".#.##.#.",".######.","..#..#.."],
    shield: [         // escudo C2PA com selo
      ".######.","######o#","#####o##","##o#o###",
      ".##o###.","..####..","...##...","........"],
    photo: [          // câmera (mídia autêntica)
      "..####..",".######.","###oo###","##oooo##",
      "##oooo##","###oo###",".######.",".######."],
    fake: [           // rosto com pixels corrompidos
      "..####..",".#####x.",".#o##x#.",".######.",
      "..#ox#..","..####..","...##...","..x....."],
    scan: [           // lupa
      "..###...",".#...#..",".#...#..",".#...#..",
      "..###...","...#....","....#...",".....#.."]
  };

  function mountAll() {
    $$('.pixel-icon').forEach(el => {
      if (el.querySelector('img')) return;               // artista já assumiu o slot
      const name = (el.className.match(/icon-pixel-([\w-]+)/) || [])[1];
      const art = ART[name];
      if (!art) return;
      el.textContent = '';
      art.forEach(row => [...row].forEach(ch => {
        const i = document.createElement('i');
        i.className = 'pc' + (MAP[ch] ? ' pk' + MAP[ch] : '');
        el.appendChild(i);
      }));
    });
  }
  return { mountAll };
})();

/* ────────────────────────────────────────────────────────────────
   HeroFace — o retrato dividido REAL × SINTÉTICO.
   Metade esquerda em fósforo verde; metade direita dessaturada,
   com olhos/boca em vermelho e glitches periódicos.
   Interação: mover o cursor sobre o rosto "corrompe" a metade sintética.
──────────────────────────────────────────────────────────────── */
const HeroFace = (() => {
  const ART = [
    "....HHHHHHHH....",
    "...HHHHHHHHHH...",
    "..HHHHHHHHHHHH..",
    "..HHFFFFFFFFHH..",
    "..HFFFFFFFFFFH..",
    "..HFFooFFooFFH..",
    "..HFFooFFooFFH..",
    "..HFFFFAAFFFFH..",
    "..HFFFFAAFFFFH..",
    "..HFFFFFFFFFFH..",
    "..HFFFMMMMFFFH..",
    "..HFFFFFFFFFFH..",
    "..HFFFFFFFFFFH..",
    "..HHFFFFFFFFHH..",
    "...HHFFFFFFHH...",
    "....HHHHHHHH...."
  ];

  function init() {
    const grid = $('#faceGrid');
    const stage = $('#faceStage');
    if (!grid) return;

    const cells = [];                                   // matriz [r][c]
    ART.forEach(row => {
      [...row].forEach(ch => {
        const d = document.createElement('div');
        d.className = 'cell' + (ch !== '.' ? ' pk-' + ch : '');
        grid.appendChild(d);
        cells.push(d);
      });
    });
    const at = (r, c) => cells[r * 16 + c];
    const hasArt = (r, c) => ART[r][c] !== '.';

    // Glitch: acende um pixel vermelho por ~150ms na metade sintética
    function glitch(el) {
      el.classList.add('glitch');
      setTimeout(() => el.classList.remove('glitch'), 90 + Math.random() * 120);
    }

    if (!RM) {
      // Corrupção espontânea (pixels soltos + varredura de linha inteira)
      setInterval(() => {
        if (Math.random() < .3) {                       // linha inteira — "scanline corrupta"
          const r = 3 + Math.floor(Math.random() * 11);
          for (let c = 8; c < 16; c++) if (hasArt(r, c)) glitch(at(r, c));
        } else {
          const n = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const r = Math.floor(Math.random() * 16), c = 8 + Math.floor(Math.random() * 8);
            if (hasArt(r, c)) glitch(at(r, c));
          }
        }
      }, 620);

      // O cursor do visitante "corrompe" a metade sintética
      let last = 0;
      stage.addEventListener('mousemove', e => {
        const now = performance.now();
        if (now - last < 70) return;
        last = now;
        const b = stage.getBoundingClientRect();
        const r = Math.floor(((e.clientY - b.top) / b.height) * 16);
        const c = 8 + Math.floor(((e.clientX - b.left) / b.width) * 8);
        if (r >= 0 && r < 16 && hasArt(r, c)) {
          glitch(at(r, c));
          if (Math.random() < .5 && r + 1 < 16 && hasArt(r + 1, c)) glitch(at(r + 1, c));
        }
      });
    }

    // Readout com métricas flutuando
    const ro = { prnu: $('#roPrnu'), art: $('#roArt'), diff: $('#roDiff') };
    setInterval(() => {
      const set = (el, v) => {
        el.textContent = v;
        el.classList.add('tick');
        setTimeout(() => el.classList.remove('tick'), 220);
      };
      set(ro.prnu, (0.78 + Math.random() * .14).toFixed(2));
      set(ro.art, 8 + Math.floor(Math.random() * 14));
      set(ro.diff, (0.34 + Math.random() * .2).toFixed(2));
    }, 2400);
  }
  return { init };
})();

/* ────────────────────────────────────────────────────────────────
   Terminal — camada de I/O do console.
   type() digita char a char (setTimeout); progress() anima barra ASCII.
   beginRun() devolve um "token de cancelamento": se uma nova varredura
   começar, a anterior aborta sem deixar linhas órfãs.
──────────────────────────────────────────────────────────────── */
const Terminal = (() => {
  const body = $('#termBody');
  const input = $('#termInput');
  const history = [];
  let histIdx = 0, runToken = 0, onCommand = null;

  const scroll = () => { body.scrollTop = body.scrollHeight; };

  function echo(text, cls) {                            // linha instantânea (segura: textContent)
    const d = document.createElement('div');
    d.className = 'tl' + (cls ? ' ' + cls : '');
    d.textContent = text;
    body.appendChild(d); scroll();
    return d;
  }

  function echoHTML(html) {                             // apenas para HTML controlado pelo app
    const d = document.createElement('div');
    d.className = 'tl';
    d.innerHTML = html;
    body.appendChild(d); scroll();
    return d;
  }

  function cmdEcho(text) {                              // eco do comando do usuário
    const d = document.createElement('div');
    d.className = 'tl t-cmd';
    const p = document.createElement('span');
    p.className = 't-prompt';
    p.textContent = 'guest@forensic:~$ ';
    d.appendChild(p);
    d.appendChild(document.createTextNode(text));
    body.appendChild(d); scroll();
  }

  function rule() {
    const d = document.createElement('div');
    d.className = 'tl rule';
    body.appendChild(d); scroll();
  }

  // parts: [[texto, classe], ...] — digita segmento a segmento
  async function type(parts, opts = {}) {
    const speed = opts.speed || 13;
    const aborted = opts.tokenCheck || (() => false);
    const d = document.createElement('div');
    d.className = 'tl';
    const cur = document.createElement('span');
    cur.className = 'tw-cur'; cur.textContent = '▌';
    d.appendChild(cur); body.appendChild(d); scroll();

    for (const [txt, cls] of parts) {
      const sp = document.createElement('span');
      if (cls) sp.className = cls;
      d.insertBefore(sp, cur);
      for (const ch of txt) {
        if (aborted()) { cur.remove(); return d; }
        sp.textContent += ch;
        scroll();
        await sleep(speed + Math.random() * 9);
      }
    }
    cur.remove();
    return d;
  }

  // Barra de progresso ASCII: [████████░░░░] 42% — label
  function progress(label, dur, tokenCheck) {
    return new Promise(res => {
      const d = echo('', 't-dim');
      const W = 22, t0 = performance.now();
      const iv = setInterval(() => {
        if (tokenCheck && tokenCheck()) {
          clearInterval(iv); d.textContent += ' [interrompido]'; res(); return;
        }
        const p = Math.min(1, (performance.now() - t0) / dur);
        const f = Math.round(p * W);
        d.textContent = '[ ' + '█'.repeat(f) + '░'.repeat(W - f) + ' ] '
                        + String(Math.round(p * 100)).padStart(3) + '% — ' + label;
        scroll();
        if (p >= 1) { clearInterval(iv); res(); }
      }, 70);
    });
  }

  function beginRun() {
    const my = ++runToken;
    return () => runToken !== my;                       // true ⇒ esta execução foi cancelada
  }

  function clear() { body.innerHTML = ''; }

  /* — input de comandos — */
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      input.value = '';
      if (!v) return;
      history.push(v); histIdx = history.length;
      cmdEcho(v);
      if (onCommand) onCommand(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx > 0) input.value = history[--histIdx];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      input.value = (histIdx < history.length - 1) ? history[++histIdx] : (histIdx = history.length, '');
    }
  });
  body.addEventListener('click', () => {                // clicar no terminal foca o input
    if (!getSelection().toString()) input.focus();
  });

  async function boot() {
    await sleep(500);
    await type([['SYNTH::DETECT ', 't-ok'], ['forensic shell — v2.4.1 (build local)', 't-dim']], { speed: 6 });
    echo('módulos: c2pa-inspector · prnu-diff · diffusion-heuristics', 't-dim');
    await sleep(140);
    await type([['digite ', 't-dim'], ['"help"', 't-ok'], [' para listar comandos — ou selecione uma mídia no painel de controles', 't-dim']], { speed: 6 });
  }

  return { echo, echoHTML, cmdEcho, type, progress, rule, clear, beginRun, boot,
           onCommandFn: fn => { onCommand = fn; } };
})();

/* ────────────────────────────────────────────────────────────────
   MediaCatalog + ScanProfiles — CAMADA DE DADOS.
   Tudo que o simulador "sabe" vive aqui, em formato declarativo,
   pronto para migrar para um backend relacional/API.
──────────────────────────────────────────────────────────────── */
const MediaCatalog = {
  real: { fileName: 'foto_origem_c2pa.jpg'  },
  fake: { fileName: 'clip_executivo_v3.mp4' }
};

const ScanProfiles = {

  real: {
    verdict: {
      ok: true,
      stamp: 'ORIGEM VERIFICADA',
      main: 'Assinatura C2PA Válida. Origem Verificada.',
      metrics: [
        ['Confiança da análise', '98.7%'],
        ['Manifest C2PA', 'PRESENTE'],
        ['Artefatos de geração', '0']
      ],
      ref: 'ref #C2PA-4F2A'
    },
    script: [
      { a: 'cmd',  text: 'c2pa-inspect --media foto_origem_c2pa.jpg --deep-scan' },
      { a: 'type', d: 240, parts: [['[ .. ]', 't-warn'], [' carregando mídia…', 't-dim']] },
      { a: 'type', d: 300, parts: [['[ OK ]', 't-ok'], [' foto_origem_c2pa.jpg — JPEG · 2.4 MB · 4032×3024', '']] },
      { a: 'type', d: 420, parts: [['[ .. ]', 't-warn'], [' extraindo metadados de origem…', 't-dim']] },
      { a: 'type', d: 220, parts: [['[ OK ]', 't-ok'], [' manifest C2PA detectado — 1 declaração de proveniência', '']] },
      { a: 'type', d: 220, parts: [['[ OK ]', 't-ok'], [' assinatura: ES256 (ECDSA / P-256) — emitente: Adobe Content Credentials', '']] },
      { a: 'type', d: 220, parts: [['[ OK ]', 't-ok'], [' cadeia de certificados válida — âncora de confiança reconhecida', '']] },
      { a: 'type', d: 220, parts: [['[ OK ]', 't-ok'], [' hash de incorporação confere — SHA-256 · 9f2a…c41b', '']] },
      { a: 'type', d: 340, parts: [['[ OK ]', 't-ok'], [' timestamp de assinatura: 2025-11-30T14:02:11Z — dentro da validade', '']] },
      { a: 'pause', d: 300 },
      { a: 'type', d: 180, parts: [['[ .. ]', 't-warn'], [' varredura de coerência em nível de pixel', 't-dim']] },
      { a: 'progress', dur: 1900, label: 'analisando blocos 8×8' },
      { a: 'type', d: 260, parts: [['[ OK ]', 't-ok'], [' ruído do sensor coerente — PRNU estável entre os canais', '']] },
      { a: 'type', d: 260, parts: [['[ OK ]', 't-ok'], [' nenhum artefato de difusão latente detectado', '']] },
      { a: 'type', d: 420, parts: [['[ OK ]', 't-ok'], [' nenhuma região de blending facial encontrada', '']] },
      { a: 'rule' },
      { a: 'type', d: 200, speed: 30, parts: [['✓  ', 't-ok t-strong'], ['Assinatura C2PA Válida. Origem Verificada.', 't-ok t-strong']] },
      { a: 'echo', cls: 't-dim', text: 'veredito registrado · confiança 98.7% · ref #C2PA-4F2A' }
    ]
  },

  fake: {
    verdict: {
      ok: false,
      stamp: 'MÍDIA SINTÉTICA',
      main: 'Alerta: Assinatura Ausente. Alta probabilidade de Mídia Sintética (GAN/Difusão).',
      metrics: [
        ['Confiança da análise', '96.4%'],
        ['Manifest C2PA', 'AUSENTE'],
        ['Artefatos de geração', '7']
      ],
      ref: 'ref #ALERT-9C31'
    },
    script: [
      { a: 'cmd',  text: 'c2pa-inspect --media clip_executivo_v3.mp4 --deep-scan' },
      { a: 'type', d: 240, parts: [['[ .. ]', 't-warn'], [' carregando mídia…', 't-dim']] },
      { a: 'type', d: 300, parts: [['[ OK ]', 't-ok'], [' clip_executivo_v3.mp4 — MP4 · 8.1 MB · 1920×1080 · 24 fps', '']] },
      { a: 'type', d: 420, parts: [['[ .. ]', 't-warn'], [' extraindo metadados de origem…', 't-dim']] },
      { a: 'type', d: 380, parts: [['[ !! ]', 't-err'], [' nenhum manifest C2PA encontrado — procedência não declarada', 't-err']] },
      { a: 'type', d: 260, parts: [['[ !! ]', 't-warn'], [' metadados EXIF ausentes — indício de re-encodamento', 't-warn']] },
      { a: 'pause', d: 280 },
      { a: 'type', d: 180, parts: [['[ .. ]', 't-warn'], [' varredura de coerência em nível de pixel', 't-dim']] },
      { a: 'progress', dur: 2200, label: 'analisando frames 120–412' },
      { a: 'type', d: 300, parts: [['[ !! ]', 't-err'], [' bordas de blending inconsistentes na região facial (frames 120–412)', 't-err']] },
      { a: 'type', d: 300, parts: [['[ !! ]', 't-err'], [' ruído do sensor ausente — textura compatível com difusão latente', 't-err']] },
      { a: 'type', d: 300, parts: [['[ !! ]', 't-err'], [' reflexos oculares dessincronizados — Δ 0.42 rad entre os olhos', 't-err']] },
      { a: 'type', d: 420, parts: [['[ !! ]', 't-err'], [' hipertextura de pele: escore 0.91 (referência natural ≤ 0.35)', 't-err']] },
      { a: 'rule' },
      { a: 'type', d: 200, speed: 30, parts: [['✗  ', 't-err t-strong'], ['Alerta: Assinatura Ausente. Alta probabilidade de Mídia Sintética (GAN/Difusão).', 't-err t-strong']] },
      { a: 'echo', cls: 't-dim', text: 'veredito registrado · confiança 96.4% · ref #ALERT-9C31' }
    ]
  }
};

/* ────────────────────────────────────────────────────────────────
   fetchScanProfile — PONTO ÚNICO DE EXTENSÃO PARA API.

   HOJE: resolve localmente (com latência simulada).
   AMANHÃ (backend + banco relacional), troque o corpo por:

     const r = await fetch(`${API_BASE}/profiles/${id}`);
     if (!r.ok) throw new Error('HTTP ' + r.status);
     return r.json();

   Nada mais no app precisa mudar: Simulator consome apenas esta função.
──────────────────────────────────────────────────────────────── */
async function fetchScanProfile(id) {
  await sleep(220);                                     // simula latência de rede — remova em produção
  const catalog = MediaCatalog[id], profile = ScanProfiles[id];
  if (!catalog || !profile) throw new Error('Perfil de mídia desconhecido: ' + id);
  return JSON.parse(JSON.stringify({ ...catalog, ...profile })); // clone profundo (imutabilidade entre execuções)
}

/* ────────────────────────────────────────────────────────────────
   Simulator — orquestra seleção de mídia, execução do roteiro
   e renderização do veredito.
──────────────────────────────────────────────────────────────── */
const Simulator = (() => {
  const slots    = $$('.slot');
  const controls = $('#simControls');
  const btn      = $('#btnScan');
  const btnLabel = $('#btnScanLabel');
  const btnSpin  = $('#btnSpin');
  const statusEl = $('#scanStatus');
  const statusTx = $('#scanStatusText');
  const verdictEl = $('#verdict');
  const T0 = Date.now();

  let media = null, scanning = false, spinIv = null, spinI = 0;
  const SPIN = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

  function setStatus(state, text) {
    statusEl.className = 'scan-status s-' + state;
    statusTx.textContent = text;
  }

  function setBtn(mode) {
    if (mode === 'busy') {
      btn.disabled = true;
      btnLabel.textContent = 'analisando';
      btnSpin.hidden = false;
      spinIv = setInterval(() => { btnSpin.textContent = SPIN[++spinI % SPIN.length]; }, 80);
    } else {
      clearInterval(spinIv);
      btnSpin.hidden = true;
      btn.disabled = false;
      btnLabel.textContent = media ? 'nova varredura' : 'iniciar varredura';
    }
  }

  function select(id) {
    if (scanning) return;
    media = id;
    slots.forEach(s => s.classList.toggle('is-on', s.dataset.slot === id));
    verdictEl.hidden = true;                            // veredito pertence à mídia anterior
    btn.disabled = false;
    setStatus('ready', 'pronto — mídia: ' + MediaCatalog[id].fileName);
  }

  function flashSlots() {
    slots.forEach(s => { s.classList.remove('attn'); void s.offsetWidth; s.classList.add('attn'); });
  }

  // Interpreta o roteiro declarativo do perfil (cmd / echo / type / pause / progress / rule)
  async function runScript(profile, chk) {
    for (const st of profile.script) {
      if (chk()) throw { aborted: true };
      switch (st.a) {
        case 'cmd':
          await Terminal.type(
            [['guest@forensic:~$ ', 't-prompt'], [st.text, 't-cmd']],
            { speed: 9, tokenCheck: chk });
          break;
        case 'echo':   Terminal.echo(st.text, st.cls); break;
        case 'rule':   Terminal.rule(); break;
        case 'pause':  await sleep(st.d); break;
        case 'type':
          await Terminal.type(st.parts, { speed: st.speed || 13, tokenCheck: chk });
          await sleep(st.d ?? 260);
          break;
        case 'progress':
          await Terminal.progress(st.label, st.dur, chk);
          await sleep(220);
          break;
      }
    }
  }

  function renderVerdict(v) {
    verdictEl.className = 'verdict ' + (v.ok ? 'v-ok' : 'v-bad');
    verdictEl.innerHTML =
      '<span class="v-stamp">' + v.stamp + '</span>' +
      '<p class="v-main">' + v.main + '</p>' +
      '<dl class="v-metrics">' +
        v.metrics.map(m => '<div><dt>' + m[0] + '</dt><dd>' + m[1] + '</dd></div>').join('') +
      '</dl>' +
      '<p class="v-ref">' + v.ref + ' · registrada às ' +
        new Date().toISOString().slice(11, 16) + ' UTC</p>';
    verdictEl.hidden = false;
  }

  async function startScan() {
    if (scanning) { Terminal.echo('[ .. ] varredura em andamento — aguarde a conclusão', 't-warn'); return; }
    if (!media) {
      Terminal.echo('[ !! ] nenhuma mídia selecionada — escolha um dos slots no painel de controles', 't-warn');
      flashSlots();
      return;
    }

    scanning = true;
    setBtn('busy');
    controls.classList.add('is-locked');
    verdictEl.hidden = true;
    setStatus('busy', 'analisando — ' + MediaCatalog[media].fileName);

    const chk = Terminal.beginRun();                    // cancela qualquer execução anterior
    try {
      const profile = await fetchScanProfile(media);
      await runScript(profile, chk);
      renderVerdict(profile.verdict);
      setStatus(profile.verdict.ok ? 'ok' : 'bad',
                profile.verdict.ok ? 'veredito: origem verificada' : 'veredito: mídia sintética');
    } catch (e) {
      if (!(e && e.aborted)) {
        console.error(e);
        Terminal.echo('[ ERRO ] falha inesperada na varredura — ver o console', 't-err');
        setStatus('idle', 'falha na varredura');
      }
    } finally {
      scanning = false;
      setBtn('idle');
      controls.classList.remove('is-locked');
    }
  }

  function init() {
    slots.forEach(s => {
      const inp = $('input', s);
      inp.addEventListener('change', () => { if (inp.checked) select(inp.value); });
    });
    btn.addEventListener('click', startScan);
  }

  /* exposes p/ Shell */
  return { init, startScan,
           currentMedia: () => media ? MediaCatalog[media].fileName : null,
           isBusy: () => scanning,
           uptime: () => {
             const s = Math.floor((Date.now() - T0) / 1000);
             return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
           } };
})();

/* ────────────────────────────────────────────────────────────────
   Shell — comandos digitáveis no terminal (bônus de imersão).
──────────────────────────────────────────────────────────────── */
const Shell = (() => {
  const registry = {
    help() {
      const rows = [
        ['help',     'lista de comandos'],
        ['scan',     'executa a varredura da mídia selecionada'],
        ['vetores',  'catálogo de vetores de ataque'],
        ['status',   'estado do laboratório'],
        ['whoami',   'identidade da sessão'],
        ['clear',    'limpa o terminal']
      ];
      rows.forEach(r => Terminal.echo('  ' + r[0].padEnd(10) + r[1], 't-dim'));
      Terminal.echo(' ');
    },
    scan()     { Simulator.startScan(); },
    clear()    { Terminal.clear(); },
    vetores()  {
      Terminal.echo('VT-01  ' + 'clonagem de voz & vishing'.padEnd(30) + 'ALTA',        't-warn');
      Terminal.echo('VT-02  ' + 'botnets de difamação'.padEnd(30) + 'CRÍTICA',      't-err');
      Terminal.echo('VT-03  ' + 'c2pa & marcas-d\u2019água'.padEnd(30) + 'CONTRAMEDIDA', 't-ok');
      Terminal.echo(' ');
    },
    status()   {
      Terminal.echo('scanner : ' + (Simulator.isBusy() ? 'ANALISANDO…' : 'PRONTO'), 't-dim');
      Terminal.echo('mídia   : ' + (Simulator.currentMedia() || 'nenhuma selecionada'), 't-dim');
      Terminal.echo('sessão  : local · uptime ' + Simulator.uptime(), 't-dim');
      Terminal.echo(' ');
    },
    whoami()   { Terminal.echo('guest · analista convidado · clearance: EDUCACIONAL', 't-dim'); Terminal.echo(' '); }
  };

  function init() {
    Terminal.onCommandFn(raw => {
      const cmd = raw.trim().toLowerCase();
      const fn = registry[cmd];
      if (fn) fn();
      else Terminal.echo('comando não encontrado: ' + cmd + ' — digite "help"', 't-warn');
    });
  }
  return { init };
})();

/* ────────────────────────────────────────────────────────────────
   boot — relógio, reveals e ligação dos módulos
──────────────────────────────────────────────────────────────── */
(function boot() {
  // Relógio UTC do header
  const clock = $('#clock');
  const tick = () => { clock.textContent = new Date().toISOString().slice(11, 19) + ' UTC'; };
  tick(); setInterval(tick, 1000);

  // Reveal on scroll (com stagger nos registros de vetores)
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .12 });
  $$('.reveal').forEach((el, i) => {
    if (el.classList.contains('vt')) el.style.transitionDelay = (i % 3) * 90 + 'ms';
    io.observe(el);
  });

  PixelArt.mountAll();
  HeroFace.init();
  Simulator.init();
  Shell.init();
  Terminal.boot();
})();

})();
