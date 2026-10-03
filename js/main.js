/* Comportamiento del sitio */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = window.matchMedia('(min-width: 900px)');
  const behavior = reduce ? 'auto' : 'smooth';

  let CFG = {};
  try { CFG = JSON.parse($('#site-config')?.textContent || '{}'); } catch { /* sin configuración */ }
  const digits = v => String(v || '').replace(/\D/g, '');
  const T = CFG.ui || {};

  /* ---------- Idioma: recordar la elección manual (cookie de 1 año) ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-lang]');
    if (a) document.cookie = `site_lang=${a.dataset.lang}; Max-Age=31536000; Path=/; SameSite=Lax`;
  });


  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  /* ---------- Texto por palabras (títulos que suben, párrafos que se iluminan) ---------- */
  const scrubBlocks = [];
  function splitWords(root, mode) {
    let k = 0;
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement('span'); w.className = 'w';
          if (mode === 'rise') { const i = document.createElement('i'); i.textContent = part; w.append(i); w.style.setProperty('--k', Math.min(k, 14)); }
          else w.textContent = part;
          k++; frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(root);
    return [...root.querySelectorAll('.w')];
  }
  if (!reduce) {
    $$('[data-split]').forEach(el => {
      const mode = el.dataset.split, words = splitWords(el, mode);
      if (mode === 'scrub') scrubBlocks.push({ el, words });
    });
  }
  html.classList.remove('split-pending');

  function updateScrub() {
    const vh = innerHeight;
    scrubBlocks.forEach(({ el, words }) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const p = clamp((vh * 0.9 - r.top) / (r.height + vh * 0.3));
      const on = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < on));
    });
  }

  /* ---------- Tarjetas apiladas: la anterior se encoge y se oscurece al cubrirse ---------- */
  const cards = $$('[data-card]');
  function updateCards() {
    cards.forEach((c, i) => {
      const next = cards[i + 1];
      if (!next) return;
      const top = parseFloat(getComputedStyle(c).top) || 0;
      const p = clamp(1 - (next.getBoundingClientRect().top - top) / c.offsetHeight);
      c.style.setProperty('--cover', p.toFixed(3));
    });
  }

  /* ---------- Foto que se expande al entrar ---------- */
  const expands = $$('[data-expand]');
  function updateExpand() {
    const vh = innerHeight;
    expands.forEach(m => {
      const r = m.parentElement.getBoundingClientRect();
      const p = clamp((vh - r.top) / (vh * 0.8));
      m.style.setProperty('--ex', (1 - Math.pow(1 - p, 3)).toFixed(3));
    });
  }

  /* ---------- Botones magnéticos (solo con puntero fino) ---------- */
  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    $$('.btn').forEach(b => {
      b.addEventListener('mousemove', e => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${((e.clientX - r.left) / r.width - .5) * 10}px, ${((e.clientY - r.top) / r.height - .5) * 8}px)`;
      });
      b.addEventListener('mouseleave', () => { b.style.transform = ''; });
    });
  }

  /* ---------- Etiquetas con física (Matter.js, se carga solo al llegar a la sección) ---------- */
  const field = $('[data-physics]');
  if (field && !reduce && 'IntersectionObserver' in window) {
    let started = false;
    const load = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
    const startPhysics = async () => {
      try { await load('/js/vendor/matter.min.js'); } catch { return; }
      const { Engine, Bodies, Body, Composite, Constraint } = window.Matter;
      const pills = $$('.pill', field);
      let engine, items = [], running = false, W = 0, H = 0, drag = null;

      const build = () => {
        if (engine) Composite.clear(engine.world, false);
        field.classList.add('physics-on');
        W = field.clientWidth; H = field.clientHeight;
        engine = Engine.create({ gravity: { y: 1.05 } });
        const t = 80;
        Composite.add(engine.world, [
          Bodies.rectangle(W / 2, H + t / 2, W * 3, t, { isStatic: true }),
          Bodies.rectangle(-t / 2, H / 2, t, H * 6, { isStatic: true }),
          Bodies.rectangle(W + t / 2, H / 2, t, H * 6, { isStatic: true })
        ]);
        items = pills.map((el, i) => {
          const w = el.offsetWidth, h = el.offsetHeight;
          const body = Bodies.rectangle(w / 2 + Math.random() * Math.max(1, W - w), -h - i * 90, w, h, {
            chamfer: { radius: h / 2 }, restitution: .3, friction: .25, frictionAir: .012, angle: (Math.random() - .5) * .8
          });
          Composite.add(engine.world, body);
          return { el, body, w, h };
        });
      };

      const tick = () => {
        if (!running) return;
        Engine.update(engine, 1000 / 60);
        items.forEach(({ el, body, w, h }) => {
          el.style.transform = `translate(${(body.position.x - w / 2).toFixed(1)}px, ${(body.position.y - h / 2).toFixed(1)}px) rotate(${body.angle.toFixed(3)}rad)`;
        });
        requestAnimationFrame(tick);
      };

      // Arrastrar una etiqueta sin bloquear el scroll de la página
      const pt = e => { const r = field.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      field.addEventListener('pointerdown', e => {
        const el = e.target.closest('.pill'); if (!el) return;
        const it = items.find(i => i.el === el); if (!it) return;
        el.setPointerCapture(e.pointerId);
        const p = pt(e);
        const c = Constraint.create({ pointA: p, bodyB: it.body, pointB: { x: p.x - it.body.position.x, y: p.y - it.body.position.y }, stiffness: .22, damping: .12, length: 0 });
        Composite.add(engine.world, c); drag = { c, id: e.pointerId };
      });
      field.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) drag.c.pointA = pt(e); });
      const end = e => { if (drag && e.pointerId === drag.id) { Composite.remove(engine.world, drag.c); drag = null; } };
      field.addEventListener('pointerup', end); field.addEventListener('pointercancel', end);

      build();
      const vio = new IntersectionObserver(es => es.forEach(en => {
        const on = en.isIntersecting;
        if (on && !running) { running = true; requestAnimationFrame(tick); }
        if (!on) running = false;
      }), { threshold: 0.05 });
      vio.observe(field);

      let rw = innerWidth;
      addEventListener('resize', () => { if (innerWidth !== rw) { rw = innerWidth; build(); } });
    };

    const pio = new IntersectionObserver(es => { if (!started && es.some(e => e.isIntersecting)) { started = true; pio.disconnect(); startPhysics(); } }, { rootMargin: '0px 0px 300px 0px' });
    pio.observe(field);
  }

  /* ---------- Scroll: barra de progreso, encabezado y parallax ---------- */
  const header = $('.site-header');
  const bar = $('.progress i');
  const parallax = new Set();
  let ticking = false;

  const frame = () => {
    ticking = false;
    const y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    header.classList.toggle('is-scrolled', y > 40);
    if (!reduce) {
      updateCards(); updateExpand(); updateScrub();
      parallax.forEach(mask => {
        const img = mask.firstElementChild, r = mask.getBoundingClientRect();
        const off = (r.top + r.height / 2 - innerHeight / 2) * -0.07;
        img.style.setProperty('--py', `${Math.max(-40, Math.min(40, off)).toFixed(1)}px`);
      });
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  frame();

  if ('IntersectionObserver' in window) {
    const pio = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? parallax.add(e.target) : parallax.delete(e.target)), { rootMargin: '20% 0px' });
    $$('[data-parallax]').forEach(el => pio.observe(el));
  }

  /* ---------- Sección actual (barra inferior) ---------- */
  const dock = $('.dock'), current = $('[data-current]');
  if ('IntersectionObserver' in window && dock) {
    const sio = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { current.textContent = e.target.dataset.section; dock.dataset.at = e.target.id; }
    }), { rootMargin: '-45% 0px -50% 0px' });
    $$('[data-section]').forEach(el => sio.observe(el));
  }

  /* ---------- Menú desplegable (hoja inferior) ---------- */
  const sheet = $('#sheet'), openBtn = $('.dock__menu');
  if (sheet && openBtn && typeof sheet.showModal === 'function') {
    let closing = false;
    const openSheet = () => {
      sheet.showModal(); html.classList.add('no-scroll'); openBtn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
    };
    const closeSheet = (after) => {
      if (closing || !sheet.open) return;
      closing = true; sheet.classList.remove('is-open');
      setTimeout(() => { sheet.close(); closing = false; html.classList.remove('no-scroll'); openBtn.setAttribute('aria-expanded', 'false'); after && after(); }, reduce ? 0 : 380);
    };
    openBtn.addEventListener('click', openSheet);
    $('[data-sheet-close]', sheet).addEventListener('click', () => closeSheet());
    sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
    sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
    $$('[data-sheet-link]', sheet).forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const target = $(a.getAttribute('href'));
      closeSheet(() => { if (target) { target.scrollIntoView({ behavior }); history.replaceState(null, '', a.getAttribute('href')); } });
    }));
    desktop.addEventListener('change', () => { if (sheet.open) { sheet.close(); sheet.classList.remove('is-open'); html.classList.remove('no-scroll'); } });
  }

  /* ---------- Aparición al desplazar ---------- */
  const countUp = dt => {
    const to = parseFloat(dt.dataset.count), pre = dt.dataset.prefix || '', suf = dt.dataset.suffix || '';
    const dec = (dt.dataset.count.split('.')[1] || '').length;
    const loc = { fr: 'fr-CA', es: 'es-MX', en: 'en-CA' }[CFG.lang] || 'fr-CA';
    const fmt = n => pre + n.toLocaleString(loc, { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: !('plain' in dt.dataset) }) + suf;
    if (reduce) { dt.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 1400;
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); dt.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window && !reduce) {
    html.classList.add('reveal-on');
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in'); io.unobserve(en.target);
      $$('[data-count]', en.target).forEach(countUp);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal, [data-split="rise"]').forEach(el => io.observe(el));
  }

  /* ---------- Galería: contador del carrusel y lightbox ---------- */
  const rail = $('[data-gallery]'), items = $$('.g-open');
  const now = $('[data-g-now]');
  if (rail && now) {
    let raf;
    rail.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = rail.scrollLeft + rail.clientWidth * 0.35;
        const figs = $$('.g-item', rail);
        let idx = 0;
        figs.forEach((f, i) => { if (f.offsetLeft <= mid) idx = i; });
        now.textContent = String(idx + 1).padStart(2, '0');
      });
    }, { passive: true });
  }

  const box = $('.lightbox');
  if (box && items.length && typeof box.showModal === 'function') {
    const img = $('img', box), cap = $('figcaption', box);
    let idx = 0;
    const show = i => {
      idx = (i + items.length) % items.length;
      const btn = items[idx];
      img.src = btn.dataset.full; img.alt = $('img', btn).alt;
      cap.textContent = $('figcaption', btn.closest('figure')).textContent;
    };
    items.forEach((btn, i) => btn.addEventListener('click', () => { show(i); box.showModal(); }));
    $('.lb-close', box).addEventListener('click', () => box.close());
    $('.lb-prev', box).addEventListener('click', () => show(idx - 1));
    $('.lb-next', box).addEventListener('click', () => show(idx + 1));
    box.addEventListener('click', e => { if (e.target === box) box.close(); });
    box.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
    let sx = 0;
    box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); }, { passive: true });
  }

  /* ---------- Formulario ---------- */
  const form = $('#form-evento');
  if (!form) return;
  const alertBox = $('[data-form-alert]'), statusEl = $('[data-form-status]'), submitBtn = $('[data-submit]'), successBox = $('[data-form-success]');
  const f = name => form.elements[name];
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  f('fecha').min = today();

  const validators = {
    nombre: v => v.trim().length >= 2 || T.name,
    contacto: v => {
      v = v.trim();
      if (!v) return T.contactEmpty;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return true;
      const d = digits(v);
      if (/^[+\d\s().-]+$/.test(v) && d.length >= 8 && d.length <= 15) return true;
      return T.contactBad;
    },
    tipo: v => v !== '' || T.type,
    fecha: v => {
      if (f('sin_fecha').checked) return true;
      if (!v) return T.dateEmpty;
      if (v < today()) return T.datePast;
      return true;
    },
    lugar: v => v.trim().length >= 2 || T.place,
    asistentes: v => {
      if (v.trim() === '') return true;
      const n = Number(v);
      return (Number.isInteger(n) && n >= 1 && n <= 100000) || T.guests;
    },
    mensaje: v => v.trim().length >= 10 || T.message
  };

  const showError = (name, msg) => {
    const input = f(name), err = $(`#err-${name}`);
    if (!err) return;
    const base = (input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== err.id);
    if (msg) {
      err.textContent = msg; err.hidden = false;
      input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', [...base, err.id].join(' '));
    } else {
      err.hidden = true; err.textContent = ''; input.removeAttribute('aria-invalid');
      base.length ? input.setAttribute('aria-describedby', base.join(' ')) : input.removeAttribute('aria-describedby');
    }
  };
  const check = name => { const r = validators[name](f(name).value); showError(name, r === true ? '' : r); return r === true; };
  const checkAll = () => Object.keys(validators).map(check).every(Boolean);

  let attempted = false;
  Object.keys(validators).forEach(name => {
    const el = f(name);
    el.addEventListener('blur', () => { if (attempted || el.value !== '') check(name); });
    el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') check(name); });
    el.addEventListener('change', () => { if (attempted) check(name); });
  });
  f('sin_fecha').addEventListener('change', e => {
    f('fecha').disabled = e.target.checked; if (e.target.checked) f('fecha').value = ''; showError('fecha', '');
  });

  const setStatus = (msg, state = '') => { statusEl.textContent = msg; statusEl.dataset.state = state; };
  $$('[data-servicio]').forEach(a => a.addEventListener('click', () => { f('servicio').value = a.dataset.servicio; }));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (f('_gotcha').value) return;
    attempted = true; setStatus(''); alertBox.hidden = true;

    if (!checkAll()) {
      const bad = Object.keys(validators).filter(n => f(n).getAttribute('aria-invalid') === 'true');
      alertBox.textContent = bad.length === 1 ? T.alertOne : (T.alertMany || '').replace('{n}', bad.length);
      alertBox.hidden = false; f(bad[0]).focus(); return;
    }

    const endpoint = CFG.form?.endpoint;
    if (!endpoint) {
      // Sitio estático: se abre WhatsApp (o el correo) del vendedor con el mensaje listo; la persona lo envía.
      const ct = CFG.contact || {};
      if (ct.wa || ct.email) {
        const lines = [T.msgIntro, ct.property, ct.url].filter(Boolean);
        $$('.field', form).forEach(fl => {
          const input = $('input, select, textarea', fl), label = $('label', fl);
          if (!input || !label || input.type === 'checkbox') return;
          const v = input.tagName === 'SELECT' ? (input.value ? input.options[input.selectedIndex].text : '') : input.value.trim();
          const name = label.childNodes[0]?.textContent.trim();
          if (v) lines.push(`${name} : ${v}`);
        });
        if (f('sin_fecha')?.checked) lines.push(f('sin_fecha').closest('label').textContent.trim());
        const text = lines.join('\n');
        if (ct.wa) { window.open(`https://wa.me/${ct.wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); setStatus(T.openedWa); }
        else { location.href = `mailto:${ct.email}?subject=${encodeURIComponent(ct.property)}&body=${encodeURIComponent(text)}`; setStatus(T.openedMail); }
        return;
      }
      console.warn('[site] Formulario sin destino: define el destino del formulario en el panel (Ajustes).');
      setStatus(T.noEndpoint + (CFG.hasDirect ? T.noEndpointDirect : ''), 'error');
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    delete data._gotcha; data.sin_fecha = f('sin_fecha').checked; data.origen = location.href; data.lang = CFG.lang || 'fr';

    submitBtn.disabled = true;
    const label = submitBtn.textContent; submitBtn.textContent = T.sending;
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.hidden = true; successBox.hidden = false; $('[data-success-title]').focus();
      successBox.scrollIntoView({ block: 'center', behavior });
    } catch (err) {
      console.error('[site] Error al enviar el formulario:', err);
      setStatus(T.sendError, 'error');
    } finally { submitBtn.disabled = false; submitBtn.textContent = label; }
  });

  $('[data-reset]').addEventListener('click', () => {
    form.reset(); f('fecha').disabled = false; attempted = false;
    Object.keys(validators).forEach(n => showError(n, ''));
    successBox.hidden = true; form.hidden = false; setStatus(''); f('nombre').focus();
  });
})();
