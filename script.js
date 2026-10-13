'use strict';
/* SYNTH::DETECT v7.0 — inspeção local e animação fotográfica.
   FORGE::FACE preserva textura da foto e admite calibração manual.
   Não há modelo neural generativo nem classificador de deepfake neste build. */

const CONFIG = {
  logPacingMs: 100,
  maxScanBytes: 32 * 1024 * 1024,
  audioWinBytes: 1024 * 1024,
  maxAudioMB: 80,
  maxVideoMB: 100,
  acousticsMaxSec: 180,
  maxVideoFrames: 12,
};

/* ── UTIL ── */
const $  = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => [...(c || document).querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hex4  = n => '0x' + n.toString(16).toUpperCase().padStart(4, '0');
const esc   = s => String(s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const snippet = (s, n) => {
  s = String(s).replace(/[\r\n\t]+/g, ' · ').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
};
function fmtBytes(n){
  const exact = n.toLocaleString('pt-BR') + ' bytes';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB — ' + exact;
  return (n / 1048576).toFixed(2) + ' MB — ' + exact;
}
function fmtTime(s){
  if (!isFinite(s) || s < 0) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
}
function ab2str(dv, off, len){
  let s = '';
  len = Math.max(0, Math.min(len, dv.byteLength - off));
  for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
  return s;
}
function bytesToStr(dv, off, len, enc){
  len = Math.max(0, Math.min(len, dv.byteLength - off));
  if (len <= 0) return '';
  const u8 = new Uint8Array(dv.buffer, off, len);
  try { return new TextDecoder(enc || 'utf-8').decode(u8); }
  catch { let s = ''; for (let i = 0; i < len; i++) s += String.fromCharCode(u8[i]); return s; }
}
const extOf = name => (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || null;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const syncsafe = (dv, o) =>
  ((dv.getUint8(o) & 0x7f) << 21) | ((dv.getUint8(o + 1) & 0x7f) << 14) |
  ((dv.getUint8(o + 2) & 0x7f) << 7) | (dv.getUint8(o + 3) & 0x7f);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── PIXELART ── */
const PixelArt = (() => {
  const MAP = { '#': '1', o: '2', x: '3' };
  const ART = {
    upload:  [".#....#.",".#....#.",".#....#.","########","...##...","...##...","########","##....##"],
    photo:   ["..####..",".######.","###oo###","##oooo##","##oooo##","###oo###",".######.",".######."],
    tag:     ["########","#oo#....","#o.o....","#o......","#o......","#o......","#o......","########"],
    shield:  [".######.","######o#","#####o##","##o#o###",".##o###.","..####..","...##...","........"],
    bot:     ["...#....",".######.",".#o##o#.",".######.","..####..",".#.##.#.",".######.","..#..#.."],
    wave:    ["........","..#.....","..#..#..","..#..#..","#.#..#.#","#.#..#.#","#.o..#.#","#.#..#o#"],
    cassette:[".######.","#o....o#","#......#","#.####.#","#.#..#.#","#.####.#","#o....o#",".######."],
    film:    ["########","#o#o#o#o","#......#","#o#o#o#o","#......#","#o#o#o#o","#......#","########"],
    mic:     ["..####..",".######.",".#o..o#.",".#.##.#.","...##...","..####..",".######.","........"],
    cam:     ["........",".######.","#o....o#","#......#","#.o..o.#","#......#",".######.","........"]
  };
  function mountAll(){
    $$('.pixel-icon').forEach(el => {
      if (el.querySelector('img')) return;
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

/* ── TERMINAL ── */
const Terminal = (() => {
  const body = $('#termBody');
  const scroll = () => { body.scrollTop = body.scrollHeight; };
  const TAGS = { ok: '[ OK ]', warn: '[WARN]', err: '[ !! ]', run: '[ .. ]' };
  const stamp = () => {
    const d = new Date();
    return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  };
  function log(text = '', status = 'plain'){
    const row = document.createElement('div');
    row.className = 'tline';
    const ts = document.createElement('span'); ts.className = 't-ts'; ts.textContent = stamp();
    const tag = document.createElement('span');
    tag.className = 't-tag' + (TAGS[status] ? ' t-' + status : '');
    tag.textContent = ' ' + (TAGS[status] || '      ') + ' ';
    const tx = document.createElement('span'); tx.textContent = ' ' + text;
    row.append(ts, tag, tx);
    body.appendChild(row); scroll();
  }
  function section(title){
    const d = document.createElement('div');
    d.className = 'tline t-sec';
    d.textContent = ('── ' + title + ' ').padEnd(52, '─');
    body.appendChild(d); scroll();
  }
  function progress(label){
    const d = document.createElement('div');
    d.className = 'tline t-dim';
    body.appendChild(d);
    const W = 22;
    const draw = p => {
      p = Math.max(0, Math.min(1, p));
      const f = Math.round(p * W);
      d.textContent = '[ ' + '█'.repeat(f) + '░'.repeat(W - f) + ' ] '
        + String(Math.round(p * 100)).padStart(3) + '% — ' + label;
      scroll();
    };
    return { update: (l, t) => draw(t ? l / t : 1), end: () => draw(1) };
  }
  const clear = () => { body.innerHTML = ''; };
  return { log, section, progress, clear };
})();

/* ═══════════════════════════════════════════════════════════════
   FORENSICCORE — motor de DETECÇÃO (DOM-free)
   ═══════════════════════════════════════════════════════════════ */
const ForensicCore = (() => {

  function readFile(file, onProgress){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total); };
      fr.onload  = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('falha na leitura do arquivo (FileReader)'));
      fr.readAsArrayBuffer(file);
    });
  }

  async function sha256(buffer){
    try {
      if (!(self.crypto && crypto.subtle)) return null;
      const d = await crypto.subtle.digest('SHA-256', buffer);
      return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { return null; }
  }

  function decodeLatin1(buffer, cap){
    const u8 = new Uint8Array(buffer);
    const len = Math.min(u8.length, cap);
    let s = '';
    for (let i = 0; i < len; i += 65536)
      s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + 65536, len)));
    return { text: s, truncated: u8.length > cap };
  }

  /* ── DETECÇÃO DE FORMATO (imagem → vídeo → áudio) ── */
  const IMG_FTYP = ['heic','heix','hevc','hevx','heif','mif1','msf1','avif','avis','miaf'];

  function detectImageFormat(dv, len){
    const b = i => dv.getUint8(i);
    if (len > 3  && b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF)
      return { kind:'jpeg',  format:'JPEG',        magic:'FF D8 FF',   exts:['jpg','jpeg','jpe','jfif'] };
    if (len > 8  && b(0) === 0x89 && ab2str(dv, 1, 3) === 'PNG')
      return { kind:'png',   format:'PNG',         magic:'89 50 4E 47',exts:['png'] };
    if (len > 6  && ab2str(dv, 0, 3) === 'GIF')
      return { kind:'gif',   format:'GIF',         magic:ab2str(dv,0,6),exts:['gif'] };
    if (len > 12 && ab2str(dv, 0, 4) === 'RIFF' && ab2str(dv, 8, 4) === 'WEBP')
      return { kind:'webp',  format:'WebP',        magic:'RIFF/WEBP',  exts:['webp'] };
    if (len > 2  && b(0) === 0x42 && b(1) === 0x4D)
      return { kind:'bmp',   format:'BMP',         magic:'42 4D',      exts:['bmp','dib'] };
    if (len > 4  && ((b(0) === 0x49 && b(1) === 0x49) || (b(0) === 0x4D && b(1) === 0x4D)) && b(2) === 0x2A)
      return { kind:'tiff',  format:'TIFF',        magic:'II/MM 2A',   exts:['tif','tiff'] };
    if (len > 12 && ab2str(dv, 4, 4) === 'ftyp'){
      const brand = ab2str(dv, 8, 4).trim().toLowerCase();
      if (IMG_FTYP.includes(brand))
        return { kind:'isobmff', format:'ISO-BMFF · ' + brand.toUpperCase(), magic:'ftyp ' + brand, exts:['heic','heif','avif','avifs','hif'] };
      return { kind:'unknown', format:'DESCONHECIDO', magic:'—', exts:[] };
    }
    return { kind:'unknown', format:'DESCONHECIDO', magic:'—', exts:[] };
  }

  function findMpegSync(dv, len, from){
    const lim = Math.min(len - 4, from + 65536);
    for (let i = Math.max(0, from); i < lim; i++){
      const b0 = dv.getUint8(i), b1 = dv.getUint8(i + 1);
      if (b0 === 0xFF && (b1 & 0xE0) === 0xE0){
        const ver = (b1 >> 3) & 3, layer = (b1 >> 1) & 3;
        const b2 = dv.getUint8(i + 2);
        const brI = b2 >> 4, srI = (b2 >> 2) & 3;
        if (ver !== 1 && layer !== 0 && brI !== 0 && brI !== 15 && srI !== 3) return i;
      }
    }
    return -1;
  }

  /* — MP4/ISO-BMFF: mapeia boxes e decide vídeo × áudio pelas PISTAS — */
  const CODEC_LABEL = {
    avc1:'H.264/AVC', avc3:'H.264/AVC', hvc1:'H.265/HEVC', hev1:'H.265/HEVC',
    mp4a:'AAC', av01:'AV1', vp09:'VP9', vp08:'VP8', opus:'Opus', 'ec-3':'E-AC-3',
    'ac-3':'AC-3', alac:'ALAC', mp4v:'MPEG-4 Visual', jpeg:'JPEG', gpmd:'GoPro GPMD',
    samr:'AMR', ulaw:'µ-law', fLaC:'FLAC', text:'texto', tx3g:'texto (tx3g)'
  };
  const MP4_TAGS = { '\u00A9too':'encoder', '\u00A9nam':'título', '\u00A9ART':'artista', '\u00A9alb':'álbum',
                     '\u00A9day':'data', '\u00A9cmt':'comentário', '\u00A9gen':'gênero', 'desc':'descrição',
                     '\u00A9swr':'software', '\u00A9mak':'fabricante', '\u00A9mod':'modelo' };

  function mp4Probe(dv, len){
    const out = { brands:[], tracks:[], meta:[], durationSec:null, creationDate:null,
                  quicktime:false, gpmd:false, handlerNames:[], c2paBox:false, trailing:0 };
    function walk(start, end, depth, trk){
      if (depth > 7) return;
      let pos = start, guard = 0, lastEnd = start;
      while (pos + 8 <= end && guard++ < 500){
        let size = dv.getUint32(pos);
        const type = ab2str(dv, pos + 4, 4);
        let hdr = 8;
        if (size === 1){
          if (pos + 16 > end) break;
          size = dv.getUint32(pos + 8) * 4294967296 + dv.getUint32(pos + 12); hdr = 16;
        }
        if (size === 0) size = end - pos;
        if (size < hdr || pos + size > end) break;
        const d = pos + hdr, e = pos + size;
        lastEnd = e;
        switch (type){
          case 'ftyp': {
            for (let o = d + 4; o + 4 <= e; o += 4){
              const b = ab2str(dv, o, 4).trim();
              if (b && !out.brands.includes(b)) out.brands.push(b);
            }
            break;
          }
          case 'mvhd': {
            const v = dv.getUint8(d); let cr, ts, du;
            if (v === 1){
              cr = dv.getUint32(d + 4) * 4294967296 + dv.getUint32(d + 8);
              ts = dv.getUint32(d + 20);
              du = dv.getUint32(d + 24) * 4294967296 + dv.getUint32(d + 28);
            } else { cr = dv.getUint32(d + 4); ts = dv.getUint32(d + 12); du = dv.getUint32(d + 16); }
            if (ts) out.durationSec = du / ts;
            if (cr > 0){
              const dt = new Date((cr - 2082844800) * 1000);
              if (dt.getFullYear() > 1990 && dt.getFullYear() < 2100) out.creationDate = dt;
            }
            break;
          }
          case 'trak': { const t = {}; out.tracks.push(t); walk(d, e, depth + 1, t); break; }
          case 'tkhd': if (trk) {
            const v = dv.getUint8(d);
            trk.w = dv.getUint32(d + (v === 1 ? 84 : 72)) / 65536;
            trk.h = dv.getUint32(d + (v === 1 ? 88 : 76)) / 65536;
            break;
          }
          case 'hdlr': {
            const t4 = ab2str(dv, d + 8, 4);
            const name = ab2str(dv, d + 24, Math.min(e - (d + 24), 64)).replace(/\0.*$/, '').trim();
            if (trk) trk.hdlr = t4;
            if (name) out.handlerNames.push(name);
            break;
          }
          case 'stsd': if (trk) {
            trk.formats = trk.formats || [];
            const cnt = dv.getUint32(d + 4);
            let p = d + 8;
            for (let i = 0; i < cnt && p + 8 <= e; i++){
              const es = dv.getUint32(p);
              const f = ab2str(dv, p + 4, 4);
              if (f) trk.formats.push(f);
              if (f === 'gpmd') out.gpmd = true;
              p += Math.max(es, 8);
            }
            break;
          }
          case 'uuid': {
            const u = ab2str(dv, d, 16);
            if (/c2pa|jumb/i.test(u)) out.c2paBox = true;
            break;
          }
          case 'meta': walk(d + 4, e, depth + 1, trk); break;
          case 'moov': case 'mdia': case 'minf': case 'stbl':
          case 'udta': case 'ilst': walk(d, e, depth + 1, trk); break;
          default:
            if (MP4_TAGS[type] && e - d >= 16){
              let p = d;
              while (p + 8 <= e){
                const cs = dv.getUint32(p), ct = ab2str(dv, p + 4, 4);
                if (ct === 'data' && cs >= 16 && (dv.getUint32(p + 8) & 0xFFFFFF) === 1){
                  const val = bytesToStr(dv, p + 16, Math.min(cs - 16, 512));
                  if (val) out.meta.push({ src:'MP4/ilst', key: MP4_TAGS[type], value: val,
                    tech: ['\u00A9too','\u00A9cmt','\u00A9swr'].includes(type) });
                }
                if (cs < 8) break;
                p += cs;
              }
            }
        }
        pos = e;
      }
      if (depth === 0) out.trailing = Math.max(0, len - lastEnd);
    }
    walk(0, len, 0, null);
    out.hasVideo = out.tracks.some(t => t.hdlr === 'vide');
    out.hasAudio = out.tracks.some(t => t.hdlr === 'soun');
    out.quicktime = out.brands.some(b => b.toLowerCase() === 'qt');
    return out;
  }

  function detectVideoFormat(dv, len){
    if (len > 16 && ab2str(dv, 0, 4) === 'RIFF' && ab2str(dv, 8, 4) === 'AVI ')
      return { kind:'avi', format:'AVI (RIFF)', magic:'RIFF/AVI', exts:['avi','divx'], media:'video' };
    if (len > 12 && ab2str(dv, 4, 4) === 'ftyp'){
      const brand = ab2str(dv, 8, 4).trim();
      const probe = mp4Probe(dv, len);
      const base = { kind:'mp4', format:'MP4/MOV (ISO-BMFF)', magic:'ftyp ' + brand,
                     exts:['mp4','m4v','mov','qt','3gp','3g2','3gpp'], probe };
      if (probe.hasVideo) return { ...base, media:'video' };
      if (probe.hasAudio) return { ...base, format:'M4A (ISO-BMFF)', exts:['m4a','m4b','m4r'], media:'audio' };
      const vBrands = ['isom','iso2','mp41','mp42','avc1','avc3','dash','qt','3gp','3g2','3gpp','3g2a','mmp4','msnv','ndas','isml','f4v'];
      const looksVideo = probe.brands.some(b => vBrands.includes(b.toLowerCase())) || brand === '';
      return { ...base, media: looksVideo ? 'video' : 'audio' };
    }
    if (len > 4 && dv.getUint8(0) === 0x1A && dv.getUint8(1) === 0x45 && dv.getUint8(2) === 0xDF && dv.getUint8(3) === 0xA3){
      const head = ab2str(dv, 0, Math.min(160, len)).toLowerCase();
      const dt = head.includes('webm') ? 'webm' : head.includes('matroska') ? 'matroska' : null;
      let hasV = false;
      if (dt){
        const w = decodeLatin1(dv.buffer, 262144).text;
        hasV = /V_(VP8|VP9|AV1|MPEG4|MPEGH|MS\/VFW|THEORA|UNCOMPRESSED)/.test(w);
      }
      return { kind:'mkv', format: dt === 'webm' ? 'WebM (EBML)' : dt === 'matroska' ? 'Matroska (EBML)' : 'EBML',
               magic:'EBML' + (dt ? '/' + dt : ''), exts: dt === 'webm' ? ['webm'] : ['mkv','mka'],
               media: hasV || !dt ? 'video' : 'audio', doctype: dt };
    }
    if (len > 9 && ab2str(dv, 0, 3) === 'FLV')
      return { kind:'flv', format:'Flash Video', magic:'FLV', exts:['flv','f4v'], media:'video' };
    if (len > 377 && dv.getUint8(0) === 0x47 && dv.getUint8(188) === 0x47 && dv.getUint8(376) === 0x47)
      return { kind:'ts', format:'MPEG-TS', magic:'sync 0x47 ×3', exts:['ts','m2ts','mts','m2t'], media:'video' };
    if (len > 4 && dv.getUint8(0) === 0 && dv.getUint8(1) === 0 && dv.getUint8(2) === 1 && dv.getUint8(3) === 0xBA)
      return { kind:'ps', format:'MPEG-PS', magic:'00 00 01 BA', exts:['mpg','mpeg','vob','m2p'], media:'video' };
    if (len > 4096 && ab2str(dv, 0, 4) === 'OggS' && ab2str(dv, 0, 4096).includes('theora'))
      return { kind:'ogv', format:'Ogg/Theora', magic:'OggS+theora', exts:['ogv'], media:'video' };
    return null;
  }

  function detectAudioFormat(dv, len, hint){
    const b = i => dv.getUint8(i);
    const s4 = o => ab2str(dv, o, 4);
    if (len > 12 && s4(0) === 'RIFF' && s4(8) === 'WAVE')
      return { kind:'wav',  format:'WAV/RIFF',   magic:'RIFF/WAVE', exts:['wav','wave'] };
    if (len > 4 && ab2str(dv, 0, 4) === 'fLaC')
      return { kind:'flac', format:'FLAC',       magic:'fLaC',      exts:['flac'] };
    if (len > 4 && ab2str(dv, 0, 4) === 'OggS')
      return { kind:'ogg',  format:'Ogg',        magic:'OggS',      exts:['ogg','oga','opus'] };
    if (len > 6 && ab2str(dv, 0, 6) === '#!AMR')
      return { kind:'amr',  format:'AMR',        magic:'#!AMR',     exts:['amr'] };
    if (len > 12 && s4(0) === 'FORM' && (s4(8) === 'AIFF' || s4(8) === 'AIFC'))
      return { kind:'aiff', format:'AIFF',       magic:'FORM/AIFF', exts:['aiff','aif'] };
    if (len > 4 && b(0) === 0x30 && b(1) === 0x26 && b(2) === 0xB2 && b(3) === 0x75)
      return { kind:'asf',  format:'ASF',        magic:'ASF GUID',
               exts: hint === 'audio' ? ['wma'] : ['wmv','asf'], media: hint === 'audio' ? 'audio' : 'video' };
    if (len > 4 && (ab2str(dv, 0, 3) === 'ID3' || findMpegSync(dv, len, 0) >= 0))
      return { kind:'mp3',  format:'MP3 (MPEG áudio)', magic:'ID3/sync', exts:['mp3','mp2','mpga'] };
    return { kind:'unknown', format:'DESCONHECIDO', magic:'—', exts:[] };
  }

  function sniffMedia(dv, len, hint){
    const img = detectImageFormat(dv, len);
    if (img.kind !== 'unknown') return { media:'image', ...img };
    const vid = detectVideoFormat(dv, len);
    if (vid) return { media: vid.media || 'video', ...vid };
    const aud = detectAudioFormat(dv, len, hint);
    if (aud.kind !== 'unknown') return { media: aud.media || 'audio', ...aud };
    return null;
  }

  /* ══════ IMAGEM ══════ */
  const JPEG_MARKERS = {
    0xE0:'APP0',0xE1:'APP1',0xE2:'APP2',0xE3:'APP3',0xE4:'APP4',0xE5:'APP5',0xE6:'APP6',0xE7:'APP7',
    0xE8:'APP8',0xE9:'APP9',0xEA:'APP10',0xEB:'APP11',0xEC:'APP12',0xED:'APP13',0xEE:'APP14',0xEF:'APP15',
    0xFE:'COM',0xDB:'DQT',0xC4:'DHT',0xDD:'DRI',0xDA:'SOS',0xCC:'DAC',
    0xC0:'SOF0',0xC1:'SOF1',0xC2:'SOF2',0xC3:'SOF3',0xC5:'SOF5',0xC6:'SOF6',0xC7:'SOF7',
    0xC9:'SOF9',0xCA:'SOF10',0xCB:'SOF11',0xCD:'SOF13',0xCE:'SOF14',0xCF:'SOF15'
  };

  function jpegWalk(dv, len, S, emit){
    let pos = 2, dims = null, sofName = '', eoi = -1, desync = false, scans = 0;
    const counts = {};
    while (pos < len - 1){
      if (dv.getUint8(pos) !== 0xFF){ desync = true; break; }
      const m = dv.getUint8(pos + 1);
      if (m === 0xFF){ pos++; continue; }
      if (m === 0xD8){ pos += 2; continue; }
      if (m === 0xD9){ eoi = pos; break; }
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)){ pos += 2; continue; }
      if (pos + 4 > len){ desync = true; break; }
      const segLen = dv.getUint16(pos + 2);
      if (segLen < 2){ desync = true; break; }
      const name = JPEG_MARKERS[m] || 'SEG_' + m.toString(16).toUpperCase();
      counts[name] = (counts[name] || 0) + 1;
      const seg = { marker: m, name, offset: pos, dataStart: pos + 4, dataLen: segLen - 2 };
      const head = n => ab2str(dv, seg.dataStart, Math.min(n, seg.dataLen));
      if (m === 0xE0 && head(4) === 'JFIF') seg.id = 'JFIF';
      if (m === 0xE1 && head(6) === 'Exif\x00\x00') seg.id = 'EXIF';
      if (m === 0xE1 && head(27).indexOf('http://ns.adobe.com') === 0) seg.id = 'XMP';
      if (m === 0xE2 && head(11) === 'ICC_PROFILE') seg.id = 'perfil ICC';
      if (m === 0xEB) seg.id = 'JUMBF — candidato a manifesto C2PA';
      if (m === 0xEC && head(13) === 'Photoshop 3.0') seg.id = 'IRB Photoshop';
      if (m === 0xEE && head(5) === 'Adobe') seg.id = 'marcador Adobe';
      if (m === 0xFE) seg.id = 'COMENTÁRIO';
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC){
        dims = { w: dv.getUint16(pos + 7), h: dv.getUint16(pos + 5) };
        sofName = name;
      }
      S.segments.push(seg);
      if (m === 0xDA){
        scans++;
        let p = pos + 2 + segLen;
        while (p < len - 1){
          if (dv.getUint8(p) === 0xFF){
            const n = dv.getUint8(p + 1);
            if (n !== 0x00 && !(n >= 0xD0 && n <= 0xD7) && n !== 0xFF) break;
          }
          p++;
        }
        pos = p; continue;
      }
      pos += 2 + segLen;
    }
    S.dims = dims; S.desync = desync;
    S.trailing = eoi >= 0 ? len - (eoi + 2) : 0;
    S.segments.filter(s => s.id).forEach(s => {
      const extra = s.id === 'COMENTÁRIO'
        ? ' — "' + snippet(ab2str(dv, s.dataStart, s.dataLen).replace(/\0/g, ''), 96) + '"'
        : ' — ' + s.dataLen + ' B';
      emit(s.name + ' · ' + s.id + ' @ ' + hex4(s.offset) + extra, s.id === 'COMENTÁRIO' ? 'plain' : 'ok');
    });
    const tech = Object.entries(counts)
      .filter(([n]) => !n.startsWith('APP') && n !== 'COM')
      .map(([n, c]) => n + (c > 1 ? ' ×' + c : '')).join(' · ');
    if (tech) emit('segmentos técnicos: ' + tech, 'plain');
    if (dims) emit('dimensões (' + sofName + '): ' + dims.w + '×' + dims.h + ' px', 'ok');
    if (eoi < 0) emit('EOI não localizado — arquivo truncado ou estrutura anômala', 'err');
    else if (S.trailing > 0) emit(S.trailing + ' bytes de dados APÓS o EOI — possível payload anexado', 'err');
    else emit('EOI @ ' + hex4(eoi) + ' — nenhum dados anexado após o fim da imagem', 'ok');
    if (desync) emit('dessincronização de marcadores a partir de ' + hex4(pos) + ' — estrutura não padrão', 'warn');
    S.scans = scans;
  }

  function readPngText(dv, chunk){
    let i = chunk.dataStart;
    const end = chunk.dataStart + chunk.length;
    let kw = '';
    while (i < end && dv.getUint8(i) !== 0) kw += String.fromCharCode(dv.getUint8(i++));
    i++;
    let val = '';
    while (i < end) val += String.fromCharCode(dv.getUint8(i++));
    return { keyword: kw, value: val };
  }
  function readPngITXt(dv, chunk){
    let i = chunk.dataStart;
    const end = chunk.dataStart + chunk.length;
    let kw = '';
    while (i < end && dv.getUint8(i) !== 0) kw += String.fromCharCode(dv.getUint8(i++));
    i++;
    if (i + 2 > end) return { keyword: kw, value: '' };
    const compressed = dv.getUint8(i) === 1;
    i += 2;
    for (let k = 0; k < 2; k++){ while (i < end && dv.getUint8(i) !== 0) i++; i++; }
    let val = '';
    if (!compressed) while (i < end) val += String.fromCharCode(dv.getUint8(i++));
    return { keyword: kw, value: val, compressed };
  }
  function pngWalk(dv, len, S, emit){
    let pos = 8, trailing = 0, corrupt = false;
    while (pos + 8 <= len){
      const clen = dv.getUint32(pos);
      if (clen > 0x7FFFFFFF || pos + 12 + clen > len){ corrupt = true; break; }
      const type = ab2str(dv, pos + 4, 4);
      S.chunks.push({ type, offset: pos, dataStart: pos + 8, length: clen });
      if (type === 'IEND'){ pos += 12 + clen; trailing = len - pos; break; }
      pos += 12 + clen;
    }
    if (S.chunks[0] && S.chunks[0].type === 'IHDR')
      S.dims = { w: dv.getUint32(16), h: dv.getUint32(20) };
    const idat = S.chunks.filter(c => c.type === 'IDAT');
    S.chunks.filter(c => c.type !== 'IDAT').forEach(c => {
      let extra = '';
      if (c.type === 'tEXt'){ const t = readPngText(dv, c); S.texts.push(t); extra = ' · chave "' + t.keyword + '"'; }
      if (c.type === 'iTXt'){ const t = readPngITXt(dv, c); S.texts.push(t); extra = ' · chave "' + t.keyword + '"'; }
      if (c.type === 'zTXt') extra = ' · comprimido (não expandido)';
      emit('chunk ' + c.type + ' @ ' + hex4(c.offset) + ' · ' + c.length + ' B' + extra, c.type === 'c2pa' ? 'ok' : 'plain');
    });
    if (idat.length) emit('IDAT ×' + idat.length + ' · ' + idat.reduce((a, c) => a + c.length, 0) + ' B de dados de imagem', 'plain');
    if (S.dims) emit('dimensões (IHDR): ' + S.dims.w + '×' + S.dims.h + ' px', 'ok');
    if (trailing > 0) emit(trailing + ' bytes de dados APÓS o IEND — possível payload anexado', 'err');
    else if (!corrupt) emit('IEND no fim exato do arquivo — nenhum dados anexado', 'ok');
    if (corrupt) emit('declaração de tamanho de chunk inconsistente com o arquivo — estrutura corrompida', 'err');
    S.trailing = trailing; S.corrupt = corrupt;
  }

  const le24 = (dv, o) => dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16);
  function webpWalk(dv, len, S, emit){
    let pos = 12, corrupt = false;
    while (pos + 8 <= len){
      const type = ab2str(dv, pos, 4);
      const clen = dv.getUint32(pos + 4, true);
      if (pos + 8 + clen > len){ corrupt = true; break; }
      S.chunks.push({ type, offset: pos, dataStart: pos + 8, length: clen });
      pos += 8 + clen + (clen & 1);
    }
    for (const c of S.chunks){
      if (c.type === 'VP8X') S.dims = { w: 1 + le24(dv, c.dataStart + 4), h: 1 + le24(dv, c.dataStart + 7) };
      if (c.type === 'VP8 '){
        const p = c.dataStart;
        if (dv.getUint8(p + 3) === 0x9D && dv.getUint8(p + 4) === 0x01 && dv.getUint8(p + 5) === 0x2A)
          S.dims = { w: dv.getUint16(p + 6) & 0x3FFF, h: dv.getUint16(p + 8) & 0x3FFF };
      }
      if (c.type === 'VP8L' && dv.getUint8(c.dataStart) === 0x2F){
        const v = dv.getUint32(c.dataStart + 1, true);
        S.dims = { w: (v & 0x3FFF) + 1, h: ((v >> 14) & 0x3FFF) + 1 };
      }
    }
    S.chunks.forEach(c => emit('chunk ' + c.type + ' @ ' + hex4(c.offset) + ' · ' + c.length + ' B',
      (c.type === 'c2pa' || c.type === 'EXIF' || c.type === 'XMP ') ? 'ok' : 'plain'));
    if (S.dims) emit('dimensões (cabeçalho de codec): ' + S.dims.w + '×' + S.dims.h + ' px', 'ok');
    if (corrupt) emit('tamanho de chunk inconsistente com o arquivo — estrutura corrompida', 'err');
    S.corrupt = corrupt;
  }

  function inspectStructure(dv, len, file, sniff, emit){
    const ext = extOf(file.name);
    const extOk = !ext || (sniff ? sniff.exts.includes(ext) : true);
    const S = { kind: sniff ? sniff.kind : 'unknown', format: sniff ? sniff.format : 'DESCONHECIDO',
                extOk, dims: null, trailing: 0, desync: false, corrupt: false, segments: [], chunks: [], texts: [] };
    emit('assinatura de arquivo: ' + S.format + ' (' + (sniff ? sniff.magic : '—') + ')', 'ok');
    if (ext)
      emit(extOk ? 'extensão .' + ext + ' confere com o conteúdo real'
                 : 'extensão .' + ext + ' diverge do conteúdo real (' + S.format + ') — arquivo renomeado',
           extOk ? 'ok' : 'err');
    else emit('arquivo sem extensão — formato identificado apenas pela assinatura de bytes', 'warn');
    try {
      if (S.kind === 'jpeg') jpegWalk(dv, len, S, emit);
      else if (S.kind === 'png') pngWalk(dv, len, S, emit);
      else if (S.kind === 'webp') webpWalk(dv, len, S, emit);
      else if (S.kind === 'gif'){
        S.dims = { w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
        emit('cabeçalho ' + ab2str(dv, 0, 6) + ' · quadros: ' + ((dv.getUint8(10) & 1) ? 'múltiplos' : 'único'), 'ok');
        emit('dimensões (cabeçalho): ' + S.dims.w + '×' + S.dims.h + ' px', 'ok');
      }
      else if (S.kind === 'bmp'){
        S.dims = { w: dv.getInt32(18, true), h: Math.abs(dv.getInt32(22, true)) };
        emit('DIB header · dimensões: ' + S.dims.w + '×' + S.dims.h + ' px', 'ok');
      }
      else if (S.kind === 'tiff') emit('contêiner TIFF detectado — tags lidas na fase de metadados', 'plain');
      else if (S.kind === 'isobmff') emit('contêiner ISO-BMFF (HEIC/AVIF) — varredura estrutural limitada; heurísticas ativas', 'warn');
      else emit('varredura estrutural limitada para este contêiner — heurísticas de strings seguem ativas', 'warn');
    } catch (e){
      S.desync = true;
      emit('exceção durante a varredura estrutural (' + e.message + ') — arquivo anômalo', 'err');
    }
    return S;
  }

  function parseTiff(dv, tiffStart){
    const bom = dv.getUint16(tiffStart);
    const le = bom === 0x4949;
    if (!le && bom !== 0x4D4D) return null;
    if (dv.getUint16(tiffStart + 2, le) !== 0x2A) return null;
    const ifd = tiffStart + dv.getUint32(tiffStart + 4, le);
    if (ifd + 2 > dv.byteLength) return null;
    const count = Math.min(dv.getUint16(ifd, le), 512);
    const TYPE_LEN = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const WANTED = { 0x010F:'Make', 0x0110:'Model', 0x0131:'Software', 0x0132:'DateTime',
                     0x013B:'Artist', 0x010E:'ImageDescription', 0x8298:'Copyright' };
    const out = {}; let gps = false, exifIfd = false;
    for (let i = 0; i < count; i++){
      const e = ifd + 2 + i * 12;
      if (e + 12 > dv.byteLength) break;
      const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), cnt = dv.getUint32(e + 4, le);
      if (tag === 0x8825) gps = true;
      if (tag === 0x8769) exifIfd = true;
      if (!TYPE_LEN[type] || !WANTED[tag] || type !== 2) continue;
      const bytes = TYPE_LEN[type] * cnt;
      const vp = bytes <= 4 ? e + 8 : tiffStart + dv.getUint32(e + 8, le);
      let s = '';
      for (let j = 0; j < Math.min(cnt - 1, 128); j++){
        if (vp + j >= dv.byteLength) break;
        s += String.fromCharCode(dv.getUint8(vp + j));
      }
      out[WANTED[tag]] = s.trim();
    }
    return { tags: out, gps, exifIfd, count };
  }

  const fmtVal = (k, v) => {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
    if (k === 'FNumber') return 'f/' + v;
    if (k === 'ExposureTime' && v > 0 && v < 1) return '1/' + Math.round(1 / v) + 's';
    return String(v);
  };

  async function inspectExif(dv, S, file, emit){
    const out = { source:'none', tiff:null, exifr:null, tags:{}, gps:false, malformed:false, exifrDegraded:false };
    let tiffStart = -1;
    if (S.kind === 'jpeg'){ const s = S.segments.find(s => s.id === 'EXIF'); if (s) tiffStart = s.dataStart + 6; }
    else if (S.kind === 'png'){ const c = S.chunks.find(c => c.type === 'eXIf'); if (c) tiffStart = c.dataStart; }
    else if (S.kind === 'webp'){
      const c = S.chunks.find(c => c.type === 'EXIF');
      if (c) tiffStart = ab2str(dv, c.dataStart, 6) === 'Exif\x00\x00' ? c.dataStart + 6 : c.dataStart;
    }
    else if (S.kind === 'tiff') tiffStart = 0;
    if (tiffStart >= 0){
      try {
        const t = parseTiff(dv, tiffStart);
        if (t){
          out.tiff = t; out.source = 'internal'; out.tags = { ...t.tags }; out.gps = t.gps;
          emit('TIFF/IFD0: ' + t.count + ' entradas decodificadas', 'ok');
          ['Make','Model','Software','DateTime','Artist','ImageDescription','Copyright']
            .forEach(k => { if (t.tags[k]) emit(k + ': ' + t.tags[k], 'ok'); });
          if (t.gps) emit('bloco GPS presente — coordenadas de localização embutidas (risco de privacidade)', 'warn');
          if (t.exifIfd) emit('sub-IFD EXIF presente — dados adicionais de captura', 'plain');
        } else { emit('cabeçalho TIFF inválido dentro do contêiner EXIF', 'err'); out.malformed = true; }
      } catch { emit('EXIF malformado — exceção ao decodificar o IFD0 (indício de adulteração)', 'err'); out.malformed = true; }
    } else emit('nenhum contêiner EXIF encontrado na estrutura do arquivo', 'warn');

    if (self.exifr){
      try {
        const tags = await self.exifr.parse(file);
        if (tags && Object.keys(tags).length){
          out.exifr = tags;
          if (out.source === 'none') out.source = 'exifr';
          Object.assign(out.tags, tags);
          out.gps = out.gps || tags.GPSLatitude != null;
          emit('módulo exifr: ' + Object.keys(tags).length + ' tags decodificadas', 'ok');
          const pick = ['DateTimeOriginal','CreateDate','LensModel','ISO','FNumber','ExposureTime','Orientation'];
          const parts = pick.filter(k => tags[k] != null).map(k => k + ': ' + fmtVal(k, tags[k]));
          if (parts.length) emit(parts.join(' · '), 'plain');
          if (tags.GPSLatitude != null && !out.tiff) emit('coordenadas GPS detectadas — risco de privacidade', 'warn');
        } else emit('exifr não encontrou tags adicionais', 'plain');
      } catch { emit('exifr falhou ao interpretar o EXIF — mantendo resultado do parser interno', 'warn'); }
    } else {
      out.exifrDegraded = true;
      emit('módulo exifr indisponível (CDN offline?) — prosseguindo com parser TIFF interno', 'warn');
    }
    return out;
  }

  function inspectC2pa(dv, S, latin1, emit){
    const out = { found: false, where: [], declaresAI: false };
    emit('buscando manifesto: APP11/JUMBF (JPEG), chunk c2pa (PNG/WebP), varredura de bytes', 'run');
    if (S.kind === 'jpeg')
      S.segments.filter(s => s.marker === 0xEB)
        .forEach(s => { out.found = true; out.where.push('APP11/JUMBF @ ' + hex4(s.offset)); });
    if (S.kind === 'png' || S.kind === 'webp')
      S.chunks.filter(c => c.type === 'c2pa')
        .forEach(c => { out.found = true; out.where.push('chunk c2pa @ ' + hex4(c.offset)); });
    const low = latin1.toLowerCase();
    const hits = [];
    let i = -1;
    while ((i = low.indexOf('c2pa', i + 1)) !== -1 && hits.length < 4) hits.push(i);
    const hasJumbf = low.indexOf('jumb') !== -1;
    if (!out.found && hits.length && hasJumbf){ out.found = true; out.where.push('bytes @ ' + hex4(hits[0])); }
    if (out.found){
      out.where.forEach(w => emit('manifesto C2PA/JUMBF localizado — ' + w, 'ok'));
      if (low.includes('trainedalgorithmicmedia')){
        out.declaresAI = true;
        emit('manifesto declara digitalSourceType = trainedAlgorithmicMedia — conteúdo gerado algoritmicamente', 'warn');
      } else emit('manifesto presente — validação criptográfica completa requer SDK oficial ou endpoint /api', 'plain');
    } else {
      if (hits.length) emit('referências textuais a "c2pa" sem contêiner JUMBF — menção, não manifesto', 'warn');
      emit('nenhum manifesto C2PA encontrado (busca estrutural + varredura de bytes)', 'warn');
    }
    return out;
  }

  const SIGNATURES = [
    { s:'midjourney', label:'Midjourney', cat:'gen' },{ s:'dall-e', label:'DALL·E', cat:'gen' },
    { s:'dall·e', label:'DALL·E', cat:'gen' },{ s:'openai', label:'OpenAI', cat:'gen' },
    { s:'stable diffusion', label:'Stable Diffusion', cat:'gen' },{ s:'stable-diffusion', label:'Stable Diffusion', cat:'gen' },
    { s:'stablediffusion', label:'Stable Diffusion', cat:'gen' },{ s:'sdxl', label:'SDXL', cat:'gen' },
    { s:'automatic1111', label:'Automatic1111', cat:'gen' },{ s:'comfyui', label:'ComfyUI', cat:'gen' },
    { s:'invokeai', label:'InvokeAI', cat:'gen' },{ s:'invoke-ai', label:'InvokeAI', cat:'gen' },
    { s:'novelai', label:'NovelAI', cat:'gen' },{ s:'nai diffusion', label:'NovelAI', cat:'gen' },
    { s:'firefly', label:'Adobe Firefly', cat:'gen' },{ s:'imagen', label:'Google Imagen', cat:'gen' },
    { s:'ideogram', label:'Ideogram', cat:'gen' },{ s:'leonardo.ai', label:'Leonardo.ai', cat:'gen' },
    { s:'leonardo ai', label:'Leonardo.ai', cat:'gen' },{ s:'flux.1', label:'FLUX.1', cat:'gen' },
    { s:'black forest labs', label:'Black Forest Labs', cat:'gen' },{ s:'runwayml', label:'Runway', cat:'gen' },
    { s:'recraft', label:'Recraft', cat:'gen' },{ s:'craiyon', label:'Craiyon', cat:'gen' },
    { s:'stylegan', label:'StyleGAN', cat:'gen' },{ s:'progan', label:'ProGAN', cat:'gen' },
    { s:'biggan', label:'BigGAN', cat:'gen' },{ s:'artbreeder', label:'Artbreeder', cat:'gen' },
    { s:'deepfacelab', label:'DeepFaceLab', cat:'gen' },{ s:'faceswap', label:'FaceSwap', cat:'gen' },
    { s:'trainedalgorithmicmedia', label:'C2PA: trainedAlgorithmicMedia', cat:'gen' },
    { s:'photoshop', label:'Adobe Photoshop', cat:'edit' },{ s:'lightroom', label:'Adobe Lightroom', cat:'edit' },
    { s:'gimp', label:'GIMP', cat:'edit' },{ s:'canva.com', label:'Canva', cat:'edit' },
    { s:'inkscape', label:'Inkscape', cat:'edit' },{ s:'snapseed', label:'Snapseed', cat:'edit' },
    { s:'picsart', label:'Picsart', cat:'edit' },{ s:'affinity photo', label:'Affinity Photo', cat:'edit' },
    { s:'capture one', label:'Capture One', cat:'edit' },{ s:'darktable', label:'darktable', cat:'edit' }
  ];
  const GEN_KEYS  = ['parameters','prompt','workflow','sampler'];
  const INFO_KEYS = ['software','comment','description','title','author'];

  function inspectHeuristics(S, latin1, truncated, emit){
    const H = { hits: [], genParams: null };
    emit('varrendo ' + fmtBytes(Math.min(latin1.length, CONFIG.maxScanBytes)) + ' contra ' + SIGNATURES.length + ' assinaturas conhecidas', 'run');
    if (truncated) emit('arquivo acima do teto de varredura — apenas os primeiros 32 MB examinados', 'warn');
    const low = latin1.toLowerCase();
    for (const sig of SIGNATURES){
      const at = low.indexOf(sig.s);
      if (at !== -1) H.hits.push({ ...sig, at });
    }
    (S.texts || []).forEach(t => {
      const k = (t.keyword || '').toLowerCase();
      if (GEN_KEYS.includes(k) && t.value){
        H.genParams = H.genParams || t.keyword;
        emit('metadado de GERAÇÃO embutido — tEXt/iTXt "' + t.keyword + '":', 'err');
        emit('"' + snippet(t.value, 220) + '"', 'err');
      } else if (INFO_KEYS.includes(k) && t.value){
        emit('metadado textual "' + t.keyword + '": ' + snippet(t.value, 100), 'plain');
      }
    });
    const gens  = H.hits.filter(h => h.cat === 'gen');
    const edits = H.hits.filter(h => h.cat === 'edit');
    if (gens.length) gens.forEach(f => emit('assinatura de gerador de IA: ' + f.label + ' @ ' + hex4(f.at), 'err'));
    else emit('nenhuma assinatura de gerador de IA conhecido', 'ok');
    if (edits.length) edits.forEach(f => emit('software de edição no histórico: ' + f.label + ' @ ' + hex4(f.at), 'plain'));
    H.editHits = edits;
    return H;
  }

  function evaluate(R){
    const S = R.structure, E = R.exif, C = R.c2pa, H = R.heur, F = R.facts;
    const signals = [];
    const add = (dir, weight, label) => signals.push({ dir, weight, label });
    if (C.found && C.declaresAI) add('syn', 4, 'C2PA declara fonte algorítmica (trainedAlgorithmicMedia)');
    else if (C.found) add('info', 0, 'Estrutura C2PA encontrada — assinatura e cadeia de confiança não verificadas');
    else add('info', 0, 'Sem manifesto C2PA (comum hoje — não pontua)');
    if (H.genParams) add('syn', 4, 'Parâmetros de geração embutidos (tEXt "' + H.genParams + '")');
    const fams = [...new Set(H.hits.filter(h => h.cat === 'gen').map(h => h.label))];
    if (fams.length){
      add('syn', 3, 'Assinatura de gerador: ' + fams.join(', '));
      if (fams.length > 1) add('syn', 1, fams.length + ' assinaturas distintas no arquivo');
    }
    if (H.editHits && H.editHits.length)
      add('info', 0, 'Rastro de edição: ' + [...new Set(H.editHits.map(h => h.label))].join(', '));
    if (E.source === 'none') add('info', 0, 'EXIF ausente — comum em capturas e arquivos de redes sociais; não indica IA');
    else if (E.tags.Make || E.tags.Model)
      add('auth', 2, 'EXIF de dispositivo de captura: ' + [E.tags.Make, E.tags.Model].filter(Boolean).join(' '));
    if (S.trailing > 0) add('syn', 1, S.trailing + ' bytes anexados após o fim da imagem');
    if (F.extOk === false) add('syn', 2, 'Extensão não corresponde ao conteúdo real');
    if (S.desync || S.corrupt) add('syn', 1, 'Estrutura interna anômala/corrompida');
    if (E.malformed) add('syn', 1, 'EXIF malformado');
    if (R.elaGrid && R.elaGrid.hot >= 3 && R.elaGrid.ratio > 4)
      add('syn', 1, 'Hotspots de ELA localizados (' + R.elaGrid.hot + ' células quentes · máx/mediana ' + R.elaGrid.ratio.toFixed(1) + '×) — padrão compatível com composição regional');
    const score = signals.reduce((a, s) => a + (s.dir === 'syn' ? s.weight : s.dir === 'auth' ? -s.weight : 0), 0);
    let cls;
    if (C.found && C.declaresAI) cls = 'info';
    else if (score >= 3) cls = 'bad';
    else if (score >= 1) cls = 'warn';
    else cls = 'ok';
    const COPY = {
      bad:  { stamp:'INDÍCIOS DE SÍNTESE', line:'Múltiplos indícios de geração sintética foram localizados neste arquivo.' },
      info: { stamp:'SÍNTESE DECLARADA',  line:'O manifesto C2PA declara que a imagem foi gerada algoritmicamente — declaração encontrada sem validação criptográfica neste projeto.' },
      warn: { stamp:'INCONCLUSIVO',       line:'Indícios parciais. Não é possível afirmar nem descartar síntese com os dados disponíveis neste arquivo.' },
      ok:   { stamp:'SEM INDÍCIOS',       line:'Nenhuma assinatura de síntese localizada. Atenção: ausência de indícios não é prova de autenticidade.' }
    };
    return { cls, score, signals, copy: COPY[cls],
             provenance: C.found ? (C.declaresAI ? 'DECLARADA (IA)' : 'DECLARADA') : 'NÃO ENCONTRADA' };
  }

  async function runImage(dv, len, file, io, latin1, R){
    const emit = io.emit, onStage = io.onStage;
    onStage(0, 'run');
    R.structure = inspectStructure(dv, len, file, io.sniff, emit);
    R.facts.format = R.structure.format;
    R.facts.extOk = R.structure.extOk;
    onStage(0, R.structure.desync || R.structure.corrupt ? 'warn' : 'ok');
    onStage(1, 'run');
    R.exif = await inspectExif(dv, R.structure, file, emit);
    onStage(1, (R.exif.source === 'none' || R.exif.exifrDegraded) ? 'warn' : 'ok');
    onStage(2, 'run');
    R.c2pa = inspectC2pa(dv, R.structure, latin1.text, emit);
    onStage(2, R.c2pa.found ? 'ok' : 'warn');
    onStage(3, 'run');
    if (io.elaImg && io.elaGrid){
      try {
        R.elaGrid = await io.elaGrid(io.elaImg);
        const E = R.elaGrid;
        emit('ELA (grade 12×12 · recompressão Q85): mediana ' + E.med.toFixed(2) + ' · máx ' + E.max.toFixed(2) +
             ' · células quentes ' + E.hot + '/144 · CV ' + E.cv.toFixed(2), 'plain');
        if (E.hot >= 3 && E.ratio > 4)
          emit('hotspots de erro de recompressão localizados — padrão compatível com composição/blending regional', 'warn');
        else emit('distribuição de erro de recompressão homogênea', 'ok');
      } catch { /* ELA é opcional */ }
    }
    R.heur = inspectHeuristics(R.structure, latin1.text, latin1.truncated, emit);
    onStage(3, R.heur.hits.some(h => h.cat === 'gen') || (R.elaGrid && R.elaGrid.hot >= 3 && R.elaGrid.ratio > 4) ? 'alert' : 'ok');
    R.verdict = evaluate(R);
    return R;
  }

  /* ══════ ÁUDIO ══════ */
  function walkRiff(dv, len, S, A, emit){
    const FMT = { 1:'PCM', 3:'IEEE float', 6:'A-law', 7:'µ-law', 2:'ADPCM', 0x55:'MP3', 0xFFFE:'EXTENSIBLE' };
    let pos = 12;
    const ids = [];
    while (pos + 8 <= len){
      const id = ab2str(dv, pos, 4);
      let size = dv.getUint32(pos + 4, true);
      const d = pos + 8;
      if (d + size > len) size = len - d;
      ids.push(id + (size ? '' : '·0'));
      if (id === 'fmt ' && size >= 16){
        const fmt = dv.getUint16(d, true);
        S.channels = dv.getUint16(d + 2, true);
        S.sr = dv.getUint32(d + 4, true);
        S.bits = dv.getUint16(d + 14, true);
        S.byteRate = dv.getUint32(d + 8, true);
        S.codec = FMT[fmt] || ('formato ' + fmt);
        if (fmt === 0xFFFE && size >= 40) S.codec = 'EXTENSIBLE → ' + (FMT[dv.getUint16(d + 24, true)] || '?');
        emit('fmt : ' + S.codec + ' · ' + S.sr + ' Hz · ' + S.channels + ' canal(is) · ' + S.bits + ' bits', 'ok');
      }
      if (id === 'LIST' && size > 8 && ab2str(dv, d, 4) === 'INFO'){
        let p = d + 4;
        const KNOWN = { ISFT:'software', ICRD:'data', INAM:'título', IART:'artista', IENG:'engenheiro', ICMT:'comentário', ISRC:'fonte', IPRD:'produto' };
        while (p + 8 <= d + size){
          const sid = ab2str(dv, p, 4), ssz = dv.getUint32(p + 4, true);
          const val = ab2str(dv, p + 8, Math.min(ssz, 256)).replace(/\0+$/, '').trim();
          if (val) A.meta.push({ src:'RIFF/INFO', key: KNOWN[sid] || sid, value: val,
                                 tech:['ISFT','IENG','ICMT','ISRC'].includes(sid) });
          p += 8 + ssz + (ssz & 1);
        }
      }
      if (id === 'bext' && size > 64){
        const txt = ab2str(dv, d, Math.min(size, 2048));
        const cut = s => s.replace(/\0.*$/, '').trim();
        const desc = cut(txt.slice(0, 256)), orig = cut(txt.slice(256, 288));
        const hist = (txt.match(/A=\w[^\0]*/) || [''])[0];
        if (orig) A.meta.push({ src:'bext', key:'originator', value: orig, tech:true });
        if (desc) A.meta.push({ src:'bext', key:'descrição', value: desc, tech:false });
        if (hist) A.meta.push({ src:'bext', key:'histórico de codificação', value: hist, tech:true });
        emit('chunk bext (Broadcast WAV) — histórico de codificação presente', 'ok');
      }
      if (id === 'data'){ S.dataSize = size; }
      if (id === 'id3 ' || id === 'ID3 '){ emit('bloco ID3 embutido dentro do WAV', 'warn'); parseId3(dv, d + 4, Math.min(d + size, len), A, emit); }
      pos = d + size + (size & 1);
    }
    if (S.dataSize && S.byteRate) S.claimedDuration = S.dataSize / S.byteRate;
    emit('chunks: ' + ids.slice(0, 18).join(' · ') + (ids.length > 18 ? ' · …' : ''), 'plain');
    S.trailing = pos < len ? len - pos : 0;
    if (S.trailing > 8) emit(S.trailing + ' bytes após o último chunk — possível payload anexado', 'err');
    else emit('fim do contêiner alinhado — nenhum dados anexado', 'ok');
  }

  function decodeId3Bytes(u8, enc){
    try {
      let td;
      if (enc === 0) td = new TextDecoder('windows-1252');
      else if (enc === 1) td = (u8[0] === 0xFF && u8[1] === 0xFE) ? new TextDecoder('utf-16le') : new TextDecoder('utf-16be');
      else if (enc === 2) td = new TextDecoder('utf-16be');
      else td = new TextDecoder('utf-8');
      return td.decode(u8).replace(/\0+$/, '').trim();
    } catch { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s.replace(/\0+$/, '').trim(); }
  }
  function id3SplitNull(u8, start, enc){
    if (enc === 1 || enc === 2){
      for (let i = start; i + 1 < u8.length; i++)
        if (u8[i] === 0 && u8[i + 1] === 0) return [u8.subarray(start, i), i + 2];
    } else {
      for (let i = start; i < u8.length; i++)
        if (u8[i] === 0) return [u8.subarray(start, i), i + 1];
    }
    return [u8.subarray(start), u8.length];
  }
  function parseId3(dv, start, end, A, emit){
    if (start + 10 > end || ab2str(dv, start, 3) !== 'ID3') return start;
    const ver = dv.getUint8(start + 3);
    const flags = dv.getUint8(start + 5);
    const size = syncsafe(dv, start + 6);
    const tagEnd = Math.min(start + 10 + size, end);
    emit('ID3v2.' + ver + ' · ' + size + ' B', 'ok');
    if (ver < 3){ emit('versão legada (2.2) — quadros não expandidos', 'warn'); return tagEnd; }
    let pos = start + 10;
    if (flags & 0x40) pos += ver === 4 ? syncsafe(dv, start + 10) : (dv.getUint32(start + 10) + 4);
    const TECH = ['TSSE','TENC','TXXX','COMM','USLT'];
    const NAME = { TIT2:'título', TPE1:'artista', TPE2:'banda', TALB:'álbum', TYER:'ano', TDRC:'data',
                   TPUB:'gravadora', TCON:'gênero', TCOM:'compositor', TSSE:'encoder (software)',
                   TENC:'codificado por', TXXX:'campo custom', COMM:'comentário', USLT:'letra', WOAR:'site do artista' };
    while (pos + 10 <= tagEnd){
      const fid = ab2str(dv, pos, 4);
      if (fid.charCodeAt(0) === 0 || !/^[A-Z0-9]{4}$/.test(fid)) break;
      const fsz = ver === 4 ? syncsafe(dv, pos + 4) : dv.getUint32(pos + 4);
      if (fsz <= 0 || pos + 10 + fsz > tagEnd + 1) break;
      const fd = pos + 10;
      if (NAME[fid] && fd + fsz <= end){
        const u8 = new Uint8Array(dv.buffer, fd, fsz);
        const enc = u8[0];
        if (fid[0] === 'T'){
          const val = decodeId3Bytes(u8.subarray(1), enc);
          if (val) A.meta.push({ src:'ID3v2.' + ver, key: NAME[fid], value: val, tech: TECH.includes(fid) });
        } else if (fid === 'COMM' || fid === 'USLT'){
          const rest = id3SplitNull(u8, 4, enc);
          const val = decodeId3Bytes(rest[1], enc);
          if (val) A.meta.push({ src:'ID3v2.' + ver, key: NAME[fid], value: val, tech:true });
        }
      }
      pos += 10 + fsz;
    }
    return tagEnd;
  }

  function walkMp3(dv, len, A, emit, S){
    let id3End = parseId3(dv, 0, len, A, emit);
    if (id3End < 0) id3End = 0;
    const sync = findMpegSync(dv, len, id3End);
    if (sync < 0){ emit('nenhum quadro MPEG localizado — arquivo truncado ou anômalo', 'err'); S.desync = true; }
    else {
      const b1 = dv.getUint8(sync + 1), b2 = dv.getUint8(sync + 2), b3 = dv.getUint8(sync + 3);
      const verB = (b1 >> 3) & 3, layer = (b1 >> 1) & 3;
      const VER = { 3:'MPEG-1', 2:'MPEG-2', 0:'MPEG-2.5' };
      const brI = b2 >> 4, srI = (b2 >> 2) & 3, pad = (b2 >> 1) & 1;
      const BR_V1 = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
      const BR_V2 = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
      const SR = { 3:[44100,48000,32000], 2:[22050,24000,16000], 0:[11025,12000,8000] };
      const kbps = (verB === 3 ? BR_V1 : BR_V2)[brI];
      const sr = SR[verB][srI];
      const mode = ['estéreo','joint estéreo','dual','mono'][(b3 >> 6) & 3];
      const spf = verB === 3 ? 1152 : 576;
      S.codec = VER[verB] + ' Layer ' + (4 - layer);
      S.sr = sr;
      S.channels = mode === 'mono' ? 1 : 2;
      emit('quadro @ ' + hex4(sync) + ': ' + S.codec + ' · ' + kbps + ' kbps · ' + sr + ' Hz · ' + mode, 'ok');
      const win = ab2str(dv, sync, Math.min(260, len - sync));
      const iXing = win.indexOf('Xing') !== -1 ? win.indexOf('Xing') : win.indexOf('Info');
      if (iXing >= 0){
        const flags = dv.getUint32(sync + iXing + 4);
        let extra = 'VBR (tag Xing/Info)';
        if (flags & 1){
          const frames = dv.getUint32(sync + iXing + 8);
          S.claimedDuration = frames * spf / sr;
          extra += ' · ' + frames.toLocaleString('pt-BR') + ' quadros';
        }
        emit(extra, 'plain');
      } else S.claimedDuration = (len - id3End) * 8 / (kbps * 1000);
      const iLame = win.indexOf('LAME');
      if (iLame >= 0){
        let enc = '';
        for (let i = iLame; i < iLame + 9 && i < win.length; i++){
          const c = win.charCodeAt(i);
          if (c < 33 || c > 126) break;
          enc += win[i];
        }
        if (enc) A.meta.push({ src:'MPEG', key:'encoder', value: enc, tech:true });
      }
    }
    if (len > 128 && ab2str(dv, len - 128, 3) === 'TAG'){
      const t = (o, n) => ab2str(dv, len - 128 + o, n).replace(/\0+$/, '').trim();
      if (t(3, 30))  A.meta.push({ src:'ID3v1', key:'título',   value: t(3, 30),  tech:false });
      if (t(33, 30)) A.meta.push({ src:'ID3v1', key:'artista',  value: t(33, 30), tech:false });
      if (t(63, 30)) A.meta.push({ src:'ID3v1', key:'álbum',    value: t(63, 30), tech:false });
      if (t(93, 4))  A.meta.push({ src:'ID3v1', key:'ano',      value: t(93, 4),  tech:false });
      emit('rodapé ID3v1 presente (128 B)', 'plain');
    }
  }

  function walkFlac(dv, len, S, A, emit){
    let pos = 4;
    const TYPES = { 0:'STREAMINFO', 1:'PADDING', 2:'APPLICATION', 3:'SEEKTABLE', 4:'VORBIS_COMMENT', 5:'CUESHEET', 6:'PICTURE' };
    let guard = 0;
    while (pos + 4 <= len && guard++ < 64){
      const head = dv.getUint8(pos);
      const last = head & 0x80, type = head & 0x7F;
      const size = (dv.getUint8(pos + 1) << 16) | (dv.getUint8(pos + 2) << 8) | dv.getUint8(pos + 3);
      const d = pos + 4;
      if (d + size > len) break;
      if (type === 0 && size >= 18){
        const u = o => dv.getUint8(d + o);
        S.sr = (u(10) << 12) | (u(11) << 4) | (u(12) >> 4);
        S.channels = ((u(12) >> 1) & 7) + 1;
        S.bits = (((u(12) & 1) << 4) | (u(13) >> 4)) + 1;
        const total = ((u(13) & 0xF) * 4294967296) + (u(14) << 24) + (u(15) << 16) + (u(16) << 8) + u(17);
        S.codec = 'FLAC lossless';
        S.claimedDuration = total / S.sr;
        emit('STREAMINFO: ' + S.sr + ' Hz · ' + S.channels + ' canal(is) · ' + S.bits + ' bits · ' + fmtTime(S.claimedDuration), 'ok');
      }
      if (type === 4){
        let p = d;
        const vlen = dv.getUint32(p, true); p += 4;
        const vendor = bytesToStr(dv, p, Math.min(vlen, 256)); p += vlen;
        if (vendor) A.meta.push({ src:'FLAC', key:'vendor', value: vendor, tech:true });
        const count = Math.min(dv.getUint32(p, true), 64); p += 4;
        const TECHK = /^(ENCODER|ENCODER_SETTINGS|COMMENT|REPLAYGAIN_|SOURCE)/i;
        for (let i = 0; i < count && p + 4 <= d + size; i++){
          const cl = dv.getUint32(p, true); p += 4;
          const kv = bytesToStr(dv, p, Math.min(cl, 512)); p += cl;
          const eq = kv.indexOf('=');
          if (eq > 0) A.meta.push({ src:'FLAC', key: kv.slice(0, eq).toLowerCase(), value: kv.slice(eq + 1), tech: TECHK.test(kv.slice(0, eq)) });
        }
      }
      emit('bloco ' + (TYPES[type] || type) + ' · ' + size + ' B @ ' + hex4(pos), type === 6 ? 'warn' : 'plain');
      if (type === 6) emit('imagem de capa embutida (' + size + ' B)', 'warn');
      pos = d + size;
      if (last) break;
    }
    S.trailing = len - pos;
    if (S.trailing > 16) emit(S.trailing + ' bytes após o último bloco — dados anexados', 'err');
  }

  function parseVorbisCommentAt(dv, off, end, A, srcName){
    const TECHK = /^(ENCODER|COMMENT|REPLAYGAIN_|SOURCE)/i;
    if (off + 4 > end) return;
    const vlen = dv.getUint32(off, true);
    let p = off + 4;
    const vendor = bytesToStr(dv, p, Math.min(vlen, 256)); p += vlen;
    if (vendor) A.meta.push({ src: srcName, key:'vendor', value: vendor, tech:true });
    if (p + 4 > end) return;
    const count = Math.min(dv.getUint32(p, true), 64); p += 4;
    for (let i = 0; i < count && p + 4 <= end; i++){
      const cl = dv.getUint32(p, true); p += 4;
      const kv = bytesToStr(dv, p, Math.min(cl, 512)); p += cl;
      const eq = kv.indexOf('=');
      if (eq > 0) A.meta.push({ src: srcName, key: kv.slice(0, eq).toLowerCase(), value: kv.slice(eq + 1), tech: TECHK.test(kv.slice(0, eq)) });
    }
  }

  function walkOgg(dv, len, S, A, emit){
    let pos = 0, pages = 0, foundTags = false;
    while (pos + 27 <= len && ab2str(dv, pos, 4) === 'OggS' && pages < 24){
      const numSegs = dv.getUint8(pos + 26);
      let body = 0;
      for (let i = 0; i < numSegs; i++) body += dv.getUint8(pos + 27 + i);
      const bodyStart = pos + 27 + numSegs;
      if (bodyStart + body > len) break;
      if (pages < 8 && !foundTags){
        const s = ab2str(dv, bodyStart, Math.min(body, 16384));
        let i = s.indexOf('OpusHead');
        if (i >= 0 && pages < 2){
          const abs = bodyStart + i;
          S.codec = 'Opus v' + dv.getUint8(abs + 8);
          S.channels = dv.getUint8(abs + 9);
          emit('OpusHead: ' + S.channels + ' canal(is) · taxa de entrada ' + dv.getUint32(abs + 12, true) + ' Hz (decodificado a 48 kHz)', 'ok');
        }
        i = s.indexOf('OpusTags');
        if (i >= 0){
          foundTags = true;
          parseVorbisCommentAt(dv, bodyStart + i + 8, bodyStart + body, A, 'OpusTags');
          emit('OpusTags decodificado', 'ok');
        }
        if (!foundTags){
          const iv = s.indexOf('vorbis');
          if (iv > 0){
            const abs = bodyStart + iv;
            if (dv.getUint8(abs - 1) === 1 && pages < 2){
              S.codec = 'Vorbis';
              S.channels = dv.getUint8(abs + 11);
              emit('Vorbis: ' + S.channels + ' canal(is) · ' + dv.getUint32(abs + 12, true) + ' Hz', 'ok');
            }
            if (dv.getUint8(abs - 1) === 3){
              foundTags = true;
              parseVorbisCommentAt(dv, abs + 7, bodyStart + body, A, 'Vorbis');
              emit('comentários Vorbis decodificados', 'ok');
            }
          }
        }
      }
      pages++;
      pos = bodyStart + body;
    }
    S.pages = pages;
    emit(pages + ' páginas Ogg percorridas', 'plain');
    if (!foundTags) emit('cabeçalhos de comentários não localizados nas primeiras páginas', 'warn');
  }

  function inspectAudioStructure(dv, len, file, sniff, emit, A){
    const ext = extOf(file.name);
    const extOk = !ext || (sniff ? sniff.exts.includes(ext) : true);
    const S = { kind: sniff ? sniff.kind : 'unknown', format: sniff ? sniff.format : 'DESCONHECIDO',
                extOk, sr: null, channels: null, bits: null, codec: null,
                claimedDuration: null, trailing: 0, desync: false, corrupt: false };
    emit('assinatura de arquivo: ' + S.format + ' (' + (sniff ? sniff.magic : '—') + ')', 'ok');
    if (ext)
      emit(extOk ? 'extensão .' + ext + ' confere com o conteúdo real'
                 : 'extensão .' + ext + ' diverge do conteúdo real (' + S.format + ') — arquivo renomeado',
           extOk ? 'ok' : 'err');
    try {
      if (S.kind === 'wav')       walkRiff(dv, len, S, A, emit);
      else if (S.kind === 'mp3')  walkMp3(dv, len, A, emit, S);
      else if (S.kind === 'flac') walkFlac(dv, len, S, A, emit);
      else if (S.kind === 'ogg')  walkOgg(dv, len, S, A, emit);
      else if (S.kind === 'mp4'){
        const probe = (sniff && sniff.probe) || mp4Probe(dv, len);
        S.probe = probe;
        const auds = probe.tracks.filter(t => t.hdlr === 'soun');
        S.codec = auds.length ? auds.map(t => (t.formats || []).map(f => CODEC_LABEL[f] || f).join('+')).join(', ') : 'ISO-BMFF · áudio';
        if (probe.durationSec) S.claimedDuration = probe.durationSec;
        emit('brands: ' + probe.brands.join(' · '), 'plain');
        emit('pistas de áudio: ' + (auds.length || 0) + ' · codec: ' + S.codec, 'ok');
        if (probe.hasVideo) emit('ALERTA de roteamento: pista de VÍDEO detectada — este arquivo deveria seguir o pipeline de vídeo', 'warn');
        if (probe.creationDate) emit('criado (mvhd): ' + probe.creationDate.toISOString().slice(0, 19).replace('T', ' '), 'plain');
        probe.meta.forEach(m => A.meta.push(m));
        if (probe.trailing > 16) emit(probe.trailing + ' bytes após o último box — dados anexados', 'err');
      }
      else if (S.kind === 'mkv')  emit('contêiner EBML sem pista de vídeo — tratado como áudio', 'plain');
      else if (S.kind === 'amr')  emit('AMR (nota de voz Android comum) — decodificação não suportada; heurísticas de strings ativas', 'warn');
      else if (S.kind === 'aiff') emit('contêiner AIFF — decodificação dependente do navegador; heurísticas ativas', 'warn');
      else if (S.kind === 'asf')  emit('contêiner ASF — varredura estrutural limitada; heurísticas ativas', 'warn');
      else emit('contêiner não reconhecido — varredura de strings e metadados genéricos ativos', 'warn');
    } catch (e){
      S.desync = true;
      emit('exceção durante a varredura estrutural (' + e.message + ') — arquivo anômalo', 'err');
    }
    return S;
  }

  /* — FFT radix-2 (Cooley-Tukey, in-place) — */
  function fft(re, im){
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++){
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j){
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1){
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len){
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++){
          const a = i + k, b = a + half;
          const vr = re[b] * cr - im[b] * ci;
          const vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr;        im[a] += vi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  async function analyzeAcoustics(arrayBuffer, emit, io, R){
    const AC = R.acoustics = { ok: false };
    emit('decodificando PCM via Web Audio API…', 'run');
    let buf;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      buf = await new Promise((res, rej) => {
        const maybe = ctx.decodeAudioData(arrayBuffer.slice(0), res, rej);
        if (maybe && typeof maybe.then === 'function') maybe.then(res, rej);
      });
      if (ctx.close) ctx.close();
    } catch (e){
      emit('decodificação falhou (' + (e && e.message ? e.message : 'codec/trilha não suportado') + ') — análise acústica indisponível', 'warn');
      return AC;
    }
    const sr = buf.sampleRate, ch = buf.numberOfChannels, N = buf.length;
    AC.sr = sr; AC.channels = ch; AC.duration = buf.duration;
    emit(sr + ' Hz · ' + ch + ' canal(is) · ' + fmtTime(buf.duration) + ' · ' +
         N.toLocaleString('pt-BR') + ' amostras decodificadas', 'ok');
    if (buf.duration < 0.4){ emit('duração insuficiente para estatísticas acústicas confiáveis', 'warn'); return AC; }

    const mono = new Float32Array(N);
    for (let c = 0; c < ch; c++){
      const d = buf.getChannelData(c);
      for (let i = 0; i < N; i++) mono[i] += d[i] / ch;
    }
    if (ch >= 2){
      const a = buf.getChannelData(0), b = buf.getChannelData(1);
      const step = Math.max(1, Math.floor(N / 200000));
      let sa = 0, sb = 0, sab = 0, n = 0;
      for (let i = 0; i < N; i += step){ sa += a[i]*a[i]; sb += b[i]*b[i]; sab += a[i]*b[i]; n++; }
      const denom = Math.sqrt(sa * sb);
      AC.stereoR = denom > 0 ? sab / denom : 1;
      emit('correlação entre canais: ' + AC.stereoR.toFixed(4) +
           (Math.abs(AC.stereoR) > 0.999 ? ' — canais idênticos (mono duplicado)' : ' — canais independentes'), 'plain');
    }
    let clip = 0, dc = 0;
    for (let i = 0; i < N; i++){ dc += mono[i]; if (mono[i] > 0.9995 || mono[i] < -0.9995) clip++; }
    AC.clipping = clip / N;
    AC.dc = Math.abs(dc / N);
    emit('clipping: ' + (AC.clipping * 100).toFixed(4) + '% · offset DC: ' + AC.dc.toFixed(6), 'plain');

    const maxSamples = Math.min(N, Math.floor(CONFIG.acousticsMaxSec * sr));
    AC.capped = N > maxSamples;
    if (AC.capped) emit('análise acústica limitada aos primeiros ' + CONFIG.acousticsMaxSec + ' s (desempenho)', 'warn');

    const F = 1024, H = 512, BINS = 512;
    const binHz = sr / F;
    const totalFrames = Math.max(1, Math.floor((maxSamples - F) / H));
    const stride = Math.max(1, Math.ceil(totalFrames / 3600));
    const frames = Math.floor((totalFrames - 1) / stride) + 1;
    const hann = new Float32Array(F);
    for (let i = 0; i < F; i++) hann[i] = .5 - .5 * Math.cos(2 * Math.PI * i / F);
    const re = new Float32Array(F), im = new Float32Array(F);
    const meanSpec = new Float64Array(BINS);
    const specCols = Math.min(900, frames), specRows = 256;
    const specAcc = new Float64Array(specCols * specRows), specCnt = new Uint32Array(specCols);
    const rmsDbArr = [];
    let flatSum = 0, centSum = 0, hfE = 0, totE = 0;

    const bar = io.progressBar && io.progressBar('STFT 1024/512 · ' + frames + ' quadros · Hann');
    emit('analisando ' + frames + ' quadros FFT sobre o sinal mono', 'run');
    const tDsp = performance.now();
    for (let k = 0; k < frames; k++){
      const pos = k * stride * H;
      if (pos + F > N) break;
      let rms = 0;
      for (let i = 0; i < F; i++){
        const raw = mono[pos + i];
        rms += raw * raw;
        re[i] = raw * hann[i]; im[i] = 0;
      }
      fft(re, im);
      let magSum = 0, weighted = 0, lnSum = 0, pSum = 0;
      const col = Math.floor(k * specCols / frames);
      for (let b = 1; b < BINS; b++){
        const p = re[b] * re[b] + im[b] * im[b];
        const mag = Math.sqrt(p);
        re[b] = mag;
        const fHz = b * binHz;
        if (fHz >= 5000) hfE += p;
        totE += p; pSum += p; lnSum += Math.log(p + 1e-12);
        magSum += mag; weighted += b * mag; meanSpec[b] += mag;
        specAcc[(b >> 1) * specCols + col] += p;
      }
      specCnt[col]++;
      const mag0 = magSum || 1;
      flatSum += Math.exp(lnSum / (BINS - 1)) / (pSum / (BINS - 1) + 1e-12);
      centSum += (weighted / mag0) * binHz;
      rmsDbArr.push(20 * Math.log10(Math.sqrt(rms / F) + 1e-9));
      if ((k & 127) === 0){ bar && bar.update(k, frames); await sleep(0); }
    }
    bar && bar.end();
    emit('varredura espectral concluída em ' + Math.round(performance.now() - tDsp) + ' ms', 'ok');

    const sorted = [...rmsDbArr].sort((a, b) => a - b);
    const p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    AC.noiseFloorDb = p(0.10);
    AC.silenceRatio = rmsDbArr.filter(v => v < -55).length / rmsDbArr.length;
    const quiet = rmsDbArr.filter(v => v < -45);
    if (quiet.length >= 8){
      const qm = quiet.reduce((a, v) => a + v, 0) / quiet.length;
      AC.floorStd = Math.sqrt(quiet.reduce((a, v) => a + (v - qm) * (v - qm), 0) / quiet.length);
    } else AC.floorStd = null;
    emit('piso de ruído: ' + AC.noiseFloorDb.toFixed(1) + ' dB (percentil 10)' +
         (AC.floorStd !== null ? ' · variação ±' + AC.floorStd.toFixed(2) + ' dB em ' + quiet.length + ' quadros quietos' : ''), 'plain');
    emit('quadros em silêncio (< −55 dB): ' + (AC.silenceRatio * 100).toFixed(1) + '%', 'plain');
    if (AC.noiseFloorDb < -65)
      emit('silêncio "estéril": piso ultra-limpo' +
           (AC.floorStd !== null && AC.floorStd < 0.5 ? ' e constante — típico de síntese ou estúdio tratado' : ''), 'warn');
    else if (AC.noiseFloorDb > -60 && AC.floorStd !== null && AC.floorStd > 0.8)
      emit('room tone natural presente e flutuante — compatível com captação real', 'ok');

    const meanDb = new Float64Array(BINS);
    let peak = -Infinity;
    for (let b = 1; b < BINS; b++){
      meanDb[b] = 20 * Math.log10(meanSpec[b] / frames + 1e-12);
      if (meanDb[b] > peak) peak = meanDb[b];
    }
    let cutBin = BINS - 1;
    for (let b = BINS - 1; b >= 1; b--) if (meanDb[b] > peak - 40){ cutBin = b; break; }
    AC.bandwidthHz = Math.round(cutBin * binHz);
    const SHELVES = [5500, 8000, 11025, 12000];
    AC.shelfHz = null;
    if (AC.bandwidthHz < sr / 2 - 800)
      for (const c of SHELVES) if (Math.abs(AC.bandwidthHz - c) < 350) AC.shelfHz = c;
    emit('banda efetiva: ' + AC.bandwidthHz + ' Hz (corte a −40 dB do pico) · energia > 5 kHz: ' +
         (totE > 0 ? (hfE / totE * 100).toFixed(1) : '0') + '%', 'plain');
    if (AC.shelfHz)
      emit('banda efetiva ≈ ' + (AC.shelfHz / 1000).toFixed(1) + ' kHz em conteúdo decodificado a ' + (sr / 1000).toFixed(1) +
           ' kHz — corte de banda compatível com codec/filtragem; não identifica IA', 'warn');
    else if (AC.bandwidthHz > 15000)
      emit('espectro pleno até ' + (AC.bandwidthHz / 1000).toFixed(1) + ' kHz — sem corte suspeito', 'ok');
    AC.flatness = flatSum / frames;
    AC.centroid = centSum / frames;
    emit('planura espectral média: ' + AC.flatness.toFixed(4) + ' · centróide: ' + Math.round(AC.centroid) + ' Hz (informativo)', 'plain');

    const ds = Math.max(1, Math.round(sr / 8000)), f0sr = sr / ds;
    const sigLen = Math.floor(Math.min(N, maxSamples) / ds);
    const sig = new Float32Array(sigLen);
    for (let i = 0; i < sigLen; i++) sig[i] = mono[i * ds];
    const FW = 400, FH = 200;
    const lagLo = Math.max(2, Math.round(f0sr / 400)), lagHi = Math.min(FW - 2, Math.round(f0sr / 65));
    const totalF = Math.max(1, Math.floor((sigLen - FW) / FH));
    const fStride = Math.max(1, Math.ceil(totalF / 1200));
    const f0s = [];
    for (let f = 0; f < totalF; f += fStride){
      const pos = f * FH;
      if (pos + FW > sigLen) break;
      let e0 = 0;
      for (let i = 0; i < FW; i++) e0 += sig[pos + i] * sig[pos + i];
      if (e0 < 1e-7) continue;
      let best = 0, bestLag = 0;
      for (let lag = lagLo; lag <= lagHi; lag++){
        let s = 0;
        for (let i = 0; i < FW - lag; i++) s += sig[pos + i] * sig[pos + i + lag];
        const n = s / e0;
        if (n > best){ best = n; bestLag = lag; }
      }
      if (best > 0.5 && bestLag) f0s.push(f0sr / bestLag);
    }
    if (f0s.length >= 20){
      f0s.sort((a, b) => a - b);
      const med = f0s[f0s.length >> 1];
      const m = f0s.reduce((a, v) => a + v, 0) / f0s.length;
      const sd = Math.sqrt(f0s.reduce((a, v) => a + (v - m) * (v - m), 0) / f0s.length);
      AC.f0 = { median: med, mean: m, sd, cv: sd / m, min: f0s[0], max: f0s[f0s.length - 1] };
      emit('F0 mediano: ' + med.toFixed(0) + ' Hz · CV ' + AC.f0.cv.toFixed(3), 'plain');
      if (AC.f0.cv < 0.06)
        emit('prosódia pouco variável (sinal inespecífico) (CV de F0 = ' + AC.f0.cv.toFixed(3) + ') — traço comum de TTS', 'warn');
    } else AC.f0 = null;
    if (AC.f0 === null) emit('voz vozeada insuficiente para estatísticas de F0', 'plain');

    let dbMin = Infinity, dbMax = -Infinity;
    const specDb = new Float32Array(specCols * specRows);
    for (let c = 0; c < specCols; c++){
      const n = specCnt[c] || 1;
      for (let r = 0; r < specRows; r++){
        const db = 10 * Math.log10(specAcc[r * specCols + c] / n + 1e-12);
        specDb[r * specCols + c] = db;
        if (db < dbMin) dbMin = db;
        if (db > dbMax) dbMax = db;
      }
    }
    const lo = Math.max(dbMin, dbMax - 70);
    const spec = new Float32Array(specDb.length);
    for (let i = 0; i < specDb.length; i++)
      spec[i] = Math.max(0, Math.min(1, (specDb[i] - lo) / (dbMax - lo || 1)));
    const peaks = new Float32Array(specCols * 2);
    let maxAbs = 0.0001;
    const buck = maxSamples / specCols;
    for (let c = 0; c < specCols; c++){
      let mn = 1, mx = -1;
      const s0 = Math.floor(c * buck), s1 = Math.min(maxSamples, Math.floor((c + 1) * buck));
      for (let i = s0; i < s1; i++){ if (mono[i] < mn) mn = mono[i]; if (mono[i] > mx) mx = mono[i]; }
      peaks[c * 2] = mn; peaks[c * 2 + 1] = mx;
      if (-mn > maxAbs) maxAbs = -mn;
      if (mx > maxAbs) maxAbs = mx;
    }
    Object.assign(AC, { ok: true, spec, specCols, specRows, peaks, peakNorm: maxAbs });
    return AC;
  }

  function audioWindow(text){
    const W = CONFIG.audioWinBytes;
    if (text.length <= W * 2) return { text, headLen: text.length, split: false };
    return { text: text.slice(0, W) + '\n' + text.slice(-W), headLen: W, split: true };
  }

  function scanC2paWindow(win, emit, boxFound){
    const out = { found: false, where: [], declaresAI: false };
    const low = win.text.toLowerCase();
    const hits = [];
    let i = -1;
    while ((i = low.indexOf('c2pa', i + 1)) !== -1 && hits.length < 4) hits.push(i);
    const hasJumbf = low.indexOf('jumb') !== -1;
    if (boxFound){ out.found = true; out.where.push('box uuid/c2pa (estrutural)'); }
    if (!out.found && hits.length && hasJumbf){
      out.found = true;
      hits.forEach(h => out.where.push('bytes @ ' + (h < win.headLen ? 'cabeçalho ' : 'rodapé ') + hex4(h)));
    }
    if (out.found){
      out.where.forEach(w => emit('manifesto C2PA/JUMBF localizado — ' + w, 'ok'));
      if (low.includes('trainedalgorithmicmedia')){
        out.declaresAI = true;
        emit('manifesto declara digitalSourceType = trainedAlgorithmicMedia — conteúdo algorítmico', 'warn');
      }
    } else {
      if (hits.length) emit('referências textuais a "c2pa" sem contêiner JUMBF — menção, não manifesto', 'warn');
      else emit('nenhum manifesto C2PA encontrado (varredura de cabeçalho/rodapé)', 'warn');
    }
    return out;
  }

  function scanTieredSignatures(sigs, metaList, win, emit){
    const SG = { tech: [], descStrong: [], descWeak: [], raw: [], edit: [], auth: [] };
    const techText = metaList.filter(m => m.tech).map(m => m.key + ': ' + m.value).join('\n').toLowerCase();
    const descText = metaList.filter(m => !m.tech).map(m => m.key + ': ' + m.value).join('\n').toLowerCase();
    const lowWin = win.text.toLowerCase();
    for (const sig of sigs){
      if (sig.cat){
        if (techText.includes(sig.s) || lowWin.includes(sig.s)) SG[sig.cat].push(sig.label);
        continue;
      }
      const rx = new RegExp('\\b' + reEsc(sig.s) + '\\b', 'i');
      if (sig.where === 'meta'){
        if (rx.test(techText)) SG.tech.push(sig.label);
        else if (rx.test(descText)) (sig.tier ? SG.descStrong : SG.descWeak).push(sig.label);
      } else {
        const m = lowWin.match(rx);
        if (m) SG.raw.push(sig.label + ' (' + (m.index < win.headLen ? 'cabeçalho' : 'rodapé') + ')');
      }
    }
    return SG;
  }

  const AUDIO_SIGS = [
    { s:'elevenlabs', label:'ElevenLabs', where:'raw', tier:1 },{ s:'eleven-labs', label:'ElevenLabs', where:'raw', tier:1 },
    { s:'suno', label:'Suno', where:'meta', tier:1 },{ s:'udio', label:'Udio', where:'meta', tier:1 },
    { s:'openai', label:'OpenAI (TTS)', where:'meta', tier:0 },{ s:'tts-1', label:'OpenAI TTS (tts-1)', where:'meta', tier:1 },
    { s:'bark', label:'Suno Bark', where:'meta', tier:0 },{ s:'tortoise-tts', label:'Tortoise TTS', where:'raw', tier:1 },
    { s:'xtts', label:'Coqui XTTS', where:'meta', tier:1 },{ s:'xtts-v2', label:'Coqui XTTS v2', where:'raw', tier:1 },
    { s:'coqui', label:'Coqui', where:'meta', tier:0 },{ s:'vits', label:'VITS', where:'meta', tier:0 },
    { s:'so-vits-svc', label:'so-vits-svc (conversão de voz)', where:'raw', tier:1 },{ s:'sovits', label:'So-VITS (conversão de voz)', where:'meta', tier:1 },
    { s:'rvc', label:'RVC (conversão de voz)', where:'meta', tier:0 },{ s:'descript', label:'Descript', where:'meta', tier:0 },
    { s:'overdub', label:'Descript Overdub', where:'meta', tier:1 },{ s:'resemble.ai', label:'Resemble.ai', where:'raw', tier:1 },
    { s:'play.ht', label:'Play.ht', where:'meta', tier:1 },{ s:'playht', label:'Play.ht', where:'meta', tier:1 },
    { s:'cartesia', label:'Cartesia', where:'raw', tier:1 },{ s:'respeecher', label:'Respeecher', where:'raw', tier:1 },
    { s:'sonantic', label:'Sonantic', where:'raw', tier:1 },{ s:'speechify', label:'Speechify', where:'raw', tier:1 },
    { s:'murf.ai', label:'Murf.ai', where:'meta', tier:1 },{ s:'wellsaid', label:'WellSaid', where:'raw', tier:1 },
    { s:'voice.ai', label:'Voice.ai', where:'meta', tier:1 },{ s:'kits.ai', label:'Kits.ai', where:'meta', tier:1 },
    { s:'audiocraft', label:'AudioCraft/MusicGen (Meta)', where:'raw', tier:1 },{ s:'musicgen', label:'MusicGen (Meta)', where:'raw', tier:1 },
    { s:'stable audio', label:'Stable Audio', where:'raw', tier:1 },{ s:'riffusion', label:'Riffusion', where:'raw', tier:1 },
    { s:'soundraw', label:'Soundraw', where:'raw', tier:1 },{ s:'mubert', label:'Mubert', where:'raw', tier:1 },
    { s:'boomy', label:'Boomy', where:'meta', tier:0 },{ s:'aiva', label:'AIVA', where:'meta', tier:0 },
    { s:'lyria', label:'Google Lyria', where:'meta', tier:0 },{ s:'beatoven', label:'Beatoven', where:'meta', tier:1 },
    { s:'sonauto', label:'Sonauto', where:'meta', tier:1 },
    { s:'lame', label:'LAME (encoder MP3)', cat:'edit' },{ s:'lavf', label:'FFmpeg (Lavf)', cat:'edit' },
    { s:'ffmpeg', label:'FFmpeg', cat:'edit' },{ s:'libopus', label:'libopus', cat:'edit' },
    { s:'libvorbis', label:'libvorbis', cat:'edit' },{ s:'audacity', label:'Audacity', cat:'edit' },
    { s:'adobe audition', label:'Adobe Audition', cat:'edit' },{ s:'pro tools', label:'Pro Tools', cat:'edit' },
    { s:'logic pro', label:'Logic Pro', cat:'edit' },{ s:'garageband', label:'GarageBand', cat:'edit' },
    { s:'cubase', label:'Cubase', cat:'edit' },{ s:'reaper', label:'REAPER', cat:'edit' },
    { s:'voice memos', label:'Gravado no app Notas de Voz (iOS)', cat:'auth' },
    { s:'voicememos', label:'Gravado no app Notas de Voz (iOS)', cat:'auth' }
  ];

  function scanAudioSignatures(A, win, emit){
    emit('varrendo ' + A.meta.length + ' campos de metadados e ' +
         fmtBytes(Math.min(win.text.length, CONFIG.audioWinBytes * 2)) + ' de bytes contra ' +
         AUDIO_SIGS.length + ' assinaturas de TTS/música-IA', 'run');
    if (win.split) emit('varredura de strings limitada a cabeçalho + rodapé (1 MB cada) — onde metadados residem', 'plain');
    const SG = scanTieredSignatures(AUDIO_SIGS, A.meta, win, emit);
    SG.tech.forEach(l => emit('assinatura em campo TÉCNICO (encoder/vendor): ' + l, 'err'));
    SG.descStrong.forEach(l => emit('assinatura em campo descritivo: ' + l, 'err'));
    SG.descWeak.forEach(l => emit('menção ambígua em campo descritivo: ' + l, 'warn'));
    SG.raw.forEach(l => emit('assinatura de gerador nos bytes do arquivo: ' + l, 'err'));
    if (!SG.tech.length && !SG.descStrong.length && !SG.descWeak.length && !SG.raw.length)
      emit('nenhuma assinatura de gerador de áudio conhecida', 'ok');
    [...new Set(SG.edit)].forEach(l => emit('software na cadeia de edição: ' + l, 'plain'));
    [...new Set(SG.auth)].forEach(l => emit('cadeia de gravação identificada: ' + l, 'ok'));
    return SG;
  }

  function scoreTieredSigs(SG, add){
    SG.tech.forEach(l => add('syn', 4, 'Assinatura de gerador em campo técnico: ' + l));
    SG.descStrong.forEach(l => add('syn', 3, 'Assinatura de gerador em campo descritivo: ' + l));
    SG.descWeak.forEach(l => add('syn', 2, 'Menção a gerador em campo descritivo: ' + l));
    SG.raw.forEach(l => add('syn', 3, 'Assinatura de gerador nos bytes: ' + l));
    [...new Set(SG.edit)].forEach(l => add('info', 0, 'Rastro de edição: ' + l));
    [...new Set(SG.auth)].forEach(l => add('auth', 1, l));
  }

  function evaluateAudio(R){
    const AC = R.acoustics, SG = R.audioSigs, C = R.c2pa;
    const signals = [];
    const add = (dir, weight, label) => signals.push({ dir, weight, label });
    scoreTieredSigs(SG, add);
    if (C.found && C.declaresAI) add('syn', 4, 'C2PA declara fonte algorítmica (trainedAlgorithmicMedia)');
    else if (C.found) add('info', 0, 'Estrutura C2PA encontrada — assinatura e cadeia de confiança não verificadas');
    else add('info', 0, 'Sem manifesto C2PA (comum — não pontua)');
    if (AC && AC.ok){
      if (AC.shelfHz) add('info', 0, 'Banda efetiva ≈ ' + (AC.shelfHz / 1000).toFixed(1) + ' kHz — corte de banda compatível com codec/filtragem; não identifica IA');
      if (AC.noiseFloorDb < -65) add('info', 0, 'Piso de ruído baixo (pode decorrer de redução de ruído) (' + AC.noiseFloorDb.toFixed(0) + ' dB) — silêncio "estéril"');
      if (AC.f0 && AC.f0.cv < 0.06) add('info', 0, 'Prosódia pouco variável (sinal inespecífico) (CV de F0 = ' + AC.f0.cv.toFixed(3) + ')');
      if (AC.noiseFloorDb > -60 && AC.floorStd !== null && AC.floorStd > 0.8)
        add('auth', 1, 'Room tone natural: piso de ruído presente e flutuante');
      if (AC.clipping > 0.00005) add('info', 0, 'Clipping presente (' + (AC.clipping * 100).toFixed(3) + '%) — evidência fraca de captação real');
      if (AC.stereoR !== null && Math.abs(AC.stereoR) > 0.999)
        add('info', 0, 'Canais L/R idênticos — mono duplicado em contêiner estéreo');
    } else add('info', 0, 'Análise acústica indisponível (decodificação falhou no navegador)');
    const score = signals.reduce((a, s) => a + (s.dir === 'syn' ? s.weight : s.dir === 'auth' ? -s.weight : 0), 0);
    let cls;
    if (C.found && C.declaresAI) cls = 'info';
    else if (score >= 3) cls = 'bad';
    else if (score >= 1) cls = 'warn';
    else cls = 'ok';
    const COPY = {
      bad:  { stamp:'INDÍCIOS DE SÍNTESE', line:'Múltiplos indícios de síntese de áudio (voz clonada ou música gerada) foram localizados neste arquivo.' },
      info: { stamp:'SÍNTESE DECLARADA', line:'Assinatura no arquivo declara que o conteúdo foi gerado algoritmicamente — declaração encontrada sem validação criptográfica neste projeto.' },
      warn: { stamp:'INCONCLUSIVO', line:'Indícios parciais. Não é possível afirmar nem descartar síntese com os dados disponíveis neste arquivo.' },
      ok:   { stamp:'SEM INDÍCIOS', line:'Nenhuma assinatura de síntese localizada. Atenção: em áudio, a ausência de indícios está longe de provar autenticidade.' }
    };
    return { cls, score, signals, copy: COPY[cls],
             provenance: C.found ? (C.declaresAI ? 'DECLARADA (IA)' : 'DECLARADA') : 'NÃO ENCONTRADA' };
  }

  async function runAudio(dv, len, file, io, latin1, R){
    const emit = io.emit, onStage = io.onStage;
    const A = R.audioMeta = { meta: [] };
    onStage(0, 'run');
    R.structure = inspectAudioStructure(dv, len, file, io.sniff, emit, A);
    R.facts.format = R.structure.format;
    R.facts.extOk = R.structure.extOk;
    onStage(0, R.structure.desync || R.structure.corrupt ? 'warn' : 'ok');
    onStage(1, 'run');
    io.section && io.section('METADADOS & ENCODER');
    if (A.meta.length)
      A.meta.forEach(m => emit(m.src + ' · ' + m.key + ': "' + snippet(m.value, 110) + '"', m.tech ? 'ok' : 'plain'));
    else emit('nenhum metadado embutido encontrado no contêiner', 'warn');
    const win = audioWindow(latin1.text);
    R.c2pa = scanC2paWindow(win, emit, R.structure.probe && R.structure.probe.c2paBox);
    onStage(1, R.c2pa.found ? 'ok' : (A.meta.length ? 'ok' : 'warn'));
    onStage(2, 'run');
    io.section && io.section('ANÁLISE ACÚSTICA');
    try { await analyzeAcoustics(io.arrayBuffer, emit, io, R); }
    catch (e){ R.acoustics = { ok:false }; emit('exceção na análise acústica (' + e.message + ')', 'err'); }
    const AC = R.acoustics;
    onStage(2, !AC.ok ? 'nodata' : (AC.shelfHz || AC.noiseFloorDb < -65 ? 'warn' : 'ok'));
    onStage(3, 'run');
    io.section && io.section('ASSINATURAS DE IA');
    R.audioSigs = scanAudioSignatures(A, win, emit);
    const hasGen = R.audioSigs.tech.length || R.audioSigs.descStrong.length || R.audioSigs.descWeak.length || R.audioSigs.raw.length;
    onStage(3, hasGen ? 'alert' : 'ok');
    R.verdict = evaluateAudio(R);
    return R;
  }

  /* ══════ VÍDEO ══════ */
  function aviWalk(dv, len, S, emit){
    const riffSize = dv.getUint32(4, true);
    S.trailing = Math.max(0, len - (8 + Math.min(riffSize, len - 8)));
    const tracks = [];
    let pos = 12, reachedMovi = false;
    while (pos + 8 <= len && !reachedMovi){
      const id = ab2str(dv, pos, 4);
      let sz = dv.getUint32(pos + 4, true);
      const d = pos + 8;
      if (d + sz > len) sz = len - d;
      if (id === 'LIST'){
        const lt = ab2str(dv, d, 4);
        if (lt === 'hdrl' || lt === 'strl'){
          let p = d + 4;
          while (p + 8 <= d + sz){
            const cid = ab2str(dv, p, 4);
            let csz = dv.getUint32(p + 4, true);
            const cd = p + 8;
            if (cd + csz > d + sz) csz = d + sz - cd;
            if (lt === 'hdrl' && cid === 'avih' && csz >= 40){
              const usf = dv.getUint32(cd, true);
              if (usf > 0) S.fps = 1e6 / usf;
              S.totalFrames = dv.getUint32(cd + 16, true);
              S.dims = { w: dv.getUint32(cd + 32, true), h: dv.getUint32(cd + 36, true) };
            }
            if (lt === 'strl' && cid === 'strh' && csz >= 28){
              const scale = dv.getUint32(cd + 20, true), rate = dv.getUint32(cd + 24, true);
              tracks.push({ fccType: ab2str(dv, cd, 4), fccHandler: ab2str(dv, cd + 4, 4).trim(),
                            rate: scale ? rate / scale : null });
            }
            if (lt === 'strl' && cid === 'strf' && tracks.length){
              const t = tracks[tracks.length - 1];
              if (t.fccType === 'vids' && csz >= 16) t.bitCount = dv.getUint16(cd + 14, true);
              else if (t.fccType === 'auds' && csz >= 8){
                t.channels = dv.getUint16(cd + 2, true);
                t.sr = dv.getUint32(cd + 4, true);
              }
            }
            if (csz < 0) break;
            p += 8 + csz + (csz & 1);
          }
        } else if (lt === 'movi') reachedMovi = true;
      }
      pos = d + sz + (sz & 1);
    }
    S.tracks = tracks;
    const vids = tracks.find(t => t.fccType === 'vids');
    const auds = tracks.find(t => t.fccType === 'auds');
    if (S.dims) emit('avih: ' + S.dims.w + '×' + S.dims.h + ' px · ' + S.totalFrames + ' quadros' + (S.fps ? ' · ~' + S.fps.toFixed(2) + ' fps' : ''), 'ok');
    if (vids) emit('pista de vídeo: handler "' + vids.fccHandler + '"' + (vids.bitCount ? ' · ' + vids.bitCount + ' bits/px' : ''), 'ok');
    if (auds) emit('pista de áudio: ' + (auds.channels || '?') + ' canal(is) · ' + (auds.sr || '?') + ' Hz', 'ok');
    emit('LIST/movi localizado — cabeçalhos íntegros', 'ok');
    if (S.trailing > 16) emit(S.trailing + ' bytes fora do RIFF declarado — dados anexados', 'err');
  }

  function mkvScan(win, sniff, S, emit){
    emit('EBML DoType: ' + (sniff.doctype || 'desconhecido'), 'ok');
    const VC = { 'V_MPEG4/ISO/AVC':'H.264/AVC', 'V_MPEGH/ISO/HEVC':'H.265/HEVC', 'V_VP8':'VP8',
                 'V_VP9':'VP9', 'V_AV1':'AV1', 'V_MPEG4/ISO/AP':'MPEG-4', 'V_THEORA':'Theora' };
    const AC = { 'A_AAC':'AAC', 'A_MPEG/L3':'MP3', 'A_VORBIS':'Vorbis', 'A_OPUS':'Opus',
                 'A_AC3':'AC-3', 'A_EAC3':'E-AC-3', 'A_DTS':'DTS', 'A_FLAC':'FLAC', 'A_PCM/INT/LIT':'PCM' };
    const v = [...new Set([...win.text.matchAll(/V_[A-Z0-9\/]+/g)].map(m => m[0]).filter(v => VC[v]).map(v => VC[v]))];
    const a = [...new Set([...win.text.matchAll(/A_[A-Z0-9\/]+/g)].map(m => m[0]).filter(a => AC[a]).map(a => AC[a]))];
    S.vCodecs = v; S.aCodecs = a;
    emit('pistas de vídeo (por codec id): ' + (v.join(' · ') || 'não localizadas na janela'), v.length ? 'ok' : 'warn');
    emit('pistas de áudio (por codec id): ' + (a.join(' · ') || 'não localizadas na janela'), a.length ? 'ok' : 'warn');
  }

  function flvScan(dv, len, S, emit){
    const flags = dv.getUint8(5);
    S.hasAudioFlag = !!(flags & 0x4);
    S.hasVideoFlag = !!(flags & 0x1);
    emit('FLV v' + dv.getUint8(4) + ' · pista de áudio: ' + (S.hasAudioFlag ? 'sim' : 'não') +
         ' · pista de vídeo: ' + (S.hasVideoFlag ? 'sim' : 'não'), 'ok');
  }

  function inspectVideoStructure(dv, len, file, sniff, emit, win){
    const ext = extOf(file.name);
    const extOk = !ext || (sniff ? sniff.exts.includes(ext) : true);
    const S = { kind: sniff ? sniff.kind : 'unknown', format: sniff ? sniff.format : 'DESCONHECIDO',
                extOk, dims: null, duration: null, fps: null, tracks: null, trailing: 0,
                desync: false, corrupt: false, probe: null };
    emit('assinatura de arquivo: ' + S.format + ' (' + (sniff ? sniff.magic : '—') + ')', 'ok');
    if (ext)
      emit(extOk ? 'extensão .' + ext + ' confere com o conteúdo real'
                 : 'extensão .' + ext + ' diverge do conteúdo real (' + S.format + ') — arquivo renomeado',
           extOk ? 'ok' : 'err');
    try {
      if (S.kind === 'mp4'){
        const probe = (sniff && sniff.probe) || mp4Probe(dv, len);
        S.probe = probe;
        emit('brands do ftyp: ' + (probe.brands.join(' · ') || '—'), 'plain');
        probe.tracks.forEach(t => {
          const tipo = t.hdlr === 'vide' ? 'VÍDEO' : t.hdlr === 'soun' ? 'áudio' : t.hdlr === 'meta' ? 'metadados' : (t.hdlr || '?');
          const codec = (t.formats || []).map(f => CODEC_LABEL[f] || f).join('+') || '?';
          let line = 'pista ' + tipo + ': ' + codec;
          if (t.hdlr === 'vide' && t.w) line += ' · ' + t.w + '×' + t.h + ' px';
          emit(line, 'ok');
        });
        if (probe.durationSec) S.duration = probe.durationSec;
        if (probe.durationSec) emit('duração (mvhd): ' + fmtTime(probe.durationSec), 'ok');
        if (probe.creationDate) emit('criado (mvhd): ' + probe.creationDate.toISOString().slice(0, 19).replace('T', ' '), 'plain');
        if (probe.gpmd) emit('pista GPMD (telemetria GoPro) presente — forte sinal de captura real', 'ok');
        [...new Set(probe.handlerNames)].forEach(n => emit('handler: "' + n + '"', 'plain'));
        const vtrk = probe.tracks.find(t => t.hdlr === 'vide');
        if (vtrk && vtrk.w){ S.dims = { w: vtrk.w, h: vtrk.h }; }
        if (probe.trailing > 16) emit(probe.trailing + ' bytes após o último box — dados anexados', 'err');
        else emit('fim do contêiner alinhado — nenhum box anexado', 'ok');
      }
      else if (S.kind === 'mkv') mkvScan(win, sniff, S, emit);
      else if (S.kind === 'avi') aviWalk(dv, len, S, emit);
      else if (S.kind === 'flv') flvScan(dv, len, S, emit);
      else if (S.kind === 'ts')  emit('fluxo MPEG-TS — pacotes de 188 bytes sincronizados; estrutura de programas não expandida', 'warn');
      else if (S.kind === 'ps')  emit('fluxo MPEG-PS — varredura estrutural limitada', 'warn');
      else if (S.kind === 'ogv') emit('contêiner Ogg com pista de vídeo (Theora) — análise de quadros depende do navegador', 'warn');
      else emit('contêiner de vídeo parcialmente suportado — metadados e heurísticas ativos', 'warn');
    } catch (e){
      S.desync = true;
      emit('exceção durante a varredura estrutural (' + e.message + ') — arquivo anômalo', 'err');
    }
    return S;
  }

  function qtTags(text){
    const out = [];
    const NAMES = { make:'fabricante', model:'modelo', software:'software', creationdate:'data de criação' };
    const rx = /com\.apple\.quicktime\.([a-z]+)/g;
    let m;
    while ((m = rx.exec(text))){
      const key = m[1];
      if (!NAMES[key]) continue;
      if (out.some(o => o.key === NAMES[key])) continue;
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 96);
      const runs = after.match(/[A-Za-z0-9][A-Za-z0-9 .:\-\/]{2,40}/g) || [];
      const val = runs.find(r => !/^com\.apple/i.test(r));
      if (val) out.push({ key: NAMES[key], value: val.trim() });
    }
    return out;
  }

  const VIDEO_SIGS = [
    { s:'runway', label:'Runway', where:'meta', tier:1 },{ s:'gen-3', label:'Runway Gen-3', where:'meta', tier:1 },
    { s:'gen-2', label:'Runway Gen-2', where:'meta', tier:1 },{ s:'pika.art', label:'Pika', where:'raw', tier:1 },
    { s:'pika', label:'Pika', where:'meta', tier:0 },{ s:'pikalabs', label:'Pika Labs', where:'raw', tier:1 },
    { s:'sora', label:'OpenAI Sora', where:'meta', tier:0 },{ s:'openai', label:'OpenAI', where:'meta', tier:0 },
    { s:'kling', label:'Kling AI', where:'meta', tier:1 },{ s:'klingai', label:'Kling AI', where:'meta', tier:1 },
    { s:'kuaishou', label:'Kling (Kuaishou)', where:'meta', tier:1 },{ s:'lumalabs', label:'Luma AI', where:'meta', tier:1 },
    { s:'luma ai', label:'Luma AI', where:'meta', tier:1 },{ s:'dream machine', label:'Luma Dream Machine', where:'meta', tier:1 },
    { s:'hailuo', label:'Hailuo/MiniMax', where:'meta', tier:1 },{ s:'minimax', label:'MiniMax', where:'meta', tier:1 },
    { s:'veo-2', label:'Google Veo 2', where:'meta', tier:1 },{ s:'veo-3', label:'Google Veo 3', where:'meta', tier:1 },
    { s:'google veo', label:'Google Veo', where:'meta', tier:1 },{ s:'pixverse', label:'PixVerse', where:'meta', tier:1 },
    { s:'vidu', label:'Vidu', where:'meta', tier:0 },{ s:'heygen', label:'HeyGen', where:'meta', tier:1 },
    { s:'synthesia', label:'Synthesia', where:'meta', tier:1 },{ s:'d-id', label:'D-ID', where:'raw', tier:1 },
    { s:'colossyan', label:'Colossyan', where:'meta', tier:1 },{ s:'invideo', label:'InVideo', where:'meta', tier:0 },
    { s:'fliki', label:'Fliki', where:'meta', tier:0 },{ s:'deepbrain', label:'DeepBrain', where:'meta', tier:1 },
    { s:'hour one', label:'Hour One', where:'meta', tier:1 },{ s:'vidnoz', label:'Vidnoz', where:'meta', tier:1 },
    { s:'creatify', label:'Creatify', where:'meta', tier:1 },{ s:'akool', label:'Akool', where:'meta', tier:0 },
    { s:'argil', label:'Argil', where:'meta', tier:0 },
    { s:'facefusion', label:'FaceFusion', where:'raw', tier:1 },{ s:'deepfacelab', label:'DeepFaceLab', where:'raw', tier:1 },
    { s:'faceswap', label:'FaceSwap', where:'meta', tier:0 },{ s:'wav2lip', label:'Wav2Lip', where:'raw', tier:1 },
    { s:'sadtalker', label:'SadTalker', where:'raw', tier:1 },{ s:'liveportrait', label:'LivePortrait', where:'raw', tier:1 },
    { s:'roop', label:'Roop', where:'meta', tier:0 },{ s:'deepswap', label:'DeepSwap', where:'meta', tier:1 },
    { s:'reface', label:'Reface', where:'meta', tier:0 },
    { s:'lavf', label:'FFmpeg (Lavf)', cat:'edit' },{ s:'ffmpeg', label:'FFmpeg', cat:'edit' },
    { s:'libx264', label:'libx264', cat:'edit' },{ s:'x264', label:'x264', cat:'edit' },
    { s:'handbrake', label:'HandBrake', cat:'edit' },{ s:'premiere', label:'Adobe Premiere', cat:'edit' },
    { s:'after effects', label:'After Effects', cat:'edit' },{ s:'davinci resolve', label:'DaVinci Resolve', cat:'edit' },
    { s:'final cut', label:'Final Cut Pro', cat:'edit' },{ s:'capcut', label:'CapCut', cat:'edit' },
    { s:'kinemaster', label:'Kinemaster', cat:'edit' },{ s:'filmora', label:'Filmora', cat:'edit' },
    { s:'virtualdub', label:'VirtualDub', cat:'edit' },{ s:'mencoder', label:'MEncoder', cat:'edit' },
    { s:'obs studio', label:'OBS Studio', cat:'edit' },
    { s:'gopro', label:'Gravado por câmera GoPro', cat:'auth' },
    { s:'dji', label:'Gravado por câmera DJI', cat:'auth' }
  ];

  function evaluateVideo(R){
    const S = R.structure, F = R.frames, AC = R.acoustics, SG = R.videoSigs, C = R.c2pa, QT = R.qtTags || [];
    const signals = [];
    const add = (dir, weight, label) => signals.push({ dir, weight, label });
    scoreTieredSigs(SG, add);
    if (C.found && C.declaresAI) add('syn', 4, 'C2PA declara fonte algorítmica (trainedAlgorithmicMedia)');
    else if (C.found) add('info', 0, 'Estrutura C2PA encontrada — assinatura e cadeia de confiança não verificadas');
    else add('info', 0, 'Sem manifesto C2PA (comum — não pontua)');
    if (QT.length) add('auth', 2, 'Metadados de captura QuickTime: ' + QT.map(t => t.key + ' "' + t.value + '"').join(', '));
    if (S.probe && S.probe.gpmd) add('auth', 2, 'Telemetria GPMD (GoPro) embutida — captura de câmera real');
    if (!R.metaCount && !QT.length && !(S.probe && S.probe.gpmd))
      add('info', 0, 'Metadados de captura ausentes — remoção por re-encode é comum; não indica IA');
    if (F && F.ok){
      add('info', 0, 'ELA médio dos quadros: ' + F.elaMean.toFixed(2) + ' (CV ' + F.elaCV.toFixed(3) + ') — informativo');
    }
    if (AC && AC.ok){
      if (AC.shelfHz) add('info', 0, 'Trilha: banda efetiva ≈ ' + (AC.shelfHz / 1000).toFixed(1) + ' kHz — corte de codec/filtragem; não identifica IA');
      if (AC.noiseFloorDb < -65) add('info', 0, 'Trilha: piso de ruído baixo (pode decorrer de redução de ruído) (' + AC.noiseFloorDb.toFixed(0) + ' dB)');
      if (AC.f0 && AC.f0.cv < 0.06) add('info', 0, 'Trilha: prosódia pouco variável (sinal inespecífico) (CV de F0 = ' + AC.f0.cv.toFixed(3) + ')');
      if (AC.noiseFloorDb > -60 && AC.floorStd !== null && AC.floorStd > 0.8)
        add('auth', 1, 'Trilha: room tone natural e flutuante');
    }
    if (R.facts.extOk === false) add('syn', 2, 'Extensão não corresponde ao conteúdo real');
    if (S.desync || S.corrupt) add('syn', 1, 'Estrutura interna anômala/corrompida');
    const score = signals.reduce((a, s) => a + (s.dir === 'syn' ? s.weight : s.dir === 'auth' ? -s.weight : 0), 0);
    let cls;
    if (C.found && C.declaresAI) cls = 'info';
    else if (score >= 3) cls = 'bad';
    else if (score >= 1) cls = 'warn';
    else cls = 'ok';
    const COPY = {
      bad:  { stamp:'INDÍCIOS DE SÍNTESE', line:'Múltiplos indícios de geração sintética (vídeo IA ou manipulação de face) foram localizados neste arquivo.' },
      info: { stamp:'SÍNTESE DECLARADA', line:'Assinatura no arquivo declara que o conteúdo foi gerado algoritmicamente — declaração encontrada sem validação criptográfica neste projeto.' },
      warn: { stamp:'INCONCLUSIVO', line:'Indícios parciais. Não é possível afirmar nem descartar síntese com os dados disponíveis neste arquivo.' },
      ok:   { stamp:'SEM INDÍCIOS', line:'Nenhuma assinatura de síntese localizada. O resultado é inconclusivo quanto à autenticidade; não há classificador neural neste projeto.' }
    };
    return { cls, score, signals, copy: COPY[cls],
             provenance: C.found ? (C.declaresAI ? 'DECLARADA (IA)' : 'DECLARADA') : 'NÃO ENCONTRADA' };
  }

  async function runVideo(dv, len, file, io, latin1, R){
    const emit = io.emit, onStage = io.onStage;
    const V = R.videoMeta = { meta: [] };
    const win = audioWindow(latin1.text);
    onStage(0, 'run');
    io.section && io.section('CONTÊINER & PISTAS');
    R.structure = inspectVideoStructure(dv, len, file, io.sniff, emit, win);
    R.facts.format = R.structure.format;
    R.facts.extOk = R.structure.extOk;
    if (R.structure.probe) R.structure.probe.meta.forEach(m => V.meta.push(m));
    onStage(0, R.structure.desync || R.structure.corrupt ? 'warn' : 'ok');
    onStage(1, 'run');
    io.section && io.section('METADADOS & ENCODER');
    R.qtTags = qtTags(win.text);
    R.metaCount = V.meta.length + R.qtTags.length;
    if (V.meta.length)
      V.meta.forEach(m => emit(m.src + ' · ' + m.key + ': "' + snippet(m.value, 110) + '"', m.tech ? 'ok' : 'plain'));
    R.qtTags.forEach(t => emit('QuickTime · ' + t.key + ': "' + t.value + '"', 'ok'));
    if (!V.meta.length && !R.qtTags.length) emit('nenhum metadado embutido encontrado no contêiner', 'warn');
    R.c2pa = scanC2paWindow(win, emit, R.structure.probe && R.structure.probe.c2paBox);
    onStage(1, R.c2pa.found || R.metaCount ? 'ok' : 'warn');
    onStage(2, 'run');
    io.section && io.section('QUADROS & TRILHA');
    const F = io.getFrames ? await io.getFrames() : { ok: false, why: 'extração indisponível' };
    R.frames = F;
    if (F.ok){
      emit('quadros decodificados: ' + F.frames.length + ' @ ' + F.w + '×' + F.h + ' · duração ' + fmtTime(F.duration), 'ok');
      emit('ELA (erro de recompressão JPEG) — médio: ' + F.elaMean.toFixed(2) +
           ' · p95 médio: ' + F.p95Mean.toFixed(1) +
           ' · variação entre quadros (CV): ' + F.elaCV.toFixed(3), 'plain');
      emit('atividade temporal média entre quadros: ' + F.activityMean.toFixed(2) + ' (CV ' + F.activityCV.toFixed(2) + ') — informativo', 'plain');
      if (F.elaCV < 0.05) emit('uniformidade anômala dos níveis de erro entre quadros — compressão homogênea (informativo, não pontua)', 'warn');
    } else emit('quadros não decodificáveis: ' + (F.why || 'motivo desconhecido') + ' — análise de contêiner e metadados preservada', 'warn');
    emit('tentando decodificar a TRILHA de áudio embutida…', 'run');
    try { await analyzeAcoustics(io.arrayBuffer, emit, io, R); }
    catch (e){ R.acoustics = { ok:false }; emit('trilha não decodificável (' + e.message + ')', 'warn'); }
    const AC = R.acoustics;
    const stage2Warn = (F.ok && F.elaCV < 0.05) || (AC && AC.ok && (AC.shelfHz || AC.noiseFloorDb < -65));
    onStage(2, (!F.ok && !(AC && AC.ok)) ? 'nodata' : (stage2Warn ? 'warn' : 'ok'));
    onStage(3, 'run');
    io.section && io.section('ASSINATURAS DE IA');
    emit('varrendo ' + R.metaCount + ' campos de metadados e ' +
         fmtBytes(Math.min(win.text.length, CONFIG.audioWinBytes * 2)) + ' de bytes contra ' +
         VIDEO_SIGS.length + ' assinaturas de vídeo-IA', 'run');
    if (win.split) emit('varredura de strings limitada a cabeçalho + rodapé (1 MB cada) — onde metadados residem', 'plain');
    const SG = R.videoSigs = scanTieredSignatures(VIDEO_SIGS, V.meta.concat(
      R.qtTags.map(t => ({ key: t.key, value: t.value, tech: t.key === 'software' }))
    ), win, emit);
    SG.tech.forEach(l => emit('assinatura em campo TÉCNICO (encoder/vendor): ' + l, 'err'));
    SG.descStrong.forEach(l => emit('assinatura em campo descritivo: ' + l, 'err'));
    SG.descWeak.forEach(l => emit('menção ambígua em campo descritivo: ' + l, 'warn'));
    SG.raw.forEach(l => emit('assinatura de gerador nos bytes do arquivo: ' + l, 'err'));
    if (!SG.tech.length && !SG.descStrong.length && !SG.descWeak.length && !SG.raw.length)
      emit('nenhuma assinatura de gerador de vídeo conhecida', 'ok');
    [...new Set(SG.edit)].forEach(l => emit('software na cadeia de edição: ' + l, 'plain'));
    [...new Set(SG.auth)].forEach(l => emit('cadeia de gravação identificada: ' + l, 'ok'));
    const hasGen = SG.tech.length || SG.descStrong.length || SG.descWeak.length || SG.raw.length;
    onStage(3, hasGen ? 'alert' : 'ok');
    R.verdict = evaluateVideo(R);
    return R;
  }

  async function runPipeline(file, io = {}){
    const emit = io.emit || (async () => {});
    const onStage = io.onStage || (() => {});
    const R = { mode: io.mode || 'image', facts: {}, structure: {}, verdict: null, hash: null };
    const buffer = io.arrayBuffer || await readFile(file);
    R.facts.size = file.size;
    await emit(fmtBytes(file.size) + (io.readMs ? ' lidos em ' + io.readMs + ' ms' : ''), 'ok');
    R.hash = await sha256(buffer);
    await emit(R.hash ? 'SHA-256: ' + R.hash.slice(0, 32) + '…' : 'SHA-256 indisponível (contexto não seguro)',
               R.hash ? 'ok' : 'warn');
    const dv = new DataView(buffer);
    const latin1 = decodeLatin1(buffer, CONFIG.maxScanBytes);
    io.arrayBuffer = buffer;
    io.sniff = io.sniff || sniffMedia(dv, buffer.byteLength, R.mode);
    if (R.mode === 'audio')  return runAudio(dv, buffer.byteLength, file, io, latin1, R);
    if (R.mode === 'video')  return runVideo(dv, buffer.byteLength, file, io, latin1, R);
    return runImage(dv, buffer.byteLength, file, io, latin1, R);
  }

  return { runPipeline, readFile, sha256, sniffMedia, mp4Probe,
           evaluate, evaluateAudio, evaluateVideo, analyzeAcoustics, fft,
           SIGNATURES, AUDIO_SIGS, VIDEO_SIGS };
})();

/* ═══════════════════════════════════════════════════════════════
   VIDEOLAB — extração de quadros + ELA (camada de UI/DOM)
════════════════════════════════════════════════════════════════ */
const VideoLab = (() => {
  const once = (el, ev, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout: ' + ev)), ms || 4000);
    el.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
    el.addEventListener('error', () => { clearTimeout(t); rej(new Error('decodificação falhou no navegador')); }, { once: true });
  });

  async function elaOf(canvas){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const orig = ctx.getImageData(0, 0, w, h).data;
    const url = canvas.toDataURL('image/jpeg', 0.85);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cctx = c.getContext('2d', { willReadFrequently: true });
    cctx.drawImage(img, 0, 0);
    const rec = cctx.getImageData(0, 0, w, h).data;
    let sum = 0, n = 0;
    const diffs = [];
    for (let i = 0; i < orig.length; i += 16){
      const d = (Math.abs(orig[i] - rec[i]) + Math.abs(orig[i+1] - rec[i+1]) + Math.abs(orig[i+2] - rec[i+2])) / 3;
      sum += d; n++; diffs.push(d);
    }
    diffs.sort((a, b) => a - b);
    return { mean: sum / (n || 1), p95: diffs[Math.floor(diffs.length * 0.95)] || 0 };
  }

  async function extract(file, emit, progressBar){
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return; cleaned = true;
      try { v.pause(); } catch {}
      v.removeAttribute('src');
      try { v.load(); } catch {}
      URL.revokeObjectURL(url);
    };
    try {
      v.src = url;
      await once(v, 'loadedmetadata', 15000);
      const dur = v.duration;
      if (!isFinite(dur) || dur <= 0){ cleanup(); return { ok:false, why:'duração inválida/indisponível' }; }
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh){ cleanup(); return { ok:false, why:'sem pista de vídeo decodificável pelo navegador' }; }
      const n = Math.min(CONFIG.maxVideoFrames, Math.max(4, Math.ceil(dur / 5) + 2));
      const big = document.createElement('canvas');
      big.width = Math.min(480, vw);
      big.height = Math.max(1, Math.round(big.width * vh / vw));
      const bctx = big.getContext('2d', { willReadFrequently: true });
      const small = document.createElement('canvas');
      small.width = 160;
      small.height = Math.max(1, Math.round(160 * vh / vw));
      const sctx = small.getContext('2d', { willReadFrequently: true });
      const frames = [];
      const bar = progressBar('extraindo ' + n + ' quadros via decodificador do navegador');
      for (let i = 0; i < n; i++){
        const t = dur * (i + 0.5) / n;
        v.currentTime = Math.min(t, Math.max(0, dur - 0.05));
        await once(v, 'seeked', 5000);
        bctx.drawImage(v, 0, 0, big.width, big.height);
        sctx.drawImage(v, 0, 0, small.width, small.height);
        const th = document.createElement('canvas'); th.width = big.width; th.height = big.height;
        th.getContext('2d', { willReadFrequently: true }).drawImage(big, 0, 0);
        frames.push({ t, thumb: th, small: sctx.getImageData(0, 0, small.width, small.height) });
        bar.update(i + 1, n);
        await sleep(0);
      }
      bar.end();
      const ebar = progressBar('ELA: recomprimindo quadros em JPEG e medindo resíduos');
      for (let i = 0; i < frames.length; i++){
        const e = await elaOf(frames[i].thumb);
        frames[i].ela = e.mean; frames[i].elaP95 = e.p95;
        emit && emit('quadro ' + (i + 1) + '/' + frames.length + ' @ ' + fmtTime(frames[i].t) +
                     ' — ELA ' + e.mean.toFixed(2) + ' (p95 ' + e.p95.toFixed(1) + ')', 'plain');
        ebar.update(i + 1, frames.length);
      }
      ebar.end();
      const acts = [];
      for (let i = 1; i < frames.length; i++){
        const a = frames[i - 1].small.data, b = frames[i].small.data;
        let s = 0, c = 0;
        for (let p = 0; p < a.length; p += 4){
          s += Math.abs(a[p] - b[p]) + Math.abs(a[p+1] - b[p+1]) + Math.abs(a[p+2] - b[p+2]);
          c += 3;
        }
        acts.push(s / (c || 1));
      }
      const am = acts.reduce((x, y) => x + y, 0) / (acts.length || 1);
      const acv = Math.sqrt(acts.reduce((x, y) => x + (y - am) * (y - am), 0) / (acts.length || 1)) / (am || 1);
      cleanup();
      return { ok:true, w: vw, h: vh, duration: dur, frames, activityMean: am, activityCV: acv };
    } catch (e){
      cleanup();
      return { ok:false, why: (e && e.message) || 'erro de decodificação' };
    }
  }
  return { extract };
})();

/* ═══════════════════════════════════════════════════════════════
   PIXELLAB — ELA em grade p/ imagens estáticas (camada de UI/DOM)
════════════════════════════════════════════════════════════════ */
const PixelLab = (() => {
  async function elaGrid(img){
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) throw new Error('dimensões inválidas');
    const W = Math.min(560, iw), H = Math.max(2, Math.round(ih * W / iw));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    const orig = x.getImageData(0, 0, W, H).data;
    const jpg = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
    const url = URL.createObjectURL(jpg);
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
      const x2 = c2.getContext('2d', { willReadFrequently: true });
      x2.drawImage(im, 0, 0, W, H);
      const rec = x2.getImageData(0, 0, W, H).data;
      const GX = 12, GY = 12, cw = Math.ceil(W / GX), ch = Math.ceil(H / GY);
      const cells = [];
      for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++){
        let sum = 0, n = 0;
        for (let y = gy * ch; y < Math.min(H, (gy + 1) * ch); y += 3)
          for (let px = gx * cw; px < Math.min(W, (gx + 1) * cw); px += 3){
            const i = (y * W + px) * 4;
            sum += (Math.abs(orig[i] - rec[i]) + Math.abs(orig[i+1] - rec[i+1]) + Math.abs(orig[i+2] - rec[i+2])) / 3;
            n++;
          }
        cells.push(sum / (n || 1));
      }
      const sorted = [...cells].sort((a, b) => a - b);
      const med = sorted[cells.length >> 1];
      const max = sorted[cells.length - 1];
      const m = cells.reduce((a, b) => a + b, 0) / cells.length;
      const cv = Math.sqrt(cells.reduce((a, b) => a + (b - m) * (b - m), 0) / cells.length) / (m || 1);
      const hot = cells.filter(v => v > Math.max(med * 3, med + 4)).length;
      return { med, max, hot, cv, ratio: med > 0.2 ? max / med : 1 };
    } finally { URL.revokeObjectURL(url); }
  }
  return { elaGrid };
})();

/* ═══════════════════════════════════════════════════════════════
   FORGEARTIFACTS — deck de artefatos gerados
════════════════════════════════════════════════════════════════ */
const ForgeArtifacts = (() => {
  const list = $('#artList'), empty = $('#artEmpty');
  const urls = new Set();
  window.addEventListener('pagehide', () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); });
  function add(blob, name, kind){
    if (empty) empty.hidden = true;
    const url = URL.createObjectURL(blob);
    urls.add(url);
    const card = document.createElement('div');
    card.className = 'art-card';
    const media = kind === 'audio'
      ? '<audio controls preload="metadata" src="' + url + '"></audio>'
      : kind === 'video'
        ? '<video controls preload="metadata" src="' + url + '"></video>'
        : '<img class="art-thumb" src="' + url + '" alt="Artefato gerado">';
    card.innerHTML = media +
      '<span class="art-name">' + esc(name) + ' · ' + fmtBytes(blob.size) + '</span>' +
      '<div class="art-actions">' +
        '<button class="btn btn-ghost" data-a="scan" type="button">analisar</button>' +
        '<button class="btn btn-ghost" data-a="dl" type="button">baixar</button>' +
      '</div>';
    card.querySelector('[data-a="scan"]').addEventListener('click', () => App.submitBlob(blob, name));
    card.querySelector('[data-a="dl"]').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
    });
    card.dataset.objectUrl = url;
    list.prepend(card);
    const cards = [...list.querySelectorAll('.art-card')];
    cards.slice(20).forEach(old => {
      const u = old.dataset.objectUrl;
      old.querySelectorAll('video,audio').forEach(media => { media.pause(); media.removeAttribute('src'); media.load(); });
      URL.revokeObjectURL(u); urls.delete(u); old.remove();
    });
  }
  return { add };
})();

/* ═══════════════════════════════════════════════════════════════
   DSP compartilhado da FORGE (conversão de voz — núcleo clássico)
════════════════════════════════════════════════════════════════ */
function granularShift(input, r, wob){
  const L = 1024, hop = L >> 2, n = input.length;
  const out = new Float32Array(n), acc = new Float32Array(n);
  const win = new Float32Array(L);
  for (let i = 0; i < L; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / L);
  let g = 0;
  for (let pos = 0; pos + L < n; pos += hop, g++){
    const rr = wob ? r * (1 + wob * Math.sin(g * 0.35)) : r;
    for (let i = 0; i < L; i++){
      const src = pos + i * rr;
      const j = src | 0, f = src - j;
      const v = (j + 1 < n) ? input[j] * (1 - f) + input[j + 1] * f : (input[j] || 0);
      out[pos + i] += v * win[i];
      acc[pos + i] += win[i];
    }
  }
  for (let i = 0; i < n; i++) out[i] /= acc[i] || 1;
  return out;
}
function tiltFilter(x, dir){
  const out = new Float32Array(x.length);
  for (let i = 1; i < x.length - 1; i++){
    const avg = (x[i-1] + x[i] + x[i+1]) / 3;
    out[i] = dir < 0 ? avg * .85 + x[i] * .15 : (x[i] - avg) * .7 + x[i] * .3;
  }
  out[0] = x[0]; out[x.length - 1] = x[x.length - 1];
  return out;
}
function ringMod(x, hz, sr){
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++)
    out[i] = x[i] * (0.55 + 0.45 * Math.sin(2 * Math.PI * hz * (i / sr)));
  return out;
}
function encodeWav(pcm, sr){
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0,'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8,'WAVE');
  w(12,'fmt '); dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*2,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true);
  w(36,'data'); dv.setUint32(40,n*2,true);
  for (let i = 0; i < n; i++){
    const v = Math.max(-1, Math.min(1, pcm[i]));
    dv.setInt16(44 + i * 2, v < 0 ? v * 32768 : v * 32767, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
function mixMono(ab){
  const N = ab.length, out = new Float32Array(N);
  for (let c = 0; c < ab.numberOfChannels; c++){
    const d = ab.getChannelData(c);
    for (let i = 0; i < N; i++) out[i] += d[i] / ab.numberOfChannels;
  }
  return out;
}
function quickProfile(pcm, sr){
  const ds = Math.max(1, Math.round(sr / 8000)), fsr = sr / ds;
  const n = Math.floor(pcm.length / ds);
  const sig = new Float32Array(n);
  for (let i = 0; i < n; i++) sig[i] = pcm[i * ds];
  const FW = 400, FH = 250;
  const lagLo = Math.max(2, Math.round(fsr / 400)), lagHi = Math.min(FW - 2, Math.round(fsr / 65));
  const f0s = [];
  for (let pos = 0; pos + FW < n; pos += FH){
    let e0 = 0;
    for (let i = 0; i < FW; i++) e0 += sig[pos + i] * sig[pos + i];
    if (e0 < 1e-6) continue;
    let best = 0, bl = 0;
    for (let lag = lagLo; lag <= lagHi; lag++){
      let s = 0;
      for (let i = 0; i < FW - lag; i++) s += sig[pos + i] * sig[pos + i + lag];
      const v = s / e0;
      if (v > best){ best = v; bl = lag; }
    }
    if (best > 0.45 && bl) f0s.push(fsr / bl);
  }
  f0s.sort((a, b) => a - b);
  const win = Math.floor(sr * 0.04), rms = [];
  for (let pos = 0; pos + win < pcm.length; pos += win){
    let e = 0;
    for (let i = 0; i < win; i++) e += pcm[pos + i] * pcm[pos + i];
    rms.push(20 * Math.log10(Math.sqrt(e / win) + 1e-9));
  }
  rms.sort((a, b) => a - b);
  return { f0: f0s.length ? f0s[f0s.length >> 1] : null,
           floorDb: rms.length ? rms[Math.floor(rms.length * 0.1)] : null,
           frames: f0s.length };
}

/* ═══════════════════════════════════════════════════════════════
   VOICEFORGE — conversão de voz sobre a PRÓPRIA voz do operador
════════════════════════════════════════════════════════════════ */
const VoiceForge = (() => {
  const $rec = $('#vfRec'), $live = $('#vfLive'), $pres = $('#vfPresets'),
        $ro = $('#vfReadout'), $st = $('#vfStatus');
  const st = { stream:null, ctx:null, rec:null, chunks:[], pcm:null, sr:44100,
               prof:null, live:false, sp:null, src:null, livePreset:'original', recording:false, timer:null };
  const PRESETS = [
    { k:'original', label:'original', r:1 },
    { k:'grave',    label:'grave',    r:0.72, tilt:-1 },
    { k:'agudo',    label:'agudo',    r:1.42, tilt:+1 },
    { k:'robo',     label:'robô',     ring:55 },
    { k:'warble',   label:'warble',   r:1, wob:0.05 }
  ];
  let seq = 0;

  const setSt = t => { $st.textContent = t; };

  async function ensureMic(){
    if (st.stream) return st.stream;
    st.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }
    });
    return st.stream;
  }

  function renderPresets(){
    $pres.innerHTML = '';
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.textContent = p.label;
      b.addEventListener('click', () => {
        st.livePreset = p.k;
        [...$pres.children].forEach(c => c.classList.toggle('on', c === b));
        renderPreset(p);
      });
      $pres.appendChild(b);
    });
    [...$pres.children][0].classList.add('on');
  }

  function presetR(p){
    if (p.ring) return Math.max(0.5, Math.min(2.2, 110 / (st.prof && st.prof.f0 || 130)));
    return p.r || 1;
  }

  function transform(pcm, p, sr){
    let out = pcm;
    const r = presetR(p);
    if (r !== 1 || p.wob) out = granularShift(out, r, p.wob || 0);
    if (p.tilt) out = tiltFilter(out, p.tilt);
    if (p.ring) out = ringMod(out, p.ring, sr);
    return out;
  }

  function renderPreset(p){
    if (!st.pcm) return;
    const out = transform(st.pcm, p, st.sr);
    const blob = encodeWav(out, st.sr);
    const name = 'forge_voz_' + p.k + '_' + (++seq) + '.wav';
    ForgeArtifacts.add(blob, name, 'audio');
    Terminal.log('[FORGE::VOICE] artefato gerado: ' + name + ' (preset "' + p.label + '"' +
                 (p.ring ? ' · F0 fixado em ~110 Hz' : presetR(p) !== 1 ? ' · pitch ×' + presetR(p).toFixed(2) : '') + ')', 'ok');
    $ro.innerHTML = 'artefato <b>' + esc(name) + '</b> gerado — player na seção SAÍDA abaixo. ' +
      'Envie à bancada de detecção e veja se ela percebe a conversão.';
  }

  async function record(){
    if (st.recording){
      try { st.rec.stop(); } catch {}
      return;
    }
    try { await ensureMic(); }
    catch (e){ setSt('mic negado'); $ro.textContent = 'acesso ao microfone negado — ' + e.name; return; }
    st.chunks = [];
    st.rec = new MediaRecorder(st.stream);
    st.rec.ondataavailable = e => e.data.size && st.chunks.push(e.data);
    st.rec.onstop = async () => {
      st.recording = false;
      clearTimeout(st.timer);
      $rec.classList.remove('on');
      $rec.textContent = '● gravar 5 s';
      setSt('processando…');
      try {
        const blob = new Blob(st.chunks, { type: st.rec.mimeType || 'audio/webm' });
        const buf = await blob.arrayBuffer();
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const ab = await actx.decodeAudioData(buf);
        if (actx.close) actx.close();
        st.pcm = mixMono(ab);
        st.sr = ab.sampleRate;
        st.prof = quickProfile(st.pcm, st.sr);
        renderPresets();
        $live.disabled = false;
        setSt('amostra pronta');
        const f0 = st.prof.f0 ? st.prof.f0.toFixed(0) + ' Hz' : '—';
        const fl = st.prof.floorDb !== null ? st.prof.floorDb.toFixed(0) + ' dB' : '—';
        $ro.innerHTML = 'impressão vocal extraída: F0 mediano <b>' + f0 + '</b> · piso de ruído <b>' + fl +
          '</b> · duração <b>' + ab.duration.toFixed(1) + ' s</b> — é este dado que um clonador colhe de segundos de áudio público. Escolha um conversor abaixo.';
        Terminal.log('[FORGE::VOICE] amostra capturada: ' + ab.duration.toFixed(1) + ' s · ' + st.sr + ' Hz · F0 ' + f0 + ' · piso ' + fl, 'ok');
      } catch (e){
        setSt('falha ao decodificar');
        $ro.textContent = 'falha ao decodificar a gravação (' + e.message + ')';
      }
    };
    st.recording = true;
    $rec.classList.add('on');
    setSt('gravando…');
    let left = 5;
    $rec.textContent = '■ parar (' + left + ')';
    st.timer = setInterval(() => {
      left--;
      if (left <= 0){ clearInterval(st.timer); try { st.rec.stop(); } catch {} }
      else $rec.textContent = '■ parar (' + left + ')';
    }, 1000);
    st.rec.start();
  }

  async function toggleLive(){
    if (st.live){ stopLive(); return; }
    try { await ensureMic(); }
    catch (e){ setSt('mic negado'); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    st.ctx = st.ctx || new Ctx();
    await st.ctx.resume();
    st.src = st.ctx.createMediaStreamSource(st.stream);
    st.sp = st.ctx.createScriptProcessor(2048, 1, 1);
    let tail = new Float32Array(1024);
    st.sp.onaudioprocess = e => {
      const inp = e.inputBuffer.getChannelData(0);
      const outp = e.outputBuffer.getChannelData(0);
      const p = PRESETS.find(x => x.k === st.livePreset) || PRESETS[0];
      const seg = new Float32Array(tail.length + inp.length);
      seg.set(tail); seg.set(inp, tail.length);
      const sh = transform(seg, p, st.ctx.sampleRate);
      outp.set(sh.subarray(tail.length));
      tail = inp.slice(inp.length - 1024);
    };
    st.src.connect(st.sp);
    st.sp.connect(st.ctx.destination);
    st.live = true;
    $live.classList.add('on');
    $live.textContent = '■ parar ao vivo';
    setSt('ao vivo (use fones)');
    $ro.innerHTML = 'conversão em tempo real ATIVA — fale e ouça o resultado (latência ~100 ms). ' +
      '<b>Use fones de ouvido</b> para evitar microfonia. Troque de preset acima.';
    Terminal.log('[FORGE::VOICE] modo ao vivo iniciado — conversor aplicado sobre o mic em tempo real', 'run');
  }
  function stopLive(){
    if (!st.live) return;
    try { st.sp && st.sp.disconnect(); st.src && st.src.disconnect(); } catch {}
    st.live = false;
    $live.classList.remove('on');
    $live.textContent = '▷ modo ao vivo';
    setSt(st.pcm ? 'amostra pronta' : 'parado');
    Terminal.log('[FORGE::VOICE] modo ao vivo encerrado', 'plain');
  }

  function init(){
    $rec.addEventListener('click', record);
    $live.addEventListener('click', toggleLive);
  }
  return { init };
})();

/* FORGE::FACE v7 — deformação inversa, textura fotográfica e calibração explícita.
   Não gera dentes, língua ou identidade. WebGL é opcional; Canvas 2D é o fallback. */
const FaceForge = (() => {
  const cvs = $('#ffCanvas'), ctx = cvs.getContext('2d');
  const guide = $('#ffGuide'), gx = guide.getContext('2d');
  const video = $('#ffVideo'), empty = $('#ffEmpty'), stage = $('#ffStage');
  const status = $('#ffStatus'), readout = $('#ffReadout');
  const controls = ['ffRevive','ffVoice','ffAudioBtn','ffCalibrate','ffCompare','ffShot','ffClip','ffMask'];
  const fx = { puppet:false, swap:false, smooth:false, glitch:false };
  const clamp = (x, a=0, b=1) => Math.min(b, Math.max(a, x));
  const smooth = (a,b,x) => { const u=clamp((x-a)/(b-a)); return u*u*(3-2*u); };
  const lerp = (a,b,t) => a+(b-a)*t;
  const TAU = 2*Math.PI;
  const TOP = [78,191,80,81,82,13,312,311,310,415,308];
  const BOT = [78,95,88,178,87,14,317,402,318,324,308];
  let W=0,H=0,mode='idle',photo=null,photoName='',camera=null,renderer=null;
  let running=false,raf=0,generation=0,lm=null,manual=null,geometry=null,compare=false;
  let fm=null,meshPromise=null,meshSend=Promise.resolve(),meshGeneration=0,tracking=false;
  let mask=null,sequence=0,recording=null,recordTimer=0,calibration=null;
  let audioContext=null,analyser=null,audioOut=null,mic=null,audioSource=null,audioBuffer=null;
  let audioName='',audioMode='demo',audioLoading=false,photoLoading=false,cameraLoading=false,micLoading=false,clipLoading=false;
  let tbuf=null,fbuf=null,audioStarted=0,audioLevel=0,noiseFloor=.008,peak=.05;
  const anim={ on:false, t0:0,last:0,mouth:0,wide:0,blink:0,nextBlink:2,blinkStart:-2,
    mood:'neutro',smile:0,brow:0 };
  let frameCount=0,fpsStart=0,lastStats=0;

  const setStatus = t => { status.textContent=t; };
  const message = t => { readout.textContent=t; };
  const point = i => ({x:lm[i].x*W,y:lm[i].y*H});
  const mid = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

  function boxForFace(){
    if(lm){
      const pts=[10,152,234,454,127,356].map(point);
      const x=Math.min(...pts.map(p=>p.x)),y=Math.min(...pts.map(p=>p.y));
      const w=Math.max(...pts.map(p=>p.x))-x,h=Math.max(...pts.map(p=>p.y))-y;
      return {x,y,w,h,cx:x+w/2,cy:y+h/2};
    }
    if(manual){
      const width=distance(manual[0],manual[1])*2.5;
      const height=distance(manual[0],manual[1])*3.1,c=mid(manual[0],manual[1]);
      return {x:c.x-width/2,y:c.y-height*.70,w:width,h:height,cx:c.x,cy:c.y-height*.20};
    }
    return {x:W*.3,y:H*.13,w:W*.4,h:H*.65,cx:W*.5,cy:H*.455};
  }

  function buildGeometry(){
    if(!manual&&!lm){geometry=null;return;}
    const b=boxForFace();
    let left=manual?manual[0]:point(78),right=manual?manual[1]:point(308);
    if(left.x>right.x) [left,right]=[right,left];
    const c=mid(left,right),span=distance(left,right);
    if(span<4||b.h<12){geometry=null;return;}
    const axis={x:(right.x-left.x)/span,y:(right.y-left.y)/span};
    const normal={x:-axis.y,y:axis.x};
    const local=p=>({x:(p.x-c.x)*axis.x+(p.y-c.y)*axis.y,
      y:(p.x-c.x)*normal.x+(p.y-c.y)*normal.y});
    let top,bottom;
    if(manual){
      const u=local(manual[2]).y,d=local(manual[3]).y;
      top=Array.from({length:11},(_,i)=>u*(1-(-1+i/5)**2));
      bottom=Array.from({length:11},(_,i)=>d*(1-(-1+i/5)**2));
    }else{
      const resample=ids=>{
        const ps=ids.map(i=>local(point(i))).sort((a,b)=>a.x-b.x);
        return Array.from({length:11},(_,i)=>{
          const x=(-1+i/5)*span/2;
          let k=0;while(k<ps.length-2&&ps[k+1].x<x) k++;
          return lerp(ps[k].y,ps[k+1].y,clamp((x-ps[k].x)/Math.max(.001,ps[k+1].x-ps[k].x)));
        });
      };
      top=resample(TOP);bottom=resample(BOT);
    }
    for(let i=0;i<11;i++) bottom[i]=Math.max(top[i],bottom[i]);
    const eye=(a,z,t,d)=>{
      const p=point(a),q=point(z),cc=mid(p,q);
      return {x:cc.x,y:cc.y,w:distance(p,q)/2,h:Math.max(1,distance(point(t),point(d))/2)};
    };
    geometry={b,c,axis,normal,half:span/2,top,bottom,
      eyes:lm?[eye(33,133,159,145),eye(362,263,386,374)]:[],
      brows:lm?[point(105),point(334)]:[],dark:[.025,.025,.025]};
    if(photo){
      // O tom do interior vem de pixels escuros da boca real, inclusive em fotos P&B.
      const pc=photo.getContext('2d'),samples=[];
      for(let i=2;i<9;i++)for(let j=1;j<=3;j++){
        const x=(-1+i/5)*span/2,y=lerp(top[i],bottom[i],j/4);
        const px=clamp(Math.round(c.x+axis.x*x+normal.x*y),0,W-1);
        const py=clamp(Math.round(c.y+axis.y*x+normal.y*y),0,H-1);
        const rgb=pc.getImageData(px,py,1,1).data;
        samples.push([rgb[0],rgb[1],rgb[2]]);
      }
      samples.sort((a,z)=>(a[0]+a[1]+a[2])-(z[0]+z[1]+z[2]));
      const dark=samples.slice(0,8).reduce((a,p)=>a.map((v,i)=>v+p[i]/8),[0,0,0]);
      const lum=dark.reduce((a,v)=>a+v,0)/3;
      geometry.dark=dark.map(v=>Math.min(.19,v/255*(lum<45?.72:.27)));
    }
    $('#ffCalHint').textContent=(manual?'Boca ajustada manualmente.':'Contorno facial localizado.')+
      ' Dentes e detalhes visíveis são preservados da foto; não há desenho dental.';
    syncControls();
  }

  // Renderizador por pixel: contorno dos lábios define a abertura e a oclusão.
  // O interior superior usa pixels originais ancorados na maxila, sem esticar os dentes.
  class PhotoRenderer {
    constructor(source){
      this.source=source;this.width=source.width;this.height=source.height;
      this.data=source.getContext('2d').getImageData(0,0,this.width,this.height).data;
      this.canvas=document.createElement('canvas');this.canvas.width=this.width;this.canvas.height=this.height;
      this.kind='Canvas 2D';this.gl=null;this.program=null;this.texture=null;this.locs={};this.lost=false;
      try{this.initGL();}catch(e){console.info('FORGE: Canvas 2D selecionado:',e.message);this.disposeGL();}
    }
    initGL(){
      const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
      if(!gl) throw new Error('WebGL indisponível');
      this.gl=gl;
      const vs=`attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}`;
      const fs=`precision highp float;
        varying vec2 uv;uniform sampler2D photo;uniform vec2 size,center,axis;
        uniform vec4 face,eye0,eye1;uniform float halfW,drop,widthScale,smile,brow,blink,rotation;
        uniform float top[11],bottom[11],softness;uniform vec3 dark;uniform vec2 shift;
        float saturate(float x){return clamp(x,0.0,1.0);}
        float upper(float t){float f=saturate((t+1.0)*0.5)*10.0;float v=top[10];
          for(int i=0;i<10;i++){if(f>=float(i)&&f<float(i+1))v=mix(top[i],top[i+1],f-float(i));}return v;}
        float lower(float t){float f=saturate((t+1.0)*0.5)*10.0;float v=bottom[10];
          for(int i=0;i<10;i++){if(f>=float(i)&&f<float(i+1))v=mix(bottom[i],bottom[i+1],f-float(i));}return v;}
        vec3 tex(vec2 p){return texture2D(photo,vec2(clamp(p.x/size.x,0.0,1.0),clamp(1.0-p.y/size.y,0.0,1.0))).rgb;}
        vec2 eyelid(vec2 p,vec4 e){
          if(e.z<1.0)return p;float wx=1.0-smoothstep(0.55,1.18,abs(p.x-e.x)/e.z);
          float amount=blink*wx,eh=e.w;float y=p.y-e.y,target=eh*(1.0-amount*.88);
          if(abs(y)<target)p.y=e.y+y/(1.0-amount*.88);
          else if(y<0.0)p.y-=amount*eh*.88*(1.0-smoothstep(eh,eh*4.0,abs(y)));
          else p.y+=amount*eh*.40*(1.0-smoothstep(eh,eh*3.0,y));return p;
        }
        void main(){
          vec2 p=vec2(uv.x*size.x,(1.0-uv.y)*size.y);
          vec2 fc=face.xy;float weight=1.0-smoothstep(.64,1.05,length((p-fc)/face.zw));
          vec2 v=p-fc-shift*weight;float r=-rotation*weight;
          vec2 q=vec2(cos(r)*v.x-sin(r)*v.y,sin(r)*v.x+cos(r)*v.y)+fc;
          q=eyelid(eyelid(q,eye0),eye1);
          if(brow!=0.0){float w=exp(-pow((q.y-(fc.y-face.w*.27))/(face.w*.10),2.0));
            q.y+=brow*face.w*.014*w*weight;}
          vec2 normal=vec2(-axis.y,axis.x);vec2 rel=q-center;
          float x=dot(rel,axis),y=dot(rel,normal);
          float lateral=1.0-smoothstep(1.0,1.55,abs(x)/halfW);
          float near=1.0-smoothstep(face.w*.04,face.w*.18,abs(y));
          float sx=x/(1.0+(widthScale-1.0)*lateral*near);
          float t=sx/halfW,shape=pow(max(0.0,1.0-t*t),.80);
          float up=upper(t),lo=lower(t),lift=smile*face.w*.008*pow(min(1.0,abs(t)),1.7)*lateral;
          float d=drop*shape,u=up-d*.06-lift,l=lo+d*.94-lift;
          float sy=y;
          if(y<=u)sy=y+d*.06*exp(-abs(y-u)/(face.w*.065))+lift*near;
          else if(y>=l)sy=y-d*.94*exp(-(y-l)/(face.w*.42))+lift*near;
          vec2 sampleP=center+axis*sx+normal*sy;
          vec3 color=tex(sampleP);
          if(abs(t)<1.0&&y>u&&y<l&&d>.001){
            float gap=max(0.0,lo-up),height=max(.001,l-u),delta=y-u;
            vec3 oral=dark*(.82+.25*saturate(delta/height));
            float upperKeep=1.0-smoothstep(max(.0,gap*.78),max(.6,gap*.98),delta);
            upperKeep*=smoothstep(.6,2.0,gap);
            oral=mix(oral,tex(center+axis*sx+normal*(up+delta)),upperKeep);
            float bottomKeep=(1.0-smoothstep(0.0,max(.7,gap*.22),l-y))*smoothstep(1.0,3.0,gap);
            oral=mix(oral,tex(center+axis*sx+normal*(lo-(l-y))),bottomKeep);
            float contact=min(y-u,l-y);oral*=.68+.32*smoothstep(.0,softness*1.5,contact);
            vec3 old=tex(center+axis*sx+normal*(up+delta/height*gap));
            oral=mix(old,oral,smoothstep(.0,2.0,d));
            float edge=smoothstep(0.0,softness,contact)*smoothstep(0.0,.025,1.0-abs(t));
            color=mix(color,oral,edge);
          }
          gl_FragColor=vec4(color,1.0);
        }`;
      const compile=(type,src)=>{
        const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const vertex=compile(gl.VERTEX_SHADER,vs),fragment=compile(gl.FRAGMENT_SHADER,fs);
      this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);
      gl.linkProgram(this.program);gl.deleteShader(vertex);gl.deleteShader(fragment);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.source);
      for(const name of ['size','center','axis','face','eye0','eye1','halfW','softness','drop','widthScale','smile','brow','blink','rotation','dark','shift','top[0]','bottom[0]'])
        this.locs[name]=gl.getUniformLocation(this.program,name);
      gl.viewport(0,0,this.width,this.height);this.kind='WebGL';
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.kind='Canvas 2D';});
    }
    disposeGL(){
      const gl=this.gl;if(gl){if(this.texture)gl.deleteTexture(this.texture);if(this.program)gl.deleteProgram(this.program);
        if(this.buffer)gl.deleteBuffer(this.buffer);const ext=gl.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();}
      this.gl=null;this.kind='Canvas 2D';
    }
    dispose(){this.disposeGL();this.data=null;this.frame=null;}
    sample(x,y,out){
      // Mesma convenção de centros de pixels do sampler do WebGL.
      x=clamp(x-.5,0,this.width-1);y=clamp(y-.5,0,this.height-1);
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
      const a=(iy*this.width+ix)*4,b=(iy*this.width+Math.min(ix+1,this.width-1))*4;
      const c=(Math.min(iy+1,this.height-1)*this.width+ix)*4,d=(Math.min(iy+1,this.height-1)*this.width+Math.min(ix+1,this.width-1))*4;
      for(let i=0;i<3;i++)out[i]=lerp(lerp(this.data[a+i],this.data[b+i],fx),lerp(this.data[c+i],this.data[d+i],fx),fy)/255;
      return out;
    }
    render(p){
      if(this.gl&&!this.lost){
        const gl=this.gl,l=this.locs,g=p.g,b=g.b;gl.useProgram(this.program);
        gl.uniform2f(l.size,this.width,this.height);gl.uniform2f(l.center,g.c.x,g.c.y);gl.uniform2f(l.axis,g.axis.x,g.axis.y);
        gl.uniform4f(l.face,b.cx,b.cy,b.w*.72,b.h*.70);gl.uniform1f(l.halfW,g.half);gl.uniform1f(l.softness,clamp(g.half*.018,.9,2.8));
        for(let i=0;i<2;i++){const e=g.eyes[i];gl.uniform4f(l['eye'+i],e?e.x:0,e?e.y:0,e?e.w:0,e?e.h:0);}
        for(const key of ['drop','widthScale','smile','brow','blink','rotation'])gl.uniform1f(l[key],p[key]);
        gl.uniform3fv(l.dark,g.dark);gl.uniform2f(l.shift,p.tx,p.ty);
        gl.uniform1fv(l['top[0]'],g.top);gl.uniform1fv(l['bottom[0]'],g.bottom);
        gl.drawArrays(gl.TRIANGLES,0,6);ctx.drawImage(this.canvas,0,0);return;
      }
      this.renderCPU(p);
    }
    renderCPU(p){
      const g=p.g,b=g.b,rx=b.w*.72,ry=b.h*.70;
      const x0=clamp(Math.floor(b.cx-rx*1.07),0,this.width-1),y0=clamp(Math.floor(b.cy-ry*1.07),0,this.height-1);
      const w=Math.min(this.width-x0,Math.ceil(rx*2.14)),h=Math.min(this.height-y0,Math.ceil(ry*2.14));
      if(!this.frame||this.frame.width!==w||this.frame.height!==h)this.frame=ctx.createImageData(w,h);
      const out=this.frame.data,col=[0,0,0],tmp=[0,0,0],old=[0,0,0],oral=[0,0,0],softness=clamp(g.half*.018,.9,2.8);
      const curve=(a,t)=>{const f=clamp((t+1)*.5)*10,i=Math.min(9,Math.floor(f));return lerp(a[i],a[i+1],f-i);};
      for(let iy=0;iy<h;iy++)for(let ix=0;ix<w;ix++){
        const px=x0+ix+.5,py=y0+iy+.5;
        const weight=1-smooth(.64,1.05,Math.hypot((px-b.cx)/rx,(py-b.cy)/ry));
        const vx=px-b.cx-p.tx*weight,vy=py-b.cy-p.ty*weight,r=-p.rotation*weight;
        let qx=Math.cos(r)*vx-Math.sin(r)*vy+b.cx,qy=Math.sin(r)*vx+Math.cos(r)*vy+b.cy;
        for(const e of g.eyes){
          const amount=p.blink*(1-smooth(.55,1.18,Math.abs(qx-e.x)/e.w));
          const y=qy-e.y,target=e.h*(1-amount*.88);
          if(Math.abs(y)<target)qy=e.y+y/(1-amount*.88);
          else if(y<0)qy-=amount*e.h*.88*(1-smooth(e.h,e.h*4,Math.abs(y)));
          else qy+=amount*e.h*.40*(1-smooth(e.h,e.h*3,y));
        }
        qy+=p.brow*ry*.014*Math.exp(-(((qy-(b.cy-ry*.27))/(ry*.10))**2))*weight;
        const nx=-g.axis.y,ny=g.axis.x;
        const x=(qx-g.c.x)*g.axis.x+(qy-g.c.y)*g.axis.y,y=(qx-g.c.x)*nx+(qy-g.c.y)*ny;
        const lateral=1-smooth(1,1.55,Math.abs(x)/g.half),near=1-smooth(ry*.04,ry*.18,Math.abs(y));
        const sx=x/(1+(p.widthScale-1)*lateral*near),t=sx/g.half;
        const d=p.drop*Math.max(0,1-t*t)**.8,up=curve(g.top,t),lo=curve(g.bottom,t);
        const lift=p.smile*ry*.008*Math.min(1,Math.abs(t))**1.7*lateral,u=up-d*.06-lift,l=lo+d*.94-lift;
        let sy=y;
        if(y<=u)sy+=d*.06*Math.exp(-Math.abs(y-u)/(ry*.065))+lift*near;
        else if(y>=l)sy-=d*.94*Math.exp(-(y-l)/(ry*.42))-lift*near;
        this.sample(g.c.x+g.axis.x*sx+nx*sy,g.c.y+g.axis.y*sx+ny*sy,col);
        if(Math.abs(t)<1&&y>u&&y<l&&d>.001){
          const gap=Math.max(0,lo-up),height=Math.max(.001,l-u),delta=y-u;
          const keep=(1-smooth(Math.max(0,gap*.78),Math.max(.6,gap*.98),delta))*smooth(.6,2,gap);
          this.sample(g.c.x+g.axis.x*sx+nx*(up+delta),g.c.y+g.axis.y*sx+ny*(up+delta),tmp);
          for(let k=0;k<3;k++)oral[k]=lerp(g.dark[k]*(.82+.25*clamp(delta/height)),tmp[k],keep);
          const bottomKeep=(1-smooth(0,Math.max(.7,gap*.22),l-y))*smooth(1,3,gap);
          this.sample(g.c.x+g.axis.x*sx+nx*(lo-(l-y)),g.c.y+g.axis.y*sx+ny*(lo-(l-y)),tmp);
          const contact=Math.min(y-u,l-y),shadow=.68+.32*smooth(0,softness*1.5,contact),blend=smooth(0,2,d);
          this.sample(g.c.x+g.axis.x*sx+nx*(up+delta/height*gap),g.c.y+g.axis.y*sx+ny*(up+delta/height*gap),old);
          const edge=smooth(0,softness,contact)*smooth(0,.025,1-Math.abs(t));
          for(let k=0;k<3;k++){oral[k]=lerp(old[k],lerp(oral[k],tmp[k],bottomKeep)*shadow,blend);col[k]=lerp(col[k],oral[k],edge);}
        }
        const index=(iy*w+ix)*4;for(let k=0;k<3;k++)out[index+k]=Math.round(clamp(col[k])*255);out[index+3]=255;
      }
      ctx.putImageData(this.frame,x0,y0);
    }
  }

  function syncControls(){
    const photoReady=mode==='photo'&&photo,hasMedia=mode!=='idle',ready=photoReady&&geometry;
    for(const id of controls)$('#'+id).disabled=!hasMedia;
    $('#ffRevive').disabled=!ready;$('#ffVoice').disabled=!ready;$('#ffAudioBtn').disabled=!photoReady;
    $('#ffCalibrate').disabled=!photoReady;$('#ffCompare').disabled=!photoReady;
    $('#ffAudioPlay').disabled=!ready||!audioBuffer||audioLoading;
    $('#ffAudioClear').disabled=!audioBuffer&&!mic;
    $('#ffStop').disabled=!hasMedia&&!cameraLoading&&!photoLoading;
    $('#ffPhotoBtn').disabled=!$('#ffConsent').checked||!!recording||photoLoading||clipLoading;
    $('#ffStart').disabled=!!recording||cameraLoading||clipLoading;
    $('#ffClip').disabled=!hasMedia||(photoReady&&!geometry)||!!calibration||clipLoading;
    $('#ffShot').disabled=!hasMedia||!!calibration;
    $('#ffClip').textContent=recording?'■ encerrar gravação':'gravar clipe';
    for(const el of $$('#ffMood .chip'))el.disabled=!ready||!!recording;
    for(const el of $$('#ffFx .chip'))el.disabled=!hasMedia||(el.dataset.fx==='puppet'&&(mode!=='live'||!lm));
    if(recording||clipLoading){
      for(const id of ['ffCalibrate','ffCompare','ffVoice','ffAudioBtn','ffAudioPlay','ffAudioClear','ffRevive','ffMask'])$('#'+id).disabled=true;
      $('#ffMotion').disabled=true;$('#ffIntensity').disabled=true;$('#ffClipDuration').disabled=true;
    }else{$('#ffMotion').disabled=false;$('#ffIntensity').disabled=false;$('#ffClipDuration').disabled=false;}
    if(micLoading)$('#ffVoice').disabled=true;
    $('#ffRevive').classList.toggle('on',anim.on);$('#ffRevive').textContent=anim.on?'■ pausar animação':'▷ reviver';
    $('#ffCompare').classList.toggle('on',compare);$('#ffCompare').textContent=compare?'ver animação':'ver original';
    $('#ffVoice').classList.toggle('on',audioMode==='mic');$('#ffAudioPlay').classList.toggle('on',!!audioSource);
    $('#ffAudioPlay').textContent=audioSource?'■ parar áudio':'▷ tocar áudio';
  }
  function clearFX(){for(const k in fx)fx[k]=false;mask=null;$$('#ffFx .chip').forEach(e=>e.classList.remove('on'));}
  function releaseCamera(){if(camera)camera.getTracks().forEach(t=>t.stop());camera=null;video.srcObject=null;}
  function stopAudio(preserve=true){
    if(audioSource){const s=audioSource;audioSource=null;s.onended=null;try{s.stop();s.disconnect();}catch{}}
    if(mic)mic.getTracks().forEach(t=>t.stop());mic=null;analyser=null;tbuf=null;fbuf=null;
    if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}audioOut=null;
    audioMode=preserve&&audioBuffer?'file':'demo';audioLevel=0;anim.mouth=0;
    $('#ffAudioPlayer').hidden=!audioBuffer;
    if(!preserve){audioBuffer=null;audioName='';$('#ffAudioName').textContent='';$('#ffAudioPlayer').hidden=true;}
    syncControls();
  }
  function stop(){
    generation++;photoLoading=false;cameraLoading=false;audioLoading=false;micLoading=false;clipLoading=false;
    if(recording&&recording.state!=='inactive')recording.stop();
    running=false;cancelAnimationFrame(raf);raf=0;releaseCamera();stopAudio();
    if(renderer)renderer.dispose();renderer=null;photo=null;photoName='';lm=null;manual=null;geometry=null;
    mode='idle';anim.on=false;compare=false;calibration=null;clearFX();guide.hidden=true;
    ctx.clearRect(0,0,W,H);empty.hidden=false;stage.style.aspectRatio='4 / 3';
    setStatus('parado');message('Sessão encerrada. Câmera e microfone liberados. Carregue uma foto para iniciar.');syncControls();
  }
  function dimensions(w,h){W=cvs.width=guide.width=w;H=cvs.height=guide.height=h;stage.style.aspectRatio=w+' / '+h;}
  function beginLoop(){running=true;frameCount=0;fpsStart=performance.now();if(!raf)raf=requestAnimationFrame(loop);}

  async function startCamera(){
    if(cameraLoading||recording||clipLoading)return;
    stop();cameraLoading=true;const token=generation;syncControls();setStatus('abrindo câmera…');
    try{
      if(!navigator.mediaDevices||!window.isSecureContext)throw new Error('A câmera requer HTTPS ou localhost.');
      const s=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960}},audio:false});
      if(token!==generation){s.getTracks().forEach(t=>t.stop());return;}
      camera=s;video.srcObject=s;await video.play();
      if(token!==generation)return;
      if(!video.videoWidth)throw new Error('A câmera não forneceu quadros.');
      dimensions(video.videoWidth,video.videoHeight);mode='live';empty.hidden=true;
      setStatus('câmera ativa');message('Câmera ativa. Os efeitos de demonstração podem ser combinados.');
      beginLoop();syncControls();loadTracking(token);
    }catch(e){if(token===generation){releaseCamera();setStatus('câmera indisponível');message(e.message+' · Use o modo foto.');}}
    finally{if(token===generation){cameraLoading=false;syncControls();}}
  }
  async function loadPhoto(){
    const file=$('#ffPhotoInput').files[0];$('#ffPhotoInput').value='';
    if(!file||!$('#ffConsent').checked||recording||photoLoading||clipLoading)return;
    if(file.size>25*1024*1024){message('Escolha uma imagem de até 25 MB.');return;}
    photoLoading=true;syncControls();let url=null;const token=generation;
    try{
      url=URL.createObjectURL(file);
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Imagem não decodificável no navegador.'));i.src=url;});
      if(token!==generation||!$('#ffConsent').checked)return;
      if(img.naturalWidth*img.naturalHeight>100000000)throw new Error('Imagem muito grande; reduza para até 100 megapixels.');
      const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
      const source=document.createElement('canvas');source.width=Math.max(2,Math.round(img.naturalWidth*scale));source.height=Math.max(2,Math.round(img.naturalHeight*scale));
      const pc=source.getContext('2d',{willReadFrequently:true});pc.imageSmoothingQuality='high';pc.drawImage(img,0,0,source.width,source.height);
      stop();photo=source;photoName=file.name;dimensions(source.width,source.height);
      renderer=new PhotoRenderer(source);mode='photo';empty.hidden=true;guide.hidden=true;compare=false;
      setStatus('foto carregada');message('Foto '+photoName+' · '+W+'×'+H+' px. Localizando o rosto; você também pode usar “ajustar boca”.');
      $('#ffCalHint').textContent='Para fotos inclinadas ou sem tracking, marque os quatro pontos em “ajustar boca”.';
      beginLoop();syncControls();Terminal.log('[FORGE::FACE] foto carregada · '+renderer.kind+' · '+W+'×'+H,'ok');
      loadTracking(generation);
    }catch(e){message('Falha ao carregar: '+e.message);}
    finally{if(url)URL.revokeObjectURL(url);photoLoading=false;syncControls();}
  }

  async function ensureMesh(){
    if(fm)return fm;if(meshPromise)return meshPromise;
    meshPromise=(async()=>{
      if(!self.FaceMesh)await new Promise((resolve,reject)=>{
        const s=document.createElement('script');let timer;
        const finish=error=>{clearTimeout(timer);s.onload=null;s.onerror=null;if(error){s.remove();reject(error);}else resolve();};
        s.src='https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js';
        s.crossOrigin='anonymous';s.onload=()=>finish();s.onerror=()=>finish(new Error('Tracking indisponível.'));
        timer=setTimeout(()=>finish(new Error('Timeout no tracking.')),15000);document.head.appendChild(s);
      });
      fm=new self.FaceMesh({locateFile:f=>'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/'+f});
      fm.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:.5,minTrackingConfidence:.5});
      fm.onResults(result=>{
        if(meshGeneration!==generation)return;
        lm=result.multiFaceLandmarks&&result.multiFaceLandmarks[0]||null;
        if(mode==='photo'){
          if(!calibration)buildGeometry();
          if(!manual){
            if(geometry){setStatus(anim.on?'foto animada':'foto pronta');message('Rosto localizado. Ative “reviver”, use seu microfone ou carregue um áudio. Se o contorno estiver deslocado, ajuste a boca.');}
            else{setStatus('ajuste necessário');message('Nenhum rosto localizado. Use “ajustar boca” para marcar o contorno.');}
          }
        }
        syncControls();
      });
      return fm;
    })();
    try{return await meshPromise;}catch(e){meshPromise=null;if(fm){try{fm.close();}catch{}fm=null;}throw e;}
  }
  function sendMesh(token){
    const source=mode==='photo'?photo:video;
    meshSend=meshSend.catch(()=>{}).then(async()=>{
      if(token!==generation||!source||!fm)return;
      meshGeneration=token;await fm.send({image:source});
    });return meshSend;
  }
  async function loadTracking(token){
    try{
      await ensureMesh();if(token!==generation)return;
      if(mode==='photo'){await sendMesh(token);return;}
      if(tracking)return;tracking=true;
      try{while(running&&mode==='live'){const current=generation;await sendMesh(current);await sleep(60);}}
      finally{tracking=false;}
    }catch(e){if(token===generation){setStatus(manual?(anim.on?'foto animada':'foto pronta'):'tracking indisponível');
      message(manual?'Contorno manual ativo. O tracking automático não está disponível.':'O tracking não está disponível. No modo foto, use “ajustar boca”; a animação não usa posição estimada automaticamente.');Terminal.log('[FORGE::FACE] '+e.message,'warn');}}
  }

  const CAL_LABELS=['canto esquerdo da abertura da boca','canto direito da abertura da boca','centro da borda interna do lábio superior','centro da borda interna do lábio inferior'];
  function toggleCalibration(){
    if(mode!=='photo'||recording)return;
    if(calibration){calibration=null;guide.hidden=true;$('#ffCalibrate').classList.remove('on');syncControls();return;}
    calibration={points:[],resume:anim.on};anim.on=false;compare=false;stopPlayback();
    guide.hidden=false;$('#ffCalibrate').classList.add('on');guide.tabIndex=0;guide.focus();
    $('#ffCalHint').textContent='1/4 · Clique no '+CAL_LABELS[0]+'. Esc cancela; Backspace desfaz.';syncControls();
  }
  function calibrateAt(x,y){
    if(!calibration)return;
    calibration.points.push({x:clamp(x,0,W-1),y:clamp(y,0,H-1)});
    const points=calibration.points;
    if(points.length===4){
      const span=distance(points[0],points[1]),c=mid(points[0],points[1]);
      const normal={x:-(points[1].y-points[0].y)/span,y:(points[1].x-points[0].x)/span};
      const y1=(points[2].x-c.x)*normal.x+(points[2].y-c.y)*normal.y;
      const y2=(points[3].x-c.x)*normal.x+(points[3].y-c.y)*normal.y;
      if(span<8||points[1].x<=points[0].x||y2<y1-1||y2-y1>span*.55){
        calibration.points=[];$('#ffCalHint').textContent='Pontos inconsistentes. Recomece pelo canto esquerdo da abertura.';return;
      }
      const resume=calibration.resume;manual=points.slice();calibration=null;guide.hidden=true;$('#ffCalibrate').classList.remove('on');
      buildGeometry();if(resume)toggleRevive(true);setStatus(anim.on?'foto animada':'boca ajustada');
      message('Boca ajustada. Use intensidade baixa para preservar lábios, barba e textura.');syncControls();return;
    }
    $('#ffCalHint').textContent=(points.length+1)+'/4 · Clique no '+CAL_LABELS[points.length]+'. Esc cancela; Backspace desfaz.';
  }
  function drawGuide(){
    if(!calibration)return;gx.clearRect(0,0,W,H);gx.font=Math.max(15,W*.021)+'px monospace';
    const ps=calibration.points;
    if(ps.length>1){gx.beginPath();gx.moveTo(ps[0].x,ps[0].y);gx.lineTo(ps[1].x,ps[1].y);gx.strokeStyle='#4ee08d';gx.lineWidth=2;gx.stroke();}
    ps.forEach((p,i)=>{gx.beginPath();gx.arc(p.x,p.y,Math.max(4,W*.006),0,TAU);gx.fillStyle='#4ee08d';gx.fill();gx.fillText(String(i+1),p.x+10,p.y-8);});
  }

  function toggleRevive(force){
    if(mode!=='photo'||!geometry||calibration)return;
    anim.on=typeof force==='boolean'?force:!anim.on;
    if(anim.on){anim.t0=performance.now();anim.last=0;anim.mouth=0;anim.wide=0;anim.nextBlink=1.8;anim.blinkStart=-2;}
    else stopPlayback();
    setStatus(anim.on?'foto animada':'foto pausada');syncControls();
    message(anim.on?'Animação ativa. Ajuste a intensidade e compare com a foto. A boca responde à energia do áudio; não há reconhecimento de fonemas.':'Animação pausada. A imagem original está visível.');
  }
  async function ensureAudio(){
    if(!audioContext){
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)throw new Error('Web Audio indisponível.');
      audioContext=new Ctx();analyser=audioContext.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.15;
      audioOut=audioContext.createMediaStreamDestination();tbuf=new Float32Array(analyser.fftSize);fbuf=new Float32Array(analyser.frequencyBinCount);
    }
    await audioContext.resume();return audioContext;
  }
  function stopPlayback(){if(audioSource){const s=audioSource;audioSource=null;s.onended=null;try{s.stop();s.disconnect();}catch{}}syncControls();}
  async function toggleMic(){
    if(recording||clipLoading||micLoading||!geometry)return;
    if(audioMode==='mic'){stopAudio();message('Microfone encerrado.');return;}
    const token=generation;micLoading=true;syncControls();
    try{
      if(!navigator.mediaDevices||!window.isSecureContext)throw new Error('O microfone requer HTTPS ou localhost.');
      stopAudio();const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false}});
      if(token!==generation){s.getTracks().forEach(t=>t.stop());return;}
      mic=s;await ensureAudio();
      if(token!==generation){s.getTracks().forEach(t=>t.stop());return;}
      const source=audioContext.createMediaStreamSource(s);source.connect(analyser);source.connect(audioOut);
      audioMode='mic';noiseFloor=.008;peak=.05;audioStarted=audioContext.currentTime;if(!anim.on)toggleRevive(true);
      setStatus('foto + microfone');message('Fale ao microfone. A gravação inclui sua voz; o microfone não é reproduzido nos alto-falantes.');syncControls();
    }catch(e){if(token===generation){stopAudio();message('Microfone indisponível: '+e.message);}}
    finally{if(token===generation){micLoading=false;syncControls();}}
  }
  async function loadAudio(){
    const f=$('#ffAudioInput').files[0];$('#ffAudioInput').value='';if(!f||recording||audioLoading)return;
    if(f.size>30*1024*1024){message('Escolha um áudio de até 30 MB e 120 segundos.');return;}
    const token=generation;audioLoading=true;syncControls();
    try{
      stopAudio();await ensureAudio();const ac=audioContext;
      const buffer=await ac.decodeAudioData(await f.arrayBuffer());
      if(token!==generation)return;
      if(buffer.duration>120)throw new Error('Limite de 120 segundos por áudio.');
      audioBuffer=buffer;audioName=f.name;audioMode='file';$('#ffAudioPlayer').hidden=false;
      $('#ffAudioName').textContent=audioName+' · '+buffer.duration.toFixed(1)+' s';
      message('Áudio carregado. Use “tocar áudio” para prévia ou “gravar clipe” para iniciar do começo e exportar a fala.');
    }catch(e){if(token===generation)message('Falha no áudio: '+e.message);}
    finally{if(token===generation){audioLoading=false;syncControls();}}
  }
  async function playAudio(restart=false){
    if(!audioBuffer||!geometry)return;
    if(audioSource&&!restart){stopPlayback();return;}
    const token=generation;stopPlayback();
    try{
      if(mic){mic.getTracks().forEach(t=>t.stop());mic=null;}
      await ensureAudio();if(token!==generation)return;
      const source=audioContext.createBufferSource();source.buffer=audioBuffer;
      source.connect(analyser);source.connect(audioOut);source.connect(audioContext.destination);
      source.onended=()=>{if(audioSource===source){audioSource=null;anim.mouth=0;audioLevel=0;syncControls();}};
      audioSource=source;audioMode='file';peak=.05;source.start();audioStarted=audioContext.currentTime;
      if(!anim.on)toggleRevive(true);syncControls();setStatus('foto + áudio');
    }catch(e){if(token===generation)message('Não foi possível tocar o áudio: '+e.message);}
  }

  function updateAnimation(now){
    const t=(now-anim.t0)/1000,dt=clamp(t-anim.last,0,.07);anim.last=t;
    let target=0,wide=0;
    if((audioMode==='mic'||audioSource)&&analyser){
      analyser.getFloatTimeDomainData(tbuf);let sum=0;for(const v of tbuf)sum+=v*v;
      const rms=Math.sqrt(sum/tbuf.length);audioLevel=rms;
      if(audioMode==='mic'&&rms<Math.max(.016,noiseFloor*1.8))noiseFloor=lerp(noiseFloor,rms,1-Math.exp(-dt*1.2));
      const gate=audioMode==='mic'?Math.max(.006,noiseFloor*1.6):.003;
      peak=Math.max(.05,rms,peak*Math.exp(-dt*.18));
      const sensitivity=Number($('#ffSensitivity').value)/100;
      const voiced=Math.max(0,rms-gate);target=clamp(Math.sqrt(voiced/Math.max(.04,peak-gate))*.78*sensitivity);
      analyser.getFloatFrequencyData(fbuf);let low=0,high=0;
      for(let i=1;i<fbuf.length;i++){
        const f=i*audioContext.sampleRate/analyser.fftSize;if(f<180||f>4800)continue;
        const energy=Math.pow(10,fbuf[i]/20);if(f<1200)low+=energy;else high+=energy;
      }
      wide=target>.04?clamp((high/(low+high+1e-9)-.36)*1.1,-.35,.45):0;
    }else if(audioMode==='demo'){
      // Ritmo de demonstração; não é fala sintetizada nem sincronização fonética.
      const cycle=t%4.8;
      if(cycle<3){target=Math.max(0,Math.sin(TAU*2.5*cycle))*.46*(.75+.25*Math.sin(TAU*.6*cycle));wide=.22*Math.sin(TAU*.8*cycle)*target;}
      audioLevel=0;
    }
    anim.mouth=lerp(anim.mouth,target,1-Math.exp(-dt/(target>anim.mouth?.035:.065)));
    anim.wide=lerp(anim.wide,wide,1-Math.exp(-dt/.10));
    if(t>anim.nextBlink){anim.blinkStart=t;anim.nextBlink=t+2.6+Math.random()*2.3;}
    const bp=(t-anim.blinkStart)/.16;anim.blink=bp>=0&&bp<=1?Math.sin(Math.PI*bp):0;
    const moods={neutro:[0,0],sorriso:[.35,.08],surpresa:[0,.4],serio:[0,-.15],auto:[.08,.03]};
    const desired=moods[anim.mood]||moods.neutro;
    anim.smile=lerp(anim.smile,desired[0],1-Math.exp(-dt*3));anim.brow=lerp(anim.brow,desired[1],1-Math.exp(-dt*3));
    const intensity=Number($('#ffIntensity').value)/100,motion=$('#ffMotion').checked&&lm;
    return {g:geometry,drop:anim.mouth*geometry.b.h*.065*intensity,
      widthScale:1+anim.wide*.10*intensity+anim.smile*.035*intensity,
      smile:anim.smile*intensity,brow:motion?anim.brow*intensity:0,blink:motion?anim.blink:0,
      rotation:motion?.003*Math.sin(TAU*.22*t)*intensity:0,
      tx:motion?geometry.b.w*.002*Math.sin(TAU*.17*t)*intensity:0,
      ty:motion?geometry.b.h*.0015*Math.sin(TAU*.21*t)*intensity:0};
  }
  function watermark(){
    const fs=Math.max(11,Math.round(W*.018)),pad=Math.max(7,Math.round(W*.013));
    ctx.save();ctx.font='700 '+fs+'px monospace';ctx.textBaseline='bottom';
    const text='SINTÉTICO · SYNTH::DETECT · TESTE EDUCACIONAL';const tw=ctx.measureText(text).width;
    ctx.fillStyle='rgba(8,12,9,.72)';ctx.fillRect(pad-4,H-pad-fs-5,Math.min(tw+8,W-pad),fs+9);
    ctx.fillStyle='#ff8a82';ctx.fillText(text,pad,H-pad,W-pad*2);ctx.restore();
  }
  function applyEffects(){
    const b=boxForFace();
    if(fx.smooth){
      const tiny=document.createElement('canvas');tiny.width=Math.max(8,Math.round(b.w/10));tiny.height=Math.max(8,Math.round(b.h/10));
      tiny.getContext('2d').drawImage(cvs,b.x,b.y,b.w,b.h,0,0,tiny.width,tiny.height);
      ctx.save();ctx.beginPath();ctx.ellipse(b.cx,b.cy,b.w*.5,b.h*.5,0,0,TAU);ctx.clip();ctx.drawImage(tiny,b.x,b.y,b.w,b.h);ctx.restore();
    }
    if(fx.puppet&&mode==='live'&&lm){
      const c=mid(point(13),point(14)),open=clamp(distance(point(13),point(14))/b.h/.12);
      ctx.save();ctx.translate(c.x,c.y);ctx.scale(1+open*.35,1+open*.45);ctx.drawImage(video,c.x-b.w*.22,c.y-b.h*.12,b.w*.44,b.h*.24,-b.w*.22,-b.h*.12,b.w*.44,b.h*.24);ctx.restore();
    }
    if(fx.swap&&mask){
      ctx.save();ctx.translate(b.cx,b.cy);ctx.rotate(.018);ctx.globalAlpha=.88;ctx.drawImage(mask,-b.w*.515,-b.h*.515,b.w*1.03,b.h*1.03);ctx.restore();
    }
    if(fx.glitch&&Math.random()<.35){
      const y=b.y+Math.random()*b.h;ctx.drawImage(cvs,b.x,y,b.w,Math.max(1,b.h*.025),b.x+b.w*.03,y,b.w,Math.max(1,b.h*.025));
    }
  }
  function render(now){
    const source=mode==='photo'?photo:video;if(!source||!W)return;
    ctx.drawImage(source,0,0,W,H);
    if(mode==='photo'&&anim.on&&geometry&&!compare&&!calibration){renderer.render(updateAnimation(now));applyEffects();}
    else if(!compare&&!calibration)applyEffects();
    watermark();drawGuide();
  }
  function loop(now){
    raf=0;if(!running)return;
    try{render(now);}catch(e){anim.on=false;setStatus('animação interrompida');message('Falha de renderização: '+e.message);console.error(e);syncControls();}
    frameCount++;
    if(now-lastStats>600){
      const fps=frameCount*1000/Math.max(1,now-fpsStart);
      $('#ffMetrics').textContent=(mode==='photo'&&renderer?renderer.kind:'câmera')+' · '+W+'×'+H+' · '+Math.round(fps)+' fps';
      $('#ffMouthMeter').value=anim.on?anim.mouth:0;$('#ffAudioMeter').value=clamp(audioLevel*5);
      lastStats=now;frameCount=0;fpsStart=now;
    }
    raf=requestAnimationFrame(loop);
  }
  function freezeMask(){
    if(mode==='idle'||recording)return;const b=boxForFace();mask=document.createElement('canvas');mask.width=Math.max(2,Math.round(b.w));mask.height=Math.max(2,Math.round(b.h));
    mask.getContext('2d').drawImage(mode==='photo'?photo:video,b.x,b.y,b.w,b.h,0,0,mask.width,mask.height);
    fx.swap=true;$('#ffFx [data-fx="swap"]').classList.add('on');message('Enxerto da própria face aplicado. Para maior naturalidade, desligue os efeitos de demonstração.');
  }
  function shot(){
    if(mode==='idle'||calibration)return;const was=compare;compare=false;render(performance.now());compare=was;
    cvs.toBlob(blob=>{if(blob)ForgeArtifacts.add(blob,'forge_quadro_'+(++sequence)+'.png','image');},'image/png');
  }
  async function clip(){
    if(recording){if(recording.state!=='inactive')recording.stop();return;}
    if(clipLoading||mode==='idle'||calibration||mode==='photo'&&!geometry)return;
    if(!cvs.captureStream||!window.MediaRecorder){message('Gravação não suportada neste navegador. A captura de quadro continua disponível.');return;}
    const token=generation;clipLoading=true;syncControls();
    try{
      compare=false;if(mode==='photo'&&!anim.on)toggleRevive(true);
      if(audioBuffer&&audioMode==='file')await playAudio(true);
      if(token!==generation)return;
      render(performance.now());
      const videoStream=cvs.captureStream(30),audioTrack=audioOut&&(audioSource||mic)?audioOut.stream.getAudioTracks()[0]:null;
      const tracks=[...videoStream.getVideoTracks()];if(audioTrack)tracks.push(audioTrack.clone());
      const stream=new MediaStream(tracks);
      const mimes=audioTrack?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4','video/webm']:
        ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4','video/webm'];
      const mime=mimes.find(m=>MediaRecorder.isTypeSupported(m));
      let r;try{r=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:clamp(W*H*30*.15,2000000,12000000),audioBitsPerSecond:128000});}
      catch(e){tracks.forEach(t=>t.stop());throw e;}
      const chunks=[],duration=Number($('#ffClipDuration').value)||5;recording=r;
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      r.onerror=e=>{message('Falha na gravação: '+(e.error&&e.error.message||'erro de codec'));if(r.state!=='inactive')r.stop();};
      r.onstop=()=>{
        clearTimeout(recordTimer);tracks.forEach(t=>t.stop());if(recording===r)recording=null;
        if(chunks.length){const type=r.mimeType||mime||'video/webm',blob=new Blob(chunks,{type});
          ForgeArtifacts.add(blob,'forge_clipe_'+(++sequence)+(type.includes('mp4')?'.mp4':'.webm'),'video');
          Terminal.log('[FORGE::FACE] clipe '+(audioTrack?'com áudio':'sem áudio')+' · '+fmtBytes(blob.size),'ok');}
        if(audioMode==='file')stopPlayback();
        setStatus(mode==='idle'?'parado':anim.on?'foto animada':'sessão pronta');syncControls();
      };
      try{r.start(250);}catch(e){tracks.forEach(t=>t.stop());recording=null;throw e;}
      recordTimer=setTimeout(()=>{if(r.state!=='inactive')r.stop();},duration*1000);
      setStatus('gravando '+duration+' s');syncControls();
    }catch(e){message('Não foi possível gravar: '+e.message);}
    finally{if(token===generation){clipLoading=false;syncControls();}}
  }
  function init(){
    $('#ffStart').addEventListener('click',startCamera);$('#ffStop').addEventListener('click',stop);
    empty.addEventListener('click',()=>{if($('#ffConsent').checked)$('#ffPhotoInput').click();else message('Confirme o consentimento para carregar a foto, ou use “câmera”.');});
    empty.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();empty.click();}});
    $('#ffConsent').addEventListener('change',()=>{if(!$('#ffConsent').checked&&mode==='photo')stop();syncControls();});
    $('#ffPhotoBtn').addEventListener('click',()=>$('#ffPhotoInput').click());$('#ffPhotoInput').addEventListener('change',loadPhoto);
    $('#ffRevive').addEventListener('click',()=>toggleRevive());$('#ffVoice').addEventListener('click',toggleMic);
    $('#ffAudioBtn').addEventListener('click',()=>$('#ffAudioInput').click());$('#ffAudioInput').addEventListener('change',loadAudio);
    $('#ffAudioPlay').addEventListener('click',()=>playAudio());$('#ffAudioClear').addEventListener('click',()=>{stopAudio(false);message('Áudio removido; demonstração procedural disponível.');});
    $('#ffCalibrate').addEventListener('click',toggleCalibration);
    guide.addEventListener('pointerdown',e=>{if(!calibration)return;const r=guide.getBoundingClientRect();calibrateAt((e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height);});
    guide.addEventListener('keydown',e=>{if(e.key==='Escape')toggleCalibration();else if(e.key==='Backspace'&&calibration){e.preventDefault();calibration.points.pop();$('#ffCalHint').textContent=(calibration.points.length+1)+'/4 · Clique no '+CAL_LABELS[calibration.points.length]+'.';}});
    $('#ffCompare').addEventListener('click',()=>{compare=!compare;$('#ffCompare').textContent=compare?'ver animação':'ver original';syncControls();});
    $('#ffIntensity').addEventListener('input',()=>{$('#ffIntensityValue').textContent=$('#ffIntensity').value+'%';});
    $('#ffSensitivity').addEventListener('input',()=>{$('#ffSensitivityValue').textContent=(Number($('#ffSensitivity').value)/100).toFixed(1)+'×';});
    for(const b of $$('#ffMood .chip'))b.addEventListener('click',()=>{anim.mood=b.dataset.mood;$$('#ffMood .chip').forEach(e=>e.classList.toggle('on',e===b));});
    for(const b of $$('#ffFx .chip'))b.addEventListener('click',()=>{
      const k=b.dataset.fx;if(k==='swap'&&!mask){message('Use “congelar máscara” primeiro.');return;}
      fx[k]=!fx[k];b.classList.toggle('on',fx[k]);
    });
    $('#ffMask').addEventListener('click',freezeMask);$('#ffShot').addEventListener('click',shot);$('#ffClip').addEventListener('click',clip);
    window.addEventListener('pagehide',()=>{stop();});syncControls();
  }
  return {init};
})();


/* ═══════════════════════════════════════════════════════════════
   APP — orquestração da bancada de DETECÇÃO
   (+ submitBlob: a FORGE injeta artefatos direto no pipeline)
════════════════════════════════════════════════════════════════ */
const App = (() => {
  const dz = $('#dropzone'), input = $('#fileInput');
  const evidence = $('#evidence'), evPreview = $('#evPreview');
  const evImg = $('#evImg'), evNo = $('#evNoPreview'), evFacts = $('#evFacts');
  const evMediaWrap = $('#evMediaWrap'), evMedia = $('#evMedia');
  const evVizWrap = $('#evVizWrap'), evViz = $('#evViz');
  const btnRescan = $('#btnRescan'), btnReset = $('#btnReset');
  const verdictEl = $('#verdict');
  const modEls = $$('.mod');
  const IMG_EXTS = ['jpg','jpeg','png','webp','gif','bmp','heic','heif','avif','tif','tiff'];
  const AUD_EXTS = ['wav','wave','mp3','flac','ogg','oga','opus','m4a','m4b','m4r','amr','aiff','aif','wma','asf'];
  const VID_EXTS = ['mp4','m4v','mov','qt','mkv','webm','avi','divx','flv','f4v','ts','m2ts','mts','mpg','mpeg','vob','3gp','3g2','ogv','wmv'];

  const MODULES = {
    image: [
      { icon:'photo',    name:'Estrutura binária' },
      { icon:'tag',      name:'EXIF / metadados' },
      { icon:'shield',   name:'Proveniência C2PA' },
      { icon:'bot',      name:'Assinaturas & pixels' }
    ],
    audio: [
      { icon:'cassette', name:'Contêiner & codec' },
      { icon:'tag',      name:'Metadados & encoder' },
      { icon:'wave',     name:'Análise acústica' },
      { icon:'bot',      name:'Assinaturas de IA' }
    ],
    video: [
      { icon:'film',     name:'Contêiner & pistas' },
      { icon:'tag',      name:'Metadados & encoder' },
      { icon:'film',     name:'Quadros & trilha' },
      { icon:'bot',      name:'Assinaturas de IA' }
    ]
  };
  const ST = { idle:'aguardando', run:'executando', ok:'concluído', warn:'atenção', alert:'alerta', nodata:'indisponível' };

  let currentFile = null, currentMode = 'image', busy = false, dragDepth = 0, mediaUrl = null;
  let viz = null, rafOn = false, lastFrames = null;

  const emit = async (text, status) => {
    Terminal.log(text, status);
    if (CONFIG.logPacingMs) await sleep(CONFIG.logPacingMs);
  };

  function setMediaMode(mode){
    currentMode = mode;
    MODULES[mode].forEach((def, i) => {
      modEls[i].innerHTML =
        '<span class="pixel-icon icon-pixel-' + def.icon + '" style="--icon-size:20px" aria-hidden="true"></span>' +
        '<span class="mod-id"><b>0' + (i + 1) + '</b><span>' + def.name + '</span></span>' +
        '<span class="mod-state">aguardando</span>';
    });
    PixelArt.mountAll();
  }

  function setStage(i, state){
    const m = modEls[i];
    if (!m) return;
    m.dataset.state = state;
    m.querySelector('.mod-state').textContent = ST[state] || state;
  }
  const resetStages = () => modEls.forEach((_, i) => setStage(i, 'idle'));

  function shake(){
    dz.classList.remove('shake'); void dz.offsetWidth; dz.classList.add('shake');
  }

  /* ── visualizações ── */
  function makeWaveSpec(ac, W, waveH, specH, dpr){
    const spec = document.createElement('canvas');
    spec.width = W; spec.height = specH;
    const sctx = spec.getContext('2d');
    const img = sctx.createImageData(W, specH);
    const { specCols, specRows } = ac;
    for (let y = 0; y < specH; y++){
      const row = Math.min(specRows - 1, Math.floor((1 - y / specH) * specRows));
      for (let x = 0; x < W; x++){
        const col = Math.min(specCols - 1, Math.floor(x / W * ac.specCols));
        const v = ac.spec[row * specCols + col];
        const p = (y * W + x) * 4;
        img.data[p] = 10 + v * 58; img.data[p+1] = 18 + v * 206; img.data[p+2] = 12 + v * 125; img.data[p+3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    const wave = document.createElement('canvas');
    wave.width = W; wave.height = waveH;
    const wctx = wave.getContext('2d');
    wctx.strokeStyle = 'rgba(78,224,141,.85)';
    wctx.lineWidth = Math.max(1, dpr);
    const half = waveH / 2 - 2 * dpr;
    for (let x = 0; x < W; x++){
      const c = Math.min(ac.specCols - 1, Math.floor(x / W * ac.specCols));
      const mn = ac.peaks[c * 2] / ac.peakNorm, mx = ac.peaks[c * 2 + 1] / ac.peakNorm;
      wctx.beginPath();
      wctx.moveTo(x + .5, half - mx * half);
      wctx.lineTo(x + .5, half - mn * half);
      wctx.stroke();
    }
    return { wave, spec };
  }

  function renderVideoViz(fr, ac){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(240, Math.floor((evViz.clientWidth || 600) * dpr));
    const H = Math.floor(262 * dpr);
    evViz.width = W; evViz.height = H;
    const filmH = ac && ac.ok ? Math.floor(126 * dpr) : H;
    const film = document.createElement('canvas');
    film.width = W; film.height = filmH;
    const fctx = film.getContext('2d');
    fctx.fillStyle = '#080c09'; fctx.fillRect(0, 0, W, filmH);
    const n = fr.frames.length, slot = W / n, thH = filmH - 16 * dpr;
    const elas = fr.frames.map(f => f.ela);
    const eMin = Math.min(...elas), eMax = Math.max(...elas);
    fr.frames.forEach((f, i) => {
      const x = i * slot + 3 * dpr, w = slot - 6 * dpr;
      const scale = Math.min(w / f.thumb.width, thH / f.thumb.height);
      const dw = f.thumb.width * scale, dh = f.thumb.height * scale;
      fctx.drawImage(f.thumb, x + (w - dw) / 2, (thH - dh) / 2, dw, dh);
      fctx.strokeStyle = 'rgba(43,58,48,.9)'; fctx.lineWidth = dpr;
      fctx.strokeRect(x, 0, w, thH);
      const norm = eMax > eMin ? (f.ela - eMin) / (eMax - eMin) : 0.5;
      fctx.fillStyle = 'rgb(' + Math.round(78 + norm * 177) + ',' + Math.round(224 - norm * 129) + ',' + Math.round(141 - norm * 85) + ')';
      fctx.fillRect(x, thH + 4 * dpr, w, 6 * dpr);
    });
    let wave = null, spec = null, waveH = 0;
    if (ac && ac.ok){
      waveH = Math.floor(36 * dpr);
      const ws = makeWaveSpec(ac, W, waveH, H - filmH - waveH, dpr);
      wave = ws.wave; spec = ws.spec;
    }
    viz = { kind:'video', fr, ac: ac && ac.ok ? ac : null, film, wave, spec, W, H, dpr, filmH, waveH };
    $('#vizCapL').textContent = 'filmstrip · ' + n + ' quadros · barra = ELA por quadro' +
      (viz.ac ? ' + onda/espectrograma da trilha' : '');
    evVizWrap.hidden = false;
    drawViz(evMedia.currentTime || 0);
  }

  function renderAudioViz(ac){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(240, Math.floor((evViz.clientWidth || 600) * dpr));
    const H = Math.floor(262 * dpr);
    evViz.width = W; evViz.height = H;
    const waveH = Math.floor(74 * dpr);
    const ws = makeWaveSpec(ac, W, waveH, H - waveH, dpr);
    viz = { kind:'audio', ac, wave: ws.wave, spec: ws.spec, W, H, dpr, waveH };
    $('#vizCapL').textContent = 'onda + espectrograma' + (ac.capped ? ' · primeiros ' + CONFIG.acousticsMaxSec + ' s' : '');
    evVizWrap.hidden = false;
    drawViz(evMedia.currentTime || 0);
  }

  function drawViz(t){
    if (!viz) return;
    const ctx = evViz.getContext('2d');
    const { W, H, dpr } = viz;
    ctx.fillStyle = '#080c09'; ctx.fillRect(0, 0, W, H);
    const dur = viz.kind === 'video' ? viz.fr.duration : viz.ac.duration;
    if (viz.kind === 'video'){
      ctx.drawImage(viz.film, 0, 0);
      if (viz.wave){
        ctx.drawImage(viz.wave, 0, viz.filmH);
        ctx.drawImage(viz.spec, 0, viz.filmH + viz.waveH);
        ctx.strokeStyle = 'rgba(43,58,48,.9)'; ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.moveTo(0, viz.filmH); ctx.lineTo(W, viz.filmH); ctx.stroke();
      }
    } else {
      ctx.drawImage(viz.wave, 0, 0);
      ctx.drawImage(viz.spec, 0, viz.waveH);
      ctx.strokeStyle = 'rgba(43,58,48,.9)'; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(0, viz.waveH); ctx.lineTo(W, viz.waveH); ctx.stroke();
    }
    if (viz.ac && viz.ac.shelfHz && viz.ac.sr){
      const top = viz.kind === 'video' ? viz.filmH + viz.waveH : viz.waveH;
      const sh = H - top;
      const y = top + Math.max(2 * dpr, (1 - viz.ac.shelfHz / (viz.ac.sr / 2)) * sh);
      ctx.strokeStyle = 'rgba(255,95,86,.8)';
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff5f56';
      ctx.font = (9 * dpr) + 'px "JetBrains Mono", monospace';
      ctx.fillText('corte ~' + (viz.ac.shelfHz / 1000).toFixed(1) + ' kHz', 6 * dpr, y - 4 * dpr);
    }
    const steps = [1,2,5,10,15,30,60,120,300,600];
    const step = steps.find(s => dur / s <= 12) || 600;
    ctx.font = (9 * dpr) + 'px "JetBrains Mono", monospace';
    ctx.fillStyle = '#5c6a60';
    ctx.strokeStyle = 'rgba(43,58,48,.5)';
    for (let s = step; s < dur; s += step){
      const x = Math.round(s / dur * W) + .5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillText(fmtTime(s), x + 3 * dpr, H - 4 * dpr);
    }
    const x = Math.min(W - 1, (t / (dur || 1)) * W);
    ctx.strokeStyle = '#8effc0'; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  function vizLoop(){
    if (!rafOn) return;
    if (!evMedia.paused){ drawViz(evMedia.currentTime); requestAnimationFrame(vizLoop); }
    else { rafOn = false; drawViz(evMedia.currentTime); }
  }

  /* ── fichas ── */
  function renderFacts(R, file){
    const rows = [];
    const push = (k, v) => rows.push([k, v]);
    push('Arquivo', esc(file.name));
    push('Tipo declarado', esc(file.type || 'não declarado'));
    push('Formato real', esc(R.structure.format) + (R.facts.extOk === false ? ' <span class="bad">· extensão divergente</span>' : ''));
    push('Tamanho', esc(fmtBytes(R.facts.size)));

    if (R.mode === 'image'){
      const dims = R.structure.dims || R.facts.naturalDims;
      if (dims){
        push('Resolução', dims.w + '×' + dims.h + ' px');
        const g = gcd(dims.w, dims.h);
        if (g > 1) push('Proporção', (dims.w / g) + ':' + (dims.h / g));
        push('Densidade', ((R.facts.size * 8) / (dims.w * dims.h)).toFixed(2) + ' bits/px');
      }
      if (R.elaGrid) push('ELA (Q85)', R.elaGrid.med.toFixed(1) + ' med · máx ' + R.elaGrid.max.toFixed(1) + ' · ' + R.elaGrid.hot + '/144 células quentes');
    }
    else if (R.mode === 'audio'){
      const AC = R.acoustics || {}, S = R.structure;
      const dur = AC.ok ? AC.duration : S.claimedDuration;
      push('Codec', esc(S.codec || '—'));
      if (dur) push('Duração', fmtTime(dur));
      if (AC.ok){
        push('Amostragem', (AC.sr / 1000).toFixed(1) + ' kHz decodificado');
        push('Canais', AC.channels);
        push('Bitrate', Math.round(R.facts.size * 8 / AC.duration / 1000) + ' kbps (médio)');
        push('Piso de ruído', AC.noiseFloorDb.toFixed(1) + ' dB');
        push('Banda efetiva', AC.bandwidthHz + ' Hz' + (AC.shelfHz ? ' <span class="bad">· shelf ≈ ' + (AC.shelfHz / 1000).toFixed(1) + ' kHz</span>' : ''));
        if (AC.f0) push('F0 mediano', AC.f0.median.toFixed(0) + ' Hz · CV ' + AC.f0.cv.toFixed(3));
      }
    }
    else {
      const S = R.structure, F = R.frames, AC = R.acoustics, P = S.probe;
      const vtrk = P && P.tracks.find(t => t.hdlr === 'vide');
      const atrk = P && P.tracks.find(t => t.hdlr === 'soun');
      if (P && (vtrk || atrk)){
        push('Codecs', esc([vtrk, atrk].filter(Boolean).map(t =>
          (t.hdlr === 'vide' ? 'vídeo: ' : 'áudio: ') + (t.formats || []).join('+')).join(' · ') || '—'));
      } else if (S.vCodecs || S.aCodecs)
        push('Codecs', esc((S.vCodecs || []).join('/') + ' + ' + (S.aCodecs || []).join('/')));
      else if (S.tracks){
        const v = S.tracks.find(t => t.fccType === 'vids');
        const a = S.tracks.find(t => t.fccType === 'auds');
        push('Handlers', esc([v && ('vídeo: ' + v.fccHandler), a && 'áudio'].filter(Boolean).join(' · ')));
      }
      const dims = S.dims || (F && F.ok ? { w: F.w, h: F.h } : null);
      if (dims) push('Resolução', dims.w + '×' + dims.h + ' px' + (!S.dims && F && F.ok ? ' <span class="mono-dim">(decodificada)</span>' : ''));
      const dur = S.duration || (F && F.ok ? F.duration : null);
      if (dur){
        push('Duração', fmtTime(dur));
        push('Bitrate', Math.round(R.facts.size * 8 / dur / 1000) + ' kbps (total)');
      }
      if (S.fps) push('Taxa de quadros', S.fps.toFixed(2) + ' fps (avih)');
      if (S.totalFrames) push('Quadros (avih)', S.totalFrames.toLocaleString('pt-BR'));
      if (P && P.creationDate) push('Criado (contêiner)', P.creationDate.toLocaleString('pt-BR'));
      if (P) push('Pistas', P.tracks.filter(t => t.hdlr === 'vide').length + ' vídeo · ' +
                   P.tracks.filter(t => t.hdlr === 'soun').length + ' áudio');
      if (F && F.ok) push('ELA médio', F.elaMean.toFixed(2) + ' · CV ' + F.elaCV.toFixed(3));
      if (AC && AC.ok){
        push('Trilha · ruído', AC.noiseFloorDb.toFixed(1) + ' dB');
        push('Trilha · banda', AC.bandwidthHz + ' Hz' + (AC.shelfHz ? ' <span class="bad">· shelf ≈ ' + (AC.shelfHz / 1000).toFixed(1) + ' kHz</span>' : ''));
        if (AC.f0) push('Trilha · F0', AC.f0.median.toFixed(0) + ' Hz · CV ' + AC.f0.cv.toFixed(3));
      }
    }
    push('Modificado', new Date(file.lastModified).toLocaleString('pt-BR'));
    if (R.hash) push('SHA-256', '<span class="mono-dim">' + esc(R.hash.slice(0, 32)) + '…</span>');
    evFacts.innerHTML = rows.map(r => '<div class="ev-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('');
  }

  function renderVerdict(R){
    const v = R.verdict;
    const ARROW = { syn:['▲','s-syn'], auth:['▼','s-auth'], info:['•','s-info'] };
    verdictEl.className = 'verdict v-' + v.cls;
    verdictEl.innerHTML =
      '<span class="v-stamp">' + v.copy.stamp + '</span>' +
      '<p class="v-main">' + v.copy.line + '</p>' +
      '<div class="v-kv"><span>Proveniência C2PA</span><b>' + v.provenance + '</b></div>' +
      '<div class="v-kv"><span>Escore heurístico</span><b>' + (v.score > 0 ? '+' : '') + v.score + '</b></div>' +
      '<div class="v-signals">' + v.signals.map(s => {
        const a = ARROW[s.dir];
        const w = s.dir === 'auth' ? '−' + s.weight : s.dir === 'syn' && s.weight ? '+' + s.weight : '0';
        return '<div class="v-sig ' + a[1] + '"><span class="v-arrow">' + a[0] +
               '</span><span class="v-lbl">' + esc(s.label) + '</span><span class="v-w">' + w + '</span></div>';
      }).join('') + '</div>' +
      '<p class="v-note">Heurística de arquivo, quadro e sinal — não substitui perícia nem modelos treinados. ' +
      'Sinais ▲ pesam a favor de síntese; ▼ a favor de captura autêntica; • são informativos.</p>';
    verdictEl.hidden = false;
  }

  /* ── fluxo principal ── */
  async function handleFile(file, via){
    if (busy){ Terminal.log('análise em andamento — aguarde a conclusão', 'warn'); return; }
    if (!file || file.size === 0) return;

    const ext = extOf(file.name);
    const isImg = (file.type && file.type.startsWith('image/')) || IMG_EXTS.includes(ext);
    const isAud = (file.type && file.type.startsWith('audio/'))  || AUD_EXTS.includes(ext);
    const isVid = (file.type && file.type.startsWith('video/'))  || VID_EXTS.includes(ext);
    if (!isImg && !isAud && !isVid){
      Terminal.section('ENTRADA REJEITADA');
      Terminal.log('"' + file.name + '" não parece ser imagem, áudio ou vídeo (tipo: ' + (file.type || 'desconhecido') + ')', 'err');
      shake(); return;
    }
    if (isVid && file.size > CONFIG.maxVideoMB * 1024 * 1024){
      Terminal.section('ENTRADA REJEITADA');
      Terminal.log('vídeo acima de ' + CONFIG.maxVideoMB + ' MB — teto de memória do processamento local', 'err');
      shake(); return;
    }
    if (isAud && !isVid && file.size > CONFIG.maxAudioMB * 1024 * 1024){
      Terminal.section('ENTRADA REJEITADA');
      Terminal.log('áudio acima de ' + CONFIG.maxAudioMB + ' MB — teto de memória do processamento local', 'err');
      shake(); return;
    }

    busy = true;
    const t0 = performance.now();
    currentFile = file;
    lastFrames = null;
    btnRescan.disabled = true;
    dz.hidden = true;
    evidence.hidden = false;
    verdictEl.hidden = true;
    evVizWrap.hidden = true;
    viz = null;
    Terminal.clear();

    Terminal.section('EVIDÊNCIA · ' + file.name);
    Terminal.log('origem da entrada: ' +
      ({ drop:'arrastar e soltar', paste:'área de transferência', picker:'seletor de arquivos',
         're-run':'reanálise manual', forge:'bancada ofensiva — loop sintetizar → detectar' }[via] || 'manual'), 'plain');
    const rBar = Terminal.progress('lendo arquivo do disco');
    let buffer;
    try { buffer = await ForensicCore.readFile(file, (l, t) => rBar.update(l, t)); }
    catch (e){ rBar.end(); Terminal.log('falha na leitura: ' + e.message, 'err'); busy = false; btnRescan.disabled = false; return; }
    rBar.end();
    const readMs = Math.round(performance.now() - t0);
    Terminal.log(fmtBytes(file.size) + ' lidos em ' + readMs + ' ms', 'ok');

    const hint = isVid ? 'video' : isAud ? 'audio' : 'image';
    const dv = new DataView(buffer);
    const sniff = ForensicCore.sniffMedia(dv, buffer.byteLength, hint);
    const mode = sniff ? sniff.media : hint;
    if (mode !== hint)
      Terminal.log('roteamento: conteúdo real é ' + (mode === 'video' ? 'VÍDEO' : mode === 'audio' ? 'ÁUDIO' : 'IMAGEM') +
                   ' — pipeline ajustado pela assinatura de bytes, não pela extensão', 'warn');
    setMediaMode(mode);
    resetStages();

    let ioDims = null, ioImageEl = null;
    evImg.hidden = true; evNo.hidden = true;
    if (mode === 'image'){
      evPreview.hidden = false;
      evMediaWrap.hidden = true;
      if (mediaUrl){ URL.revokeObjectURL(mediaUrl); mediaUrl = null; }
      try {
        const dataUrl = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(new Error('erro de leitura'));
          fr.readAsDataURL(file);
        });
        const img = await new Promise(res => {
          const i = new Image();
          i.onload = () => res(i); i.onerror = () => res(null); i.src = dataUrl;
        });
        if (img){
          evImg.src = dataUrl; evImg.hidden = false;
          ioDims = { w: img.naturalWidth, h: img.naturalHeight };
          ioImageEl = img;
          await emit('preview decodificado: ' + ioDims.w + '×' + ioDims.h + ' px', 'ok');
        } else { evNo.hidden = false; await emit('formato não decodificável — a análise estrutural continua', 'warn'); }
      } catch { evNo.hidden = false; await emit('falha ao gerar preview — a análise estrutural continua', 'warn'); }
    } else {
      evPreview.hidden = true;
      evMediaWrap.hidden = false;
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      mediaUrl = URL.createObjectURL(file);
      evMedia.src = mediaUrl;
      await emit('player pronto (object URL) — decodificação e DSP seguem abaixo', 'plain');
    }

    let report;
    try {
      report = await ForensicCore.runPipeline(file, {
        emit, onStage: setStage,
        progressBar: Terminal.progress,
        section: Terminal.section,
        arrayBuffer: buffer, readMs, sniff, mode,
        naturalDims: ioDims,
        elaImg: ioImageEl,
        elaGrid: ioImageEl ? PixelLab.elaGrid : null,
        getFrames: mode === 'video'
          ? async () => {
              const fr = await VideoLab.extract(file, emit, Terminal.progress);
              lastFrames = fr;
              if (!fr.ok) return { ok: false, why: fr.why };
              const elas = fr.frames.map(f => f.ela);
              const em = elas.reduce((a, b) => a + b, 0) / elas.length;
              const ecv = Math.sqrt(elas.reduce((a, b) => a + (b - em) * (b - em), 0) / elas.length) / (em || 1);
              return { ok: true, w: fr.w, h: fr.h, duration: fr.duration,
                       frames: fr.frames.map(f => ({ t: f.t, ela: f.ela, elaP95: f.elaP95 })),
                       elaMean: em, elaCV: ecv,
                       p95Mean: fr.frames.reduce((a, f) => a + f.elaP95, 0) / fr.frames.length,
                       activityMean: fr.activityMean, activityCV: fr.activityCV };
            }
          : undefined
      });
    } catch (err){
      console.error(err);
      Terminal.section('FALHA');
      Terminal.log('erro durante a análise: ' + err.message, 'err');
      busy = false; btnRescan.disabled = false; return;
    }

    if (report.mode === 'audio' && report.acoustics && report.acoustics.ok)
      renderAudioViz(report.acoustics);
    if (report.mode === 'video' && lastFrames && lastFrames.ok)
      renderVideoViz(lastFrames, report.acoustics);
    renderFacts(report, file);
    renderVerdict(report);

    Terminal.section('VEREDITO');
    Terminal.log(report.verdict.copy.stamp + ' — escore heurístico ' +
      (report.verdict.score > 0 ? '+' : '') + report.verdict.score,
      report.verdict.cls === 'bad' ? 'err' : (report.verdict.cls === 'ok' ? 'ok' : 'warn'));
    Terminal.log('proveniência C2PA: ' + report.verdict.provenance, report.c2pa && report.c2pa.found ? 'ok' : 'plain');
    Terminal.log('4 módulos concluídos em ' + (performance.now() - t0).toFixed(0) +
                 ' ms · detalhes na ficha (esquerda) e no painel de sinais', 'plain');

    busy = false; btnRescan.disabled = false;
  }

  /* injeção de artefatos da FORGE no pipeline de detecção */
  function submitBlob(blob, name){
    const f = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    $('#workbench').scrollIntoView({ behavior: 'smooth', block: 'start' });
    handleFile(f, 'forge');
  }

  function reset(){
    currentFile = null;
    viz = null; rafOn = false; lastFrames = null;
    if (mediaUrl){ URL.revokeObjectURL(mediaUrl); mediaUrl = null; }
    evMedia.pause(); evMedia.removeAttribute('src');
    dz.hidden = false;
    evidence.hidden = true;
    verdictEl.hidden = true;
    evVizWrap.hidden = true;
    evImg.removeAttribute('src');
    setMediaMode('image');
    resetStages();
    bootLog();
  }

  function bootLog(){
    Terminal.clear();
    Terminal.section('SYNTH::DETECT — BANCADA FORENSE v7.0');
    Terminal.log('pipeline imagem: estrutura → EXIF → C2PA → ELA + assinaturas de IA', 'plain');
    Terminal.log('pipeline áudio: contêiner → metadados → acústica (STFT/F0) → assinaturas', 'plain');
    Terminal.log('pipeline vídeo: contêiner/pistas → metadados → quadros (ELA) + trilha → assinaturas', 'plain');
    Terminal.log('bancada ofensiva: conversão de voz + animação com textura fotográfica, calibração e áudio — v7.0', 'plain');
    Terminal.log('processamento 100% local · nenhum byte sai do navegador', 'plain');
    Terminal.log('aguardando evidência — arraste uma mídia, cole com Ctrl+V ou gere uma na bancada ofensiva', 'run');
  }

  function init(){
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => {
      if (input.files[0]) handleFile(input.files[0], 'picker');
      input.value = '';
    });
    document.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; dz.classList.add('is-drag'); });
    document.addEventListener('dragover',  e => e.preventDefault());
    document.addEventListener('dragleave', e => {
      e.preventDefault();
      if (--dragDepth <= 0){ dragDepth = 0; dz.classList.remove('is-drag'); }
    });
    document.addEventListener('drop', e => {
      e.preventDefault();
      dragDepth = 0; dz.classList.remove('is-drag');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f, 'drop');
    });
    document.addEventListener('paste', e => {
      const items = [...((e.clipboardData && e.clipboardData.items) || [])];
      const it = items.find(i => i.type.startsWith('image/') || i.type.startsWith('audio/') || i.type.startsWith('video/'));
      if (it){ const f = it.getAsFile(); if (f) handleFile(f, 'paste'); }
    });
    btnRescan.addEventListener('click', () => { if (currentFile) handleFile(currentFile, 're-run'); });
    btnReset.addEventListener('click', reset);

    evMedia.addEventListener('play',  () => { if (viz && !rafOn){ rafOn = true; vizLoop(); } });
    evMedia.addEventListener('pause', () => { if (viz) drawViz(evMedia.currentTime); });
    evMedia.addEventListener('seeked',() => { if (viz && evMedia.paused) drawViz(evMedia.currentTime); });
    evMedia.addEventListener('error', () => { evMediaWrap.hidden = true; });
    evViz.addEventListener('click', e => {
      if (!viz) return;
      const dur = viz.kind === 'video' ? viz.fr.duration : viz.ac.duration;
      if (!dur) return;
      const r = evViz.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      evMedia.currentTime = f * dur;
      drawViz(evMedia.currentTime);
    });
    let rzT;
    window.addEventListener('resize', () => {
      if (!viz) return;
      clearTimeout(rzT);
      rzT = setTimeout(() => {
        if (viz.kind === 'audio') renderAudioViz(viz.ac);
        else renderVideoViz(viz.fr, viz.ac);
      }, 200);
    });

    const clock = $('#clock');
    const tick = () => { clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour12: false }); };
    tick(); setInterval(tick, 1000);

    PixelArt.mountAll();
    VoiceForge.init();
    FaceForge.init();
    bootLog();
  }

  return { init, submitBlob };
})();

App.init();