/* Recorrido por scroll.
   Cada parada es una foto real. Entre dos paradas la "cámara" avanza:
   - sin secuencia: empuje hacia el punto de enfoque de la foto + fundido con la siguiente;
   - con secuencia (data-seq="/assets/seq/x", data-seq-count): cuadros 001.webp… dibujados en <canvas>.
   Con movimiento reducido no se activa: el CSS muestra las paradas como lista. */
(() => {
  'use strict';

  const tour = document.querySelector('[data-tour]');
  if (!tour || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const stops = [...tour.querySelectorAll('[data-stop]')];
  const n = stops.length;
  if (n < 2) return;

  let CFG = {};
  try { CFG = JSON.parse(document.getElementById('site-config')?.textContent || '{}'); } catch { /* sin configuración */ }
  const floors = CFG.floors || {};

  const header = document.querySelector('.site-header');
  const shots = stops.map(s => s.querySelector('.stop__shot'));
  const imgs = stops.map(s => s.querySelector('.stop__shot img'));
  const planImg = tour.querySelector('[data-plan]'), floorName = tour.querySelector('[data-floor-name]');
  const dot = tour.querySelector('[data-dot]'), rail = tour.querySelector('[data-rail]');
  const indexLinks = [...tour.querySelectorAll('[data-index]')], countNow = tour.querySelector('[data-count-now]');
  const canvas = tour.querySelector('.tour__seq'), ctx = canvas?.getContext('2d');

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = t => t * t * (3 - 2 * t);   // suave en los extremos, sin acelerones a mitad del tramo
  const SMOOTH_MS = 150;                     // inercia: la cámara sigue al scroll con ~150 ms de deslizamiento
  const HOLD = .42;            // parte de cada tramo con la cámara quieta (texto visible)
  const END = .6;              // la última parada también se queda un rato
  const T = n - 1 + END;

  const data = stops.map(s => {
    const [fx, fy] = (s.dataset.focus || '50 50').split(' ').map(v => Number(v) / 100);
    return { floor: s.dataset.floor, px: Number(s.dataset.px), py: Number(s.dataset.py), fx, fy,
      cut: s.dataset.link === 'cut',   // espacios que no se tocan en el plano: fundido a negro, sin fingir que se camina
      seq: s.dataset.seq ? { dir: s.dataset.seq, count: Number(s.dataset.seqCount) || 0, frames: [], started: false } : null };
  });

  /* ---------- Secuencias (cuadros de la transición) ---------- */
  // Carga progresiva: primero 1 de cada 8 cuadros, luego se completa (la transición ya funciona con pocos)
  let armed = false;
  const loadSeq = i => {
    const q = data[i]?.seq;
    if (!armed || !q || q.started || !q.count) return;
    q.started = true;
    for (const step of [8, 4, 2, 1]) {
      for (let k = 0; k < q.count; k += step) {
        if (q.frames[k]) continue;
        const im = new Image(); im.decoding = 'async';
        im.src = `${q.dir}/${String(k + 1).padStart(3, '0')}.webp`;
        q.frames[k] = im;
      }
    }
  };
  const sizeCanvas = () => {
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  };
  // Dibuja el cuadro más cercano ya descargado con la misma geometría que las fotos (caja 16:9 que cubre,
  // centrada por el enfoque y escalada desde él): el primer cuadro coincide con la foto de salida y el último con la de llegada.
  const HOLD_ZOOM = 1.035;
  const ready = f => f && f.complete && f.naturalWidth;
  const drawFrame = (i, k) => {
    const q = data[i].seq; if (!q || !ctx) return false;
    const x = k * (q.count - 1), lo = Math.floor(x), hi = Math.min(q.count - 1, lo + 1), frac = x - lo;
    let A = ready(q.frames[lo]) ? q.frames[lo] : null, B = ready(q.frames[hi]) ? q.frames[hi] : null;
    if (!A && !B) {                                            // aún no llegan: el cuadro descargado más cercano
      const want = Math.round(x);
      for (let d = 1; d < q.count && !A; d++) for (const j of [want - d, want + d]) if (ready(q.frames[j])) { A = q.frames[j]; break; }
      if (!A) return false;
    }
    const a = data[i], b = data[i + 1];
    const fx = a.fx + (b.fx - a.fx) * k, fy = a.fy + (b.fy - a.fy) * k, s = HOLD_ZOOM + (1 - HOLD_ZOOM) * k;
    const cw = canvas.width, ch = canvas.height;
    const W = Math.max(cw, ch * 16 / 9), H = Math.max(ch, cw * 9 / 16);
    const dx = fx * (cw - W) + fx * W * (1 - s), dy = (ch - H) / 2 + fy * H * (1 - s);
    // Fundido entre el cuadro anterior y el siguiente: el movimiento no avanza a saltos
    ctx.globalAlpha = 1; ctx.drawImage(A || B, dx, dy, W * s, H * s);
    if (A && B && A !== B && frac > .01) { ctx.globalAlpha = frac; ctx.drawImage(B, dx, dy, W * s, H * s); ctx.globalAlpha = 1; }
    return true;
  };

  /* ---------- Mini plano ---------- */
  let shownFloor = data[0].floor;
  const setPlan = (floor, x, y) => {
    if (dot) { dot.style.setProperty('--x', `${x}%`); dot.style.setProperty('--y', `${y}%`); }
    if (!planImg || floor === shownFloor || !floors[floor]) return;
    shownFloor = floor;
    planImg.classList.add('is-swap');
    setTimeout(() => {
      planImg.src = floors[floor].src; planImg.width = floors[floor].w; planImg.height = floors[floor].h;
      if (floorName) floorName.textContent = floors[floor].name;
      planImg.classList.remove('is-swap');
    }, 180);
  };

  /* ---------- Cuadro por cuadro ---------- */
  let near = -1, on = -2;
  const scrollLen = () => tour.offsetHeight - innerHeight;
  const progress = () => {
    const r = tour.getBoundingClientRect();
    header?.classList.toggle('is-solid', r.bottom <= (header.offsetHeight || 60));
    return clamp(-r.top / Math.max(1, r.height - innerHeight));
  };

  function render(p) {
    const t = p * T;
    let i = Math.floor(t), f = t - i, k = 0;
    if (i >= n - 1) { i = n - 1; f = 0; }
    else if (f > HOLD) k = ease((f - HOLD) / (1 - HOLD));
    const hold = i < n - 1 ? Math.min(1, f / HOLD) : 0;

    if (i !== near) {
      near = i;  // fotos cercanas visibles + secuencias del tramo actual y el siguiente
      stops.forEach((s, j) => s.classList.toggle('is-near', j >= i - 1 && j <= i + 2));
      loadSeq(i); loadSeq(i + 1);
    }

    // Con secuencia: el video cubre el tramo y se funde 5 % al inicio y al final sobre las fotos reales
    const seqOn = k > 0 && k < 1 && drawFrame(i, k);
    canvas?.style.setProperty('--o', seqOn ? (smooth(0, .05, k) * (1 - smooth(.95, 1, k))).toFixed(3) : '0');

    const cut = !seqOn && data[i].cut;
    shots.forEach((el, j) => {
      let o = 0, s = 1;
      if (cut && (j === i || j === i + 1) && k > 0) {           // corte: la foto sale a negro y la siguiente entra
        o = j === i ? 1 - smooth(0, .48, k) : smooth(.52, 1, k);
        s = j === i ? 1 + .035 * hold : 1.03 - .03 * k;
      } else if (j === i) {
        s = (1 + .035 * hold) * (seqOn ? 1 : 1 + .28 * k);       // la cámara avanza hacia el enfoque
        o = seqOn ? (k < .1 ? 1 : 0) : 1 - smooth(.8, 1, k);     // se queda debajo hasta que la siguiente la cubre
      } else if (j === i + 1 && k > 0) {
        s = seqOn ? 1 : 1.08 - .08 * k;                           // la siguiente pieza llega encima y se asienta
        o = seqOn ? (k > .9 ? 1 : 0) : smooth(.15, .8, k);
        if (k >= 1) o = 1;
      }
      el.style.setProperty('--o', o.toFixed(3));
      imgs[j]?.style.setProperty('--s', s.toFixed(4));
    });

    const active = k < .12 ? i : k > .88 ? i + 1 : -1;
    if (active !== on) {
      on = active;
      stops.forEach((s, j) => s.classList.toggle('is-on', j === active));
    }

    const at = k < .5 ? i : i + 1;
    if (tour.dataset.at !== String(at)) {
      tour.dataset.at = String(at);
      indexLinks.forEach((a, j) => (j === at ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
      if (countNow) countNow.textContent = String(at + 1).padStart(2, '0');
    }
    const a = data[i], b = data[Math.min(n - 1, i + 1)];
    if (a.floor === b.floor && k > 0) setPlan(a.floor, a.px + (b.px - a.px) * k, a.py + (b.py - a.py) * k);
    else setPlan(data[at].floor, data[at].px, data[at].py);

    rail?.style.setProperty('--p', p.toFixed(4));
  }

  // Inercia: el valor mostrado se acerca al del scroll con un deslizamiento exponencial (independiente de los fps)
  let target = progress(), shown = target, running = false, last = 0;
  const loop = ts => {
    const dt = last ? Math.min(64, ts - last) : 16; last = ts;
    shown += (target - shown) * (1 - Math.exp(-dt / SMOOTH_MS));
    if (Math.abs(target - shown) < 1e-5) shown = target;
    render(shown);
    if (shown !== target) requestAnimationFrame(loop); else { running = false; last = 0; }
  };
  const onScroll = () => {
    if (!armed) { armed = true; near = -1; }                      // las secuencias se descargan después del primer scroll
    target = progress();
    if (!running) { running = true; requestAnimationFrame(loop); }
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { sizeCanvas(); onScroll(); });

  // Los enlaces a una parada (#arret-…) llevan a su punto del recorrido, no al inicio de la sección
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#arret-"]');
    if (!a) return;
    const idx = stops.findIndex(s => `#${s.id}` === a.getAttribute('href'));
    if (idx < 0) return;
    e.preventDefault();
    const top = tour.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (idx / T) * scrollLen() + 2, behavior: 'smooth' });
  });

  tour.classList.add('is-live');
  sizeCanvas();
  render(shown);
})();
