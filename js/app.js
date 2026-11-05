/**
 * ว.TACTICAL : ระบบควบคุมหลักของเว็บแอปพลิเคชันฝึกรหัส ว. วิทยุสื่อสาร
 * รองรับทั้ง Desktop และ Mobile พร้อมบันทึกสถิติและรหัสปักหมุดใน localStorage
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    theme: 'wo_tactical_theme',
    bookmarks: 'wo_tactical_bookmarks',
    weakCodes: 'wo_tactical_weak_codes',
    stats: 'wo_tactical_stats'
  };

  const state = {
    activeView: 'directory',
    directorySubView: 'codes',
    selectedCategory: 'all',
    searchQuery: '',
    selectedCode: 'ว.2',
    bookmarks: new Set(),
    weakCodes: new Set(),

    // Scenarios state
    activeScenarioId: 'net-check',
    showPlainTranslation: true,
    scenarioAutoPlayActive: false,
    scenarioPlayingIndex: -1,

    // Multi-level Drills state
    drillLevel: 1,
    drillWeakOnly: false,
    drillInputMode: 'choice', // 'choice' | 'typein'
    drillQuestions: [],
    drillIndex: 0,
    drillScore: 0,
    drillAnswered: false,
    drillMissedCodes: [],

    // Persistent stats
    stats: {
      totalMastered: 0,
      currentStreak: 0,
      bestTimedScore: 0,
      bestAvgReactionMs: 0,
      levelBest: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    },

    // Timed Reflex Trainer state
    timedMode: 'sprint60', // 'sprint60' | 'reflex5' | 'survival'
    timedStatus: 'idle', // 'idle' | 'running' | 'finished'
    timedScore: 0,
    timedCombo: 1,
    timedCorrectCount: 0,
    timedTotalAnswered: 0,
    timedLives: 3,
    timedQuestionIndex: 0,
    timedCurrentQuestion: null,
    timedRemainingMs: 60000,
    timedMaxMs: 60000,
    timedQuestionStartMs: 0,
    timedReactionListMs: [],
    timedMissedCodes: [],
    timedRafId: null,
    timedLastTickSec: -1
  };

  /* ========================================================================
     1. Initialization & Persistence
     ======================================================================== */

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadPersistedState() {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
      if (savedTheme === 'night' || savedTheme === 'day') {
        applyTheme(savedTheme);
      }

      const savedBookmarks = JSON.parse(localStorage.getItem(STORAGE_KEYS.bookmarks) || '[]');
      if (Array.isArray(savedBookmarks)) {
        state.bookmarks = new Set(savedBookmarks);
      }

      const savedWeak = JSON.parse(localStorage.getItem(STORAGE_KEYS.weakCodes) || '[]');
      if (Array.isArray(savedWeak)) {
        state.weakCodes = new Set(savedWeak);
      }

      const savedStats = JSON.parse(localStorage.getItem(STORAGE_KEYS.stats) || 'null');
      if (savedStats && typeof savedStats === 'object') {
        state.stats = Object.assign(state.stats, savedStats);
        state.stats.levelBest = Object.assign({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, savedStats.levelBest || {});
      }
    } catch (e) {
      // Fallback silently if storage is restricted
    }
  }

  function saveBookmarks() {
    try {
      localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(Array.from(state.bookmarks)));
    } catch (e) {}
    updateQuickStatsUI();
  }

  function saveWeakCodes() {
    try {
      localStorage.setItem(STORAGE_KEYS.weakCodes, JSON.stringify(Array.from(state.weakCodes)));
    } catch (e) {}
  }

  function saveStats() {
    try {
      localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(state.stats));
    } catch (e) {}
    updateQuickStatsUI();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggleBtn');
    const label = document.getElementById('themeToggleLabel');
    if (btn && label) {
      const isNight = theme === 'night';
      btn.setAttribute('aria-pressed', String(isNight));
      label.textContent = isNight ? 'NIGHT' : 'DAY';
    }
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch (e) {}
  }

  function setTxStatus(isTransmitting, customLabel) {
    const dot = document.getElementById('txStatusDot');
    const label = document.getElementById('txStatusLabel');
    if (!dot || !label) return;
    if (isTransmitting) {
      dot.classList.add('tx-active');
      label.textContent = customLabel || 'CH-01 · 152.450 MHz · TX SENDING';
    } else {
      dot.classList.remove('tx-active');
      label.textContent = customLabel || 'CH-01 · 152.450 MHz · RX READY';
    }
  }

  function updateQuickStatsUI() {
    const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    const totalEl = document.getElementById('statTotalCodes');
    const coreEl = document.getElementById('statCoreCodes');
    const bookmarkedEl = document.getElementById('statBookmarkedCodes');
    if (totalEl) totalEl.textContent = String(codes.length);
    if (coreEl) coreEl.textContent = String(codes.filter(c => c.isCore).length);
    if (bookmarkedEl) bookmarkedEl.textContent = String(state.bookmarks.size);

    const masteredEl = document.getElementById('drillTotalMastered');
    const streakEl = document.getElementById('drillCurrentStreak');
    if (masteredEl) masteredEl.textContent = String(state.stats.totalMastered);
    if (streakEl) streakEl.textContent = String(state.stats.currentStreak);

    const bestScoreEl = document.getElementById('timedBestScore');
    const bestAvgEl = document.getElementById('timedBestAvgMs');
    if (bestScoreEl) bestScoreEl.textContent = String(state.stats.bestTimedScore);
    if (bestAvgEl) {
      bestAvgEl.textContent = state.stats.bestAvgReactionMs > 0
        ? (state.stats.bestAvgReactionMs / 1000).toFixed(2) + 's'
        : '0.00s';
    }
  }

  /* ========================================================================
     2. Navigation & View Switching
     ======================================================================== */

  function switchView(viewName, updateHash = true) {
    const validViews = ['directory', 'scenarios', 'drills', 'timed'];
    if (!validViews.includes(viewName)) viewName = 'directory';

    if (state.activeView === 'timed' && viewName !== 'timed' && state.timedStatus === 'running') {
      stopTimedLoop();
      state.timedStatus = 'idle';
      renderTimedIdleScreen();
    }

    if (state.activeView === 'scenarios' && viewName !== 'scenarios') {
      stopScenarioPlayback();
    }

    state.activeView = viewName;

    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'view-' + viewName);
    });

    document.querySelectorAll('.nav-tab, .mobile-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    closeMobileInspectorDrawer();

    if (updateHash) {
      history.replaceState(null, '', '#' + viewName);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ========================================================================
     3. Module 1 : ทำเนียบรหัส ว. (Code Directory, ว.16 & Phonetics)
     ======================================================================== */

  function getCategoryCount(catId) {
    const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    if (catId === 'all') return codes.length;
    if (catId === 'core') return codes.filter(c => c.isCore).length;
    if (catId === 'bookmarked') return state.bookmarks.size;
    if (catId === 'military') return codes.filter(c => c.category === 'military' || c.isMilitary === true).length;
    return codes.filter(c => c.category === catId).length;
  }

  function renderCategoryPills() {
    const bar = document.getElementById('categoryFilterBar');
    if (!bar) return;

    const baseCategories = Array.isArray(window.WO_CATEGORIES) ? window.WO_CATEGORIES : [];
    const categories = [
      ...baseCategories,
      { id: 'bookmarked', label: 'ปักหมุดทบทวน', countLabel: 'รหัสที่บันทึกไว้' }
    ];

    bar.innerHTML = categories.map(cat => {
      const count = getCategoryCount(cat.id);
      const isActive = state.selectedCategory === cat.id;
      return `
        <button type="button" class="cat-pill ${isActive ? 'active' : ''}" data-cat="${escapeHtml(cat.id)}">
          <span>${escapeHtml(cat.label)}</span>
          <span class="cat-count">(${count})</span>
        </button>
      `;
    }).join('');

    bar.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedCategory = btn.getAttribute('data-cat') || 'all';
        if (state.directorySubView !== 'codes') {
          switchDirectorySubView('codes');
        }
        renderCategoryPills();
        renderCodeTable();
        if (state.selectedCategory === 'military' && !String(state.selectedCode).startsWith('ท.')) {
          selectCodeForInspector('ท.01', false);
        }
      });
    });
  }

  function getFilteredCodes() {
    const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    const q = state.searchQuery.trim().toLowerCase();
    const list = codes.filter(item => {
      if (state.selectedCategory === 'core' && !item.isCore) return false;
      if (state.selectedCategory === 'bookmarked' && !state.bookmarks.has(item.code)) return false;
      if (state.selectedCategory === 'military' && !(item.category === 'military' || item.isMilitary === true)) return false;
      if (
        state.selectedCategory !== 'all' &&
        state.selectedCategory !== 'core' &&
        state.selectedCategory !== 'bookmarked' &&
        state.selectedCategory !== 'military' &&
        item.category !== state.selectedCategory
      ) {
        return false;
      }

      if (!q) return true;
      const cleanQ = q.replace(/^(?:ว|ท)\.?/, '');
      const codeMatch =
        item.code.toLowerCase().includes(q) ||
        item.num.toLowerCase() === cleanQ ||
        (/^\d+$/.test(cleanQ) && item.num.toLowerCase() === cleanQ.padStart(2, '0'));
      const meaningMatch = item.meaning.toLowerCase().includes(q) || item.shortMeaning.toLowerCase().includes(q);
      const contextMatch =
        item.context.toLowerCase().includes(q) ||
        item.exampleCall.toLowerCase().includes(q) ||
        (item.exampleReply && item.exampleReply.toLowerCase().includes(q)) ||
        (item.confusionNote && item.confusionNote.toLowerCase().includes(q));
      return codeMatch || meaningMatch || contextMatch;
    });

    if (state.selectedCategory === 'military') {
      list.sort((a, b) => {
        const aMil = a.category === 'military' ? 0 : 1;
        const bMil = b.category === 'military' ? 0 : 1;
        return aMil - bMil;
      });
    }

    return list;
  }

  function renderCodeTable() {
    const tbody = document.getElementById('codeTableBody');
    if (!tbody) return;

    const filtered = getFilteredCodes();

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <div class="summary-card">
          <p class="protocol-cell-title">ไม่พบรหัส ว. ที่ตรงกับเงื่อนไขการค้นหา</p>
          <p class="code-meaning-sub">ลองค้นหาด้วยเลขรหัส เช่น 2, 16, 40, 61 หรือกดล้างตัวกรองเพื่อดูรหัสทั้งหมด</p>
          <div class="action-cluster">
            <button type="button" id="resetFilterEmptyBtn" class="inst-btn">แสดงรหัส ว. ทั้งหมด</button>
          </div>
        </div>
      `;
      const resetBtn = document.getElementById('resetFilterEmptyBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          state.searchQuery = '';
          state.selectedCategory = 'all';
          const searchInput = document.getElementById('codeSearchInput');
          const clearBtn = document.getElementById('clearSearchBtn');
          if (searchInput) searchInput.value = '';
          if (clearBtn) clearBtn.hidden = true;
          renderCategoryPills();
          renderCodeTable();
        });
      }
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const isSelected = item.code === state.selectedCode;
      const isBookmarked = state.bookmarks.has(item.code);
      const safeCode = escapeHtml(item.code);
      return `
        <div class="code-row ${isSelected ? 'selected' : ''}" role="listitem" tabindex="0" data-code="${safeCode}">
          <div>
            <span class="code-badge ${item.isCore ? 'core-badge' : ''}">${safeCode}</span>
          </div>
          <div class="code-meaning-cell">
            <div class="code-meaning-main">
              <span>${escapeHtml(item.meaning)}</span>
              ${item.isCore ? '<span class="core-tag">ใช้บ่อย</span>' : ''}
            </div>
            <div class="code-meaning-sub">${escapeHtml(item.context)}</div>
          </div>
          <div class="code-cat-cell">
            <div>${escapeHtml(item.categoryLabel)}</div>
            <div class="mono">คู่รหัส: ${escapeHtml(item.pairCode)}</div>
          </div>
          <div class="code-actions-cell">
            <button type="button" class="row-icon-btn speak-row-btn" data-code="${safeCode}" title="ฟังเสียงขานรหัส ${safeCode}" aria-label="ฟังเสียง ${safeCode}">
              <span class="mono">TX</span>
            </button>
            <button type="button" class="row-icon-btn bookmark-row-btn ${isBookmarked ? 'bookmarked' : ''}" data-code="${safeCode}" title="ปักหมุดทบทวน ${safeCode}" aria-label="ปักหมุด ${safeCode}">
              <span class="mono">${isBookmarked ? '★' : '☆'}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    tbody.querySelectorAll('.code-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-icon-btn')) return;
        const code = row.getAttribute('data-code');
        if (code) selectCodeForInspector(code, true);
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const code = row.getAttribute('data-code');
          if (code) selectCodeForInspector(code, true);
        }
      });
    });

    tbody.querySelectorAll('.speak-row-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = btn.getAttribute('data-code');
        const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
        const found = codes.find(c => c.code === code);
        if (found) {
          selectCodeForInspector(found.code, false);
          speakCodeItem(found);
        }
      });
    });

    tbody.querySelectorAll('.bookmark-row-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = btn.getAttribute('data-code');
        if (code) toggleBookmark(code);
      });
    });
  }

  function selectCodeForInspector(code, openDrawerOnMobile = false) {
    const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    const found = codes.find(c => c.code === code) || codes[0];
    if (!found) return;
    state.selectedCode = found.code;

    document.querySelectorAll('.code-row').forEach(r => {
      r.classList.toggle('selected', r.getAttribute('data-code') === found.code);
    });

    const badgeEl = document.getElementById('inspCodeBadge');
    const meaningEl = document.getElementById('inspMeaningText');
    const catEl = document.getElementById('inspCategoryTag');
    const contextEl = document.getElementById('inspContextText');
    const pairEl = document.getElementById('inspPairCode');
    const callEl = document.getElementById('inspExampleCall');
    const replyEl = document.getElementById('inspExampleReply');
    const confEl = document.getElementById('inspConfusionText');
    const bmBtn = document.getElementById('inspBookmarkBtn');

    if (badgeEl) badgeEl.textContent = found.code;
    if (meaningEl) meaningEl.textContent = found.meaning;
    if (catEl) catEl.textContent = found.categoryLabel;
    if (contextEl) contextEl.textContent = found.context;
    if (pairEl) pairEl.textContent = 'คู่รหัส: ' + found.pairCode;
    if (callEl) {
      const callSlotMap = buildColorMapForText(found.exampleCall);
      callEl.innerHTML = `${highlightWoCodesInline(found.exampleCall, callSlotMap)}<div class="dialogue-plain-note"><strong>ถอดความหมาย :</strong> ${autoDecodeRadioSentence(found.exampleCall, callSlotMap)}</div>`;
    }
    if (replyEl) {
      const replySlotMap = buildColorMapForText(found.exampleReply);
      replyEl.innerHTML = `${highlightWoCodesInline(found.exampleReply, replySlotMap)}<div class="dialogue-plain-note"><strong>ถอดความหมาย :</strong> ${autoDecodeRadioSentence(found.exampleReply, replySlotMap)}</div>`;
    }
    if (confEl) confEl.textContent = found.confusionNote;

    const inspectorPanel = document.getElementById('codeInspectorPanel');
    if (inspectorPanel) {
      bindPairedCodeInteractions(inspectorPanel);
    }

    if (bmBtn) {
      const isBm = state.bookmarks.has(found.code);
      bmBtn.textContent = isBm ? '★ ปักหมุดแล้ว' : '☆ ปักหมุดทบทวน';
      bmBtn.setAttribute('aria-pressed', String(isBm));
    }

    if (openDrawerOnMobile && window.innerWidth <= 1024) {
      openMobileInspectorDrawer();
    }
  }

  function openMobileInspectorDrawer() {
    const panel = document.getElementById('codeInspectorPanel');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const closeBtn = document.getElementById('inspCloseMobileBtn');
    if (panel) panel.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('open');
    if (closeBtn) closeBtn.hidden = false;
  }

  function closeMobileInspectorDrawer() {
    const panel = document.getElementById('codeInspectorPanel');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    if (panel) panel.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('open');
  }

  function toggleBookmark(code) {
    if (!code) return;
    if (state.bookmarks.has(code)) {
      state.bookmarks.delete(code);
    } else {
      state.bookmarks.add(code);
    }
    saveBookmarks();
    renderCategoryPills();
    renderCodeTable();
    if (state.selectedCode === code) {
      selectCodeForInspector(code, false);
    }
  }

  function speakCodeItem(item) {
    if (!item || !window.radioAudio) return;
    const text = `${item.code} หมายถึง ${item.meaning}. ตัวอย่างการเรียกขาน: ${item.exampleCall}`;
    window.radioAudio.speakTransmission(
      text,
      () => setTxStatus(true, `CH-01 · TX ${item.code} AUDIO`),
      () => setTxStatus(false)
    );
  }

  function switchDirectorySubView(subView) {
    state.directorySubView = subView;
    document.querySelectorAll('.sub-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-subview') === subView);
    });

    const codesEl = document.getElementById('subview-codes');
    const wo16El = document.getElementById('subview-wo16');
    const phoneticEl = document.getElementById('subview-phonetic');
    const catBar = document.getElementById('categoryFilterBar');

    if (codesEl) codesEl.hidden = subView !== 'codes';
    if (wo16El) wo16El.hidden = subView !== 'wo16';
    if (phoneticEl) phoneticEl.hidden = subView !== 'phonetic';
    if (catBar) catBar.hidden = subView !== 'codes';
  }

  function renderWo16Table() {
    const container = document.getElementById('wo16ListContainer');
    if (!container) return;

    const levels = Array.isArray(window.WO_16_LEVELS) ? window.WO_16_LEVELS : [];
    container.innerHTML = levels.map(lvl => {
      const barsHtml = [1, 2, 3, 4, 5].map(n => {
        return `<span class="sig-bar sig-bar-${n} ${n <= lvl.bars ? 'on' : ''}"></span>`;
      }).join('');

      const safeCode = escapeHtml(lvl.code);
      const safeTitle = escapeHtml(lvl.title);
      return `
        <div class="signal-level-row">
          <div>
            <span class="code-badge ${lvl.bars === 5 ? 'core-badge' : ''}">${safeCode}</span>
          </div>
          <div>
            <div class="signal-bars" aria-label="ความแรงสัญญาณ ${lvl.bars} จาก 5">${barsHtml}</div>
          </div>
          <div>
            <div class="code-meaning-main">${safeTitle}</div>
            <div class="code-meaning-sub">${escapeHtml(lvl.desc)}</div>
          </div>
          <div>
            <button type="button" class="inst-btn speak-wo16-btn" data-text="${safeCode} ${safeTitle}">
              <span class="mono">TX</span>
              <span>ฟังเสียง</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.speak-wo16-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text') || '';
        if (!window.radioAudio) return;
        window.radioAudio.speakTransmission(
          text,
          () => setTxStatus(true, 'CH-01 · TX ว.16 TEST'),
          () => setTxStatus(false)
        );
      });
    });
  }

  function renderPhoneticGrid() {
    const renderCards = (targetEl, list) => {
      if (!targetEl) return;
      const items = Array.isArray(list) ? list : [];
      targetEl.innerHTML = items.map(item => {
        const safeWord = escapeHtml(item.word);
        return `
          <div class="phonetic-cell">
            <div class="u-flex-between">
              <span class="phonetic-char">${escapeHtml(item.char)}</span>
              <div>
                <div class="code-meaning-main">${safeWord}</div>
                <div class="code-meaning-sub">${escapeHtml(item.example)}</div>
              </div>
            </div>
            <button type="button" class="row-icon-btn speak-phonetic-btn" data-word="${safeWord}" title="ฟังเสียงขาน ${safeWord}" aria-label="ฟังเสียงขาน ${safeWord}">
              <span class="mono">TX</span>
            </button>
          </div>
        `;
      }).join('');

      targetEl.querySelectorAll('.speak-phonetic-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const word = btn.getAttribute('data-word') || '';
          if (!window.radioAudio) return;
          window.radioAudio.speakTransmission(
            `รหัสขานอักษร ${word}`,
            () => setTxStatus(true, 'CH-01 · TX PHONETIC'),
            () => setTxStatus(false)
          );
        });
      });
    };

    const thaiContainer = document.getElementById('phoneticGridContainer');
    renderCards(thaiContainer, window.THAI_PHONETIC_ALPHABET);

    const natoContainer = document.getElementById('natoPhoneticGridContainer');
    if (natoContainer) {
      renderCards(natoContainer, window.NATO_PHONETIC_ALPHABET);
    }
  }

  /* ========================================================================
     4. Module 2 : ตัวอย่างการใช้ วอ สื่อสาร (Scenarios & Composer)
     ======================================================================== */

  function buildColorMapForText(text) {
    const slotMap = {};
    let slotIndex = 0;
    const raw = String(text == null ? '' : text);
    const matches = raw.matchAll(/((?:ว|ท)\.\d+)/g);
    for (const match of matches) {
      const code = match[1];
      if (!Object.prototype.hasOwnProperty.call(slotMap, code)) {
        slotMap[code] = 'wo-slot-' + (slotIndex % 5);
        slotIndex++;
      }
    }
    return slotMap;
  }

  function highlightWoCodesInline(text, slotMap) {
    const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    const activeMap = slotMap || buildColorMapForText(text);
    return escapeHtml(text).replace(/((?:ว|ท)\.\d+)/g, (match) => {
      const codeObj = codes.find(c => c.code === match);
      const titleAttr = codeObj ? `${codeObj.code} : ${codeObj.shortMeaning}` : match;
      const slotClass = activeMap[match] || 'wo-slot-0';
      const safeMatch = escapeHtml(match);
      return `<button type="button" class="inline-wo-btn ${slotClass}" data-inline-code="${safeMatch}" title="${escapeHtml(titleAttr)}">${safeMatch}</button>`;
    });
  }

  function autoDecodeRadioSentence(radioText, slotMap) {
    const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    const raw = String(radioText == null ? '' : radioText);
    const activeMap = slotMap || buildColorMapForText(raw);
    const matches = raw.matchAll(/((?:ว|ท)\.\d+)/g);
    let lastIndex = 0;
    let result = '';

    for (const match of matches) {
      const matchIdx = match.index || 0;
      if (matchIdx > lastIndex) {
        result += escapeHtml(raw.slice(lastIndex, matchIdx));
      }
      const code = match[1];
      const codeObj = codes.find(c => c.code === code);
      const meaningText = codeObj ? codeObj.shortMeaning : code;
      const slotClass = activeMap[code] || 'wo-slot-0';
      const safeCode = escapeHtml(code);
      const safeMeaning = escapeHtml(meaningText);
      result += `<button type="button" class="inline-meaning-tag ${slotClass}" data-inline-code="${safeCode}" title="คลิกเพื่อดูรายละเอียด ${safeCode}"><span class="inline-meaning-code">${safeCode}</span><span>${safeMeaning}</span></button>`;
      lastIndex = matchIdx + match[0].length;
    }

    if (lastIndex < raw.length) {
      result += escapeHtml(raw.slice(lastIndex));
    }

    return result;
  }

  function renderColorCodedPlainText(plainText, radioText, slotMap) {
    const rawPlain = String(plainText == null ? '' : plainText);
    const activeMap = slotMap || buildColorMapForText(radioText || rawPlain);

    if (!rawPlain.includes('{{')) {
      return radioText ? autoDecodeRadioSentence(radioText, activeMap) : escapeHtml(rawPlain);
    }

    const matches = rawPlain.matchAll(/\{\{((?:ว|ท)\.\d+)\|([^}]+)\}\}/g);
    let lastIndex = 0;
    let result = '';

    for (const match of matches) {
      const matchIdx = match.index || 0;
      if (matchIdx > lastIndex) {
        result += escapeHtml(rawPlain.slice(lastIndex, matchIdx));
      }
      const code = match[1];
      const meaning = match[2];
      if (!activeMap[code]) {
        const nextSlot = Object.keys(activeMap).length % 5;
        activeMap[code] = 'wo-slot-' + nextSlot;
      }
      const slotClass = activeMap[code];
      const safeCode = escapeHtml(code);
      const safeMeaning = escapeHtml(meaning);
      result += `<button type="button" class="inline-meaning-tag ${slotClass}" data-inline-code="${safeCode}" title="คลิกเพื่อดูรายละเอียด ${safeCode}"><span class="inline-meaning-code">${safeCode}</span><span>${safeMeaning}</span></button>`;
      lastIndex = matchIdx + match[0].length;
    }

    if (lastIndex < rawPlain.length) {
      result += escapeHtml(rawPlain.slice(lastIndex));
    }

    return result;
  }

  function bindPairedCodeInteractions(container) {
    if (!container) return;
    const interactiveNodes = container.querySelectorAll('.inline-wo-btn, .inline-meaning-tag');
    interactiveNodes.forEach(node => {
      if (node.dataset.pairBound === '1') return;
      node.dataset.pairBound = '1';

      const setPairHighlight = (isActive) => {
        const code = node.getAttribute('data-inline-code');
        if (!code) return;
        const block = node.closest('.tx-item, .dialogue-line, .composer-output') || container;
        block.querySelectorAll('.inline-wo-btn, .inline-meaning-tag').forEach(peer => {
          if (peer.getAttribute('data-inline-code') === code) {
            peer.classList.toggle('pair-active', isActive);
          } else if (!isActive) {
            peer.classList.remove('pair-active');
          }
        });
      };

      node.addEventListener('mouseenter', () => setPairHighlight(true));
      node.addEventListener('mouseleave', () => setPairHighlight(false));
      node.addEventListener('focus', () => setPairHighlight(true));
      node.addEventListener('blur', () => setPairHighlight(false));

      node.addEventListener('click', () => {
        const code = node.getAttribute('data-inline-code');
        if (!code) return;
        if (state.activeView !== 'directory') {
          switchView('directory');
        }
        if (state.directorySubView !== 'codes') {
          switchDirectorySubView('codes');
        }
        selectCodeForInspector(code, true);
      });
    });
  }

  function renderProtocolSteps() {
    const container = document.getElementById('protocolStepsContainer');
    if (!container) return;

    const steps = Array.isArray(window.PROTOCOL_STEPS) ? window.PROTOCOL_STEPS : [];
    container.innerHTML = steps.map(p => `
      <div class="protocol-cell">
        <span class="protocol-step-tag">${escapeHtml(p.step)}</span>
        <div class="protocol-cell-title">${escapeHtml(p.title)}</div>
        <div class="protocol-formula">${escapeHtml(p.formula)}</div>
        <div class="code-meaning-sub">${escapeHtml(p.detail)}</div>
      </div>
    `).join('');
  }

  function renderScenarioList() {
    const nav = document.getElementById('scenarioListNav');
    if (!nav) return;

    const scenarios = Array.isArray(window.RADIO_SCENARIOS) ? window.RADIO_SCENARIOS : [];
    nav.innerHTML = scenarios.map(sc => {
      const isActive = sc.id === state.activeScenarioId;
      const lineCount = Array.isArray(sc.lines) ? sc.lines.length : 0;
      return `
        <button type="button" class="scenario-nav-item ${isActive ? 'active' : ''}" data-scid="${escapeHtml(sc.id)}">
          <div class="scenario-nav-meta">
            <span>${escapeHtml(sc.codeTag)} · ${escapeHtml(sc.category)}</span>
            <span>${lineCount} ประโยค</span>
          </div>
          <div class="scenario-nav-title">${escapeHtml(sc.title)}</div>
          <div class="scenario-nav-sub">${escapeHtml(sc.subtitle)}</div>
        </button>
      `;
    }).join('');

    nav.querySelectorAll('.scenario-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        stopScenarioPlayback();
        state.activeScenarioId = btn.getAttribute('data-scid') || 'net-check';
        renderScenarioList();
        renderActiveScenarioStage();
      });
    });
  }

  function renderActiveScenarioStage() {
    const scenarios = Array.isArray(window.RADIO_SCENARIOS) ? window.RADIO_SCENARIOS : [];
    const scenario = scenarios.find(s => s.id === state.activeScenarioId) || scenarios[0];
    if (!scenario) return;

    const codeEl = document.getElementById('scStageCode');
    const chanEl = document.getElementById('scStageChannel');
    const titleEl = document.getElementById('scStageTitle');
    const sumEl = document.getElementById('scStageSummary');
    const logEl = document.getElementById('scenarioTransmissionLog');

    if (codeEl) codeEl.textContent = scenario.codeTag;
    if (chanEl) chanEl.textContent = scenario.channel;
    if (titleEl) titleEl.textContent = scenario.title;
    if (sumEl) sumEl.textContent = scenario.summary;

    if (!logEl) return;

    const lines = Array.isArray(scenario.lines) ? scenario.lines : [];
    logEl.innerHTML = lines.map((line, idx) => {
      const isPlaying = state.scenarioPlayingIndex === idx;
      const roleClass = line.role === 'dispatch' ? 'dispatch' : 'unit';
      const roleLabel = line.role === 'dispatch' ? 'แม่ข่าย' : 'ลูกข่าย';
      const slotMap = buildColorMapForText(line.radioText);
      return `
        <article class="tx-item ${roleClass} ${isPlaying ? 'playing' : ''}" data-line-idx="${idx}">
          <div class="tx-header">
            <div class="tx-speaker">
              <span class="role-pill ${roleClass}">${roleLabel}</span>
              <span>${escapeHtml(line.speaker)}</span>
              <span class="mono">${escapeHtml(line.time)}</span>
            </div>
            <button type="button" class="inst-btn play-line-btn" data-line-idx="${idx}">
              <span class="mono">PTT</span>
              <span>ฟังประโยคนี้</span>
            </button>
          </div>
          <div class="tx-radio-text">${highlightWoCodesInline(line.radioText, slotMap)}</div>
          ${state.showPlainTranslation ? `
            <div class="tx-plain-box">
              <strong>ถอดความหมาย :</strong> ${renderColorCodedPlainText(line.plainText, line.radioText, slotMap)}
            </div>
          ` : ''}
        </article>
      `;
    }).join('');

    logEl.querySelectorAll('.play-line-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-line-idx'));
        stopScenarioPlayback();
        playScenarioSingleLine(scenario, idx);
      });
    });

    bindPairedCodeInteractions(logEl);
  }

  function playScenarioSingleLine(scenario, idx, onComplete) {
    if (!scenario || !Array.isArray(scenario.lines) || idx < 0 || idx >= scenario.lines.length) {
      if (onComplete) onComplete();
      return;
    }
    const line = scenario.lines[idx];
    if (!line || !window.radioAudio) {
      if (onComplete) onComplete();
      return;
    }

    state.scenarioPlayingIndex = idx;
    renderActiveScenarioStage();

    window.radioAudio.speakTransmission(
      line.radioText,
      () => setTxStatus(true, `${scenario.channel} · TX ${line.speaker}`),
      () => {
        setTxStatus(false);
        if (!state.scenarioAutoPlayActive) {
          state.scenarioPlayingIndex = -1;
          renderActiveScenarioStage();
        }
        if (onComplete) onComplete();
      }
    );
  }

  function playFullScenario() {
    const scenarios = Array.isArray(window.RADIO_SCENARIOS) ? window.RADIO_SCENARIOS : [];
    const scenario = scenarios.find(s => s.id === state.activeScenarioId) || scenarios[0];
    if (!scenario || !Array.isArray(scenario.lines)) return;

    stopScenarioPlayback();
    state.scenarioAutoPlayActive = true;

    let currentIdx = 0;
    const nextStep = () => {
      if (!state.scenarioAutoPlayActive || currentIdx >= scenario.lines.length) {
        state.scenarioAutoPlayActive = false;
        state.scenarioPlayingIndex = -1;
        setTxStatus(false);
        renderActiveScenarioStage();
        return;
      }
      playScenarioSingleLine(scenario, currentIdx, () => {
        currentIdx++;
        if (state.scenarioAutoPlayActive) {
          setTimeout(nextStep, 420);
        }
      });
    };

    nextStep();
  }

  function stopScenarioPlayback() {
    state.scenarioAutoPlayActive = false;
    state.scenarioPlayingIndex = -1;
    if (window.radioAudio) {
      window.radioAudio.stopSpeech();
    }
    setTxStatus(false);
    renderActiveScenarioStage();
  }

  function initComposerMilitaryOptions() {
    const recEl = document.getElementById('compReceiver');
    const sndEl = document.getElementById('compSender');
    const tplEl = document.getElementById('compTemplate');

    const appendOpts = (selectEl, items) => {
      if (!selectEl || selectEl.dataset.milInit === '1') return;
      selectEl.dataset.milInit = '1';
      items.forEach(([val, label]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        selectEl.appendChild(opt);
      });
    };

    appendOpts(recEl, [
      ['บก.ควบคุม ชายแดน', 'บก.ควบคุม ชายแดน (แม่ข่ายทหาร/ตชด.)'],
      ['ชุด ลว. ไกล 01', 'ชุด ลว. ไกล 01 (ลาดตระเวนชายแดน)'],
      ['ฐานปฏิบัติการหน้าแนว', 'ฐานปฏิบัติการหน้าแนว']
    ]);

    appendOpts(sndEl, [
      ['ชุด ลว. ไกล 01', 'ชุด ลว. ไกล 01'],
      ['ร้อย ตชด. ชายแดน', 'ร้อย ตชด. ชายแดน'],
      ['ชป.ชายแดน 03', 'ชป.ชายแดน 03']
    ]);

    appendOpts(tplEl, [
      [
        'แจ้ง ท.07 ตรวจพบกลุ่มติดอาวุธไม่ทราบฝ่าย ว.30 ประมาณ 6 นาย บริเวณ ท.05 พิกัด 47P QQ 123 456 ส่งรายละเอียดแบบ ท.06 ด้วยระบบ ว.621',
        'ชายแดน : รายงานตรวจพบเป้าหมาย ท.06 และพิกัด MGRS ท.05'
      ],
      [
        'แจ้งข่าวด่วน ท.16 ว.9 เกิดเหตุ ท.09 ปะทะที่ ท.05 พิกัด 47P QQ 248 510 มีกำลังพลบาดเจ็บจาก ท.12 ว.30 จำนวน 1 ราย ขอ ท.10 ยิงคุ้มกันและขอ ฮ. ท.11 ด่วน',
        'ชายแดน : แจ้งปะทะด่วน ท.09 เตือนทุ่นระเบิด ท.12 และขอ MEDEVAC ท.11'
      ],
      [
        'พบอาการ ว.609 ในช่องหลัก ขอพิสูจน์ตัวตน ท.14 ด้วย ว.621 แล้วสลับ ว.602 ไปช่องสำรอง ว.32 พร้อมรักษาวินัย ท.13',
        'ชายแดน : ต้านคลื่นรบกวน ท.14 ย้ายช่อง ว.32 และเงียบวิทยุ ท.13'
      ]
    ]);
  }

  function updateComposerOutput() {
    initComposerMilitaryOptions();
    const recEl = document.getElementById('compReceiver');
    const sndEl = document.getElementById('compSender');
    const tplEl = document.getElementById('compTemplate');
    const outEl = document.getElementById('composerResultText');
    if (!recEl || !sndEl || !tplEl || !outEl) return;

    const sentence = `${recEl.value} จาก ${sndEl.value} ${tplEl.value} เปลี่ยน`;
    const slotMap = buildColorMapForText(sentence);
    outEl.innerHTML = `
      <div>${highlightWoCodesInline(sentence, slotMap)}</div>
      <div class="tx-plain-box">
        <strong>ถอดความหมาย :</strong> ${autoDecodeRadioSentence(sentence, slotMap)}
      </div>
    `;
    outEl.setAttribute('data-raw-sentence', sentence);

    const composerBlock = outEl.closest('.composer-output') || outEl;
    bindPairedCodeInteractions(composerBlock);
  }

  /* ========================================================================
     5. Module 3 : แบบฝึกหัด วอ หลายระดับ (Multi-Level Drills)
     ======================================================================== */

  function shuffleArray(arr) {
    if (!Array.isArray(arr)) return [];
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function pickDistractorCodes(correctItem, pool, count = 3) {
    if (!correctItem) return [];
    const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    const clusters = Array.isArray(window.CONFUSION_CLUSTERS) ? window.CONFUSION_CLUSTERS : [];
    const safePool = Array.isArray(pool) && pool.length > 0 ? pool : codes;

    // หาจาก Confusion Cluster เดียวกันก่อนเพื่อให้ตัวเลือกมีความใกล้เคียงเชิงยุทธวิธี
    let clusterCodes = [];
    for (const cluster of clusters) {
      if (Array.isArray(cluster) && cluster.includes(correctItem.code)) {
        clusterCodes = cluster.filter(c => c !== correctItem.code);
        break;
      }
    }

    const distractors = [];
    for (const cCode of shuffleArray(clusterCodes)) {
      const found = codes.find(item => item.code === cCode);
      if (found && distractors.length < count) {
        distractors.push(found);
      }
    }

    const remainingPool = shuffleArray(safePool.filter(
      item => item.code !== correctItem.code && !distractors.some(d => d.code === item.code)
    ));

    while (distractors.length < count && remainingPool.length > 0) {
      distractors.push(remainingPool.pop());
    }

    return distractors;
  }

  function buildDrillQuestionsForLevel(levelId, weakOnly = false) {
    const allCodes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    if (allCodes.length === 0) return [];

    if (weakOnly) {
      const targetSet = new Set([...state.weakCodes, ...state.bookmarks]);
      let pool = allCodes.filter(c => targetSet.has(c.code));
      if (pool.length < 4) {
        pool = allCodes.filter(c => c.isCore);
      }
      return shuffleArray(pool).slice(0, 10).map((item, idx) => createCodeDrillQuestion(item, allCodes, idx % 2 === 0));
    }

    if (levelId === 1) {
      const corePool = allCodes.filter(c => c.isCore);
      return shuffleArray(corePool).slice(0, 10).map((item, idx) => createCodeDrillQuestion(item, corePool, idx % 2 === 0));
    }

    if (levelId === 2) {
      return shuffleArray(allCodes).slice(0, 10).map((item, idx) => createCodeDrillQuestion(item, allCodes, idx % 2 === 1));
    }

    if (levelId === 3) {
      const scenarioDrills = Array.isArray(window.SCENARIO_DRILL_QUESTIONS) ? window.SCENARIO_DRILL_QUESTIONS : [];
      return shuffleArray(scenarioDrills).slice(0, 10).map(sc => {
        const optionObjects = sc.options.map((text, idx) => ({ text, isCorrect: idx === sc.correctIndex }));
        const shuffledOptions = shuffleArray(optionObjects);
        return {
          type: 'scenario',
          code: sc.focusCode,
          contextTag: `สายเรียกเข้าจาก : ${sc.caller}`,
          incomingText: sc.incoming,
          prompt: sc.prompt,
          options: shuffledOptions.map(o => o.text),
          correctIndex: shuffledOptions.findIndex(o => o.isCorrect),
          expectedCode: sc.focusCode,
          explanation: sc.explanation
        };
      });
    }

    if (levelId === 4) {
      // Level 4 : Decoder + Multi-code
      const decoderDrills = Array.isArray(window.DECODER_DRILL_QUESTIONS) ? window.DECODER_DRILL_QUESTIONS : [];
      const decItems = shuffleArray(decoderDrills).map(dec => {
        const optionObjects = dec.options.map((text, idx) => ({ text, isCorrect: idx === dec.correctIndex }));
        const shuffledOptions = shuffleArray(optionObjects);
        return {
          type: 'decoder',
          code: dec.targetCode,
          contextTag: 'ถอดรหัสข้อความวิทยุหลายรหัสซ้อน',
          incomingText: dec.transmission,
          prompt: state.drillInputMode === 'typein' ? dec.targetPrompt : dec.question,
          options: shuffledOptions.map(o => o.text),
          correctIndex: shuffledOptions.findIndex(o => o.isCorrect),
          expectedCode: dec.targetCode,
          explanation: dec.explanation
        };
      });

      // เติมให้ครบ 10 ข้อด้วยรหัสระดับปฏิบัติการ
      const extraPool = shuffleArray(allCodes.filter(c => !c.isCore)).slice(0, Math.max(0, 10 - decItems.length));
      const extraQuestions = extraPool.map(item => createCodeDrillQuestion(item, allCodes, false));
      return [...decItems, ...extraQuestions].slice(0, 10);
    }

    // Level 5 : Military & Border Patrol Tactical Ops (ทหาร/ชายแดน)
    const milPoolRaw = allCodes.filter(c => c.category === 'military' || c.isMilitary === true);
    const milCodePool = milPoolRaw.length > 0 ? milPoolRaw : allCodes;

    const allScenarios = Array.isArray(window.SCENARIO_DRILL_QUESTIONS) ? window.SCENARIO_DRILL_QUESTIONS : [];
    const milScenariosRaw = allScenarios.filter(s => s.isMilitary);
    const milScenarioPool = milScenariosRaw.length >= 3 ? milScenariosRaw : allScenarios;

    const allDecoders = Array.isArray(window.DECODER_DRILL_QUESTIONS) ? window.DECODER_DRILL_QUESTIONS : [];
    const milDecodersRaw = allDecoders.filter(d => d.isMilitary);
    const milDecoderPool = milDecodersRaw.length >= 3 ? milDecodersRaw : allDecoders;

    const mapDecoderQuestion = (dec) => {
      const optionObjects = dec.options.map((text, idx) => ({ text, isCorrect: idx === dec.correctIndex }));
      const shuffledOptions = shuffleArray(optionObjects);
      return {
        type: 'decoder',
        code: dec.targetCode,
        contextTag: 'ถอดรหัสยุทธวิธีทหาร/ชายแดน',
        incomingText: dec.transmission,
        prompt: state.drillInputMode === 'typein' ? dec.targetPrompt : dec.question,
        options: shuffledOptions.map(o => o.text),
        correctIndex: shuffledOptions.findIndex(o => o.isCorrect),
        expectedCode: dec.targetCode,
        explanation: dec.explanation
      };
    };

    const mapScenarioQuestion = (sc) => {
      const optionObjects = sc.options.map((text, idx) => ({ text, isCorrect: idx === sc.correctIndex }));
      const shuffledOptions = shuffleArray(optionObjects);
      return {
        type: 'scenario',
        code: sc.focusCode,
        contextTag: `สายเรียกเข้ายุทธวิธี : ${sc.caller}`,
        incomingText: sc.incoming,
        prompt: sc.prompt,
        options: shuffledOptions.map(o => o.text),
        correctIndex: shuffledOptions.findIndex(o => o.isCorrect),
        expectedCode: sc.focusCode,
        explanation: sc.explanation
      };
    };

    if (state.drillInputMode === 'typein') {
      const decPart = shuffleArray(milDecoderPool).slice(0, 3).map(mapDecoderQuestion);
      const codeNeed = Math.max(0, 10 - decPart.length);
      const codePart = shuffleArray(milCodePool).slice(0, codeNeed).map(item => createCodeDrillQuestion(item, milCodePool, false));
      return shuffleArray([...codePart, ...decPart]).slice(0, 10);
    }

    const codeQuestions = shuffleArray(milCodePool).slice(0, 4).map((item, idx) => createCodeDrillQuestion(item, milCodePool, idx % 2 === 0));
    const scenarioQuestions = shuffleArray(milScenarioPool).slice(0, 3).map(mapScenarioQuestion);
    const decoderQuestions = shuffleArray(milDecoderPool).slice(0, 3).map(mapDecoderQuestion);
    return [...codeQuestions, ...scenarioQuestions, ...decoderQuestions].slice(0, 10);
  }

  function createCodeDrillQuestion(item, pool, askMeaningFromCode = true) {
    const distractors = pickDistractorCodes(item, pool, 3);
    if (askMeaningFromCode && state.drillInputMode !== 'typein') {
      const rawOptions = [
        { text: item.meaning, isCorrect: true },
        ...distractors.map(d => ({ text: d.meaning, isCorrect: false }))
      ];
      const shuffled = shuffleArray(rawOptions);
      return {
        type: 'code-to-meaning',
        code: item.code,
        contextTag: `หมวด : ${item.categoryLabel}`,
        incomingText: item.exampleCall,
        prompt: `รหัส "${item.code}" มีความหมายตรงกับข้อใด?`,
        options: shuffled.map(o => o.text),
        correctIndex: shuffled.findIndex(o => o.isCorrect),
        expectedCode: item.code,
        explanation: `${item.code} หมายถึง "${item.meaning}" (${item.confusionNote})`
      };
    } else {
      const rawOptions = [
        { text: `${item.code} (${item.shortMeaning})`, codeOnly: item.code, isCorrect: true },
        ...distractors.map(d => ({ text: `${d.code} (${d.shortMeaning})`, codeOnly: d.code, isCorrect: false }))
      ];
      const shuffled = shuffleArray(rawOptions);
      return {
        type: 'meaning-to-code',
        code: item.code,
        contextTag: `หมวด : ${item.categoryLabel}`,
        incomingText: '',
        prompt: `หากต้องการสื่อสารความหมายว่า "${item.meaning}" ต้องใช้รหัสใด?`,
        options: shuffled.map(o => state.drillLevel === 1 ? o.text : o.codeOnly),
        correctIndex: shuffled.findIndex(o => o.isCorrect),
        expectedCode: item.code,
        explanation: `"${item.meaning}" ใช้รหัส ${item.code} ตัวอย่าง: "${item.exampleCall}"`
      };
    }
  }

  function renderDrillLevelSelector() {
    const bar = document.getElementById('drillLevelSelector');
    if (!bar) return;

    const levels = Array.isArray(window.DRILL_LEVELS) ? window.DRILL_LEVELS : [];
    bar.innerHTML = levels.map(lvl => {
      const isActive = !state.drillWeakOnly && state.drillLevel === lvl.id;
      const bestPct = state.stats.levelBest[lvl.id] || 0;
      return `
        <button type="button" class="level-select-btn ${isActive ? 'active' : ''}" data-level="${lvl.id}">
          <div class="level-btn-meta">
            <span>${escapeHtml(lvl.code)}</span>
            <span>สถิติสูงสุด: ${bestPct}%</span>
          </div>
          <div class="level-btn-title">${escapeHtml(lvl.shortName)}</div>
          <div class="level-btn-desc">${escapeHtml(lvl.desc)}</div>
        </button>
      `;
    }).join('');

    bar.querySelectorAll('.level-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.drillWeakOnly = false;
        state.drillLevel = Number(btn.getAttribute('data-level')) || 1;
        if (state.drillLevel === 3) {
          state.drillInputMode = 'choice';
        }
        startDrillSession();
      });
    });
  }

  function startDrillSession() {
    renderDrillLevelSelector();
    state.drillQuestions = buildDrillQuestionsForLevel(state.drillLevel, state.drillWeakOnly);
    state.drillIndex = 0;
    state.drillScore = 0;
    state.drillAnswered = false;
    state.drillMissedCodes = [];

    const levels = Array.isArray(window.DRILL_LEVELS) ? window.DRILL_LEVELS : [];
    const lvlObj = levels.find(l => l.id === state.drillLevel) || levels[0] || { code: 'LV-01', name: 'ระดับที่ 1' };
    const badgeEl = document.getElementById('drillActiveLevelBadge');
    const titleEl = document.getElementById('drillActiveLevelTitle');
    const inputModeBtn = document.getElementById('toggleInputModeBtn');

    if (badgeEl) badgeEl.textContent = state.drillWeakOnly ? 'REVIEW' : lvlObj.code;
    if (titleEl) {
      titleEl.textContent = state.drillWeakOnly
        ? 'โหมดทบทวนรหัสที่ปักหมุดและเคยตอบผิด'
        : lvlObj.name;
    }
    if (inputModeBtn) {
      inputModeBtn.hidden = state.drillLevel === 3;
      inputModeBtn.setAttribute('aria-pressed', String(state.drillInputMode === 'typein'));
      inputModeBtn.innerHTML = `<span>โหมดตอบ : ${state.drillInputMode === 'typein' ? 'พิมพ์รหัส ว. สด' : 'ตัวเลือก 4 ข้อ'}</span>`;
    }

    renderCurrentDrillQuestion();
  }

  function renderCurrentDrillQuestion() {
    const stage = document.getElementById('drillStageContent');
    const counterEl = document.getElementById('drillQuestionCounter');
    const progressEl = document.getElementById('drillProgressFill');
    if (!stage) return;

    const total = state.drillQuestions.length;
    if (total === 0 || state.drillIndex >= total) {
      renderDrillSummaryScreen();
      return;
    }

    const q = state.drillQuestions[state.drillIndex];
    if (!q || !Array.isArray(q.options)) {
      renderDrillSummaryScreen();
      return;
    }
    state.drillAnswered = false;

    if (counterEl) counterEl.textContent = `ข้อที่ ${state.drillIndex + 1} / ${total}`;
    if (progressEl) {
      const ratio = Math.max(0, Math.min(1, (state.drillIndex + 1) / total));
      progressEl.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    }

    const isTypeIn = state.drillInputMode === 'typein' && state.drillLevel !== 3;

    stage.innerHTML = `
      <div class="question-context-tag">${escapeHtml(q.contextTag)}</div>
      ${q.incomingText ? `
        <div class="question-incoming-box">
          <div class="u-flex-between">
            <span class="mono">สัญญาณวิทยุขาเข้า (RX MESSAGE)</span>
            <button type="button" id="drillSpeakIncomingBtn" class="inst-btn">
              <span class="mono">PTT</span>
              <span>ฟังเสียงวิทยุ</span>
            </button>
          </div>
          <div>"${escapeHtml(q.incomingText)}"</div>
        </div>
      ` : ''}
      <h2 class="question-title">${escapeHtml(q.prompt)}</h2>

      ${isTypeIn ? `
        <form id="drillTypeinForm" class="typein-box" autocomplete="off">
          <input
            type="text"
            id="drillTypeinInput"
            class="typein-input"
            placeholder="พิมพ์รหัส เช่น ว.40, ท.05 หรือ 40 แล้วกด Enter"
            required
          >
          <button type="button" id="drillTypeinSubmitBtn" class="ptt-action-btn btn-auto">
            <span>ส่งคำตอบ</span>
          </button>
        </form>
      ` : `
        <div class="choices-grid" role="group" aria-label="ตัวเลือกคำตอบ">
          ${q.options.map((opt, idx) => `
            <button type="button" class="choice-btn" data-choice-idx="${idx}">
              <span class="choice-key">${idx + 1}</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>
      `}

      <div id="drillFeedbackSlot"></div>
    `;

    const speakBtn = document.getElementById('drillSpeakIncomingBtn');
    if (speakBtn && q.incomingText) {
      speakBtn.addEventListener('click', () => {
        if (!window.radioAudio) return;
        window.radioAudio.speakTransmission(
          q.incomingText,
          () => setTxStatus(true, 'CH-01 · RX DRILL AUDIO'),
          () => setTxStatus(false)
        );
      });
    }

    if (isTypeIn) {
      const inputEl = document.getElementById('drillTypeinInput');
      const formEl = document.getElementById('drillTypeinForm');
      const submitBtn = document.getElementById('drillTypeinSubmitBtn');
      if (inputEl) inputEl.focus();

      const handleTypeSubmit = () => {
        if (state.drillAnswered || !inputEl) return;
        const rawVal = inputEl.value.trim();
        if (!rawVal) return;
        evaluateDrillTypeInAnswer(rawVal);
      };

      if (formEl) {
        formEl.addEventListener('submit', (e) => {
          e.preventDefault();
          handleTypeSubmit();
        });
      }
      if (submitBtn) {
        submitBtn.addEventListener('click', handleTypeSubmit);
      }
    } else {
      stage.querySelectorAll('.choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (state.drillAnswered) return;
          const idx = Number(btn.getAttribute('data-choice-idx'));
          evaluateDrillChoiceAnswer(idx);
        });
      });
    }
  }

  function normalizeWoCodeInput(inputStr) {
    const clean = String(inputStr).trim().replace(/\s+/g, '');
    if (/^(?:ท|t|T)\.?\d+$/.test(clean)) {
      const num = clean.replace(/^(?:ท|t|T)\.?/, '');
      return 'ท.' + num.padStart(2, '0');
    }
    if (/^\d+$/.test(clean)) {
      return 'ว.' + clean;
    }
    if (/^ว\.?\d+$/.test(clean)) {
      return 'ว.' + clean.replace(/^ว\.?/, '');
    }
    return clean;
  }

  function evaluateDrillTypeInAnswer(rawInput) {
    if (state.drillAnswered) return;
    const q = state.drillQuestions[state.drillIndex];
    if (!q) return;
    state.drillAnswered = true;

    const cleanDigits = String(rawInput).trim().replace(/\s+/g, '');
    let normalizedUser = normalizeWoCodeInput(rawInput);
    if (
      q.expectedCode &&
      q.expectedCode.startsWith('ท.') &&
      /^\d+$/.test(cleanDigits) &&
      'ท.' + cleanDigits.padStart(2, '0') === q.expectedCode
    ) {
      normalizedUser = 'ท.' + cleanDigits.padStart(2, '0');
    }
    const isCorrect = normalizedUser === q.expectedCode;

    const inputEl = document.getElementById('drillTypeinInput');
    if (inputEl) inputEl.disabled = true;

    recordDrillOutcome(q, isCorrect, `คุณพิมพ์: ${normalizedUser} | คำตอบที่ถูกต้อง: ${q.expectedCode}`);
  }

  function evaluateDrillChoiceAnswer(chosenIdx) {
    if (state.drillAnswered) return;
    const q = state.drillQuestions[state.drillIndex];
    if (!q || !Array.isArray(q.options) || chosenIdx < 0 || chosenIdx >= q.options.length) return;
    state.drillAnswered = true;

    const isCorrect = chosenIdx === q.correctIndex;

    const buttons = document.querySelectorAll('#drillStageContent .choice-btn');
    buttons.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correctIndex) {
        btn.classList.add('correct');
      } else if (idx === chosenIdx && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    recordDrillOutcome(q, isCorrect, '');
  }

  function recordDrillOutcome(q, isCorrect, extraHeaderNote) {
    if (!q) return;
    if (isCorrect) {
      state.drillScore++;
      state.stats.totalMastered++;
      state.stats.currentStreak++;
      state.weakCodes.delete(q.code);
      if (window.radioAudio) window.radioAudio.playCorrect();
    } else {
      state.stats.currentStreak = 0;
      state.weakCodes.add(q.code);
      if (!state.drillMissedCodes.includes(q.code)) {
        state.drillMissedCodes.push(q.code);
      }
      if (window.radioAudio) window.radioAudio.playError();
    }

    saveWeakCodes();
    saveStats();

    const slot = document.getElementById('drillFeedbackSlot');
    if (!slot) return;

    slot.innerHTML = `
      <div class="feedback-panel ${isCorrect ? 'is-correct' : 'is-wrong'}">
        <div class="u-flex-between">
          <strong>
            ${isCorrect ? 'ถูกต้อง (ว.2 ทราบข้อความแม่นยำ)' : 'ยังไม่ถูกต้อง (บันทึกเข้าหมวดทบทวนอัตโนมัติ)'}
          </strong>
          <span class="code-badge">${escapeHtml(q.code)}</span>
        </div>
        ${extraHeaderNote ? `<div class="mono">${escapeHtml(extraHeaderNote)}</div>` : ''}
        <p>${escapeHtml(q.explanation)}</p>
        <div class="action-cluster">
          <button type="button" id="drillNextQuestionBtn" class="ptt-action-btn btn-auto">
            <span>${state.drillIndex + 1 < state.drillQuestions.length ? 'ข้อต่อไป [Space / Enter]' : 'ดูสรุปผลคะแนน'}</span>
          </button>
        </div>
      </div>
    `;

    const nextBtn = document.getElementById('drillNextQuestionBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        state.drillIndex++;
        renderCurrentDrillQuestion();
      });
    }
  }

  function renderDrillSummaryScreen() {
    const stage = document.getElementById('drillStageContent');
    const progressEl = document.getElementById('drillProgressFill');
    if (progressEl) {
      progressEl.style.transform = 'scaleX(1)';
    }
    if (!stage) return;

    const total = state.drillQuestions.length || 1;
    const pct = Math.round((state.drillScore / total) * 100);

    if (!state.drillWeakOnly) {
      const prevBest = state.stats.levelBest[state.drillLevel] || 0;
      if (pct > prevBest) {
        state.stats.levelBest[state.drillLevel] = pct;
        saveStats();
      }
    }

    renderDrillLevelSelector();

    const passed = pct >= 80;
    stage.innerHTML = `
      <div class="summary-card">
        <span class="code-badge ${passed ? 'core-badge' : ''}">
          ${passed ? 'ผ่านเกณฑ์มาตรฐาน (PASSED)' : 'แนะนำให้ฝึกทบทวนเพิ่ม (NEEDS REVIEW)'}
        </span>
        <h2 class="question-title">
          คะแนนของคุณ : ${state.drillScore} / ${total} (${pct}%)
        </h2>
        <p class="code-meaning-sub">
          ${passed
            ? 'คุณมีความแม่นยำในการใช้รหัส ว. ระดับดีเยี่ยม พร้อมขยับขึ้นสู่ระดับถัดไปหรือทดสอบจับเวลา'
            : 'รหัสที่ตอบผิดถูกบันทึกไว้ในระบบทบทวนแล้ว คุณสามารถกดฝึกซ้ำเฉพาะรหัสที่พลาดได้ทันที'}
        </p>

        ${state.drillMissedCodes.length > 0 ? `
          <div class="missed-box">
            <div class="question-context-tag">รหัส ว. ที่ควรทบทวนจากรอบนี้ :</div>
            <div class="badge-cluster">
              ${state.drillMissedCodes.map(c => `<span class="code-badge">${escapeHtml(c)}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="action-cluster">
          <button type="button" id="summaryRetryBtn" class="ptt-action-btn btn-auto">
            <span>ฝึกซ้ำระดับนี้อีกครั้ง</span>
          </button>
          ${state.drillLevel < 5 ? `
            <button type="button" id="summaryNextLevelBtn" class="secondary-action-btn btn-auto">
              <span>ไปต่อระดับที่ ${state.drillLevel + 1}</span>
            </button>
          ` : ''}
          <button type="button" id="summaryGoTimedBtn" class="secondary-action-btn btn-auto">
            <span>ไปทดสอบจับเวลาตอบสนอง</span>
          </button>
        </div>
      </div>
    `;

    const retryBtn = document.getElementById('summaryRetryBtn');
    const nextLvlBtn = document.getElementById('summaryNextLevelBtn');
    const goTimedBtn = document.getElementById('summaryGoTimedBtn');

    if (retryBtn) retryBtn.addEventListener('click', () => startDrillSession());
    if (nextLvlBtn) {
      nextLvlBtn.addEventListener('click', () => {
        state.drillWeakOnly = false;
        state.drillLevel = Math.min(5, state.drillLevel + 1);
        startDrillSession();
      });
    }
    if (goTimedBtn) {
      goTimedBtn.addEventListener('click', () => switchView('timed'));
    }
  }

  /* ========================================================================
     6. Module 4 : แบบฝึกจับเวลาในการตอบรหัส วอ (Timed Reflex Trainer)
     ======================================================================== */

  function renderTimedIdleScreen() {
    const stage = document.getElementById('timedArenaStage');
    const timeEl = document.getElementById('chronoTimeDisplay');
    const scoreEl = document.getElementById('chronoScoreDisplay');
    const avgEl = document.getElementById('chronoAvgDisplay');
    const comboEl = document.getElementById('chronoComboDisplay');
    const barFill = document.getElementById('chronoBarFill');

    const defaultSeconds = state.timedMode === 'sprint60' ? '60.00s' : (state.timedMode === 'reflex5' ? '05.00s' : '06.00s');
    const modeGrid = document.querySelector('.timer-mode-grid');
    if (modeGrid) modeGrid.classList.remove('is-running');
    if (timeEl) {
      timeEl.textContent = defaultSeconds;
      timeEl.classList.remove('urgent');
    }
    if (scoreEl) scoreEl.textContent = '0';
    if (avgEl) avgEl.textContent = '0.00s';
    if (comboEl) comboEl.textContent = 'x1';
    if (barFill) {
      barFill.style.transform = 'scaleX(1)';
      barFill.classList.remove('urgent');
    }

    if (!stage) return;

    const modeDescriptions = {
      sprint60: 'เวลาทั้งหมด 60.00 วินาที ตอบรหัส ว. ให้ได้มากและแม่นยำที่สุด ยิ่งตอบถูกต่อเนื่องจะได้ตัวคูณคะแนนสูงสุด x5',
      reflex5: 'จำลองการถูกเรียกขานฉับพลันจำนวน 15 ข้อ แต่ละข้อมีเวลาตัดสินใจเพียง 5.00 วินาที หากหมดเวลาถือว่าพลาดทันที',
      survival: 'เริ่มต้นที่ 6.00 วินาทีต่อข้อ และเวลาจะบีบสั้นลงเรื่อยๆ จนเหลือ 2.50 วินาที ห้ามตอบผิดหรือหมดเวลาเกิน 3 ครั้ง'
    };

    stage.innerHTML = `
      <div class="summary-card">
        <div class="question-context-tag">พร้อมทดสอบความไวในการขานรหัส ว.</div>
        <h2 class="question-title">กดปุ่มเริ่มจับเวลาเมื่อพร้อมเข้าสู่คลื่นความถี่</h2>
        <p class="code-meaning-sub">
          ${escapeHtml(modeDescriptions[state.timedMode] || modeDescriptions.sprint60)}
        </p>
        <div class="action-cluster">
          <button type="button" id="startTimedChallengeBtn" class="ptt-action-btn btn-auto">
            <span class="mono">[START PTT]</span>
            <span>เริ่มจับเวลาทดสอบทันที</span>
          </button>
        </div>
      </div>
    `;

    const startBtn = document.getElementById('startTimedChallengeBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => startTimedChallenge());
    }
  }

  function generateSingleTimedQuestion() {
    const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
    if (codes.length === 0) return null;

    const item = codes[Math.floor(Math.random() * codes.length)];
    const askCode = Math.random() < 0.5;
    const distractors = pickDistractorCodes(item, codes, 3);

    if (askCode) {
      const opts = shuffleArray([
        { label: item.code, isCorrect: true },
        ...distractors.map(d => ({ label: d.code, isCorrect: false }))
      ]);
      return {
        code: item.code,
        tag: `หมวด : ${item.categoryLabel}`,
        prompt: `"${item.meaning}" คือรหัสใด?`,
        options: opts.map(o => o.label),
        correctIndex: opts.findIndex(o => o.isCorrect)
      };
    } else {
      const opts = shuffleArray([
        { label: item.shortMeaning, isCorrect: true },
        ...distractors.map(d => ({ label: d.shortMeaning, isCorrect: false }))
      ]);
      return {
        code: item.code,
        tag: 'แปลรหัสด่วน',
        prompt: `${item.code} หมายถึงอะไร?`,
        options: opts.map(o => o.label),
        correctIndex: opts.findIndex(o => o.isCorrect)
      };
    }
  }

  function startTimedChallenge() {
    stopTimedLoop();
    state.timedStatus = 'running';
    state.timedScore = 0;
    state.timedCombo = 1;
    state.timedCorrectCount = 0;
    state.timedTotalAnswered = 0;
    state.timedLives = 3;
    state.timedQuestionIndex = 0;
    state.timedReactionListMs = [];
    state.timedMissedCodes = [];
    state.timedLastTickSec = -1;

    if (window.radioAudio) window.radioAudio.playPttPress();
    setTxStatus(true, 'CH-01 · TIMED DRILL ACTIVE');
    const modeGrid = document.querySelector('.timer-mode-grid');
    if (modeGrid) modeGrid.classList.add('is-running');

    if (state.timedMode === 'sprint60') {
      state.timedMaxMs = 60000;
      state.timedRemainingMs = 60000;
    } else if (state.timedMode === 'reflex5') {
      state.timedMaxMs = 5000;
      state.timedRemainingMs = 5000;
    } else {
      state.timedMaxMs = 6000;
      state.timedRemainingMs = 6000;
    }

    nextTimedQuestion(true);
    runTimedLoop();
  }

  function nextTimedQuestion(isFirst = false) {
    if (state.timedMode === 'reflex5' && state.timedQuestionIndex >= 15) {
      finishTimedChallenge();
      return;
    }

    if (!isFirst && state.timedMode === 'reflex5') {
      state.timedMaxMs = 5000;
      state.timedRemainingMs = 5000;
    } else if (!isFirst && state.timedMode === 'survival') {
      const nextWindow = Math.max(2500, 6000 - state.timedQuestionIndex * 220);
      state.timedMaxMs = nextWindow;
      state.timedRemainingMs = nextWindow;
    }

    state.timedQuestionIndex++;
    state.timedCurrentQuestion = generateSingleTimedQuestion();
    state.timedQuestionStartMs = performance.now();

    renderTimedActiveQuestion();
    updateChronoHudUI();
  }

  function renderTimedActiveQuestion() {
    const stage = document.getElementById('timedArenaStage');
    const q = state.timedCurrentQuestion;
    if (!stage || !q || !Array.isArray(q.options)) return;

    const statusRight = state.timedMode === 'survival'
      ? `โอกาสพลาดเหลือ : ${state.timedLives} ครั้ง`
      : (state.timedMode === 'reflex5' ? `ข้อที่ ${state.timedQuestionIndex} / 15` : `ข้อที่ ${state.timedQuestionIndex}`);

    stage.innerHTML = `
      <div class="u-flex-between">
        <span class="question-context-tag">${escapeHtml(q.tag)}</span>
        <span class="mono">${escapeHtml(statusRight)}</span>
      </div>
      <h2 class="question-title">${escapeHtml(q.prompt)}</h2>
      <div class="speed-choices-grid" role="group" aria-label="ตัวเลือกจับเวลา">
        ${q.options.map((opt, idx) => `
          <button type="button" class="choice-btn timed-choice-btn" data-tchoice="${idx}">
            <span class="choice-key">${idx + 1}</span>
            <span>${escapeHtml(opt)}</span>
          </button>
        `).join('')}
      </div>
    `;

    stage.querySelectorAll('.timed-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.timedStatus !== 'running') return;
        const idx = Number(btn.getAttribute('data-tchoice'));
        handleTimedAnswer(idx);
      });
    });
  }

  function handleTimedAnswer(chosenIdx) {
    const q = state.timedCurrentQuestion;
    if (state.timedStatus !== 'running' || !q || !Array.isArray(q.options)) return;
    if (chosenIdx < -1 || chosenIdx >= q.options.length) return;

    state.timedCurrentQuestion = null;

    const now = performance.now();
    const reactionMs = Math.max(80, Math.round(now - state.timedQuestionStartMs));
    state.timedReactionListMs.push(reactionMs);
    state.timedTotalAnswered++;

    const isCorrect = chosenIdx === q.correctIndex;

    if (isCorrect) {
      state.timedCorrectCount++;
      const speedBonus = Math.max(10, Math.round((3000 - Math.min(2800, reactionMs)) / 25));
      state.timedScore += (100 + speedBonus) * state.timedCombo;
      state.timedCombo = Math.min(5, state.timedCombo + 1);
      if (window.radioAudio) window.radioAudio.playCorrect();
    } else {
      state.timedCombo = 1;
      state.weakCodes.add(q.code);
      if (!state.timedMissedCodes.includes(q.code)) {
        state.timedMissedCodes.push(q.code);
      }
      saveWeakCodes();
      if (window.radioAudio) window.radioAudio.playError();

      if (state.timedMode === 'survival') {
        state.timedLives--;
        if (state.timedLives <= 0) {
          finishTimedChallenge();
          return;
        }
      }
    }

    nextTimedQuestion(false);
  }

  function runTimedLoop() {
    let lastFrame = performance.now();

    const step = (now) => {
      if (state.timedStatus !== 'running') return;
      const dt = now - lastFrame;
      lastFrame = now;

      state.timedRemainingMs = Math.max(0, state.timedRemainingMs - dt);
      updateChronoHudUI();

      const secLeft = Math.ceil(state.timedRemainingMs / 1000);
      if (secLeft <= 3 && secLeft > 0 && secLeft !== state.timedLastTickSec) {
        state.timedLastTickSec = secLeft;
        if (window.radioAudio) window.radioAudio.playTick(true);
      }

      if (state.timedRemainingMs <= 0) {
        if (state.timedMode === 'sprint60') {
          finishTimedChallenge();
          return;
        } else {
          // หมดเวลาต่อข้อในโหมด reflex5 หรือ survival
          handleTimedAnswer(-1);
          if (state.timedStatus !== 'running') return;
        }
      }

      state.timedRafId = requestAnimationFrame(step);
    };

    state.timedRafId = requestAnimationFrame(step);
  }

  function stopTimedLoop() {
    if (state.timedRafId) {
      cancelAnimationFrame(state.timedRafId);
      state.timedRafId = null;
    }
  }

  function updateChronoHudUI() {
    const timeEl = document.getElementById('chronoTimeDisplay');
    const scoreEl = document.getElementById('chronoScoreDisplay');
    const avgEl = document.getElementById('chronoAvgDisplay');
    const comboEl = document.getElementById('chronoComboDisplay');
    const barFill = document.getElementById('chronoBarFill');

    const sec = (state.timedRemainingMs / 1000).toFixed(2);
    const isUrgent = state.timedRemainingMs <= (state.timedMode === 'sprint60' ? 10000 : 1800);

    if (timeEl) {
      timeEl.textContent = `${sec}s`;
      timeEl.classList.toggle('urgent', isUrgent);
    }
    if (scoreEl) scoreEl.textContent = String(state.timedScore);

    if (avgEl) {
      if (state.timedReactionListMs.length > 0) {
        const sum = state.timedReactionListMs.reduce((a, b) => a + b, 0);
        const avgSec = (sum / state.timedReactionListMs.length / 1000).toFixed(2);
        avgEl.textContent = `${avgSec}s`;
      } else {
        avgEl.textContent = '0.00s';
      }
    }

    if (comboEl) comboEl.textContent = `x${state.timedCombo}`;

    if (barFill) {
      const ratio = state.timedMaxMs > 0 ? Math.max(0, Math.min(1, state.timedRemainingMs / state.timedMaxMs)) : 0;
      barFill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
      barFill.classList.toggle('urgent', isUrgent);
    }
  }

  function finishTimedChallenge() {
    stopTimedLoop();
    state.timedStatus = 'finished';
    state.timedCurrentQuestion = null;
    setTxStatus(false);
    const modeGrid = document.querySelector('.timer-mode-grid');
    if (modeGrid) modeGrid.classList.remove('is-running');
    if (window.radioAudio) window.radioAudio.playRogerBeep();

    const avgMs = state.timedReactionListMs.length > 0
      ? Math.round(state.timedReactionListMs.reduce((a, b) => a + b, 0) / state.timedReactionListMs.length)
      : 0;

    if (state.timedScore > state.stats.bestTimedScore) {
      state.stats.bestTimedScore = state.timedScore;
    }
    if (avgMs > 0 && state.timedCorrectCount >= 5) {
      if (state.stats.bestAvgReactionMs === 0 || avgMs < state.stats.bestAvgReactionMs) {
        state.stats.bestAvgReactionMs = avgMs;
      }
    }
    saveStats();

    const accuracy = state.timedTotalAnswered > 0
      ? Math.round((state.timedCorrectCount / state.timedTotalAnswered) * 100)
      : 0;

    let rankTitle = 'ลูกข่ายฝึกหัด (Cadet Operator)';
    if (state.timedScore >= 2500 && accuracy >= 85) {
      rankTitle = 'นายสถานีควบคุมข่าย (Master Net Controller)';
    } else if (state.timedScore >= 1200 && accuracy >= 75) {
      rankTitle = 'พนักงานวิทยุชำนาญการ (Senior Tactical Operator)';
    }

    const stage = document.getElementById('timedArenaStage');
    if (!stage) return;

    stage.innerHTML = `
      <div class="summary-card">
        <span class="code-badge core-badge">สรุปผลการฝึกจับเวลา (MISSION DEBRIEF)</span>
        <h2 class="question-title">ระดับความชำนาญ : ${escapeHtml(rankTitle)}</h2>

        <div class="debrief-grid">
          <div class="debrief-stat-box">
            <div class="chrono-label">คะแนนรวม</div>
            <div class="chrono-val">${state.timedScore}</div>
          </div>
          <div class="debrief-stat-box">
            <div class="chrono-label">ความแม่นยำ</div>
            <div class="chrono-val">${accuracy}% (${state.timedCorrectCount}/${state.timedTotalAnswered})</div>
          </div>
          <div class="debrief-stat-box">
            <div class="chrono-label">เวลาตัดสินใจเฉลี่ย</div>
            <div class="chrono-val">${avgMs > 0 ? (avgMs / 1000).toFixed(2) + 's' : '0.00s'}</div>
          </div>
        </div>

        ${state.timedMissedCodes.length > 0 ? `
          <div class="missed-box">
            <div class="question-context-tag">รหัส ว. ที่ตอบพลาดหรือหมดเวลาในรอบนี้ :</div>
            <div class="badge-cluster">
              ${state.timedMissedCodes.map(c => `<span class="code-badge">${escapeHtml(c)}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="action-cluster">
          <button type="button" id="timedPlayAgainBtn" class="ptt-action-btn btn-auto">
            <span>ทดสอบจับเวลาอีกครั้ง</span>
          </button>
          ${state.timedMissedCodes.length > 0 ? `
            <button type="button" id="timedPracticeMissedBtn" class="secondary-action-btn btn-auto">
              <span>ไปฝึกทบทวนรหัสที่พลาด</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;

    const againBtn = document.getElementById('timedPlayAgainBtn');
    const missedBtn = document.getElementById('timedPracticeMissedBtn');

    if (againBtn) againBtn.addEventListener('click', () => startTimedChallenge());
    if (missedBtn) {
      missedBtn.addEventListener('click', () => {
        state.drillWeakOnly = true;
        switchView('drills');
        startDrillSession();
      });
    }
  }

  /* ========================================================================
     7. Event Listeners & Keyboard Shortcuts
     ======================================================================== */

  function bindGlobalEvents() {
    // Navigation buttons
    document.querySelectorAll('.nav-tab, .mobile-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        if (view) switchView(view);
      });
    });

    // Audio toggle
    const audioBtn = document.getElementById('audioToggleBtn');
    const audioIcon = document.getElementById('audioToggleIcon');
    if (audioBtn && audioIcon && window.radioAudio) {
      const syncAudioUI = () => {
        audioBtn.setAttribute('aria-pressed', String(window.radioAudio.enabled));
        audioIcon.textContent = window.radioAudio.enabled ? 'SQL:ON' : 'SQL:MUTE';
      };
      syncAudioUI();
      audioBtn.addEventListener('click', () => {
        window.radioAudio.toggleAudio();
        syncAudioUI();
      });
    }

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'day';
        applyTheme(current === 'day' ? 'night' : 'day');
      });
    }

    // Search input
    const searchInput = document.getElementById('codeSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.searchQuery = searchInput.value;
        if (clearBtn) clearBtn.hidden = !state.searchQuery;
        if (state.directorySubView !== 'codes') {
          switchDirectorySubView('codes');
        }
        renderCodeTable();
      });
    }
    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        clearBtn.hidden = true;
        renderCodeTable();
        searchInput.focus();
      });
    }

    // Directory Sub-view tabs
    document.querySelectorAll('.sub-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.getAttribute('data-subview') || 'codes';
        switchDirectorySubView(sub);
      });
    });

    // Inspector buttons
    const inspPlayBtn = document.getElementById('inspPlayAudioBtn');
    if (inspPlayBtn) {
      inspPlayBtn.addEventListener('click', () => {
        const codes = Array.isArray(window.WO_CODES) ? window.WO_CODES : [];
        const found = codes.find(c => c.code === state.selectedCode);
        if (found) speakCodeItem(found);
      });
    }

    const inspBmBtn = document.getElementById('inspBookmarkBtn');
    if (inspBmBtn) {
      inspBmBtn.addEventListener('click', () => toggleBookmark(state.selectedCode));
    }

    const inspJumpDrillBtn = document.getElementById('inspJumpDrillBtn');
    if (inspJumpDrillBtn) {
      inspJumpDrillBtn.addEventListener('click', () => {
        closeMobileInspectorDrawer();
        switchView('drills');
        startDrillSession();
      });
    }

    const closeMobileBtn = document.getElementById('inspCloseMobileBtn');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    if (closeMobileBtn) closeMobileBtn.addEventListener('click', closeMobileInspectorDrawer);
    if (backdrop) backdrop.addEventListener('click', closeMobileInspectorDrawer);

    // Scenarios controls
    const togglePlainBtn = document.getElementById('togglePlainTranslationBtn');
    if (togglePlainBtn) {
      togglePlainBtn.addEventListener('click', () => {
        state.showPlainTranslation = !state.showPlainTranslation;
        togglePlainBtn.setAttribute('aria-pressed', String(state.showPlainTranslation));
        togglePlainBtn.innerHTML = `<span>แสดงคำแปลภาษาพูดปกติ : ${state.showPlainTranslation ? 'เปิด' : 'ซ่อน'}</span>`;
        renderActiveScenarioStage();
      });
    }

    const playFullBtn = document.getElementById('playFullScenarioBtn');
    const stopFullBtn = document.getElementById('stopScenarioAudioBtn');
    if (playFullBtn) playFullBtn.addEventListener('click', playFullScenario);
    if (stopFullBtn) stopFullBtn.addEventListener('click', stopScenarioPlayback);

    // Composer controls
    ['compReceiver', 'compSender', 'compTemplate'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', updateComposerOutput);
    });
    const compSpeakBtn = document.getElementById('composerSpeakBtn');
    if (compSpeakBtn) {
      compSpeakBtn.addEventListener('click', () => {
        const outEl = document.getElementById('composerResultText');
        const sentence = outEl ? outEl.getAttribute('data-raw-sentence') : '';
        if (sentence && window.radioAudio) {
          window.radioAudio.speakTransmission(
            sentence,
            () => setTxStatus(true, 'CH-01 · TX COMPOSER'),
            () => setTxStatus(false)
          );
        }
      });
    }

    // Drills controls
    const toggleInputModeBtn = document.getElementById('toggleInputModeBtn');
    if (toggleInputModeBtn) {
      toggleInputModeBtn.addEventListener('click', () => {
        state.drillInputMode = state.drillInputMode === 'choice' ? 'typein' : 'choice';
        startDrillSession();
      });
    }

    const restartDrillBtn = document.getElementById('restartDrillBtn');
    if (restartDrillBtn) {
      restartDrillBtn.addEventListener('click', () => startDrillSession());
    }

    const drillWeakBtn = document.getElementById('drillWeakCodesBtn');
    if (drillWeakBtn) {
      drillWeakBtn.addEventListener('click', () => {
        state.drillWeakOnly = true;
        startDrillSession();
      });
    }

    // Timed mode buttons
    document.querySelectorAll('[data-timemode]').forEach(btn => {
      btn.addEventListener('click', () => {
        stopTimedLoop();
        state.timedStatus = 'idle';
        state.timedMode = btn.getAttribute('data-timemode') || 'sprint60';
        document.querySelectorAll('[data-timemode]').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
        renderTimedIdleScreen();
      });
    });

    // Global Keyboard Shortcuts (/, 1-4, Space/Enter, Escape)
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isTyping = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (e.key === '/' && !isTyping && state.activeView === 'directory') {
        e.preventDefault();
        const searchEl = document.getElementById('codeSearchInput');
        if (searchEl) searchEl.focus();
        return;
      }

      if (e.key === 'Escape') {
        closeMobileInspectorDrawer();
        return;
      }

      if (isTyping) return;

      // Shortcuts 1-4 for active Drills or Timed Mode
      if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (state.activeView === 'drills' && !state.drillAnswered && state.drillInputMode === 'choice') {
          const btns = document.querySelectorAll('#drillStageContent .choice-btn');
          if (idx >= 0 && idx < btns.length) {
            e.preventDefault();
            evaluateDrillChoiceAnswer(idx);
          }
        } else if (state.activeView === 'timed' && state.timedStatus === 'running') {
          e.preventDefault();
          handleTimedAnswer(idx);
        }
      }

      // Space or Enter to advance to next question in Drills
      if ((e.key === ' ' || e.key === 'Enter') && state.activeView === 'drills' && state.drillAnswered) {
        const nextBtn = document.getElementById('drillNextQuestionBtn');
        if (nextBtn) {
          e.preventDefault();
          nextBtn.click();
        }
      }
    });
  }

  /* ========================================================================
     8. Bootstrapping
     ======================================================================== */

  function initApp() {
    loadPersistedState();
    updateQuickStatsUI();

    renderCategoryPills();
    renderCodeTable();
    selectCodeForInspector(state.selectedCode, false);
    renderWo16Table();
    renderPhoneticGrid();

    renderProtocolSteps();
    renderScenarioList();
    renderActiveScenarioStage();
    updateComposerOutput();

    startDrillSession();
    renderTimedIdleScreen();

    bindGlobalEvents();

    // Check initial URL hash
    const hash = window.location.hash.replace('#', '');
    if (['directory', 'scenarios', 'drills', 'timed'].includes(hash)) {
      switchView(hash, false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
