/* Sofia — "Never Miss a Customer" demo chat engine (real-estate edition).
   100% client-side. No network calls, no tracking. Works from file:// .
   Leads persist in the browser only (localStorage key "nmc_realestate_leads").
   Test hooks: ?fast=1 skips delays; window.__maya exposes state + send(). */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var FAST = qs.get('fast') === '1';
  var LEAD_KEY = 'nmc_realestate_leads';

  /* ---------- business profile (personalizable via ?biz= etc.) ---------- */
  var BIZ = {
    name:    qs.get('biz')     || 'Lantern & Key Realty',
    tagline: qs.get('tagline') || 'Boutique Brokerage',
    city:    qs.get('city')    || 'Boise, ID',
    address: qs.get('addr') || qs.get('address') || '4812 W Harborview Ave, Boise, ID 83703',
    phone:   qs.get('phone')   || '(208) 555-0147',
    host: 'Sofia'
  };
  // short ref prefix from the name's initials, e.g. "Lantern & Key" -> "LK"
  BIZ.refPrefix = (BIZ.name.split(/\s+/).map(function (w) { return w.charAt(0); }).filter(function (c) { return /[A-Za-z]/.test(c); }).join('').slice(0, 2).toUpperCase()) || 'LK';

  /* apply personalization to the page */
  function personalize() {
    document.querySelectorAll('[data-biz="name"]').forEach(function (el) { el.textContent = BIZ.name; });
    document.querySelectorAll('[data-biz="tagline"]').forEach(function (el) { el.textContent = BIZ.tagline; });
    document.querySelectorAll('[data-biz="city"]').forEach(function (el) { el.textContent = BIZ.city; });
    document.querySelectorAll('[data-biz="address"]').forEach(function (el) { el.textContent = BIZ.address; });
    document.querySelectorAll('[data-biz="phone"]').forEach(function (el) { el.textContent = BIZ.phone; });
    document.querySelectorAll('[data-biz="host"]').forEach(function (el) { el.textContent = BIZ.host; });
    document.querySelectorAll('[data-biz="host-initial"]').forEach(function (el) { el.textContent = BIZ.host.charAt(0); });
    document.title = BIZ.name + ' — ' + BIZ.tagline + ' | ' + BIZ.city;
  }
  /* ---------- deep personalization: ?services= ?hours= ----------
     services: pipe-separated REAL service names -> rendered into the services grid (max 8).
     hours: pipe-separated "Day(s): time" pairs -> rendered into the hours table (max 6).
     Graceful fallback: the page keeps its built-in fictional content when a param is absent. */
  function dpEsc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function deepPersonalize() {
    var svc = qs.get('services');
    if (svc) {
      var items = svc.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).slice(0, 8);
      var grid = document.querySelector('#services .menu-grid, #menu .menu-grid, #rooms .menu-grid, #practice .menu-grid, #services .cards');
      if (grid && items.length) {
        var isCards = grid.classList.contains('cards');
        grid.innerHTML = items.map(function (name) {
          var n = dpEsc(name);
          if (isCards) {
            return '<div class="card"><div class="ico">&#10003;</div><h3>' + n + '</h3>' +
              '<p>Offered at ' + dpEsc(BIZ.name) + ' &mdash; chat below for details &amp; pricing.</p></div>';
          }
          return '<div class="menu-card"><div class="cat">Service</div><h3>' + n + '</h3>' +
            '<p>Offered at ' + dpEsc(BIZ.name) + ' &mdash; ask ' + dpEsc(BIZ.host) + ' below for details &amp; pricing.</p></div>';
        }).join('');
      }
    }
    var hrs = qs.get('hours');
    if (hrs) {
      var rows = hrs.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).slice(0, 6);
      var table = document.querySelector('table.hours') || document.querySelector('#visit table');
      if (table && rows.length) {
        var chatCell = null;
        Array.prototype.forEach.call(table.rows, function (r) {
          if (/chat/i.test(r.textContent) && r.cells[1]) chatCell = r.cells[1].innerHTML;
        });
        var html = rows.map(function (r) {
          var i = r.indexOf(':');
          var day = (i > 0 ? r.slice(0, i) : r).trim();
          var time = (i > 0 ? r.slice(i + 1) : '').trim();
          return '<tr><td>' + dpEsc(day) + '</td><td>' + dpEsc(time) + '</td></tr>';
        }).join('');
        if (chatCell) html += '<tr><td>Chat with ' + dpEsc(BIZ.host) + '</td><td>' + chatCell + '</td></tr>';
        table.innerHTML = html;
      }
    }
  }


  /* ---------- leads (localStorage only) ---------- */
  var leads = [];
  try { leads = JSON.parse(localStorage.getItem(LEAD_KEY) || '[]'); } catch (e) { leads = []; }
  function saveLead(l) {
    l.at = new Date().toISOString(); l.biz = BIZ.name;
    leads.push(l);
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(leads)); } catch (e) {}
  }

  /* ---------- dom ---------- */
  var panel, msgs, chipsBox, input, bubble, unread, closeBtn;
  var opened = false, autoOpened = false, greeted = false;

  /* conversation state */
  var S = {
    mode: 'idle',          // idle | booking | afterhours | review
    step: 0,
    booking: {},
    ah: {},
    lastTopic: null
  };

  function $(id) { return document.getElementById(id); }

  function delay(ms) {
    return new Promise(function (res) { setTimeout(res, FAST ? 0 : ms); });
  }

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  /* ---------- rendering ---------- */
  function addUser(text) {
    var row = el('div', 'mrow user');
    row.appendChild(el('div', 'bubble', escapeHtml(text)));
    msgs.appendChild(row); scrollDown();
  }

  function addBot(html, opts) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble', html);
    row.appendChild(b);
    msgs.appendChild(row);
    if (opts && opts.notice) b.classList.add('notice');
    scrollDown();
    return b;
  }

  function addNotice(html) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'notice', html));
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function addDashCard(rows) {
    var row = el('div', 'mrow bot');
    var card = el('div', 'dashcard');
    card.appendChild(el('div', 'dl-head', '&#128203; Saved to your dashboard'));
    rows.forEach(function (r) {
      card.appendChild(el('div', 'dl-row', '<span>' + r[0] + ':</span> <b>' + escapeHtml(r[1]) + '</b>'));
    });
    row.appendChild(card);
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function showTyping() {
    var row = el('div', 'mrow bot', '');
    row.id = 'maya-typing-row';
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble typing', '<i></i><i></i><i></i>');
    row.appendChild(b);
    msgs.appendChild(row); scrollDown();
  }
  function hideTyping() {
    var t = $('maya-typing-row');
    if (t) t.remove();
  }

  function setChips(list) {
    chipsBox.innerHTML = '';
    (list || []).forEach(function (c) {
      var btn = el('button', 'chip', c.label);
      btn.type = 'button';
      btn.addEventListener('click', function () { userSays(c.value || c.label, c.silent); });
      chipsBox.appendChild(btn);
    });
    scrollDown();
  }

  function showStars() {
    chipsBox.innerHTML = '';
    var wrap = el('div', 'stars-row');
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var s = el('button', 'star-btn', '&#11088;');
        s.type = 'button';
        s.setAttribute('aria-label', n + ' star' + (n > 1 ? 's' : ''));
        s.addEventListener('click', function () { pickStars(n); });
        wrap.appendChild(s);
      })(i);
    }
    chipsBox.appendChild(wrap);
    scrollDown();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- bot speech ---------- */
  function say(html, chips, opts) {
    showTyping();
    var wait = Math.min(700 + html.length * 6, 1900);
    return delay(wait).then(function () {
      hideTyping();
      addBot(html);
      setChips(chips);
    });
  }

  function sayMany(items) {
    // items: [{html, chips, notice, dash}]
    var p = Promise.resolve();
    items.forEach(function (it) {
      p = p.then(function () {
        showTyping();
        var wait = Math.min(600 + (it.html || '').length * 5, 1700);
        return delay(wait).then(function () {
          hideTyping();
          if (it.dash) { addDashCard(it.dash); }
          else if (it.notice) { addNotice(it.html); }
          else { addBot(it.html); }
          setChips(it.chips);
        });
      });
    });
    return p;
  }

  /* ---------- helpers ---------- */
  function makeRef() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var r = '';
    for (var i = 0; i < 5; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return BIZ.refPrefix + '-' + r;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* word-start keyword match (proven standard, 2026-10-03): "foreclosure" must not
     trip a "close" keyword, "recall" must not trip "call". Prefix keywords like
     'schedul'/'valu'/'relocat' still match; phrases keep word-start match. */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function has(t) {
    var words = Array.prototype.slice.call(arguments, 1);
    return words.some(function (w) { return new RegExp('(^|[^a-z])' + escRe(w)).test(t); });
  }

  function digitsOf(s) { return String(s).replace(/\D/g, ''); }

  /* ---------- intent answers ---------- */
  function servicesHtml() {
    return 'Full-service brokerage, boutique attention. &#8962;<br><br>' +
      '<b>Buying</b> &mdash; off-market previews, same-day showings, offer strategy that wins without overpaying<br>' +
      '<b>Selling</b> &mdash; staging advice, pro photography, and pricing from live market data<br>' +
      '<b>Home valuation</b> &mdash; a data-backed estimate of what your home is worth, free<br>' +
      '<b>Relocation</b> &mdash; virtual tours and neighborhood guides before you ever pack a box<br><br>' +
      'Which one sounds like you?';
  }

  function valuationHtml() {
    return 'Great question &mdash; and the honest answer is: it depends on <b>your</b> home, not the zip-code average. &#128200;<br><br>' +
      'Give me 2 minutes and I&rsquo;ll run a <b>free, data-backed valuation</b> &mdash; recent comparable sales, your home&rsquo;s condition and upgrades, and what buyers are paying <i>right now</i> in ' + escapeHtml(BIZ.city) + '.<br><br>' +
      'No obligation, no spammy follow-up. Want me to start it?';
  }

  function commissionHtml() {
    return 'Straight talk on fees &mdash; because nobody likes surprises at closing. &#129309;<br><br>' +
      'The typical total commission in our market is <b>5&ndash;6%</b>, split between the listing side and the buyer&rsquo;s side, and it&rsquo;s <b>always negotiable</b> based on your home and situation.<br><br>' +
      'We also offer a <b>4.5% full-service listing plan</b> &mdash; same staging advice, photography, and negotiation, leaner fee. Want the breakdown for your home?';
  }

  function hoursHtml() {
    return '<b>Our hours:</b><br>Mon&ndash;Fri &middot; 9 AM &ndash; 6 PM<br>Saturday &middot; 10 AM &ndash; 4 PM<br>Sunday &middot; by appointment<br><br>' +
      'But here&rsquo;s the thing &mdash; <b>I&rsquo;m here 24/7</b>, so listings, valuations and tour bookings never have to wait for morning. Want to book a tour?';
  }

  function defaultChips() {
    return [
      { label: '&#8962; Our services' },
      { label: '&#128197; Book a home tour' },
      { label: '&#127769; After-hours demo' },
      { label: '&#11088; Rate your experience' }
    ];
  }

  function greet() {
    greeted = true;
    return say(
      'Hi there! I\'m <b>' + escapeHtml(BIZ.host) + '</b>, ' + escapeHtml(BIZ.name) + '\'s coordinator. &#8962;<br><br>' +
      'Ask me about <b>listings</b>, <b>home values</b> or <b>commissions</b> &mdash; or I can <b>book your home tour</b> right now. What can I help with?',
      defaultChips()
    );
  }

  /* ---------- booking flow ---------- */
  var INTERESTS = ['Buying a home', 'Selling my home', 'Home valuation', 'Just browsing'];

  function startBooking() {
    S.mode = 'booking'; S.step = 0; S.booking = {};
    return say('Love it &mdash; let&rsquo;s set up your tour. <b>What brings you in?</b>',
      INTERESTS.map(function (r) { return { label: r }; }));
  }

  function bookingStep(text) {
    var t = text.toLowerCase().trim();
    if (S.step === 0) {
      var interest = 'Buying a home';
      for (var i = 0; i < INTERESTS.length; i++) {
        if (t.indexOf(INTERESTS[i].toLowerCase().split(' ')[0]) !== -1) { interest = INTERESTS[i]; break; }
      }
      if (has(t, 'sell', 'list my')) interest = 'Selling my home';
      if (has(t, 'valu', 'worth', 'apprais')) interest = 'Home valuation';
      if (has(t, 'tour', 'visit', 'see a', 'showing')) interest = 'Buying a home';
      S.booking.interest = interest; S.step = 1;
      return say('<b>' + escapeHtml(interest) + '</b> &mdash; got it. <b>What&rsquo;s your name?</b>');
    }
    if (S.step === 1) {
      var name = text.trim();
      if (name.length < 2 || name.length > 40) {
        return say('And your <b>name</b> for the tour?');
      }
      S.booking.name = name; S.step = 2;
      return say('Thanks, ' + escapeHtml(cap(name.split(' ')[0])) +
        '! Want a <b>text reminder</b> before your tour? Drop your number &mdash; or skip it.',
        [{ label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 2) {
      var digits = digitsOf(t);
      if (t !== 'skip' && digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(or tap Skip)</i>',
          [{ label: 'Skip', value: 'skip' }]);
      }
      if (t !== 'skip') S.booking.phone = text.trim();
      S.step = 3;
      return say('<b>Which day</b> works best for your tour?',
        [{ label: 'Tomorrow' }, { label: 'Saturday' }, { label: 'Monday' }, { label: 'Wednesday' }]);
    }
    if (S.step === 3) {
      var day = 'Saturday';
      if (has(t, 'tomorrow', 'today')) day = 'Tomorrow';
      else {
        var dm = t.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
        if (dm) day = cap(dm[0]);
      }
      S.booking.day = day; S.step = 4;
      return say('<b>' + escapeHtml(day) + '</b> it is. <b>Morning or afternoon</b> &mdash; what time suits you?',
        [{ label: '10:00 AM' }, { label: '12:30 PM' }, { label: '3:00 PM' }, { label: '5:30 PM' }]);
    }
    if (S.step === 4) {
      var tm = t.match(/\d{1,2}(:\d{2})?\s*(am|pm)?/);
      if (!tm) {
        return say('What <b>time</b> should I hold for you? <i>(e.g. 3:00 PM)</i>',
          [{ label: '10:00 AM' }, { label: '3:00 PM' }, { label: '5:30 PM' }]);
      }
      var time = text.trim();
      if (!/am|pm/i.test(time)) time += ' PM';
      var ref = makeRef();
      S.booking.ref = ref;
      var line = '<b>&#9989; You\'re booked!</b><br><br><b>' + escapeHtml(S.booking.interest) + '</b> &middot; ' +
        escapeHtml(S.booking.day) + ' at <b>' + escapeHtml(time) + '</b><br>Client: <b>' + escapeHtml(S.booking.name) + '</b><br>' +
        'Reference: <span class="ref">' + ref + '</span><br><br>';
      if (S.booking.phone) line += 'We\'ll text your reminder. ';
      line += 'We&rsquo;ll confirm the meeting point the evening before. Anything else I can help with?';
      S.mode = 'idle'; S.step = 0;
      return say(line, [{ label: '&#8962; Our services' }, { label: '&#128336; Hours & location' }]);
    }
  }

  /* ---------- after-hours lead capture (the money flow) ---------- */
  var AH_TOPICS = {
    buying:   { label: 'Buying a home',  prompt: 'What are you looking for? <i>(beds, budget, neighborhoods &mdash; anything helps)</i>' },
    selling:  { label: 'Selling my home', prompt: 'Tell me about the home you&rsquo;d like to sell &mdash; <i>beds, baths, neighborhood, timeline</i>' },
    valuing:  { label: 'Home valuation',  prompt: 'Tell me about your home &mdash; <i>beds, baths, neighborhood, any upgrades</i> &mdash; and I&rsquo;ll have a valuation ready by morning' }
  };

  function startAfterHours() {
    S.mode = 'afterhours'; S.step = 0; S.ah = {};
    return sayMany([
      {
        notice: true,
        html: '&#127769; <b>It\'s 11:42 PM</b> &mdash; the office is closed right now, but I\'m ' + escapeHtml(BIZ.host) +
          ', ' + escapeHtml(BIZ.name) + '\'s coordinator, and I\'m still here. <b>No buyer waits till morning.</b>'
      },
      {
        html: 'What can I capture for the morning team?',
        chips: [
          { label: '&#128269; Buying a home', value: 'buying' },
          { label: '&#127968; Selling my home', value: 'selling' },
          { label: '&#128200; Home valuation', value: 'valuing' }
        ]
      }
    ]);
  }

  function afterHoursStep(text) {
    var t = text.trim();
    if (S.step === 0) {
      var key = 'buying';
      var tl = t.toLowerCase();
      if (has(tl, 'sell')) key = 'selling';
      else if (has(tl, 'valu', 'worth', 'apprais')) key = 'valuing';
      else if (has(tl, 'buy')) key = 'buying';
      S.ah.topic = AH_TOPICS[key].label; S.ah.key = key; S.step = 1;
      return say('<b>' + escapeHtml(S.ah.topic) + '</b> &mdash; noted. What <b>name</b> should I save this under?');
    }
    if (S.step === 1) {
      if (t.length < 2 || t.length > 40 || /\d/.test(t)) {
        return say('What <b>name</b> should I save this under?');
      }
      S.ah.name = t; S.step = 2;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> for the morning team to reach you?');
    }
    if (S.step === 2) {
      var digits = digitsOf(t);
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.ah.phone = t; S.step = 3;
      return say('Got it. ' + AH_TOPICS[S.ah.key].prompt,
        [{ label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 3) {
      S.ah.details = (t.toLowerCase() === 'skip') ? '—' : t;
      saveLead({ name: S.ah.name, phone: S.ah.phone, topic: S.ah.topic, details: S.ah.details, source: 'after-hours 11:42 PM' });
      S.mode = 'idle'; S.step = 0;
      return sayMany([
        { html: '<b>&#9989; Saved!</b> The morning team will follow up <b>first thing</b> &mdash; hot buyers get the day&rsquo;s first showings. No need to wonder if anyone saw your message.' },
        {
          dash: [
            ['New lead', S.ah.name],
            ['Phone', S.ah.phone],
            ['Interest', S.ah.topic],
            ['Details', S.ah.details],
            ['Captured', '11:42 PM (after hours)']
          ]
        },
        {
          html: 'That&rsquo;s the whole point &mdash; <b>every late-night inquiry becomes a morning follow-up</b>, not a buyer lost to the brokerage down the street. Anything else tonight?',
          chips: defaultChips()
        }
      ]);
    }
  }

  /* ---------- review routing ---------- */
  function startReview() {
    S.mode = 'review'; S.step = 0;
    return say('We\'d love to hear it &mdash; <b>how was your experience?</b> Tap the stars:').then(function () {
      showStars();
    });
  }

  function pickStars(n) {
    chipsBox.innerHTML = '';
    addUser('\u2B50'.repeat(n));
    if (n === 5) {
      S.mode = 'idle';
      say('That made our whole team&rsquo;s day! &#128525;<br><br>Would you <b>share that on Google</b>? It genuinely keeps a local brokerage like ours thriving.',
        [{ label: 'Not now', value: 'not now' }]).then(function () {
          var row = document.querySelector('#maya-msgs .mrow.bot:last-child .bubble');
          if (row) {
            var a = document.createElement('a');
            a.className = 'gbtn'; a.href = 'https://www.google.com/maps'; a.target = '_blank'; a.rel = 'noopener';
            a.textContent = '\u2B50 Leave a Google review';
            row.appendChild(document.createElement('br'));
            row.appendChild(a); scrollDown();
          }
        });
    } else {
      S.mode = 'review'; S.step = 1;
      say('Thank you for being honest &mdash; that&rsquo;s how we get better. <b>What could we do better</b> next time?');
    }
  }

  function reviewStep(text) {
    S.mode = 'idle'; S.step = 0;
    saveLead({ name: '(review feedback)', phone: '—', topic: 'Private feedback', details: text.trim(), source: 'review routing' });
    return say('<b>Noted &mdash; truly.</b> Our broker will personally follow up on this.<br><br>' +
      'We&rsquo;d love a second chance to earn those last stars. Can I book you a home tour?',
      [{ label: '&#128197; Book a home tour' }, { label: 'No thanks', value: 'no thanks' }]);
  }

  /* ---------- main router ---------- */
  function route(text) {
    var t = text.toLowerCase().trim();

    if (S.mode === 'booking') return bookingStep(text);
    if (S.mode === 'afterhours') return afterHoursStep(text);
    if (S.mode === 'review' && S.step === 1) return reviewStep(text);

    if (has(t, 'book', 'tour', 'appoint', 'schedul', 'showing', 'visit a', 'see a home', 'slot')) return startBooking();
    if (has(t, 'after hour', 'after-hour', 'closed', 'late night', 'midnight', '11:42')) return startAfterHours();
    if (has(t, 'pre-approv', 'preapprov', 'mortgage', 'loan', 'lender', 'financ', 'down payment', 'interest rate')) return say('Smart move &mdash; <b>pre-approval comes before touring</b> in this market. &#128176;<br><br>It takes about a day with one of our trusted local lenders, costs nothing, and tells sellers you&rsquo;re serious (which wins bidding situations). Most of our buyers put down <b>5&ndash;20%</b>.<br><br>Want an intro to a lender, or shall we book your first tour?', [{ label: '&#128197; Book a home tour' }, { label: '&#8962; Our services' }]);
    if (has(t, 'review', 'rate', 'stars', 'feedback')) return startReview();
    if (has(t, 'worth', 'valu', 'apprais', 'what is my home', 'what\'s my home', 'whats my home', 'estimate my home', 'how much is my house')) return say(valuationHtml(), [{ label: '&#128200; Start my valuation', value: 'after-hours demo' }, { label: '&#128197; Book a home tour' }]);
    if (has(t, 'commission', 'how much do you charge', 'your fee', 'your fees', 'what do you charge', 'cost to sell', 'listing fee', 'percent', '%')) return say(commissionHtml(), [{ label: '&#128197; Book a home tour' }, { label: '&#128200; Free home valuation' }]);
    if (has(t, 'first-time', 'first time', 'first buyer', 'never bought')) return say('First home? Exciting &mdash; here&rsquo;s the playbook we walk every buyer through. &#127969;<br><br><b>1)</b> get <b>pre-approved</b> (we&rsquo;ll connect you with trusted local lenders &mdash; it takes a day), <b>2)</b> we tour homes <i>within</i> that budget, <b>3)</b> we write an offer that protects you (inspection + appraisal contingencies).<br><br>No dumb questions, ever. Want to book a tour and see what your budget buys?', [{ label: '&#128197; Book a home tour' }]);
    if (has(t, 'sell', 'listing my', 'list my home', 'list with')) return say('Selling? Here&rsquo;s how we do it: <b>staging advice + pro photography</b>, pricing from live market data (not guesswork), and negotiation that works every angle. &#128200;<br><br>First step is a free valuation &mdash; want me to start one?', [{ label: '&#128200; Free home valuation' }, { label: '&#128197; Book a home tour' }]);
    if (has(t, 'buy', 'looking for a home', 'want a house', 'need a house', 'house hunt', 'property')) return say('Let&rsquo;s find it. &#128269; Tell me roughly what you&rsquo;re after &mdash; <b>beds, budget, neighborhoods</b> &mdash; and I&rsquo;ll pull matching listings plus off-market previews.<br><br>Or skip the chat and <b>tour this week</b> &mdash; same-day showings available.', [{ label: '&#128197; Book a home tour' }]);
    if (has(t, 'open house', 'open-house')) return say('We run open houses <b>every Saturday 11 AM &ndash; 2 PM</b> across our active listings &mdash; no appointment needed. &#128682;<br><br>Want the list of this Saturday&rsquo;s opens, or prefer a <b>private tour</b> on your own schedule?', [{ label: '&#128197; Book a home tour' }]);
    if (has(t, 'relocat', 'moving to', 'move to', 'new in town', 'out of state')) return say('Welcome to ' + escapeHtml(BIZ.city) + ' &mdash; you picked a great town. &#128666;<br><br>For relocators we do <b>video tours</b>, neighborhood guides (schools, commute, lifestyle), and a landing plan before you ever pack a box. Plenty of our buyers purchase sight-unseen with full confidence.<br><br>Want to start with a video tour?', [{ label: '&#128197; Book a home tour' }]);
    if (has(t, 'service', 'offer', 'do you do', 'what do you', 'help with')) return say(servicesHtml(), [{ label: '&#128197; Book a home tour' }]);
    if (has(t, 'listing', 'homes for sale', 'properties', 'inventory', 'what\'s available')) return say('Right now we&rsquo;re featuring <b>3 homes</b> &mdash; a $489K North End charmer, a $365K Garden City craftsman (open Saturday), and a $412K Meridian new build. &#127968;<br><br>Plus off-market previews I can only share in person. Want to <b>tour one this week</b>?', [{ label: '&#128197; Book a home tour' }]);
    if (has(t, 'price', 'cost', 'how much', 'expensive', 'cheap', '$$')) return say('Honest numbers: typical total commission <b>5&ndash;6%</b> (negotiable), and our <b>4.5% full-service listing plan</b> covers staging advice, photography and negotiation. Valuations and buyer consults are <b>free</b>. &#129309;', [{ label: '&#8962; Our services' }]);
    if (has(t, 'hour', 'open', 'close', 'when do you', 'what time')) return say(hoursHtml(), [{ label: '&#128197; Book a home tour' }]);
    if (has(t, 'where', 'address', 'location', 'direction', 'park', 'find you', 'office')) {
      return say('Find us at <b>' + escapeHtml(BIZ.address) + '</b> &mdash; free parking out front. &#128205;<br><br>Call us anytime: <b>' + escapeHtml(BIZ.phone) + '</b>',
        [{ label: '&#128197; Book a home tour' }]);
    }
    if (has(t, 'human', 'person', 'real person', 'call you', 'phone number', 'speak to', 'agent', 'realtor', 'broker')) return say('Of course &mdash; call us at <b>' + escapeHtml(BIZ.phone) + '</b> during open hours and a real human picks up. But honestly? I can handle <b>tours, valuations, and pricing</b> right here, even at 2 AM. &#128521;', defaultChips());
    if (has(t, 'thank', 'thanks', 'thx', 'great', 'awesome', 'perfect')) return say('Anytime! That&rsquo;s what I&rsquo;m here for. &#8962;', defaultChips());
    if (has(t, 'bye', 'goodbye', 'see you', 'later')) { S.mode = 'idle'; return say('Happy house hunting &mdash; see you soon at ' + escapeHtml(BIZ.name) + '! &#8962;'); }
    if (/\b(hi+|hello|hey+|hola|yo)\b/.test(t) || has(t, 'good morning', 'good evening')) return say('Hey hey! &#128075; What can I do for you &mdash; <b>listings</b>, <b>home values</b>, or shall I <b>book your home tour</b>?', defaultChips());
    if (has(t, 'no thanks', 'not now', 'nope', "i'm good", 'im good')) { S.mode = 'idle'; return say('No worries at all! I&rsquo;m here whenever you need me. &#8962;', defaultChips()); }

    /* graceful fallback — never dead-ends */
    S.lastTopic = text;
    return say('Great question &mdash; let me have the team confirm that for you. &#128172;<br><br>Meanwhile, can I help with a <b>home tour</b>, our <b>services</b>, or a <b>free home valuation</b>?',
      [{ label: '&#128197; Book a home tour' }, { label: '&#8962; Our services' }, { label: '&#128336; Hours & location' }]);
  }

  function userSays(text, silent) {
    if (!text || !text.trim()) return Promise.resolve();
    text = text.trim();
    setChips([]);
    if (!silent) addUser(text);
    return route(text);
  }

  /* ---------- open / close ---------- */
  function openPanel(silent) {
    opened = true;
    panel.classList.add('open');
    bubble.classList.add('hidden');
    unread.classList.add('hidden');
    if (!greeted && !silent) greet();
  }
  function closePanel() {
    opened = false;
    panel.classList.remove('open');
    bubble.classList.remove('hidden');
  }

  function init() {
    panel = $('maya-panel'); msgs = $('maya-msgs'); chipsBox = $('maya-chips');
    input = $('maya-input'); bubble = $('maya-bubble'); unread = $('maya-unread'); closeBtn = $('maya-close');
    personalize();
    deepPersonalize();

    /* bubble click greets normally; hero CTA passes silent=true to skip straight to booking */
    bubble.addEventListener('click', function () { openPanel(); });
    closeBtn.addEventListener('click', closePanel);
    $('maya-send').addEventListener('click', function () { userSays(input.value); input.value = ''; input.focus(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { userSays(input.value); input.value = ''; }
    });

    /* site CTAs jump into flows */
    document.querySelectorAll('[data-action="book"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true); /* silent: goes straight to booking, no greeting */
        setTimeout(function () { if (S.mode === 'idle') startBooking(); }, FAST ? 50 : 600);
      });
    });
    document.querySelectorAll('[data-action="value"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true);
        setTimeout(function () { if (S.mode === 'idle') userSays("what's my home worth", true); }, FAST ? 50 : 600);
      });
    });

    /* proactive nudge — once, ~8s in */
    setTimeout(function () {
      if (!opened && !autoOpened) {
        autoOpened = true;
        unread.classList.remove('hidden');
        bubble.classList.add('hidden');
        panel.classList.add('open');
        opened = true;
        if (!greeted) greet();
      }
    }, FAST ? 600 : 8000);

    /* test hooks */
    window.__maya = {
      BIZ: BIZ, S: S,
      send: function (t) { openPanel(); return userSays(t); },
      open: openPanel, close: closePanel,
      pickStars: pickStars,
      getLeads: function () { return leads; },
      clearLeads: function () { leads = []; try { localStorage.removeItem(LEAD_KEY); } catch (e) {} }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
