(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);   const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const memStore = {};
  const store = {
    get(k, d) {
      try {
        const item = window.localStorage ? localStorage.getItem('tala:' + k) : null;
        return item !== null ? JSON.parse(item) : d;
      } catch (e) {
        return memStore[k] !== undefined ? memStore[k] : d;
      }
    },
    set(k, v) {
      try {
        if (window.localStorage) localStorage.setItem('tala:' + k, JSON.stringify(v));
      } catch (e) {}
      memStore[k] = v;
    }
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const weekId = () => Math.floor(Date.now() / 604800000);

  const S = {
    fav: store.get('fav', []),
    hist: store.get('hist', []),
    theme: store.get('theme', 'light'),
    goal: store.get('goal', 15),
    week: store.get('week', { id: weekId(), words: [] }),
    cur: null
  };

  if (!S.week || S.week.id !== weekId()) {
    S.week = { id: weekId(), words: [] };
  }

  const save = () => ['fav', 'hist', 'theme', 'goal', 'week'].forEach(k => store.set(k, S[k]));

  const SAMPLE = [
    ['eloquent', 'Fluent or persuasive in speaking or writing.'],
    ['resilient', 'Able to recover quickly from difficulties; tough.'],
    ['labyrinth', 'A complicated network of paths or passages in which it is difficult to find one’s way.'],
    ['lucid', 'Expressed clearly; easy to understand.'],
    ['ephemeral', 'Lasting for a very short time.'],
    ['serendipity', 'The occurrence of fortunate events by chance.'],
    ['luminous', 'Full of or shedding light; bright or shining.'],
    ['ineffable', 'Too great or extreme to be expressed or described in words.'],
    ['astute', 'Having a ready insight into things; shrewd.'],
    ['petrichor', 'The pleasant, earthy smell that accompanies the first rain after a long dry spell.']
  ].map(([word, def]) => ({ word, def }));

  const WOTD = [
    'petrichor', 'serendipity', 'ephemeral', 'luminous', 'eloquent',
    'resilient', 'labyrinth', 'solace', 'mellifluous', 'sonder',
    'halcyon', 'quixotic', 'ethereal', 'tenacious', 'candid',
    'verdant', 'cogent', 'amiable', 'zenith', 'lithe'
  ];

  /* ---------- Toast, Theme, Navigation ---------- */
  let tt;
  function toast(m) {
    const t = $('#toast');     if (!t) return;     t.textContent = m;     t.classList.add('show');     clearTimeout(tt);     tt = setTimeout(() => t.classList.remove('show'), 1800);   }    function applyTheme() {     let dark = S.theme === 'dark';     if (S.theme === 'system') {       try {         if (window.matchMedia) {           dark = window.matchMedia('(prefers-color-scheme: dark)').matches;         }       } catch (e) {}     }     document.documentElement.dataset.theme = dark ? 'dark' : 'light';     $$('[data-theme-opt]').forEach(b => b.classList.toggle('on', b.dataset.themeOpt === S.theme));
  }

  try {
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) {
        mq.addEventListener('change', applyTheme);
      } else if (mq.addListener) {
        mq.addListener(applyTheme);
      }
    }
  } catch (e) {}

  function show(v) {
    if (!$('#v-' + v)) v = 'home';
    $$('[data-v]').forEach(s => {       s.hidden = s.id !== ('v-' + v);     });$$
('nav [data-view]').forEach(b => {
      b.classList.toggle('on', b.dataset.view === v);
    });
    try {
      if (location.hash.slice(1) !== v) {
        history.replaceState(null, '', '#' + v);
      }
    } catch (e) {}

    const viewMap = {
      favorites: renderFav,
      history: renderHist,
      quiz: renderQuizHome,
      settings: renderSettings
    };
    if (viewMap[v]) viewMap[v]();
    window.scrollTo(0, 0);
  }

  /* ---------- Dictionary API (freedictionaryapi.com) ---------- */
  function normalize(data) {
    const rootWord = (Array.isArray(data) ? data[0]?.word : data?.word) || '';
    const entries = Array.isArray(data) ? data : (data?.entries || []);
    const e = {
      word: rootWord,
      phonetic: '',
      audio: '',
      source: (Array.isArray(data) ? data[0]?.sourceUrls?.[0] : data?.entries?.[0]?.source?.url) || ('https://en.wiktionary.org/wiki/' + encodeURIComponent(rootWord)),
      meanings: []
    };
    const map = {};

    entries.forEach(item => {
      const prons = item.pronunciations || item.phonetics || [];
      prons.forEach(p => {
        const txt = p.text || (typeof p === 'string' ? p : '');
        if (!e.phonetic && txt) e.phonetic = txt;
        if (!e.audio && p.audio) e.audio = p.audio;
      });
      if (!e.phonetic && item.phonetic) e.phonetic = item.phonetic;

      if (item.partOfSpeech && item.senses) {
        const g = map[item.partOfSpeech] ||= { pos: item.partOfSpeech, defs: [], syn: [] };
        item.senses.forEach(s => {
          if (s.definition) {
            const ex = Array.isArray(s.examples) ? s.examples[0] : (s.example || '');
            g.defs.push({ d: s.definition, ex: typeof ex === 'string' ? ex : (ex?.text || '') });
          }
          (s.synonyms || []).forEach(syn => {
            const synWord = typeof syn === 'string' ? syn : syn.word;
            if (synWord && !g.syn.includes(synWord)) g.syn.push(synWord);
          });
        });
        (item.synonyms || []).forEach(syn => {
          const synWord = typeof syn === 'string' ? syn : syn.word;
          if (synWord && !g.syn.includes(synWord)) g.syn.push(synWord);
        });
      } else if (item.meanings) {
        item.meanings.forEach(m => {
          const g = map[m.partOfSpeech] ||= { pos: m.partOfSpeech, defs: [], syn: [] };
          item.meanings.forEach(sub => {
            sub.definitions?.forEach(x => g.defs.push({ d: x.definition, ex: x.example || '' }));
            [...(sub.synonyms || []), ...(sub.definitions?.flatMap(x => x.synonyms || []) || [])].forEach(s => {
              if (!g.syn.includes(s)) g.syn.push(s);
            });
          });
        });
      }
    });

    e.meanings = Object.values(map);
    return e;
  }

  async function fetchEntry(w) {
    const r = await fetch('https://freedictionaryapi.com/api/v1/entries/en/' + encodeURIComponent(w));
    if (r.status === 404) {
      const err = new Error('nf');
      err.nf = true;
      throw err;
    }
    if (!r.ok) throw new Error('http ' + r.status);
    return normalize(await r.json());
  }

  const firstDef = e => e.meanings[0]?.defs[0]?.d || '';

  function setLoading(on) {
    const go = $('#go');
    const mainCard = $('#main-card');
    if (go) {
      go.classList.toggle('spin', on);
      go.innerHTML = ic(on ? 'load' : 'search');
    }
    if (on && mainCard) {
      mainCard.innerHTML = '<div class="card skel" aria-label="Loading"><i style="width:80px"></i><i style="width:200px;height:48px"></i><i style="width:120px"></i><i></i><i style="width:85%"></i><i style="width:70%"></i></div>';
    }
  }

  function showError(t, m) {
    const mainCard = $('#main-card');
    if (!mainCard) return;
    mainCard.innerHTML = `<div class="card empty"><div class="ring">${ic('search')}</div><h2>${esc(t)}</h2><p>${esc(m)}</p><div class="btns"><button class="chip" data-w="serendipity">Try “serendipity”</button></div></div>`;
  }

  async function lookup(raw) {
    const w = (raw || '').trim().toLowerCase();
    const qInput = $('#q');
    const hero = $('#hero');
    const mainCard = $('#main-card');

    if (!w) {
      showError('Type a word to search', 'Enter an English word above, then press Enter.');
      if (qInput) qInput.focus();
      return;
    }
    if (!/^[a-z][a-z' -]*$/.test(w)) {
      showError('That doesn’t look like a word', 'Use letters only — for example, “lantern”.');
      return;
    }

    show('dictionary');
    if (qInput) qInput.value = w;
    closeSug();
    if (hero) hero.hidden = false;
    setLoading(true);

    try {
      const e = await fetchEntry(w);
      renderEntry(e);
      addHist(e);
      markExplored(e.word);
      if (mainCard) mainCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (x) {
      if (x.nf) {
        showError(`No entry for “${w}”`, 'Check the spelling or try a related word.');
      } else {
        showError('Couldn’t reach the dictionary', navigator.onLine ? 'The service isn’t responding. Try again in a moment.' : 'You appear to be offline. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Entry Display ---------- */
  const isFav = w => S.fav.some(f => f.word === w);

  function speak(w) {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(w);
      u.lang = 'en-US';
      speechSynthesis.speak(u);
    } else {
      toast('Audio isn’t supported on this browser');
    }
  }

  function play(e) {
    if (e.audio) {
      new Audio(e.audio).play().catch(() => speak(e.word));
    } else {
      speak(e.word);
    }
  }

  const entryText = e => `${e.word}${e.phonetic ? ' ' + e.phonetic : ''}\n` + e.meanings.map(m => `\n${m.pos}\n` + m.defs.map((d, i) => `${i + 1}. ${d.d}`).join('\n')).join('\n');

  async function copy(t) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        toast('Copied to clipboard');
      } else {
        toast('Clipboard not permitted in local sandbox');
      }
    } catch (e) {
      toast('Couldn’t copy text');
    }
  }

  function renderEntry(e, filter = 'All') {
    S.cur = e;
    const mainCard = $('#main-card');
    if (!mainCard) return;

    const secs = e.meanings
      .filter(m => filter === 'All' || m.pos === filter)
      .map(m => `
        <div class="posh">${esc(m.pos)}</div>
        <ol class="defs">${m.defs.map((d, i) => `<li><span class="n">${i + 1}</span><div><div>${esc(d.d)}</div>${d.ex ? `<div class="q">“${esc(d.ex)}”</div>` : ''}</div></li>`).join('')}</ol>
        ${m.syn.length ? `<div class="syn"><span class="lbl">Synonyms</span>${m.syn.slice(0, 10).map(s => `<button class="chip" data-w="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      `).join('');

    const f = isFav(e.word);

    mainCard.innerHTML = `<article class="card">
      <div class="wordhead"><span class="lbl">Definition</span><span>
        <button class="icon-btn" id="b-copy" aria-label="Copy word and definition" title="Copy">${ic('copy')}</button>
        <button class="icon-btn ${f ? 'saved' : ''}" id="b-fav" aria-pressed="${f}" aria-label="${f ? 'Remove from favorites' : 'Save to favorites'}" title="Favorite">${ic('mark', f ? 'fill' : '')}</button></span></div>
      <h2 class="word">${esc(e.word)}</h2>
      <div class="pron"><button class="icon-btn ring" id="b-play" aria-label="Play pronunciation">${ic('vol')}</button><span>${esc(e.phonetic) || ''}</span><span class="small">${e.audio ? '' : 'device voice'}</span></div>
      ${e.meanings.length > 1 ? `<div class="chips" role="group" aria-label="Filter by part of speech">${['All', ...e.meanings.map(m => m.pos)].map(p => `<button class="chip ${p === filter ? 'on' : ''}" data-pos="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
      ${secs || '<p class="eg">No definitions are available for this word.</p>'}
      <div class="foot"><button id="b-copyfull">${ic('copy')}Copy full entry</button>${e.source ? `<a href="${esc(e.source)}" target="_blank" rel="noopener">${ic('ext')}Source: Wiktionary</a>` : ''}</div></article>`;

    $('#b-copy').onclick = () => copy(`${e.word}: ${firstDef(e)}`);
    $('#b-copyfull').onclick = () => copy(entryText(e));
    $('#b-play').onclick = () => play(e);
    $('#b-fav').onclick = () => {       toggleFav(e);       renderEntry(e, filter);     };     $$('[data-pos]', mainCard).forEach(b => {
      b.onclick = () => renderEntry(e, b.dataset.pos);
    });
  }

  /* ---------- Favorites, History, Storage ---------- */
  function toggleFav(e) {
    if (isFav(e.word)) {
      S.fav = S.fav.filter(f => f.word !== e.word);
      toast('Removed from favorites');
    } else {
      S.fav.unshift({ ...e, def: firstDef(e), pos: e.meanings[0]?.pos || '' });
      toast('Saved to favorites');
    }
    save();
    updateCounts();
  }

  function addHist(e) {
    S.hist = [{ word: e.word, def: firstDef(e), t: Date.now() }, ...S.hist.filter(h => h.word !== e.word)].slice(0, 50);
    save();
    updateCounts();
  }

  function markExplored(w) {
    if (!S.week.words.includes(w)) S.week.words.push(w);
    save();
    updateCounts();
  }

  function ago(t) {
    const m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago';
  }

  function updateCounts() {
    const cHist = $('#c-hist');
    const cFav = $('#c-fav');
    const cWeek = $('#c-week');
    const cBar = $('#c-bar');

    if (cHist) cHist.textContent = S.hist.length;
    if (cFav) cFav.textContent = S.fav.length;
    const n = S.week.words.length;
    if (cWeek) cWeek.textContent = `${n} / ${S.goal}`;
    if (cBar) cBar.style.width = Math.min(100, (n / S.goal) * 100) + '%';
  }

  function emptyBox(icon, title, text, btn) {
    return `<div class="card empty"><div class="ring">${ic(icon)}</div><h2>${title}</h2><p>${text}</p><div class="btns">${btn}</div></div>`;
  }

  function renderFav() {
    const favList = $('#fav-list');
    if (!favList) return;
    favList.innerHTML = S.fav.length
      ? `<div class="cards">${S.fav.map(f => `<div class="card mini" tabindex="0" role="button" data-open="${esc(f.word)}"><h3>${esc(f.word)}</h3><p>${esc(f.def)}</p><div class="meta"><span class="pos-i">${esc(f.pos)}</span><button class="icon-btn" data-unfav="${esc(f.word)}" aria-label="Remove ${esc(f.word)}">${ic('trash')}</button></div></div>`).join('')}</div><div class="btns" style="margin-top:32px"><button class="btn" data-view="quiz">Test yourself</button></div>`
      : emptyBox('mark', 'No saved words yet', 'Tap the bookmark on any definition to keep it here.', '<button class="btn" data-view="dictionary">Find a word</button>');
  }

  function renderHist() {
    const note = $('#hist-note');
    const clearBtn = $('#clear-hist');
    const histList = $('#hist-list');

    if (note) note.textContent = S.hist.length ? `The last ${S.hist.length} word${S.hist.length > 1 ? 's' : ''} you looked up, newest first. Stored only on this device.` : 'Words you search for will appear here. Stored only on this device.';
    if (clearBtn) clearBtn.hidden = !S.hist.length;
    if (histList) {
      histList.innerHTML = S.hist.length
        ? `<div class="cards">${S.hist.map(h => `<div class="card mini" tabindex="0" role="button" data-lookup="${esc(h.word)}"><h3>${esc(h.word)}</h3><p>${esc(h.def)}</p><div class="meta"><span>${ago(h.t)}</span><button class="icon-btn" data-delhist="${esc(h.word)}" aria-label="Delete ${esc(h.word)}">${ic('trash')}</button></div></div>`).join('')}</div>`
        : emptyBox('clock', 'No history yet', 'Look up a word and it will show up here.', '<button class="btn" data-view="dictionary">Find a word</button>');
    }
  }

  /* ---------- Suggestions and Search ---------- */
  const q = $('#q');
  const sug = $('#sug');
  let sugItems = [];
  let sel = -1;
  let deb;

  function closeSug() {
    if (!sug || !q) return;
    sug.hidden = true;
    sel = -1;
    q.setAttribute('aria-expanded', 'false');
  }

  function paintSug() {
    if (!sug || !q) return;
    sug.innerHTML = sugItems.map((w, i) => `<li role="option" id="sg${i}" aria-selected="${i === sel}" data-sg="${esc(w)}">${ic('search')}${esc(w)}</li>`).join('');
    sug.hidden = !sugItems.length;
    q.setAttribute('aria-expanded', String(!!sugItems.length));
  }

  if (q) {
    q.addEventListener('input', () => {
      clearTimeout(deb);
      const v = q.value.trim();
      if (v.length < 2) {
        sugItems = [];
        closeSug();
        return;
      }
      deb = setTimeout(async () => {
        try {
          const r = await fetch('https://api.datamuse.com/sug?max=5&s=' + encodeURIComponent(v));
          sugItems = (await r.json()).map(x => x.word);
          sel = -1;
          paintSug();
        } catch (e) {
          closeSug();
        }
      }, 180);
    });

    q.addEventListener('keydown', e => {
      if (!sugItems.length || !sug || sug.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length;
        paintSug();
        q.setAttribute('aria-activedescendant', 'sg' + sel);
      } else if (e.key === 'Escape') {
        closeSug();
      } else if (e.key === 'Enter' && sel >= 0) {
        e.preventDefault();
        lookup(sugItems[sel]);
      }
    });

    q.addEventListener('blur', () => setTimeout(closeSug, 120));
  }

  if (sug) {
    sug.addEventListener('mousedown', e => {
      const li = e.target.closest('[data-sg]');
      if (li) {
        e.preventDefault();
        lookup(li.dataset.sg);
      }
    });
  }

  const form = $('#form');
  if (form && q) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      lookup(q.value);
    });
  }

  /* ---------- Word of the Day ---------- */
  async function loadWotd() {
    const day = Math.floor(Date.now() / 86400000);
    const w = WOTD[day % WOTD.length];
    let c = store.get('wotd', null);
    try {
      if (!c || c.day !== day) {
        c = { day, e: await fetchEntry(w) };
        store.set('wotd', c);
      }
    } catch (e) {
      if (!c) return;
    }
    const e = c.e;
    const m = e.meanings[0];
    const f = isFav(e.word);
    const mainCard = $('#main-card');

    if (S.cur || !mainCard) return;

    mainCard.innerHTML = `<article class="card"><div class="wordhead"><span class="lbl">Word of the day</span><button class="icon-btn ${f ? 'saved' : ''}" id="w-fav" aria-label="Save to favorites">${ic('mark', f ? 'fill' : '')}</button></div>
      <h2 class="word">${esc(e.word)}</h2><div class="pron"><span>${esc(e.phonetic)}</span><button class="icon-btn ring" id="w-play" aria-label="Play pronunciation">${ic('vol')}</button></div>
      <p class="pos-i" style="margin-top:8px">${esc(m?.pos || '')}</p><hr class="hr"><p class="lead">${esc(m?.defs[0]?.d || '')}</p>
      ${m?.defs?.find(d => d.ex) ? `<p class="eg">“${esc(m.defs.find(d => d.ex).ex)}”</p>` : ''}
      <div class="foot"><button data-w="${esc(e.word)}">${ic('next')}View full entry</button></div></article>`;

    const wp = $('#w-play');
    const wf = $('#w-fav');
    if (wp) wp.onclick = () => play(e);
    if (wf) wf.onclick = () => { toggleFav(e); loadWotd(); };
  }

  /* ---------- Quiz ---------- */
  let Q = null;
  const shuffle = a => {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function renderQuizHome() {
    Q = null;
    const quiz = $('#quiz');
    if (!quiz) return;
    quiz.innerHTML = `<div class="card empty"><div class="ring">${ic('spark')}</div>` + (S.fav.length >= 3
      ? `<h2>Ready when you are</h2><p>Your quiz is built from ${S.fav.length} saved words. Match each word to its meaning.</p><div class="btns"><button class="btn" id="qs">Start quiz</button><button class="btn ghost" id="qsm">Try sample words</button></div>`
      : `<h2>Save a few words first</h2><p>The quiz is built from your favorites. You have ${S.fav.length} saved — save at least 3 to begin, or try a round with sample words.</p><div class="btns"><button class="btn" data-view="dictionary">Find words</button><button class="btn ghost" id="qsm">Try sample words</button></div>`) + '</div>';

    const qs = $('#qs');
    const qsm = $('#qsm');
    if (qs) qs.onclick = () => startQuiz(false);
    if (qsm) qsm.onclick = () => startQuiz(true);
  }

  function startQuiz(sample) {
    const pool = sample ? SAMPLE : S.fav.map(f => ({ word: f.word, def: f.def }));
    const qs = shuffle(pool).slice(0, 10).map(c => {
      const others = shuffle([...pool, ...SAMPLE].filter(x => x.def !== c.def));
      const seen = new Set();
      const d = [];
      for (const o of others) {
        if (!seen.has(o.def) && d.length < 3) {
          seen.add(o.def);
          d.push(o.def);
        }
      }
      return { word: c.word, ans: c.def, opts: shuffle([c.def, ...d]) };
    });
    Q = { qs, i: 0, score: 0, sample, done: false, picked: null };
    renderQ();
  }

  function renderQ() {
    const quiz = $('#quiz');
    if (!quiz || !Q) return;
    const { qs, i, score } = Q;

    if (i >= qs.length) {
      const pct = Math.round((score / qs.length) * 100);
      quiz.innerHTML = `<div class="card empty"><div class="lbl">Final score</div><div class="score">${score} / ${qs.length}</div><p>${pct >= 80 ? 'Excellent work — these words are yours.' : pct >= 50 ? 'Good progress. A second round will cement them.' : 'Keep going — review your words and try again.'}</p><div class="btns"><button class="btn" id="retry">Try again</button><button class="btn ghost" data-view="dictionary">Find more words</button></div></div>`;
      const retry = $('#retry');
      if (retry) retry.onclick = () => startQuiz(Q.sample);
      Q.done = true;
      return;
    }

    const c = qs[i];
    quiz.innerHTML = `<div class="qmeta"><span>Question ${i + 1} of ${qs.length}</span><span>Score ${score}</span></div><div class="bar"><i style="width:${(i / qs.length) * 100}%"></i></div>
    <div class="card"><div class="lbl">Which definition matches?</div><h2 class="word">${esc(c.word)}</h2><p class="small">Choose the correct meaning${Q.sample ? ' (sample words)' : ''}.</p>
    <div class="opts" role="group">${c.opts.map((o, k) => `<button class="opt" data-k="${k}"><span class="n">${k + 1}</span>${esc(o)}</button>`).join('')}</div><div class="fb" id="fb"></div></div>`;

    $$('.opt').forEach(b => {       b.onclick = () => answer(+b.dataset.k);     });   }    function answer(k) {     if (!Q \vert{}\vert{} Q.done \vert{}\vert{} Q.picked !== null) return;     const c = Q.qs[Q.i];     Q.picked = k;     const ok = c.opts[k] === c.ans;     if (ok) Q.score++;      $$
('.opt').forEach((b, n) => {
      b.disabled = true;
      if (c.opts[n] === c.ans) b.classList.add('ok');
      else if (n === k) b.classList.add('no');
    });

    const last = Q.i === Q.qs.length - 1;
    const fb = $('#fb');
    if (fb) {
      fb.innerHTML = `<span>${ok ? 'Correct — well done.' : 'Not quite. The highlighted meaning is correct.'}</span><button class="btn" id="nx">${last ? 'See score' : 'Next question'}</button>`;
      const nx = $('#nx');
      if (nx) {
        nx.onclick = next;
        nx.focus();
      }
    }
  }

  function next() {
    if (!Q || Q.picked === null) return;
    Q.i++;
    Q.picked = null;
    renderQ();
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    const gVal = $('#g-val');
    const dNote = $('#data-note');
    if (gVal) gVal.textContent = S.goal;
    if (dNote) dNote.textContent = `Everything is stored in this browser only — ${S.fav.length} saved, ${S.hist.length} in history.`;
  }

  const setGoal = d => {
    S.goal = Math.max(1, Math.min(100, S.goal + d));
    save();
    renderSettings();
    updateCounts();
  };

  /* ---------- Event Delegation & Listeners ---------- */
  document.addEventListener('click', e => {
    const t = e.target;

    const vBtn = t.closest('[data-view]');
    if (vBtn && vBtn.dataset.view) {
      e.preventDefault();
      show(vBtn.dataset.view);
      return;
    }

    const un = t.closest('[data-unfav]');
    if (un) {
      S.fav = S.fav.filter(f => f.word !== un.dataset.unfav);
      save();
      renderFav();
      updateCounts();
      return;
    }

    const dh = t.closest('[data-delhist]');
    if (dh) {
      S.hist = S.hist.filter(h => h.word !== dh.dataset.delhist);
      save();
      renderHist();
      updateCounts();
      return;
    }

    const op = t.closest('[data-open]');
    if (op) {
      const f = S.fav.find(x => x.word === op.dataset.open);
      if (f) {
        show('dictionary');
        renderEntry(f);
        const qInput = $('#q');
        if (qInput) qInput.value = f.word;
      }
      return;
    }

    const lk = t.closest('[data-lookup]');
    if (lk) {
      lookup(lk.dataset.lookup);
      return;
    }

    const w = t.closest('[data-w]');
    if (w) {
      lookup(w.dataset.w);
      return;
    }
  });

  const themeToggle = $('#themeToggle');   if (themeToggle) {     themeToggle.onclick = () => {       S.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';       save();       applyTheme();     };   }    $$('[data-theme-opt]').forEach(b => {
    b.onclick = () => {
      S.theme = b.dataset.themeOpt;
      save();
      applyTheme();
    };
  });

  const gDn = $('#g-dn');
  const gUp = $('#g-up');
  if (gDn) gDn.onclick = () => setGoal(-1);
  if (gUp) gUp.onclick = () => setGoal(1);

  const clearHist = () => {
    if (S.hist.length && confirm('Clear your search history?')) {
      S.hist = [];
      save();
      updateCounts();
      renderHist();
      renderSettings();
    }
  };

  const clearFav = () => {
    if (S.fav.length && confirm('Remove all saved words?')) {
      S.fav = [];
      save();
      updateCounts();
      renderFav();
      renderSettings();
    }
  };

  const ch1 = $('#clear-hist');
  const ch2 = $('#s-clear-hist');
  const cf1 = $('#s-clear-fav');
  if (ch1) ch1.onclick = clearHist;
  if (ch2) ch2.onclick = clearHist;
  if (cf1) cf1.onclick = clearFav;

  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      show('dictionary');
      if (q) { q.focus(); q.select(); }
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      show('dictionary');
      if (q) q.focus();
    } else if (Q && !Q.done && $('#v-quiz') && !$('#v-quiz').hidden && /^[1-4]$/.test(e.key) && !typing) {
      answer(+e.key - 1);
    } else if (e.key === 'Enter' && Q && $('#v-quiz') && !$('#v-quiz').hidden && Q.picked !== null && document.activeElement?.id !== 'nx') {
      next();
    }
  });

  /* ---------- Execution ---------- */
  applyTheme();
  updateCounts();
  show(location.hash.slice(1) || 'home');
  loadWotd();
})();