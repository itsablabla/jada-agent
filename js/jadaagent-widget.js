/**
 * Jada AI Chat Widget — v6.0
 * Floating FAB on all Nextcloud pages. Uses the jadaagent PHP proxy
 * for SSE streaming (/apps/jadaagent/api/chat/sse) so auth and CSRF
 * are handled by Nextcloud automatically.
 */
(function () {
  'use strict';

  // Skip login / public-share pages
  if (!document.querySelector('head[data-user]') && !window.OC?.currentUser) return;

  // Don't render on the full Jada Agent page itself
  if (location.pathname.indexOf('/apps/jadaagent') === 0) return;

  // ── Constants ──────────────────────────────────────────────────────
  var BASE = '/apps/jadaagent';
  var STORAGE_KEY = 'jada-widget-conversations';
  var ACTIVE_KEY = 'jada-widget-active';
  var MAX_HISTORY = 30;

  // ── State ──────────────────────────────────────────────────────────
  var conversations = [];
  var activeConvId = null;
  var chatOpen = false;
  var isLoading = false;
  var currentAbort = null;
  var streamBuffer = '';
  var streamText = '';
  var toolCalls = [];

  // ── Storage ────────────────────────────────────────────────────────
  function load() {
    try {
      conversations = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(conversations)) conversations = [];
    } catch (e) { conversations = []; }
    activeConvId = localStorage.getItem(ACTIVE_KEY) || null;
    if (activeConvId && !getConv(activeConvId)) activeConvId = null;
    if (!activeConvId && conversations.length) activeConvId = conversations[0].id;
    if (!activeConvId) newConv(true);
  }

  function save() {
    if (conversations.length > 20) conversations = conversations.slice(0, 20);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      if (activeConvId) localStorage.setItem(ACTIVE_KEY, activeConvId);
    } catch (e) { /* quota */ }
  }

  function getConv(id) {
    for (var i = 0; i < conversations.length; i++) {
      if (conversations[i].id === id) return conversations[i];
    }
    return null;
  }

  function newConv(silent) {
    var c = {
      id: 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: 'New chat',
      messages: [],
      ts: Date.now()
    };
    conversations.unshift(c);
    activeConvId = c.id;
    if (!silent) { save(); render(); }
    return c;
  }

  function activeMessages() {
    var c = getConv(activeConvId);
    return c ? c.messages : [];
  }

  // ── CSRF token ─────────────────────────────────────────────────────
  function csrf() {
    var m = document.querySelector('meta[name="requesttoken"]');
    return m ? m.content : (window.OC && window.OC.requestToken) || '';
  }

  // ── SSE chat ───────────────────────────────────────────────────────
  function sendMessage(text) {
    if (!text.trim() || isLoading) return;
    var conv = getConv(activeConvId);
    if (!conv) conv = newConv(true);

    conv.messages.push({ role: 'user', text: text, ts: Date.now() });
    if (conv.title === 'New chat') {
      conv.title = text.length > 35 ? text.substring(0, 35) + '…' : text;
    }
    save();
    render();
    scrollBottom();

    isLoading = true;
    streamText = '';
    toolCalls = [];
    render();

    var controller = new AbortController();
    currentAbort = controller;

    fetch(BASE + '/api/chat/sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'requesttoken': csrf()
      },
      body: JSON.stringify({
        message: text,
        conversation_id: activeConvId
      }),
      signal: controller.signal
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var fullText = '';
      var currentEvent = '';

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) return finish(fullText);
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('event: ') === 0) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (line.indexOf('data: ') !== 0) continue;
            var data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              var p = JSON.parse(data);
              var evt = currentEvent || p.type || '';

              if (evt === 'step_delta' || evt === 'text_delta' || evt === 'content_delta') {
                fullText += p.delta || p.text || '';
                streamText = fullText;
              } else if (evt === 'tool_start' || evt === 'tool_call') {
                toolCalls.push({ name: p.tool || p.name || 'tool', status: 'running' });
              } else if (evt === 'step_complete') {
                if (p.text && !fullText) { fullText = p.text; streamText = fullText; }
                var last = toolCalls[toolCalls.length - 1];
                if (last && last.status === 'running') last.status = 'done';
              } else if (evt === 'tool_result') {
                var l2 = toolCalls[toolCalls.length - 1];
                if (l2) l2.status = 'done';
              } else if (evt === 'reason_delta') {
                // skip reasoning
              } else if (p.choices && p.choices[0] && p.choices[0].delta && p.choices[0].delta.content) {
                fullText += p.choices[0].delta.content;
                streamText = fullText;
              }
            } catch (e) { /* ignore */ }
            currentEvent = '';
          }
          render();
          scrollBottom();
          return pump();
        });
      }
      return pump();
    }).catch(function (err) {
      if (err.name === 'AbortError') return;
      finish('Error: ' + err.message);
    });
  }

  function finish(text) {
    var conv = getConv(activeConvId);
    if (conv) {
      conv.messages.push({
        role: 'assistant',
        text: text || streamText || '(No response)',
        ts: Date.now(),
        tools: toolCalls.length ? toolCalls.slice() : undefined
      });
      // Trim history
      if (conv.messages.length > MAX_HISTORY) conv.messages = conv.messages.slice(-MAX_HISTORY);
      save();
    }
    isLoading = false;
    streamText = '';
    toolCalls = [];
    currentAbort = null;
    render();
    scrollBottom();
  }

  // ── Markdown-lite ──────────────────────────────────────────────────
  function md(s) {
    if (!s) return '';
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/```[\s\S]*?```/g, function (m) {
        return '<pre style="background:#1a1a2e;padding:8px;border-radius:6px;overflow-x:auto;font-size:12px;margin:4px 0">' +
          m.replace(/```\w*\n?/, '').replace(/```$/, '') + '</pre>';
      })
      .replace(/`([^`]+)`/g, '<code style="background:#1a1a2e;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  // ── Render ─────────────────────────────────────────────────────────
  function render() {
    var fab = document.getElementById('jada-fab');
    var panel = document.getElementById('jada-widget-panel');
    if (!fab || !panel) return;

    // FAB pulse when loading
    fab.style.boxShadow = isLoading ? '0 0 0 4px rgba(233,69,96,0.3)' : '0 4px 20px rgba(0,0,0,0.4)';

    if (!chatOpen) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';

    // Messages
    var msgs = activeMessages();
    var html = '';

    if (!msgs.length && !isLoading) {
      html += '<div style="text-align:center;padding:40px 20px;color:#8b8b9e">' +
        '<div style="font-size:32px;margin-bottom:12px">🤖</div>' +
        '<div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:4px">Jada AI</div>' +
        '<div style="font-size:12px">Ask me anything — I have access to 406 tools.</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:16px">' +
        ['List my files', 'Check calendar', 'Read emails'].map(function (s) {
          return '<button onclick="document.getElementById(\'jada-w-input\').value=\'' + s +
            '\';document.getElementById(\'jada-w-send\').click()" style="padding:6px 12px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#e94560;font-size:11px;cursor:pointer">' + s + '</button>';
        }).join('') +
        '</div></div>';
    }

    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var isUser = m.role === 'user';
      html += '<div style="display:flex;justify-content:' + (isUser ? 'flex-end' : 'flex-start') + ';margin:4px 0">' +
        '<div style="max-width:85%;padding:8px 12px;border-radius:' + (isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px') +
        ';background:' + (isUser ? 'linear-gradient(135deg,#e94560,#c23152)' : '#1e1e2e') +
        ';color:#fff;font-size:13px;line-height:1.5;word-break:break-word">';

      // Tool call badges
      if (m.tools && m.tools.length) {
        for (var t = 0; t < m.tools.length; t++) {
          html += '<div style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:rgba(74,222,128,0.15);color:#4ade80;font-size:10px;font-family:monospace;margin-bottom:4px;margin-right:4px">' +
            '🔧 ' + m.tools[t].name + '</div>';
        }
      }
      html += md(m.text) + '</div></div>';
    }

    // Streaming indicator
    if (isLoading) {
      html += '<div style="display:flex;justify-content:flex-start;margin:4px 0"><div style="max-width:85%;padding:8px 12px;border-radius:14px 14px 14px 4px;background:#1e1e2e;color:#fff;font-size:13px;line-height:1.5">';
      // Show tool calls in progress
      for (var tc = 0; tc < toolCalls.length; tc++) {
        html += '<div style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:rgba(233,69,96,0.15);color:#e94560;font-size:10px;font-family:monospace;margin-bottom:4px;margin-right:4px">' +
          (toolCalls[tc].status === 'running' ? '⏳' : '🔧') + ' ' + toolCalls[tc].name + '</div>';
      }
      if (streamText) {
        html += md(streamText);
      } else {
        html += '<span style="color:#e94560">●●●</span>';
      }
      html += '</div></div>';
    }

    var msgEl = document.getElementById('jada-w-messages');
    if (msgEl) msgEl.innerHTML = html;
  }

  function scrollBottom() {
    var el = document.getElementById('jada-w-messages');
    if (el) setTimeout(function () { el.scrollTop = el.scrollHeight; }, 50);
  }

  // ── Build DOM ──────────────────────────────────────────────────────
  function init() {
    load();

    // FAB button
    var fab = document.createElement('button');
    fab.id = 'jada-fab';
    fab.title = 'Jada AI';
    fab.innerHTML = '<svg viewBox="0 0 32 32" width="28" height="28" fill="none"><circle cx="16" cy="16" r="14" fill="#1a1a2e" stroke="#e94560" stroke-width="1.5"/><circle cx="11" cy="13" r="2" fill="#e94560"/><circle cx="21" cy="13" r="2" fill="#e94560"/><path d="M10 20 Q16 25 22 20" stroke="#e94560" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
    fab.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:100000;width:56px;height:56px;border-radius:50%;' +
      'background:linear-gradient(135deg,#e94560,#c23152);border:none;cursor:pointer;display:flex;align-items:center;' +
      'justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:transform 0.2s,box-shadow 0.3s';
    fab.onmouseover = function () { fab.style.transform = 'scale(1.1)'; };
    fab.onmouseout = function () { fab.style.transform = 'scale(1)'; };
    fab.onclick = function () {
      chatOpen = !chatOpen;
      render();
      if (chatOpen) {
        var inp = document.getElementById('jada-w-input');
        if (inp) setTimeout(function () { inp.focus(); }, 100);
      }
    };

    // Chat panel
    var panel = document.createElement('div');
    panel.id = 'jada-widget-panel';
    panel.style.cssText = 'position:fixed;bottom:90px;right:24px;z-index:100000;width:380px;max-height:560px;' +
      'background:#0d0d14;border:1px solid rgba(255,255,255,0.08);border-radius:16px;display:none;flex-direction:column;' +
      'overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.6);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:10px;background:#111119';
    header.innerHTML = '<svg viewBox="0 0 32 32" width="24" height="24" fill="none"><circle cx="16" cy="16" r="14" fill="#1a1a2e" stroke="#e94560" stroke-width="1.5"/><circle cx="11" cy="13" r="2" fill="#e94560"/><circle cx="21" cy="13" r="2" fill="#e94560"/><path d="M10 20 Q16 25 22 20" stroke="#e94560" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' +
      '<div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">Jada AI</div>' +
      '<div style="font-size:10px;color:#4ade80">● Online</div></div>' +
      '<a href="/apps/jadaagent/" style="padding:4px 10px;border-radius:8px;background:rgba(233,69,96,0.15);color:#e94560;font-size:11px;text-decoration:none;font-weight:600" title="Open full workspace">Open ↗</a>' +
      '<button id="jada-w-new" style="background:none;border:none;color:#8b8b9e;cursor:pointer;font-size:16px;padding:4px" title="New chat">+</button>' +
      '<button id="jada-w-close" style="background:none;border:none;color:#8b8b9e;cursor:pointer;font-size:18px;padding:4px" title="Close">✕</button>';

    // Messages area
    var msgArea = document.createElement('div');
    msgArea.id = 'jada-w-messages';
    msgArea.style.cssText = 'flex:1;overflow-y:auto;padding:12px;min-height:300px;max-height:400px';

    // Input area
    var inputArea = document.createElement('div');
    inputArea.style.cssText = 'padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:flex-end;gap:8px;background:#111119';
    inputArea.innerHTML = '<textarea id="jada-w-input" placeholder="Ask Jada anything..." rows="1" style="flex:1;background:#1a1a24;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:10px 14px;color:#e8e8ef;font-size:13px;resize:none;outline:none;font-family:inherit;max-height:80px;line-height:1.4"></textarea>' +
      '<button id="jada-w-send" style="width:36px;height:36px;border-radius:50%;border:none;background:linear-gradient(135deg,#e94560,#c23152);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>';

    panel.appendChild(header);
    panel.appendChild(msgArea);
    panel.appendChild(inputArea);
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    // Event listeners
    document.getElementById('jada-w-close').onclick = function () {
      chatOpen = false;
      render();
    };
    document.getElementById('jada-w-new').onclick = function () {
      newConv(false);
      render();
    };
    document.getElementById('jada-w-send').onclick = function () {
      var inp = document.getElementById('jada-w-input');
      if (inp && inp.value.trim()) {
        sendMessage(inp.value.trim());
        inp.value = '';
        inp.style.height = 'auto';
      }
    };
    document.getElementById('jada-w-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('jada-w-send').click();
      }
    });
    // Auto-resize textarea
    document.getElementById('jada-w-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    });

    render();
  }

  // ── Start ──────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
