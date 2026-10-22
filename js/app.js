/* 安心 · 应用逻辑（无框架、无网络、数据只在本机） */
(function () {
  'use strict';

  var D = window.AnxinData;
  var Engine = window.AnxinEngine;
  var STORAGE_KEY = 'anxin.v1';
  var CALM_SECONDS = 180;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var state = loadState();
  var activeFilter = 'all';
  var pendingFilter = null;
  var pendingScrollToCases = false;
  var selectedWho = null;
  var justAnsweredIndex = null;
  var openContactForm = false;
  var codeFormOpen = false;
  var codeHidden = false;
  var lastAnalysis = null;
  var toastTimer = null;
  var currentSpeakBtn = null;
  var doneRenderedFor = null;
  var memoryOnly = null;

  var screens = {
    home: '安心 · 长辈防诈助手',
    calm: '冷静角 · 安心',
    learn: '学一学 · 安心',
    guard: '守护 · 安心'
  };

  var CALM_QUESTIONS = [
    { id: 'q1', text: '对方让你别挂电话、别告诉家人？', yes: '有', no: '没有', riskyValue: 1 },
    { id: 'q2', text: '对方让你转“安全账户”、共享屏幕，或下载软件？', yes: '有', no: '没有', riskyValue: 1 },
    { id: 'q3', text: '这件事，你已经告诉家里人了吗？', yes: '说过了', no: '还没说', riskyValue: 0 }
  ];

  /* ---------------- 数据 ---------------- */

  function defaultState() {
    return {
      fontSize: 'normal',
      voice: true,
      family: [],
      codeWord: '',
      quiz: { date: '', answers: {}, streak: 0, lastDone: '', completed: false, result: null },
      cooldown: null,
      lastResult: null
    };
  }

  function loadState() {
    var base = defaultState();
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      raw = memoryOnly;
    }
    if (!raw) return base;
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return base;
    }
    if (!parsed || typeof parsed !== 'object') return base;

    if (['normal', 'large', 'xlarge'].indexOf(parsed.fontSize) !== -1) base.fontSize = parsed.fontSize;
    if (parsed.voice === false) base.voice = false;

    if (Array.isArray(parsed.family)) {
      base.family = parsed.family.filter(function (c) {
        return c && typeof c.name === 'string' && typeof c.phone === 'string' && c.name.trim() && c.phone.trim();
      }).slice(0, 5).map(function (c) {
        return { name: String(c.name).slice(0, 12), phone: String(c.phone).slice(0, 20) };
      });
    }

    if (typeof parsed.codeWord === 'string') base.codeWord = parsed.codeWord.slice(0, 24);

    if (parsed.quiz && typeof parsed.quiz === 'object') {
      var q = parsed.quiz;
      base.quiz.date = typeof q.date === 'string' ? q.date : '';
      base.quiz.answers = q.answers && typeof q.answers === 'object' ? q.answers : {};
      base.quiz.streak = typeof q.streak === 'number' && q.streak >= 0 ? q.streak : 0;
      base.quiz.lastDone = typeof q.lastDone === 'string' ? q.lastDone : '';
      base.quiz.completed = !!q.completed;
      base.quiz.result = q.result && typeof q.result === 'object' ? q.result : null;
    }

    if (parsed.cooldown && typeof parsed.cooldown === 'object' &&
        typeof parsed.cooldown.deadline === 'number' && typeof parsed.cooldown.who === 'string') {
      base.cooldown = {
        who: parsed.cooldown.who,
        deadline: parsed.cooldown.deadline,
        startedAt: parsed.cooldown.startedAt || Date.now(),
        fact: typeof parsed.cooldown.fact === 'number' ? parsed.cooldown.fact : 0,
        answers: parsed.cooldown.answers && typeof parsed.cooldown.answers === 'object' ? parsed.cooldown.answers : {}
      };
    }

    if (parsed.lastResult && typeof parsed.lastResult === 'object' && Array.isArray(parsed.lastResult.labels)) {
      base.lastResult = {
        level: ['high', 'medium', 'low'].indexOf(parsed.lastResult.level) !== -1 ? parsed.lastResult.level : 'low',
        labels: parsed.lastResult.labels.slice(0, 6).map(String),
        at: parsed.lastResult.at || 0
      };
    }

    return base;
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      memoryOnly = JSON.stringify(state);
    }
  }

  /* ---------------- 工具 ---------------- */

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function telHref(phone) {
    return String(phone || '').replace(/[^\d+]/g, '');
  }

  function truncate(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2600);
  }

  function dayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function yesterdayKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return dayKey(d);
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function copyText(text) {
    return new Promise(function (resolve, reject) {
      function fallbackCopy() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try {
          ok = document.execCommand('copy');
        } catch (err) {
          ok = false;
        }
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error('copy-failed'));
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  }

  function currentScreenId() {
    var raw = window.location.hash.replace(/^#\/?/, '');
    return screens[raw] ? raw : 'home';
  }

  /* ---------------- 路由 ---------------- */

  function route() {
    var name = currentScreenId();
    $$('.screen').forEach(function (section) {
      section.classList.toggle('active', section.getAttribute('data-screen') === name);
    });
    $$('.bottom-nav a').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-nav') === name);
      if (link.getAttribute('data-nav') === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = screens[name];
    window.scrollTo(0, 0);

    if (name === 'calm') renderCalm();
    if (name === 'learn') renderLearn();
    if (name === 'guard') renderGuard();
  }

  /* ---------------- 字号 / 设置 ---------------- */

  var SIZE_LABELS = { normal: '标准', large: '大', xlarge: '特大' };

  function applyFontSize() {
    document.documentElement.setAttribute('data-size', state.fontSize);
    $$('[data-size-option]').forEach(function (btn) {
      var on = btn.getAttribute('data-size-option') === state.fontSize;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var labelEl = $('.font-toggle-label');
    if (labelEl) labelEl.textContent = '大字';
    var toggle = $('#fontToggle');
    if (toggle) {
      var nextHint = state.fontSize === 'xlarge' ? '已经是最大字号' : '点击再放大';
      toggle.setAttribute('aria-label', '当前字号' + SIZE_LABELS[state.fontSize] + '，' + nextHint);
    }
  }

  function cycleFontSize() {
    if (state.fontSize === 'xlarge') {
      toast('已经是最大字号了，可在“设置”里调小');
      return;
    }
    state.fontSize = state.fontSize === 'normal' ? 'large' : 'xlarge';
    saveState();
    applyFontSize();
    toast('字号已调整为“' + SIZE_LABELS[state.fontSize] + '”');
  }

  /* ---------------- 查一查 ---------------- */

  function updateCharCount() {
    var input = $('#messageInput');
    var count = $('#charCount');
    if (input && count) count.textContent = input.value.length + ' 字';
  }

  function renderSamples() {
    var box = $('#samples');
    box.innerHTML = D.samples.map(function (s) {
      return '<button type="button" class="sample-chip" data-sample="' + esc(s.id) + '">' + esc(s.label) + '</button>';
    }).join('');
  }

  function fillSample(id, analyzeNow) {
    var sample = D.samples.filter(function (s) { return s.id === id; })[0];
    if (!sample) return;
    var input = $('#messageInput');
    input.value = sample.text;
    updateCharCount();
    if (analyzeNow) runAnalysis(sample.text, true);
  }

  function runAnalysis(text, shouldScroll) {
    var input = $('#messageInput');
    var clean = String(text || '').trim();
    if (clean.length < 4) {
      toast('请先把对方说的话粘进来');
      if (input) input.focus();
      return;
    }

    var result = Engine.analyze(clean);
    lastAnalysis = { result: result, text: clean };

    state.lastResult = {
      level: result.level,
      labels: (result.protective || result.otp) ? [] : result.signals.slice(0, 6).map(function (s) { return s.label; }),
      at: Date.now()
    };
    saveState();

    renderResult(result);

    if (shouldScroll) {
      var card = $('.result-card');
      if (card) {
        window.setTimeout(function () {
          card.scrollIntoView({ block: 'start' });
        }, 80);
      }
    }
  }

  var ICONS = {
    high: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2 2.9 19.2a1.2 1.2 0 0 0 1.1 1.8h16a1.2 1.2 0 0 0 1.1-1.8L12 3.2Z"/><path d="M12 9v4.6"/><path d="M12 17.2h.01"/></svg>',
    medium: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.6v5"/><path d="M12 16.6h.01"/></svg>',
    low: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8 5 5.8v5.3c0 4.6 3 8.2 7 10.1 4-1.9 7-5.5 7-10.1V5.8l-7-3Z"/><path d="m9 11.6 2.1 2.1 3.9-3.9"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.6 3.5 5.2 5.9c-.8.8-1 2-.5 3 2.2 4.6 5.8 8.2 10.4 10.4 1 .5 2.2.3 3-.5l2.4-2.4c.6-.6.6-1.5 0-2.1l-2.9-2.9c-.6-.6-1.5-.6-2.1 0l-1.2 1.2a18.4 18.4 0 0 1-5-5l1.2-1.2c.6-.6.6-1.5 0-2.1L7.6 3.5Z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8 5 5.8v5.3c0 4.6 3 8.2 7 10.1 4-1.9 7-5.5 7-10.1V5.8l-7-3Z"/><path d="m9 11.6 2.1 2.1 3.9-3.9"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  var LEVEL_META = {
    high: {
      kicker: '高风险 · 请先停下',
      title: '这很可能是诈骗',
      note: '不要转账、不要点链接、不要给验证码。现在先挂断，再打给家人或 96110。'
    },
    medium: {
      kicker: '中风险 · 先核实',
      title: '这些话术有风险',
      note: '别急着照做。先挂断电话，找家人商量，或打 96110 问问。'
    },
    low: {
      kicker: '低风险 · 仍要留心',
      title: '暂时没发现明显骗术',
      note: '没有关键词，不代表一定安全。只要对方让你转钱、要验证码、共享屏幕，就立刻停下。'
    }
  };

  function groupedSignals(signals) {
    var order = ['authority', 'money', 'pressure', 'lure', 'link', 'social'];
    var groups = {};
    signals.forEach(function (s) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    return order.filter(function (cat) { return groups[cat] && groups[cat].length; }).map(function (cat) {
      return { category: cat, label: Engine.CATEGORY_LABELS[cat], items: groups[cat] };
    });
  }

  function relatedFilter(result) {
    var ids = result.signals.map(function (s) { return s.id; });
    function has(id) { return ids.indexOf(id) !== -1; }
    if (has('persona_police') || has('safe_account') || has('case_involved')) return 'police';
    if (has('persona_service')) return 'service';
    if (has('brush_order')) return 'brush';
    if (has('invest') || has('guaranteed_profit')) return 'invest';
    if (has('romance')) return 'romance';
    if (has('health_elderly')) return 'health';
    if (has('job_abroad')) return 'abroad';
    if (has('persona_acquaintance')) return 'impersonate';
    if (has('ai_voice')) return 'ai';
    return 'all';
  }

  function familyButtonHtml() {
    var family = state.family[0];
    if (family) {
      return '<a class="btn btn-ghost" href="tel:' + esc(telHref(family.phone)) + '">' + ICONS.phone + '打给' + esc(family.name) + '</a>';
    }
    return '<button class="btn btn-ghost" type="button" data-action="add-family">添加家人电话</button>';
  }

  function renderResult(result) {
    var region = $('#resultRegion');
    var meta = LEVEL_META[result.level];
    var title = meta.title;
    var kicker = meta.kicker;
    var note = meta.note;
    var icon = ICONS[result.level];

    if (result.protective) {
      kicker = '看起来像防骗提醒';
      title = '这段话是在提醒您防骗';
      note = '如果是家人、警察或银行发给您的提醒，请听他的：不转账、不给验证码、不点陌生链接。';
      icon = ICONS.low;
    } else if (result.otp) {
      kicker = '看起来像验证码短信';
      title = '验证码，只能自己用';
      note = '不要把验证码转发、念给或写给任何人。只要有人向您要验证码，不管他说是谁，都是诈骗。';
      icon = ICONS.low;
    }

    var body = '';
    if (result.protective) {
      body = '<div class="clean-state">' + ICONS.shield + '<div><strong>没有把它当成诈骗话术。</strong><br>提醒里出现“诈骗”“不要转账”这类词，是正常的。真正要警惕的是：对方让你保密、让你马上转账。</div></div>';
    } else if (result.otp) {
      body = '<div class="clean-state">' + ICONS.check + '<div><strong>这是一条验证码短信，不是让您转账的消息。</strong><br>验证码只在自己操作时使用，不要告诉任何人。拿不准就关掉短信，先给家人打电话。</div></div>';
    } else if (result.level === 'low') {
      body = '<div class="clean-state">' + ICONS.check + '<div><strong>没有命中常见的诈骗话术。</strong><br>但这只是初步检查。只要谈到钱、验证码、屏幕共享，就请停下来。</div></div>';
    } else if (result.signals.length) {
      var groups = groupedSignals(result.signals);
      body = groups.map(function (group) {
        return '<section class="result-section"><h3>' + esc(group.label) + '</h3>' +
          group.items.map(function (s) {
            return '<div class="signal"><span class="signal-dot" aria-hidden="true"></span><div class="signal-body">' +
              '<strong>' + esc(s.label) + '</strong>' +
              '<p>' + esc(s.explanation) + '</p>' +
              (s.excerpt ? '<span class="signal-quote">“' + esc(s.excerpt) + '”</span>' : '') +
              '</div></div>';
          }).join('') +
          '</section>';
      }).join('');
    }

    var extraNote = '';
    if (result.links.length > 0 && !result.protective) {
      extraNote = '<div class="soft-note">消息里有 ' + result.links.length + ' 个链接，都不要点开。真想核实，请自己打开官方 App，或打 96110。</div>';
    }
    if (result.protective) {
      extraNote = '';
    }

    var showActions = !result.protective && !result.otp && result.level !== 'low';
    var actions = '';
    if (showActions) {
      actions = '<div class="result-actions">' +
        '<a class="btn btn-call" href="tel:96110">' + ICONS.phone + '打 96110 问问</a>' +
        '<div class="action-row">' +
        familyButtonHtml() +
        '<button class="btn btn-ghost" type="button" data-action="learn-related" data-filter="' + esc(relatedFilter(result)) + '">看同类骗局</button>' +
        '</div>' +
        '<button class="link-btn" type="button" data-action="share-result">把这次检查结果发给家人</button>' +
        '</div>';
    } else {
      actions = '<div class="result-actions">' +
        '<button class="btn btn-ghost" type="button" data-action="learn-related" data-filter="' + esc(relatedFilter(result)) + '">看看常见骗局</button>' +
        '</div>';
    }

    region.innerHTML = '<article class="result-card ' + result.level + '" tabindex="-1" aria-label="检查结果：' + esc(title) + '">' +
      '<div class="result-head">' +
      '<div class="result-icon">' + icon + '</div>' +
      '<div><p class="result-kicker">' + esc(kicker) + '</p><h2 class="result-title">' + esc(title) + '</h2><p class="result-note">' + esc(note) + '</p></div>' +
      '</div>' +
      '<div class="result-body">' + body + extraNote + actions + '</div>' +
      '</article>';
  }

  function buildResultShareText() {
    if (lastAnalysis) {
      var r = lastAnalysis.result;
      var labels = r.signals.slice(0, 4).map(function (s) { return s.label; });
      var lines = ['【安心 · 检查提醒】', '我刚检查了一段可疑消息，结果：' + LEVEL_META[r.level].title + '。'];
      if (labels.length) lines.push('可疑点：' + labels.join('、') + '。');
      lines.push('对方说的原话：“' + truncate(lastAnalysis.text, 90) + '”');
      lines.push('请帮我看看，别让我急着转账。拿不准就打 96110。');
      return lines.join('\n');
    }
    if (state.lastResult) {
      return '【安心 · 求助】\n我刚检查了一段可疑消息，发现：' +
        state.lastResult.labels.slice(0, 4).join('、') +
        '。\n请马上给我打个电话，别让我转账。也请帮我打 96110 核实。';
    }
    return buildHelpText();
  }

  function buildHelpText() {
    var lines = ['【安心 · 求助】', '我可能遇到了诈骗，请马上给我打电话。'];
    if (state.lastResult && state.lastResult.labels.length) {
      lines.push('刚才检查到：' + state.lastResult.labels.slice(0, 4).join('、') + '。');
    }
    lines.push('请不要让我转账、不要让我给验证码。拿不准就打 96110 核实。');
    return lines.join('\n');
  }

  /* ---------------- 分享 ---------------- */

  function openShareDialog(text, family) {
    var dialog = $('#shareDialog');
    $('#shareText').value = text;
    var callBtn = $('#callFamilyBtn');
    if (family) {
      callBtn.hidden = false;
      callBtn.textContent = '打给' + family.name;
      callBtn.onclick = function () {
        window.location.href = 'tel:' + telHref(family.phone);
      };
    } else {
      callBtn.hidden = true;
      callBtn.onclick = null;
    }

    var nativeBtn = $('#nativeShareBtn');
    if (navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.onclick = function () {
        navigator.share({ title: '安心 · 求助', text: text }).then(function () {
          dialog.close();
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          toast('系统分享没有成功，请复制文字发给家人');
        });
      };
    } else {
      nativeBtn.hidden = true;
      nativeBtn.onclick = null;
    }

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', 'open');
    }
  }

  function shareOrOpen(text) {
    openShareDialog(text, state.family[0] || null);
  }

  /* ---------------- 冷静角 ---------------- */

  function renderWhoChoices() {
    var box = $('#whoChoices');
    box.innerHTML = D.whoChoices.map(function (w) {
      var picked = selectedWho === w.id;
      return '<button type="button" class="choice-btn' + (picked ? ' is-picked' : '') + '" data-who="' + esc(w.id) + '" aria-pressed="' + (picked ? 'true' : 'false') + '">' + esc(w.label) + '</button>';
    }).join('');
    var start = $('#startCalm');
    start.disabled = !selectedWho;
  }

  function whoLabel(id) {
    var found = D.whoChoices.filter(function (w) { return w.id === id; })[0];
    return found ? found.label : '说不清是谁';
  }

  function calmRisks(cd) {
    var risks = [];
    if (cd.answers.q1 === 1) risks.push('对方让你保密、别挂电话');
    if (cd.answers.q2 === 1) risks.push('对方让你转“安全账户”或共享屏幕');
    if (cd.answers.q3 === 0) risks.push('这件事还没告诉家里人');
    return risks;
  }

  function calmActiveHtml(cd) {
    var done = cd.deadline <= Date.now();
    var risks = calmRisks(cd);
    var fact = D.calmFacts[cd.fact % D.calmFacts.length];
    var family = state.family[0];

    var questions = CALM_QUESTIONS.map(function (q) {
      var value = cd.answers[q.id];
      var pickedRisky = value === q.riskyValue;
      function btn(val, label) {
        var picked = value === val;
        var risky = picked && pickedRisky;
        return '<button type="button" class="answer-btn' + (picked ? ' is-picked' : '') + (risky ? ' risky' : '') +
          '" data-answer="' + q.id + '" data-val="' + val + '" aria-pressed="' + (picked ? 'true' : 'false') + '">' + esc(label) + '</button>';
      }
      return '<div class="question"><p>' + esc(q.text) + '</p><div class="answer-row">' + btn(1, q.yes) + btn(0, q.no) + '</div></div>';
    }).join('');

    var doneHtml = done ?
      '<div class="calm-done-banner"><strong>三分钟到了。</strong><p>现在请打 96110 核实，或让家人陪您去银行。不要按对方说的做。</p></div>' : '';

    var familyAction = family ?
      '<a class="btn btn-call" href="tel:' + esc(telHref(family.phone)) + '">' + ICONS.phone + '打给 ' + esc(family.name) + '</a>' :
      '<button class="btn btn-call" type="button" data-action="calm-add-family">先添加家人电话</button>';

    var alertHtml = risks.length ?
      '<div class="calm-alert">' + ICONS.high + '<div><strong>先别转。已经出现危险信号：</strong>' + esc(risks.join('；')) +
      '。' + (family ? '现在就给' + esc(family.name) + '打个电话。' : '现在先联系家里人。') +
      '<div class="calm-alert-actions">' + familyAction + '</div></div></div>' : '';

    return '<section class="card calm-active" aria-labelledby="calmRunTitle">' +
      '<div class="calm-who">对方说他是 <strong>' + esc(whoLabel(cd.who)) + '</strong></div>' +
      '<div class="calm-timer' + (done ? ' is-done' : '') + '" id="calmTimer">' +
      '<svg viewBox="0 0 200 200" aria-hidden="true"><circle class="timer-track" cx="100" cy="100" r="86"/><circle class="timer-progress" id="timerProgress" cx="100" cy="100" r="86"/></svg>' +
      '<div class="timer-face"><span class="timer-digits" id="timerDigits">' + (done ? '00:00' : '03:00') + '</span><span class="timer-label" id="timerLabel">' + (done ? '时间到，先核实' : '深呼吸，先别操作') + '</span></div>' +
      '</div>' +
      doneHtml + alertHtml +
      '<div class="calm-questions"><h2 id="calmRunTitle" class="sr-only">先回答三个问题</h2>' + questions + '</div>' +
      '<div class="call-row">' + familyAction + '<a class="btn btn-ghost" href="tel:96110">' + ICONS.phone + '打 96110 核实</a></div>' +
      '<p class="timer-fact">' + esc(fact) + '</p>' +
      '<button type="button" class="link-btn" data-action="reset-calm">重新开始</button>' +
      '</section>';
  }

  function updateTimerDom(remainingMs) {
    var progress = $('#timerProgress');
    var digits = $('#timerDigits');
    var timer = $('#calmTimer');
    if (!progress || !digits) return;
    var circumference = 2 * Math.PI * 86;
    var ratio = Math.max(0, Math.min(1, remainingMs / (CALM_SECONDS * 1000)));
    progress.setAttribute('stroke-dasharray', String(circumference));
    progress.style.strokeDashoffset = String(circumference * (1 - ratio));
    var secs = Math.max(0, Math.ceil(remainingMs / 1000));
    var mm = String(Math.floor(secs / 60)).padStart(2, '0');
    var ss = String(secs % 60).padStart(2, '0');
    digits.textContent = mm + ':' + ss;
    if (timer) timer.classList.toggle('is-low', secs <= 30 && secs > 0);
  }

  function renderCalm() {
    var setup = $('#calmSetup');
    var panel = $('#calmPanel');
    var cd = state.cooldown;

    if (!cd) {
      setup.hidden = false;
      panel.innerHTML = '';
      renderWhoChoices();
      return;
    }

    setup.hidden = true;
    panel.innerHTML = calmActiveHtml(cd);
    var remaining = cd.deadline - Date.now();
    if (remaining > 0) {
      updateTimerDom(remaining);
    } else {
      updateTimerDom(0);
    }
  }

  function startCalm() {
    if (!selectedWho) {
      toast('先选一下对方是谁');
      return;
    }
    state.cooldown = {
      who: selectedWho,
      deadline: Date.now() + CALM_SECONDS * 1000,
      startedAt: Date.now(),
      fact: Math.floor(Math.random() * D.calmFacts.length),
      answers: { q1: null, q2: null, q3: null }
    };
    doneRenderedFor = null;
    saveState();
    renderCalm();
    window.setTimeout(function () {
      var panel = $('#calmPanel .calm-active');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function tickCalm() {
    if (currentScreenId() !== 'calm') return;
    var cd = state.cooldown;
    if (!cd) return;
    var remaining = cd.deadline - Date.now();
    if (remaining > 0) {
      updateTimerDom(remaining);
      return;
    }
    updateTimerDom(0);
    if (doneRenderedFor !== cd.deadline) {
      doneRenderedFor = cd.deadline;
      renderCalm();
    }
  }

  /* ---------------- 学一学 ---------------- */

  function ensureQuizDay() {
    var today = dayKey();
    if (state.quiz.date !== today) {
      state.quiz.date = today;
      state.quiz.answers = {};
      state.quiz.completed = false;
      state.quiz.result = null;
      justAnsweredIndex = null;
      saveState();
    }
  }

  function todayQuestions() {
    var indices = D.quiz.map(function (_, i) { return i; });
    var rng = mulberry32(hashString(dayKey()));
    for (var i = indices.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }
    return indices.slice(0, 3).map(function (i) {
      var q = D.quiz[i];
      return {
        index: i,
        q: q.q,
        options: q.options,
        answer: q.answer,
        explain: q.explain
      };
    });
  }

  function streakLabel(streak) {
    return streak > 0 ? '连续学习 ' + streak + ' 天' : '从今天开始';
  }

  function finalizeQuiz(questions) {
    var answers = state.quiz.answers;
    var correct = questions.filter(function (q) { return answers[q.index] === q.answer; }).length;
    state.quiz.result = { correct: correct, total: questions.length };
    if (!state.quiz.completed) {
      state.quiz.completed = true;
      var today = dayKey();
      if (state.quiz.lastDone !== today) {
        state.quiz.streak = state.quiz.lastDone === yesterdayKey() ? (state.quiz.streak || 0) + 1 : 1;
        state.quiz.lastDone = today;
      }
      saveState();
    }
    return correct;
  }

  function quizHeadHtml(streak, subtitle) {
    return '<div class="quiz-head"><div><h2 id="quizTitle">今日小测</h2><p class="hint">' + esc(subtitle) + '</p></div>' +
      '<span class="quiz-streak">' + esc(streakLabel(streak)) + '</span></div>';
  }

  function quizDotsHtml(questions, currentIndex) {
    return '<div class="quiz-progress" aria-hidden="true">' + questions.map(function (q) {
      var answered = state.quiz.answers[q.index] != null;
      var current = q.index === currentIndex;
      return '<span class="quiz-dot' + (answered ? ' is-done' : '') + (current && !answered ? ' is-now' : '') + '"></span>';
    }).join('') + '</div>';
  }

  function renderQuizCard() {
    var box = $('#quizCard');
    ensureQuizDay();
    var questions = todayQuestions();
    var answers = state.quiz.answers;
    var streak = state.quiz.streak || 0;

    if (justAnsweredIndex !== null) {
      var answeredQ = questions.filter(function (q) { return q.index === justAnsweredIndex; })[0];
      if (answeredQ) {
        renderQuizFeedback(box, questions, answeredQ, answers[answeredQ.index], streak);
        return;
      }
      justAnsweredIndex = null;
    }

    var current = questions.filter(function (q) { return answers[q.index] == null; })[0];
    if (!current) {
      renderQuizDone(box, questions);
      return;
    }

    var position = questions.indexOf(current) + 1;
    var answeredCount = questions.filter(function (q) { return answers[q.index] != null; }).length;
    box.innerHTML = quizHeadHtml(streak, '3 道题，看看您会不会上当。') +
      quizDotsHtml(questions, current.index) +
      '<p class="quiz-q" tabindex="-1">第 ' + position + ' 题：' + esc(current.q) + '</p>' +
      '<div class="quiz-options">' + current.options.map(function (opt, i) {
        return '<button type="button" class="quiz-option" data-quiz-option="' + current.index + '" data-option="' + i + '">' +
          '<span class="opt-letter" aria-hidden="true">' + 'ABC'[i] + '</span><span>' + esc(opt) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="quiz-foot"><span class="quiz-score">已答 ' + answeredCount + ' / ' + questions.length + '</span></div>';
  }

  function renderQuizFeedback(box, questions, question, choice, streak) {
    var position = questions.indexOf(question) + 1;
    var correct = choice === question.answer;
    var answeredCount = questions.filter(function (q) { return state.quiz.answers[q.index] != null; }).length;
    var isLast = answeredCount === questions.length;

    var optionsHtml = question.options.map(function (opt, i) {
      var classes = 'quiz-option';
      if (i === question.answer) classes += ' is-correct';
      else if (i === choice) classes += ' is-wrong';
      return '<button type="button" class="' + classes + '" disabled>' +
        '<span class="opt-letter" aria-hidden="true">' + 'ABC'[i] + '</span><span>' + esc(opt) + '</span></button>';
    }).join('');

    var explain = '<div class="quiz-feedback ' + (correct ? 'good' : 'bad') + '" role="status" tabindex="-1">' +
      '<strong>' + (correct ? '答对了' : '答错了，正确答案是 ' + 'ABC'[question.answer]) + '</strong>' +
      esc(question.explain) + '</div>';

    box.innerHTML = quizHeadHtml(streak, '3 道题，看看您会不会上当。') +
      quizDotsHtml(questions, question.index) +
      '<p class="quiz-q" tabindex="-1">第 ' + position + ' 题：' + esc(question.q) + '</p>' +
      '<div class="quiz-options">' + optionsHtml + '</div>' + explain +
      '<div class="quiz-foot"><span class="quiz-score">已答 ' + answeredCount + ' / ' + questions.length + '</span>' +
      '<button type="button" class="btn btn-primary btn-sm" data-quiz-next>' + (isLast ? '看今天的结果' : '下一题') + '</button></div>';
  }

  function renderQuizDone(box, questions) {
    var correct = finalizeQuiz(questions);
    var perfect = correct === questions.length;
    var streak = state.quiz.streak || 0;
    box.innerHTML = quizHeadHtml(streak, '今天的题做完了。') +
      '<div class="quiz-done"><p class="big">' + (perfect ? '全对，真棒！' : '答对 ' + correct + ' / ' + questions.length + ' 题') + '</p>' +
      '<p>' + (perfect ? '这几招您已经记住了。明天再来，保持这份警觉。' : '错的地方不要紧。记住一句话：拿不准，就打 96110。') + '</p>' +
      '<div class="form-actions"><button type="button" class="btn btn-ghost" data-quiz-retry>再练一遍</button>' +
      '<button type="button" class="btn btn-primary" data-quiz-cases>看看案例</button></div></div>';
  }

  function answerQuiz(questionIndex, optionIndex) {
    if (state.quiz.answers[questionIndex] != null) return;
    state.quiz.answers[questionIndex] = optionIndex;
    justAnsweredIndex = questionIndex;
    saveState();
    renderQuizCard();
    var feedback = $('#quizCard .quiz-feedback');
    if (feedback) feedback.focus({ preventScroll: true });
  }

  function buildFilters() {
    var seen = {};
    var list = [{ id: 'all', label: '全部' }];
    D.cases.forEach(function (c) {
      if (!seen[c.category]) {
        seen[c.category] = true;
        list.push({ id: c.category, label: c.categoryLabel });
      }
    });
    return list;
  }

  function renderCaseFilters() {
    var box = $('#caseFilters');
    var filters = buildFilters();
    if (activeFilter !== 'all' && !filters.some(function (f) { return f.id === activeFilter; })) activeFilter = 'all';
    box.innerHTML = filters.map(function (f) {
      return '<button type="button" class="filter-chip' + (activeFilter === f.id ? ' is-active' : '') + '" data-filter="' + esc(f.id) + '" aria-pressed="' + (activeFilter === f.id ? 'true' : 'false') + '">' + esc(f.label) + '</button>';
    }).join('');
  }

  function renderCaseList() {
    var box = $('#caseList');
    var list = D.cases.filter(function (c) { return activeFilter === 'all' || c.category === activeFilter; });
    var canSpeak = state.voice && 'speechSynthesis' in window;
    box.innerHTML = list.map(function (c) {
      return '<article class="case-card" data-case="' + esc(c.id) + '">' +
        '<div class="case-top"><span class="case-badge">' + esc(c.categoryLabel) + '</span>' +
        (canSpeak ? '<button type="button" class="case-listen" data-listen="' + esc(c.id) + '" aria-label="听一听：' + esc(c.title) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h3l5 4V5L7 9H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5"/><path d="M19.5 7a7.5 7.5 0 0 1 0 10"/></svg>' +
          '<span class="listen-label">听一听</span></button>' : '') +
        '</div>' +
        '<h3 class="case-title">' + esc(c.title) + '</h3>' +
        '<p class="case-one-line">' + esc(c.oneLine) + '</p>' +
        '<p class="case-scene">' + esc(c.scene) + '</p>' +
        '<div class="case-remember">' + ICONS.shield + '<span>记住：' + esc(c.remember) + '</span></div>' +
        '</article>';
    }).join('');
  }

  function renderLearn() {
    if (pendingFilter) {
      activeFilter = pendingFilter;
      pendingFilter = null;
    }
    renderQuizCard();
    renderCaseFilters();
    renderCaseList();
    if (pendingScrollToCases) {
      pendingScrollToCases = false;
      window.setTimeout(function () {
        var filters = $('.filter-wrap');
        if (filters) filters.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (currentSpeakBtn) {
      currentSpeakBtn.classList.remove('is-playing');
      var label = currentSpeakBtn.querySelector('.listen-label');
      if (label) label.textContent = '听一听';
      currentSpeakBtn = null;
    }
  }

  function speakCase(btn, caseId) {
    if (!('speechSynthesis' in window)) {
      toast('这个浏览器不支持朗读，请让家人读给您听');
      return;
    }
    if (currentSpeakBtn === btn) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    var item = D.cases.filter(function (c) { return c.id === caseId; })[0];
    if (!item) return;
    var text = item.title + '。' + item.oneLine + '。' + item.scene + '。记住：' + item.remember;
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.88;
    utter.pitch = 1;
    var voices = window.speechSynthesis.getVoices();
    var zh = voices.filter(function (v) { return /zh|chinese|中文/i.test(v.lang + ' ' + v.name); })[0];
    if (zh) utter.voice = zh;

    utter.onend = function () {
      if (currentSpeakBtn === btn) stopSpeaking();
    };
    utter.onerror = function () {
      if (currentSpeakBtn === btn) stopSpeaking();
      toast('朗读没有成功，请稍后再试');
    };

    currentSpeakBtn = btn;
    btn.classList.add('is-playing');
    var label = btn.querySelector('.listen-label');
    if (label) label.textContent = '停止';
    window.speechSynthesis.speak(utter);
  }

  function goLearn(filter) {
    pendingFilter = filter;
    pendingScrollToCases = true;
    if (currentScreenId() === 'learn') {
      renderLearn();
    } else {
      window.location.hash = '#/learn';
    }
  }

  /* ---------------- 守护 ---------------- */

  function codeCardHtml() {
    var hint = '接到“家人”的电话或视频，先问一句：“咱们家的暗号是什么？”答不上来，就挂断，再用平时存的号码打回去。';
    var form = '';
    if (codeFormOpen) {
      form = '<form class="inline-form" data-code-form>' +
        '<label for="codeInput">你们约定的暗号</label>' +
        '<input id="codeInput" type="text" maxlength="24" autocomplete="off" value="' + esc(state.codeWord) + '" placeholder="例如：老家门牌号 + 小名">' +
        '<p class="hint">别用生日、手机号这些别人能猜到的。</p>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">保存暗号</button>' +
        '<button type="button" class="btn btn-ghost" data-action="code-cancel">取消</button></div></form>';
    }

    if (!state.codeWord) {
      return '<div class="code-head">' + ICONS.shield + '<div><h2 id="codeTitle">和家人约一个暗号</h2>' +
        '<p class="hint">现在的 AI 能换脸、能模仿声音。暗号是只有家里人知道的“钥匙”。</p></div></div>' +
        '<p class="code-explain">接到“子女”“老伴”要钱的电话或视频，先问暗号。答不上来，就挂断，用平时的号码打回去。</p>' +
        '<div class="code-actions"><button type="button" class="btn btn-warm btn-sm" data-action="code-setup">设置家庭暗号</button></div>' +
        form;
    }

    var shown = codeHidden ? '••••••' : state.codeWord;
    return '<div class="code-head">' + ICONS.shield + '<div><h2 id="codeTitle">家庭暗号</h2>' +
      '<p class="hint">先让对方说，不要自己先提示。</p></div></div>' +
      '<div class="code-display"><span class="code-word' + (codeHidden ? ' is-hidden' : '') + '">' + esc(shown) + '</span></div>' +
      '<p class="code-explain">' + esc(hint) + '</p>' +
      '<div class="code-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="code-reveal">' + (codeHidden ? '显示暗号' : '隐藏暗号') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="code-copy">复制提醒卡</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="code-setup">更换</button>' +
      '</div>' + form;
  }

  function codeVerificationText() {
    return '【家庭暗号 · 验证卡】\n' +
      '接到自称“家人”的电话或视频，先问一句：\n' +
      '“咱们家的暗号是什么？”\n' +
      '答不上来，就挂断，再用平时存的号码打回去。\n' +
      '暗号只有家里人知道，别发到群里，也别告诉外人。\n' +
      '—— 安心 · 长辈防诈助手';
  }

  function renderContacts() {
    var list = $('#contactList');
    if (!state.family.length) {
      list.innerHTML = '<li class="empty-contacts">还没有添加家人电话。添加后，遇到拿不准的事，一键就能打过去。</li>';
      return;
    }
    list.innerHTML = state.family.map(function (c, i) {
      return '<li class="contact-item">' +
        '<span class="contact-avatar" aria-hidden="true">' + esc(c.name.slice(0, 1)) + '</span>' +
        '<div class="contact-info"><div class="contact-name">' + esc(c.name) + '</div><div class="contact-phone">' + esc(c.phone) + '</div></div>' +
        '<a class="contact-call" href="tel:' + esc(telHref(c.phone)) + '">' + ICONS.phone + '拨打</a>' +
        '<button type="button" class="contact-del" data-del-index="' + i + '" aria-label="删除' + esc(c.name) + '的电话">×</button>' +
        '</li>';
    }).join('');
  }

  function renderGuard() {
    $('#codeCard').innerHTML = codeCardHtml();
    renderContacts();

    var form = $('#contactForm');
    form.hidden = !openContactForm;
    $('#addContactToggle').setAttribute('aria-expanded', openContactForm ? 'true' : 'false');
    $('#addContactToggle').textContent = openContactForm ? '收起' : '＋ 添加';

    var hint = $('#helpHint');
    if (state.lastResult && state.lastResult.labels.length) {
      hint.textContent = '消息里会带上最近一次检查发现的可疑点：' + state.lastResult.labels.slice(0, 3).join('、') + '。';
    } else {
      hint.textContent = '消息里会请求家人马上给您回电话。';
    }

    $('#voiceToggle').checked = state.voice;
    applyFontSize();
  }

  function addContactFromForm() {
    var nameEl = $('#contactName');
    var phoneEl = $('#contactPhone');
    var name = nameEl.value.trim();
    var phone = phoneEl.value.trim();
    if (!name) {
      toast('请填写怎么称呼');
      nameEl.focus();
      return;
    }
    if (phone.replace(/\D/g, '').length < 5) {
      toast('请填写正确的电话号码');
      phoneEl.focus();
      return;
    }
    if (state.family.length >= 5) {
      toast('最多保存 5 位家人');
      return;
    }
    state.family.push({ name: name.slice(0, 12), phone: phone.slice(0, 20) });
    saveState();
    openContactForm = false;
    nameEl.value = '';
    phoneEl.value = '';
    renderGuard();
    toast('已保存' + name + '的电话');
  }

  function goGuardAddFamily() {
    openContactForm = true;
    if (currentScreenId() === 'guard') {
      renderGuard();
      window.setTimeout(function () { $('#contactName').focus(); }, 50);
    } else {
      window.location.hash = '#/guard';
      window.setTimeout(function () { $('#contactName').focus(); }, 200);
    }
  }

  /* ---------------- 初始化与事件 ---------------- */

  function bindEvents() {
    $('#fontToggle').addEventListener('click', cycleFontSize);

    var skipLink = $('.skip-link');
    if (skipLink) {
      skipLink.addEventListener('click', function (e) {
        e.preventDefault();
        var main = $('#main');
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      });
    }

    var input = $('#messageInput');
    input.addEventListener('input', updateCharCount);

    $('#analyzeBtn').addEventListener('click', function () {
      runAnalysis(input.value, true);
    });

    $('#samples').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sample]');
      if (!btn) return;
      fillSample(btn.getAttribute('data-sample'), true);
    });

    $('#pasteBtn').addEventListener('click', function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        input.focus();
        toast('请长按输入框，选择“粘贴”');
        return;
      }
      navigator.clipboard.readText().then(function (text) {
        if (!text || !text.trim()) {
          toast('剪贴板里没有文字');
          return;
        }
        input.value = text.slice(0, 2000);
        updateCharCount();
        toast('已粘贴，点“帮我看看”');
      }).catch(function () {
        input.focus();
        toast('请长按输入框，选择“粘贴”');
      });
    });

    var voiceBtn = $('#voiceBtn');
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      voiceBtn.addEventListener('click', function () {
        toast('这个浏览器不支持语音输入，请用文字输入');
      });
    } else {
      var recognition = new Recognition();
      var listening = false;
      var baseText = '';
      recognition.lang = 'zh-CN';
      recognition.interimResults = true;
      recognition.continuous = false;

      voiceBtn.addEventListener('click', function () {
        if (listening) {
          recognition.stop();
          return;
        }
        baseText = input.value.trim();
        try {
          recognition.start();
          listening = true;
          voiceBtn.classList.add('listening');
          voiceBtn.lastChild.textContent = ' 正在听…';
        } catch (err) {
          toast('语音没有启动，请再试一次');
        }
      });

      recognition.onresult = function (event) {
        var transcript = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        input.value = (baseText ? baseText + ' ' : '') + transcript;
        updateCharCount();
      };
      recognition.onend = function () {
        listening = false;
        voiceBtn.classList.remove('listening');
        voiceBtn.lastChild.textContent = ' 用嘴说';
      };
      recognition.onerror = function () {
        listening = false;
        voiceBtn.classList.remove('listening');
        voiceBtn.lastChild.textContent = ' 用嘴说';
        toast('没听清，请再说一次，或用文字输入');
      };
    }

    $('#resultRegion').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action === 'learn-related') {
        goLearn(btn.getAttribute('data-filter') || 'all');
      } else if (action === 'share-result') {
        shareOrOpen(buildResultShareText());
      } else if (action === 'add-family') {
        goGuardAddFamily();
      }
    });

    $('#whoChoices').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-who]');
      if (!btn) return;
      selectedWho = btn.getAttribute('data-who');
      renderWhoChoices();
    });

    $('#startCalm').addEventListener('click', startCalm);

    $('#calmPanel').addEventListener('click', function (e) {
      var answer = e.target.closest('[data-answer]');
      if (answer && state.cooldown) {
        var q = answer.getAttribute('data-answer');
        var val = Number(answer.getAttribute('data-val'));
        state.cooldown.answers[q] = val;
        saveState();
        renderCalm();
        return;
      }
      var addFamilyBtn = e.target.closest('[data-action="calm-add-family"]');
      if (addFamilyBtn) {
        goGuardAddFamily();
        return;
      }
      var actionBtn = e.target.closest('[data-action="reset-calm"]');
      if (actionBtn) {
        state.cooldown = null;
        selectedWho = null;
        saveState();
        renderCalm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    $('#caseFilters').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      activeFilter = btn.getAttribute('data-filter');
      stopSpeaking();
      renderCaseFilters();
      renderCaseList();
    });

    $('#caseList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-listen]');
      if (!btn) return;
      speakCase(btn, btn.getAttribute('data-listen'));
    });

    $('#quizCard').addEventListener('click', function (e) {
      var opt = e.target.closest('[data-quiz-option]');
      if (opt) {
        answerQuiz(Number(opt.getAttribute('data-quiz-option')), Number(opt.getAttribute('data-option')));
        return;
      }
      if (e.target.closest('[data-quiz-next]')) {
        justAnsweredIndex = null;
        renderQuizCard();
        var questionEl = $('#quizCard .quiz-q');
        if (questionEl) questionEl.focus({ preventScroll: true });
        return;
      }
      if (e.target.closest('[data-quiz-retry]')) {
        state.quiz.answers = {};
        state.quiz.result = null;
        justAnsweredIndex = null;
        saveState();
        renderQuizCard();
        toast('重新开始，加油');
        return;
      }
      if (e.target.closest('[data-quiz-cases]')) {
        var filters = $('.filter-wrap');
        if (filters) filters.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    $('#addContactToggle').addEventListener('click', function () {
      openContactForm = !openContactForm;
      renderGuard();
      if (openContactForm) window.setTimeout(function () { $('#contactName').focus(); }, 30);
    });

    $('#cancelContact').addEventListener('click', function () {
      openContactForm = false;
      renderGuard();
    });

    $('#contactForm').addEventListener('submit', function (e) {
      e.preventDefault();
      addContactFromForm();
    });

    $('#contactList').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del-index]');
      if (!del) return;
      var idx = Number(del.getAttribute('data-del-index'));
      var contact = state.family[idx];
      if (!contact) return;
      if (window.confirm('删除' + contact.name + '的电话？')) {
        state.family.splice(idx, 1);
        saveState();
        renderGuard();
        toast('已删除');
      }
    });

    $('#helpBtn').addEventListener('click', function () {
      shareOrOpen(buildHelpText());
    });

    $('#codeCard').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action === 'code-setup') {
        codeFormOpen = true;
        renderGuard();
        window.setTimeout(function () {
          var codeInput = $('#codeInput');
          if (codeInput) { codeInput.focus(); codeInput.select(); }
        }, 30);
      } else if (action === 'code-cancel') {
        codeFormOpen = false;
        renderGuard();
      } else if (action === 'code-reveal') {
        codeHidden = !codeHidden;
        renderGuard();
      } else if (action === 'code-copy') {
        copyText(codeVerificationText()).then(function () {
          toast('提醒卡已复制，发给家人吧');
        }).catch(function () {
          openShareDialog(codeVerificationText(), state.family[0] || null);
        });
      }
    });

    $('#codeCard').addEventListener('submit', function (e) {
      if (!e.target.matches('[data-code-form]')) return;
      e.preventDefault();
      var input = $('#codeInput');
      var word = input.value.trim();
      if (word.length < 2) {
        toast('暗号至少 2 个字');
        input.focus();
        return;
      }
      state.codeWord = word.slice(0, 24);
      codeFormOpen = false;
      codeHidden = false;
      saveState();
      renderGuard();
      toast('暗号已保存，记得让家里人都知道');
    });

    $('#fontSegment').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-size-option]');
      if (!btn) return;
      state.fontSize = btn.getAttribute('data-size-option');
      saveState();
      applyFontSize();
      toast('字号已调整为“' + SIZE_LABELS[state.fontSize] + '”');
    });

    $('#voiceToggle').addEventListener('change', function () {
      state.voice = this.checked;
      saveState();
      if (currentScreenId() === 'learn') {
        stopSpeaking();
        renderCaseList();
      }
      toast(state.voice ? '已显示朗读按钮' : '已隐藏朗读按钮');
    });

    $('#clearDataBtn').addEventListener('click', function () {
      if (!window.confirm('清除后，家人电话、家庭暗号、学习记录都会消失。确定要清除吗？')) return;
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (err) { /* ignore */ }
      state = defaultState();
      memoryOnly = null;
      lastAnalysis = null;
      activeFilter = 'all';
      selectedWho = null;
      justAnsweredIndex = null;
      openContactForm = false;
      codeFormOpen = false;
      codeHidden = false;
      pendingFilter = null;
      pendingScrollToCases = false;
      doneRenderedFor = null;
      stopSpeaking();
      $('#messageInput').value = '';
      $('#contactName').value = '';
      $('#contactPhone').value = '';
      updateCharCount();
      $('#resultRegion').innerHTML = '';
      applyFontSize();
      route();
      toast('本机数据已清除');
    });

    $('#copyShareBtn').addEventListener('click', function () {
      copyText($('#shareText').value).then(function () {
        toast('已复制，去微信粘贴给家人');
      }).catch(function () {
        $('#shareText').focus();
        $('#shareText').select();
        toast('请长按文字，选择“复制”');
      });
    });

    window.addEventListener('hashchange', function () {
      stopSpeaking();
      var dialog = $('#shareDialog');
      if (dialog.open) dialog.close();
      route();
    });
  }

  function init() {
    applyFontSize();
    renderSamples();
    bindEvents();
    route();
    window.setInterval(tickCalm, 250);

    var params = new URLSearchParams(window.location.search);
    var sampleId = params.get('sample');
    if (sampleId) {
      fillSample(sampleId, false);
      var sample = D.samples.filter(function (s) { return s.id === sampleId; })[0];
      if (sample) runAnalysis(sample.text, true);
    }

    if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* 离线缓存不可用也不影响使用 */ });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
