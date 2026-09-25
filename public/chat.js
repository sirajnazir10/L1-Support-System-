// MR Nexis workspace — client.
// Talks only to the session-scoped API; every conversation the server returns
// already belongs to the signed-in account, so there is no client-side filtering
// to get wrong.

(function () {
  'use strict';

  var state = {
    user: null,
    llm: false,
    conversations: [],
    activeId: null,
    messages: [],
    pending: [],       // attachments staged in the composer, already uploaded
    sending: false,
    search: '',
    sort: 'recent',
    showArchived: false,
    menuConvId: null
  };

  var DEFAULT_PREFS = { showAnalysis: false, enterSends: true, autoTitle: true, captureLearning: true };

  var $ = function (id) { return document.getElementById(id); };
  var els = {};
  ['chatList', 'messages', 'input', 'sendBtn', 'convTitle', 'convModule', 'headActions', 'composer',
   'pendingAttachments', 'searchInput', 'sortSelect', 'showArchived', 'newChatBtn', 'avatar',
   'profileName', 'profileRole', 'profileBtn', 'fileInput', 'imageInput', 'attachBtn', 'imageBtn',
   'voiceBtn', 'convMenu', 'settingsOverlay', 'toastHost', 'sidebar', 'sidebarToggle',
   'pinBtn', 'renameBtn', 'archiveBtn', 'deleteBtn'].forEach(function (id) { els[id] = $(id); });

  // ---------------- helpers ----------------
  function prefs() { return Object.assign({}, DEFAULT_PREFS, (state.user && state.user.preferences) || {}); }

  function api(path, options) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}))
      .then(function (r) {
        if (r.status === 401) { window.location.href = '/login.html'; throw new Error('Signed out'); }
        return r.json().then(function (body) {
          if (!r.ok) throw new Error(body.error || 'Request failed');
          return body;
        });
      });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Light, deliberately limited formatting: bold, inline code, and bullet lists.
  // Answer text is escaped first, so nothing the model or the KB returns can
  // inject markup into the page.
  function formatAnswer(text) {
    var safe = escapeHtml(String(text || ''));
    var blocks = safe.split(/\n{2,}/).map(function (block) {
      var lines = block.split('\n');
      var isList = lines.every(function (l) { return /^\s*[-•*]\s+/.test(l) || !l.trim(); });
      if (isList && lines.some(function (l) { return l.trim(); })) {
        var items = lines.filter(function (l) { return l.trim(); })
          .map(function (l) { return '<li>' + inline(l.replace(/^\s*[-•*]\s+/, '')) + '</li>'; }).join('');
        return '<ul>' + items + '</ul>';
      }
      return '<p>' + inline(block).replace(/\n/g, '<br/>') + '</p>';
    });
    return blocks.join('');
  }
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function relTime(iso) {
    if (!iso) return '';
    var then = new Date(iso.indexOf('Z') === -1 && iso.indexOf('T') === -1 ? iso.replace(' ', 'T') + 'Z' : iso);
    var diff = (Date.now() - then.getTime()) / 1000;
    if (isNaN(diff)) return '';
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function clockTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function fileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  function toast(message, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    els.toastHost.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  // ---------------- conversation list ----------------
  // Sequence-guarded: sending a message and typing in the search box both
  // refresh this list, and without the guard a slow earlier response lands last
  // and replaces the filtered results with stale unfiltered ones.
  var listRequestSeq = 0;
  function loadConversations() {
    var params = new URLSearchParams();
    if (state.search) params.set('q', state.search);
    if (state.sort) params.set('sort', state.sort);
    if (state.showArchived) params.set('archived', 'true');
    var seq = ++listRequestSeq;
    return api('/api/conversations?' + params.toString()).then(function (list) {
      if (seq !== listRequestSeq) return; // a newer request is already in flight
      state.conversations = list;
      renderConversations();
      var count = $('setConvCount');
      if (count) count.textContent = list.length;
    });
  }

  function renderConversations() {
    var list = state.conversations;
    if (!list.length) {
      els.chatList.innerHTML = '<div class="empty-note">' +
        (state.search ? 'No conversations match “' + escapeHtml(state.search) + '”.' : 'No conversations yet.<br/>Start one with <strong>New chat</strong>.') +
        '</div>';
      return;
    }
    var pinned = list.filter(function (c) { return c.pinned; });
    var rest = list.filter(function (c) { return !c.pinned; });
    var html = '';
    if (pinned.length) html += '<div class="list-section-label">Pinned</div>' + pinned.map(itemHtml).join('');
    if (rest.length) html += (pinned.length ? '<div class="list-section-label">Recent</div>' : '') + rest.map(itemHtml).join('');
    els.chatList.innerHTML = html;
  }

  function itemHtml(c) {
    return '<div class="chat-item' + (c.id === state.activeId ? ' active' : '') + '" data-id="' + c.id + '" role="button" tabindex="0">' +
      '<div class="chat-item-title">' + (c.pinned ? '<span class="pin-dot">●</span> ' : '') + escapeHtml(c.title) + '</div>' +
      (c.preview ? '<div class="chat-item-preview">' + escapeHtml(c.preview) + '</div>' : '') +
      '<div class="chat-item-meta">' +
        '<span>' + relTime(c.updatedAt) + '</span>' +
        (c.messageCount ? '<span>· ' + c.messageCount + ' msg</span>' : '') +
        (c.module ? '<span class="module-chip">' + escapeHtml(c.module) + '</span>' : '') +
        (c.archived ? '<span>· archived</span>' : '') +
      '</div>' +
      '<button class="chat-item-menu" data-menu="' + c.id + '" aria-label="Conversation actions">⋯</button>' +
      '</div>';
  }

  els.chatList.addEventListener('click', function (e) {
    var menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      e.stopPropagation();
      openConvMenu(menuBtn.getAttribute('data-menu'), menuBtn);
      return;
    }
    var item = e.target.closest('.chat-item');
    if (item) openConversation(item.getAttribute('data-id'));
  });

  // ---------------- conversation view ----------------
  function openConversation(id) {
    if (state.sending) return;
    state.activeId = id;
    renderConversations();
    closeSidebarOnMobile();
    var wantAnalysis = prefs().showAnalysis;
    return api('/api/conversations/' + encodeURIComponent(id) + (wantAnalysis ? '?analysis=true' : ''))
      .then(function (data) {
        state.messages = data.messages;
        state.attachments = data.attachments || [];
        renderConversationHeader(data.conversation);
        renderMessages();
        els.input.focus();
      })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function activeConversation() {
    return state.conversations.filter(function (c) { return c.id === state.activeId; })[0];
  }

  function renderConversationHeader(c) {
    els.convTitle.textContent = c ? c.title : 'New chat';
    els.headActions.hidden = !c;
    if (c && c.module) {
      els.convModule.textContent = c.module;
      els.convModule.hidden = false;
    } else {
      els.convModule.hidden = true;
    }
    els.pinBtn.classList.toggle('on', !!(c && c.pinned));
    els.archiveBtn.classList.toggle('on', !!(c && c.archived));
    // Keep the cached list row in step with what the header now shows.
    if (c) {
      state.conversations = state.conversations.map(function (x) { return x.id === c.id ? Object.assign({}, x, c) : x; });
      renderConversations();
    }
  }

  function renderMessages() {
    if (!state.activeId) { renderWelcome(); return; }
    if (!state.messages.length) { renderWelcome(true); return; }
    els.messages.innerHTML = state.messages.map(messageHtml).join('');
    scrollToBottom();
  }

  function messageHtml(m) {
    var isUser = m.role === 'user';
    var atts = (state.attachments || []).filter(function (a) { return a.messageId === m.id; });
    var html = '<div class="msg-row"><div class="msg ' + (isUser ? 'user' : 'assistant') + '">' +
      '<div class="msg-avatar">' + (isUser ? escapeHtml(initials(state.user.displayName)) : 'N') + '</div>' +
      '<div class="msg-body">' +
      '<div class="msg-who">' + (isUser ? escapeHtml(state.user.displayName) : 'Nexis') +
      '<span class="msg-time">' + clockTime(m.createdAt) + '</span></div>' +
      '<div class="msg-text">' + formatAnswer(m.content) + '</div>';

    if (atts.length) {
      html += '<div class="attach-row">' + atts.map(function (a) {
        return '<div class="attach-card" data-att="' + a.id + '">' +
          '<span class="fname">' + escapeHtml(a.fileName) + '</span>' +
          '<span class="fsize">' + fileSize(a.byteSize) + '</span></div>';
      }).join('') + '</div>';
    }

    if (!isUser && m.sources && m.sources.length) {
      html += '<div class="sources"><div class="sources-label">Sources</div>' +
        m.sources.map(function (s) {
          return '<span class="source-chip">' + escapeHtml(s.title) +
            '<span class="src-doc">' + escapeHtml(s.sourceDoc) + (s.page ? ', p.' + s.page : '') + '</span></span>';
        }).join('') + '</div>';
    }

    if (!isUser && m.analysis) html += analysisHtml(m.analysis);
    return html + '</div></div></div>';
  }

  // Rendered only when the agent has switched it on; it is a separate, clearly
  // marked panel so internal reasoning is never mistaken for the reply itself.
  function analysisHtml(a) {
    var rows = [];
    if (a.understanding) rows.push(['Understanding', a.understanding]);
    if (a.engine) rows.push(['Engine', a.engine === 'llm' ? 'Model-drafted' : a.engine === 'local' ? 'Local retrieval' : a.engine]);
    if (typeof a.confidence === 'number') rows.push(['Confidence', Math.round(a.confidence * 100) + '%']);
    if (a.module) rows.push(['Module', a.module]);
    if (a.isFollowUp) rows.push(['Follow-up', 'Resolved against earlier turns in this conversation']);
    if (a.handledAs) rows.push(['Handled as', a.handledAs]);
    if (a.candidates && a.candidates.length) {
      rows.push(['Candidates', a.candidates.map(function (c) { return c.title + ' (' + c.score + ')'; }).join(' · ')]);
    }
    if (a.learnedApplied && a.learnedApplied.length) {
      rows.push(['Applied knowledge', a.learnedApplied.map(function (l) { return '[' + l.status + '] ' + l.claim.slice(0, 90); }).join(' · ')]);
    }
    if (a.attachmentsConsulted && a.attachmentsConsulted.length) rows.push(['Files read', a.attachmentsConsulted.join(', ')]);
    if (a.nextStep) rows.push(['Suggested next step', a.nextStep]);
    if (!rows.length) return '';
    return '<details class="analysis"><summary>Internal analysis</summary><div class="analysis-body">' +
      rows.map(function (r) {
        return '<div class="analysis-row"><span class="analysis-key">' + escapeHtml(r[0]) + '</span><span>' + escapeHtml(r[1]) + '</span></div>';
      }).join('') + '</div></details>';
  }

  function renderWelcome(inConversation) {
    var starters = [
      ['Smart Docs isn\'t updating', 'Changes to a requirement aren\'t appearing'],
      ['Baseline configuration', 'How do I configure a baseline?'],
      ['Copilot4DevOps', 'Do we have custom AI model support?'],
      ['Word Import', 'Word import is failing on a large document']
    ];
    els.messages.innerHTML = '<div class="welcome">' +
      '<div class="welcome-mark">N</div>' +
      '<h2>' + (inConversation ? 'New conversation' : 'Welcome back, ' + escapeHtml((state.user.displayName || '').split(' ')[0]) + '') + '</h2>' +
      '<p>Ask about Modern Requirements4DevOps or Copilot4DevOps. Attach a screenshot, log, or document and Nexis will read it.</p>' +
      '<div class="starter-grid">' + starters.map(function (s) {
        return '<button class="starter" data-starter="' + escapeHtml(s[1]) + '"><strong>' + escapeHtml(s[0]) + '</strong><span>' + escapeHtml(s[1]) + '</span></button>';
      }).join('') + '</div></div>';
  }

  els.messages.addEventListener('click', function (e) {
    var starter = e.target.closest('[data-starter]');
    if (starter) {
      els.input.value = starter.getAttribute('data-starter');
      autoGrow();
      updateSendState();
      els.input.focus();
    }
  });

  function scrollToBottom() {
    requestAnimationFrame(function () { els.messages.scrollTop = els.messages.scrollHeight; });
  }

  // ---------------- sending ----------------
  function newChat() {
    return api('/api/conversations', { method: 'POST', body: JSON.stringify({}) })
      .then(function (c) {
        state.conversations.unshift(Object.assign({ messageCount: 0 }, c));
        state.activeId = c.id;
        state.messages = [];
        state.attachments = [];
        state.pending = [];
        renderPending();
        renderConversations();
        renderConversationHeader(c);
        renderWelcome(true);
        els.input.focus();
        closeSidebarOnMobile();
        return c;
      });
  }

  function send() {
    var text = els.input.value.trim();
    if (!text || state.sending) return;
    // Staged files upload against a conversation, so one has to exist first.
    var ready = state.activeId ? Promise.resolve() : newChat();
    ready.then(function () {
      var attachmentIds = state.pending.filter(function (p) { return p.id; }).map(function (p) { return p.id; });
      state.sending = true;
      updateSendState();
      els.input.value = '';
      autoGrow();

      appendLocalMessage({ role: 'user', content: text, createdAt: new Date().toISOString() }, state.pending.slice());
      state.pending = [];
      renderPending();
      showTyping();

      api('/api/conversations/' + encodeURIComponent(state.activeId) + '/messages', {
        method: 'POST',
        body: JSON.stringify({ content: text, attachmentIds: attachmentIds })
      })
        .then(function (res) {
          hideTyping();
          state.messages.push(res.userMessage);
          var assistant = res.assistantMessage;
          if (!prefs().showAnalysis) delete assistant.analysis;
          state.messages.push(assistant);
          renderConversationHeader(res.conversation);
          renderMessages();
          if (res.learned) showLearnBanner(res.learned);
          return loadConversations();
        })
        .catch(function (err) {
          hideTyping();
          toast(err.message, 'error');
        })
        .then(function () {
          state.sending = false;
          updateSendState();
          els.input.focus();
        });
    }).catch(function (err) {
      toast(err.message, 'error');
      state.sending = false;
      updateSendState();
    });
  }

  // Shows the message immediately; the server copy replaces it on response.
  function appendLocalMessage(msg, attachments) {
    if (els.messages.querySelector('.welcome')) els.messages.innerHTML = '';
    var attHtml = attachments && attachments.length
      ? '<div class="attach-row">' + attachments.map(function (a) {
          return a.previewUrl
            ? '<img class="attach-img" src="' + a.previewUrl + '" alt="' + escapeHtml(a.fileName) + '"/>'
            : '<div class="attach-card"><span class="fname">' + escapeHtml(a.fileName) + '</span><span class="fsize">' + fileSize(a.byteSize) + '</span></div>';
        }).join('') + '</div>'
      : '';
    els.messages.insertAdjacentHTML('beforeend',
      '<div class="msg-row"><div class="msg user">' +
      '<div class="msg-avatar">' + escapeHtml(initials(state.user.displayName)) + '</div>' +
      '<div class="msg-body"><div class="msg-who">' + escapeHtml(state.user.displayName) +
      '<span class="msg-time">' + clockTime(msg.createdAt) + '</span></div>' +
      '<div class="msg-text">' + formatAnswer(msg.content) + '</div>' + attHtml +
      '</div></div></div>');
    scrollToBottom();
  }

  function showTyping() {
    els.messages.insertAdjacentHTML('beforeend',
      '<div class="msg-row" id="typingRow"><div class="msg assistant">' +
      '<div class="msg-avatar">N</div><div class="msg-body">' +
      '<div class="typing"><span></span><span></span><span></span></div></div></div></div>');
    scrollToBottom();
  }
  function hideTyping() {
    var t = $('typingRow');
    if (t) t.remove();
  }

  function showLearnBanner(learned) {
    var conflict = learned.conflictsWith && learned.conflictsWith.length;
    var html = '<div class="learn-banner' + (conflict ? ' conflict' : '') + '" id="learnBanner">' +
      '<strong>' + (conflict ? 'Recorded — but it conflicts with the documentation' : 'Recorded for this conversation') + '</strong><br/>' +
      escapeHtml(learned.note || '') +
      '<div class="learn-banner-actions">' +
      '<button class="btn btn-primary" data-learn="verify" data-id="' + learned.id + '">Verify for future chats</button>' +
      '<button class="btn btn-secondary" data-learn="reject" data-id="' + learned.id + '">Discard</button>' +
      '</div></div>';
    els.messages.insertAdjacentHTML('beforeend', html);
    scrollToBottom();
  }

  els.messages.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-learn]');
    if (!btn) return;
    var decision = btn.getAttribute('data-learn');
    api('/api/knowledge/' + btn.getAttribute('data-id') + '/review', {
      method: 'POST', body: JSON.stringify({ decision: decision })
    }).then(function () {
      var banner = $('learnBanner');
      if (banner) banner.remove();
      toast(decision === 'verify' ? 'Verified — Nexis will use this in future conversations.' : 'Discarded.', 'success');
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  // ---------------- attachments ----------------
  function stageFiles(files) {
    if (!files || !files.length) return;
    var ready = state.activeId ? Promise.resolve() : newChat();
    ready.then(function () {
      var form = new FormData();
      var staged = [];
      Array.prototype.forEach.call(files, function (f) {
        form.append('files', f);
        var entry = { fileName: f.name, byteSize: f.size, uploading: true };
        if (/^image\//.test(f.type)) entry.previewUrl = URL.createObjectURL(f);
        staged.push(entry);
        state.pending.push(entry);
      });
      renderPending();

      fetch('/api/conversations/' + encodeURIComponent(state.activeId) + '/attachments', { method: 'POST', body: form })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'Upload failed'); return b; }); })
        .then(function (res) {
          res.attachments.forEach(function (saved, i) {
            if (staged[i]) { staged[i].id = saved.id; staged[i].uploading = false; }
          });
          renderPending();
          updateSendState();
        })
        .catch(function (err) {
          staged.forEach(function (s) {
            var idx = state.pending.indexOf(s);
            if (idx > -1) state.pending.splice(idx, 1);
          });
          renderPending();
          toast(err.message, 'error');
        });
    });
  }

  function renderPending() {
    els.pendingAttachments.innerHTML = state.pending.map(function (p, i) {
      return '<div class="pending-card' + (p.uploading ? ' uploading' : '') + '">' +
        (p.previewUrl ? '<img src="' + p.previewUrl + '" alt=""/>' : '') +
        '<span>' + escapeHtml(p.fileName) + '</span>' +
        '<span class="fsize" style="color:var(--text-muted);font-size:11px">' + (p.uploading ? 'uploading…' : fileSize(p.byteSize)) + '</span>' +
        '<button class="remove" data-remove="' + i + '" aria-label="Remove attachment">×</button></div>';
    }).join('');
  }

  els.pendingAttachments.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-remove]');
    if (!btn) return;
    state.pending.splice(Number(btn.getAttribute('data-remove')), 1);
    renderPending();
  });

  els.attachBtn.addEventListener('click', function () { els.fileInput.click(); });
  els.imageBtn.addEventListener('click', function () { els.imageInput.click(); });
  els.fileInput.addEventListener('change', function () { stageFiles(this.files); this.value = ''; });
  els.imageInput.addEventListener('change', function () { stageFiles(this.files); this.value = ''; });

  ['dragenter', 'dragover'].forEach(function (evt) {
    els.composer.addEventListener(evt, function (e) { e.preventDefault(); els.composer.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    els.composer.addEventListener(evt, function (e) {
      e.preventDefault();
      if (evt === 'dragleave' && els.composer.contains(e.relatedTarget)) return;
      els.composer.classList.remove('dragover');
    });
  });
  els.composer.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) stageFiles(e.dataTransfer.files);
  });
  // Pasting a screenshot straight into the composer is the common case for support work.
  els.input.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (files.length) { e.preventDefault(); stageFiles(files); }
  });

  // ---------------- composer behaviour ----------------
  function autoGrow() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 200) + 'px';
  }
  function updateSendState() {
    var uploading = state.pending.some(function (p) { return p.uploading; });
    els.sendBtn.disabled = state.sending || uploading || !els.input.value.trim();
  }
  els.input.addEventListener('input', function () { autoGrow(); updateSendState(); });
  els.input.addEventListener('focus', function () { els.composer.classList.add('focused'); });
  els.input.addEventListener('blur', function () { els.composer.classList.remove('focused'); });
  els.input.addEventListener('keydown', function (e) {
    var enterSends = prefs().enterSends;
    if (e.key === 'Enter' && !e.shiftKey && (enterSends ? !e.ctrlKey : e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  });
  els.sendBtn.addEventListener('click', send);
  els.newChatBtn.addEventListener('click', function () { newChat().catch(function (e) { toast(e.message, 'error'); }); });

  // ---------------- voice (progressive enhancement) ----------------
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Recognition) {
    els.voiceBtn.hidden = false;
    var recognition = new Recognition();
    var listening = false;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = function (e) {
      var said = Array.prototype.map.call(e.results, function (r) { return r[0].transcript; }).join(' ').trim();
      els.input.value = (els.input.value ? els.input.value + ' ' : '') + said;
      autoGrow();
      updateSendState();
    };
    recognition.onerror = function () { toast('Could not capture audio.', 'error'); };
    recognition.onend = function () { listening = false; els.voiceBtn.classList.remove('rec-on'); };
    els.voiceBtn.addEventListener('click', function () {
      if (listening) { recognition.stop(); return; }
      try {
        recognition.start();
        listening = true;
        els.voiceBtn.classList.add('rec-on');
      } catch (err) { toast('Dictation is unavailable.', 'error'); }
    });
  }

  // ---------------- search / sort ----------------
  var searchTimer;
  els.searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    var value = this.value;
    searchTimer = setTimeout(function () { state.search = value.trim(); loadConversations(); }, 200);
  });
  els.sortSelect.addEventListener('change', function () { state.sort = this.value; loadConversations(); });
  els.showArchived.addEventListener('change', function () { state.showArchived = this.checked; loadConversations(); });

  // ---------------- conversation actions ----------------
  function patchConversation(id, patch) {
    return api('/api/conversations/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(patch) })
      .then(function (c) {
        if (c.id === state.activeId) renderConversationHeader(c);
        return loadConversations();
      })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function removeConversation(id) {
    if (!window.confirm('Delete this conversation and its attachments? This cannot be undone.')) return;
    api('/api/conversations/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () {
        if (id === state.activeId) {
          state.activeId = null;
          state.messages = [];
          renderConversationHeader(null);
          renderWelcome();
        }
        toast('Conversation deleted.', 'success');
        return loadConversations();
      })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function startRename(id) {
    var conv = state.conversations.filter(function (c) { return c.id === id; })[0];
    var next = window.prompt('Rename conversation', conv ? conv.title : '');
    if (next === null) return;
    var trimmed = next.trim();
    if (!trimmed) { toast('Title cannot be empty.', 'error'); return; }
    patchConversation(id, { title: trimmed });
  }

  els.pinBtn.addEventListener('click', function () {
    var c = activeConversation();
    if (c) patchConversation(c.id, { pinned: !c.pinned });
  });
  els.renameBtn.addEventListener('click', function () { if (state.activeId) startRename(state.activeId); });
  els.archiveBtn.addEventListener('click', function () {
    var c = activeConversation();
    if (c) patchConversation(c.id, { archived: !c.archived }).then(function () {
      toast(c.archived ? 'Restored from archive.' : 'Conversation archived.', 'success');
    });
  });
  els.deleteBtn.addEventListener('click', function () { if (state.activeId) removeConversation(state.activeId); });

  function openConvMenu(id, anchor) {
    state.menuConvId = id;
    var conv = state.conversations.filter(function (c) { return c.id === id; })[0] || {};
    els.convMenu.querySelector('[data-act="pin"]').textContent = conv.pinned ? 'Unpin' : 'Pin';
    els.convMenu.querySelector('[data-act="archive"]').textContent = conv.archived ? 'Restore from archive' : 'Archive';
    var rect = anchor.getBoundingClientRect();
    els.convMenu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 170) + 'px';
    els.convMenu.style.left = Math.min(rect.left - 150, window.innerWidth - 190) + 'px';
    els.convMenu.classList.add('show');
  }
  function closeConvMenu() { els.convMenu.classList.remove('show'); state.menuConvId = null; }

  els.convMenu.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = state.menuConvId;
    var conv = state.conversations.filter(function (c) { return c.id === id; })[0] || {};
    closeConvMenu();
    switch (btn.getAttribute('data-act')) {
      case 'rename': startRename(id); break;
      case 'pin': patchConversation(id, { pinned: !conv.pinned }); break;
      case 'archive': patchConversation(id, { archived: !conv.archived }); break;
      case 'delete': removeConversation(id); break;
    }
  });
  document.addEventListener('click', function (e) {
    if (!els.convMenu.contains(e.target) && !e.target.closest('[data-menu]')) closeConvMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeConvMenu(); closeSettings(); }
  });

  // ---------------- sidebar (mobile) ----------------
  els.sidebarToggle.addEventListener('click', function () { els.sidebar.classList.toggle('open'); });
  function closeSidebarOnMobile() { els.sidebar.classList.remove('open'); }

  // ---------------- settings ----------------
  function openSettings() {
    els.settingsOverlay.classList.add('show');
    $('setUsername').textContent = state.user.username;
    $('setEmailValue').textContent = state.user.email || 'Not set';
    $('setCustomerType').textContent = state.user.customerType === 'existing'
      ? 'Existing' + (state.user.organization ? ' · ' + state.user.organization : '')
      : state.user.customerType === 'new' ? 'New customer' : '—';
    $('setRole').textContent = state.user.role === 'admin' ? 'Administrator' : 'Support agent';
    $('setCreated').textContent = state.user.createdAt ? new Date(state.user.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString() : '—';
    $('setConvCount').textContent = state.conversations.length;
    $('setEngine').textContent = state.llm ? 'Model-assisted' : 'Local retrieval only';
    $('setDisplayName').value = state.user.displayName || '';
    $('setEmail').value = state.user.email || '';
    $('setOrganization').value = state.user.organization || '';
    var p = prefs();
    $('prefAnalysis').checked = p.showAnalysis;
    $('prefSend').checked = p.enterSends;
    $('prefAutoTitle').checked = p.autoTitle;
    $('prefLearn').checked = p.captureLearning;
    loadSessions();
    loadKnowledge();
    renderAbout();
  }
  function closeSettings() { els.settingsOverlay.classList.remove('show'); }

  // ---------------- version / build ----------------
  // Fetched once and cached: the running build cannot change without a restart,
  // which would reload the page anyway.
  var versionInfo = null;

  function loadVersion() {
    return api('/api/version').then(function (v) {
      versionInfo = v;
      var chip = $('buildChip');
      if (chip) { chip.textContent = v.version; }
      return v;
    }).catch(function () {
      var chip = $('buildChip');
      if (chip) { chip.textContent = ''; chip.hidden = true; }
    });
  }

  var TYPE_CLASS = { 'Release': 'type-release', 'Feature': 'type-feature', 'Bug fix': 'type-fix' };

  function renderAbout() {
    var host = $('aboutHistory');
    if (!host) return;
    if (!versionInfo) {
      // Clear the placeholders too, or the panel shows "…" next to an empty
      // facts list and reads like it is still loading rather than failed.
      $('aboutVersion').textContent = 'Version unavailable';
      $('aboutFacts').innerHTML = '';
      host.innerHTML = '<div class="empty">Could not reach the server for build information.</div>';
      return;
    }
    var v = versionInfo;

    $('aboutVersion').textContent = 'Version ' + v.version;

    var facts = [
      ['Version', v.semantic],
      ['Build', String(v.build)],
      ['Released', v.releaseDate],
      ['Answering engine', v.llm ? 'Model-assisted (' + v.llm + ')' : 'Local retrieval only'],
      ['Knowledge base', v.knowledgeBaseEntries + ' entries'],
      ['Node.js', v.node]
    ];
    $('aboutFacts').innerHTML = facts.map(function (f) {
      return '<dt>' + escapeHtml(f[0]) + '</dt><dd>' + escapeHtml(f[1]) + '</dd>';
    }).join('');

    // Newest first: the build someone is looking for is almost always a recent one.
    host.innerHTML = v.builds.slice().reverse().map(function (b) {
      var isCurrent = b.build === v.version;
      var meta = [
        ['Reference', b.reference], ['Developer', b.developer],
        ['QA', b.qa], ['Deployment', b.deployment]
      ].filter(function (m) { return m[1] && m[1] !== '—'; });

      return '<div class="about-build' + (isCurrent ? ' is-current' : '') + '">' +
        '<div class="about-build-head">' +
          '<span class="about-build-no">' + escapeHtml(b.build) + '</span>' +
          '<span class="about-tag ' + (TYPE_CLASS[b.type] || '') + '">' + escapeHtml(b.type) + '</span>' +
          (isCurrent ? '<span class="about-tag current">Running</span>' : '') +
          '<span class="about-build-date">' + escapeHtml(b.date) + '</span>' +
        '</div>' +
        '<ul>' + b.changes.map(function (c) { return '<li>' + escapeHtml(c) + '</li>'; }).join('') + '</ul>' +
        (meta.length
          ? '<div class="about-meta">' + meta.map(function (m) {
              return '<span><b>' + escapeHtml(m[0]) + ':</b> ' + escapeHtml(m[1]) + '</span>';
            }).join('') + '</div>'
          : '') +
      '</div>';
    }).join('');
  }

  // The build chip in the sidebar opens straight to About, so the number and
  // what is in it are one click apart.
  var buildChipEl = $('buildChip');
  if (buildChipEl) {
    buildChipEl.addEventListener('click', function () {
      openSettings();
      var tab = document.querySelector('.settings-tab[data-tab="about"]');
      if (tab) tab.click();
    });
  }

  els.profileBtn.addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', closeSettings);
  $('settingsDone').addEventListener('click', closeSettings);
  els.settingsOverlay.addEventListener('click', function (e) { if (e.target === els.settingsOverlay) closeSettings(); });

  Array.prototype.forEach.call(document.querySelectorAll('.settings-tab'), function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.settings-tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.settings-panel').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelector('.settings-panel[data-panel="' + tab.getAttribute('data-tab') + '"]').classList.add('active');
    });
  });

  function savePrefs() {
    var next = {
      showAnalysis: $('prefAnalysis').checked,
      enterSends: $('prefSend').checked,
      autoTitle: $('prefAutoTitle').checked,
      captureLearning: $('prefLearn').checked
    };
    return api('/api/auth/preferences', { method: 'PATCH', body: JSON.stringify(next) })
      .then(function (res) { state.user = res.user; })
      .catch(function (err) { toast(err.message, 'error'); });
  }
  ['prefAnalysis', 'prefSend', 'prefAutoTitle', 'prefLearn'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      savePrefs().then(function () {
        // Analysis visibility changes what the server is asked to return.
        if (id === 'prefAnalysis' && state.activeId) openConversation(state.activeId);
      });
    });
  });

  $('saveProfileBtn').addEventListener('click', function () {
    api('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        displayName: $('setDisplayName').value.trim(),
        email: $('setEmail').value.trim(),
        organization: $('setOrganization').value.trim()
      })
    }).then(function (res) {
      state.user = res.user;
      paintUser();
      toast('Profile saved.', 'success');
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  $('changePasswordBtn').addEventListener('click', function () {
    api('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: $('curPassword').value, newPassword: $('newPassword').value })
    }).then(function () {
      $('curPassword').value = '';
      $('newPassword').value = '';
      toast('Password changed. Other sessions signed out.', 'success');
      loadSessions();
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  function loadSessions() {
    api('/api/auth/sessions').then(function (list) {
      $('sessionList').innerHTML = list.map(function (s) {
        return '<div class="session-row">' +
          '<div><strong>' + relTime(s.lastSeenAt) + '</strong> ' +
          (s.current ? '<span class="badge-current">This device</span>' : '') + '</div>' +
          '<div class="session-ua">' + escapeHtml((s.userAgent || 'Unknown device').slice(0, 110)) + '</div></div>';
      }).join('') || '<div class="empty-note">No active sessions.</div>';
    }).catch(function () {});
  }

  $('signOutOthersBtn').addEventListener('click', function () {
    api('/api/auth/sessions', { method: 'DELETE' }).then(function () {
      toast('Other sessions signed out.', 'success');
      loadSessions();
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  function loadKnowledge() {
    api('/api/knowledge?limit=25').then(function (list) {
      if (!list.length) {
        $('knowledgeList').innerHTML = '<div class="empty-note">Nothing recorded yet. Correct Nexis mid-conversation and it will appear here.</div>';
        return;
      }
      $('knowledgeList').innerHTML = list.map(function (k) {
        var badge = k.status === 'verified' ? 'success' : k.status === 'rejected' ? 'danger' : 'warning';
        return '<div class="session-row">' +
          '<div style="display:flex;gap:7px;align-items:center;margin-bottom:3px">' +
          '<span class="module-chip" style="background:var(--' + badge + '-light);color:var(--' + badge + ')">' + escapeHtml(k.status) + '</span>' +
          (k.topic ? '<span style="font-size:11.5px;color:var(--text-muted)">' + escapeHtml(k.topic) + '</span>' : '') + '</div>' +
          '<div>' + escapeHtml(k.claim.slice(0, 190)) + '</div>' +
          (k.validationNote ? '<div class="session-ua" style="margin-top:2px">' + escapeHtml(k.validationNote) + '</div>' : '') +
          (k.status === 'proposed'
            ? '<div style="margin-top:6px;display:flex;gap:6px">' +
              '<button class="btn btn-secondary" style="padding:3px 9px;font-size:12px" data-learn="verify" data-id="' + k.id + '">Verify</button>' +
              '<button class="btn btn-secondary" style="padding:3px 9px;font-size:12px" data-learn="reject" data-id="' + k.id + '">Discard</button></div>'
            : '') +
          '</div>';
      }).join('');
    }).catch(function () {});
  }

  $('knowledgeList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-learn]');
    if (!btn) return;
    api('/api/knowledge/' + btn.getAttribute('data-id') + '/review', {
      method: 'POST', body: JSON.stringify({ decision: btn.getAttribute('data-learn') })
    }).then(function () { loadKnowledge(); toast('Updated.', 'success'); })
      .catch(function (err) { toast(err.message, 'error'); });
  });

  $('clearHistoryBtn').addEventListener('click', function () {
    if (!window.confirm('Delete every conversation on this account? This cannot be undone.')) return;
    api('/api/conversations?confirm=true', { method: 'DELETE' }).then(function (res) {
      state.activeId = null;
      state.messages = [];
      renderConversationHeader(null);
      renderWelcome();
      toast('Deleted ' + res.deleted + ' conversation(s).', 'success');
      return loadConversations();
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  $('logoutBtn').addEventListener('click', function () {
    api('/api/auth/logout', { method: 'POST' }).then(function () { window.location.href = '/login.html'; });
  });

  // ---------------- boot ----------------
  function paintUser() {
    els.avatar.textContent = initials(state.user.displayName);
    els.profileName.textContent = state.user.displayName;
    els.profileRole.textContent = state.user.role === 'admin' ? 'Administrator' : 'Support agent';
  }

  fetch('/api/auth/me')
    .then(function (r) {
      if (!r.ok) { window.location.href = '/login.html'; throw new Error('unauthenticated'); }
      return r.json();
    })
    .then(function (data) {
      state.user = data.user;
      state.llm = data.llm;
      paintUser();
      // Not awaited with the conversation load: the build chip is useful but
      // nothing else waits on it, and a failure here must not block the app.
      loadVersion();
      return loadConversations();
    })
    .then(function () {
      // Resume the most recent conversation, the way a workspace should.
      if (state.conversations.length) openConversation(state.conversations[0].id);
      else renderWelcome();
    })
    .catch(function () {});
})();
