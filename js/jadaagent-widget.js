// Jada Chat Widget for Nextcloud — v5.0 (Native OpenClaw WebChat)
// Uses OpenClaw Gateway WebSocket protocol as a native channel.
// No HTTP polling, no SSE, no PHP proxy — persistent WebSocket for zero-latency chat.
// Features: native WS streaming, expand/collapse activity feed, persistent memory,
// conversation history (multi-turn), auto-reconnect, live connection status
(function() {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────
  var OPENCLAW_WS = 'wss://openclaw.garzaos.online/ws/chat';
  var OPENCLAW_TOKEN = 'jada-agent-oc-key-2026';

  var STORAGE_KEY = 'jada-conversations';
  var ACTIVE_KEY = 'jada-active-conv';
  var MAX_CONVERSATIONS = 50;
  var MAX_HISTORY = 40;

  // WebSocket reconnect settings
  var WS_RECONNECT_INTERVAL = 3000;
  var WS_MAX_RECONNECT = 20;
  var WS_CONNECT_TIMEOUT = 10000;

  // ── State ──────────────────────────────────────────────────────────
  var conversations = [];
  var activeConvId = null;
  var chatOpen = false;
  var sidebarOpen = false;
  var isLoading = false;
  var unreadCount = 0;

  // WebSocket state
  var ws = null;
  var wsState = 'disconnected'; // disconnected | connecting | authenticating | connected | reconnecting
  var wsMessageId = 0;
  var wsPendingRequests = {};
  var wsReconnectAttempts = 0;
  var wsReconnectTimer = null;
  var wsSessionKey = null;
  var wsDeviceToken = null;

  // Streaming state
  var currentStreamMessageId = null;
  var lastStreamedContent = '';
  var streamBuffer = '';

  // Activity feed state
  var activitySteps = [];
  var stepIdCounter = 0;
  var currentStepId = null;
  var activityTimer = null;

  // Step detection patterns — ordered by priority
  var STEP_PATTERNS = [
    { pattern: /^(I'll |I will |Let me )(search|find|look)/i, label: 'Searching', icon: 'search' },
    { pattern: /^(I'll |I will |Let me )(check|inspect|examine|review)/i, label: 'Analyzing', icon: 'inspect' },
    { pattern: /^(I'll |I will |Let me )(read|open|access)/i, label: 'Reading', icon: 'read' },
    { pattern: /^(I'll |I will |Let me )(create|write|generate|build|make)/i, label: 'Creating', icon: 'create' },
    { pattern: /^(I'll |I will |Let me )(update|modify|change|edit|fix)/i, label: 'Updating', icon: 'edit' },
    { pattern: /^(I'll |I will |Let me )(delete|remove)/i, label: 'Removing', icon: 'delete' },
    { pattern: /^(I'll |I will |Let me )(send|email|notify)/i, label: 'Sending', icon: 'send' },
    { pattern: /^(I'll |I will |Let me )(connect|call|request|fetch)/i, label: 'Connecting', icon: 'connect' },
    { pattern: /^(Here|Below|The following|I found|Results|Found)/i, label: 'Results', icon: 'result' },
    { pattern: /```/m, label: 'Generating code', icon: 'code' },
    { pattern: /^(\d+\.|[-*]) /m, label: 'Listing items', icon: 'list' },
  ];

  var STEP_ICONS = {
    connect: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    think: '<svg viewBox="0 0 16 16"><circle cx="4" cy="8" r="1.5" fill="currentColor"><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite"/></circle><circle cx="8" cy="8" r="1.5" fill="currentColor"><animate attributeName="opacity" values=".3;1;.3" dur="1.2s" repeatCount="indefinite"/></circle><circle cx="12" cy="8" r="1.5" fill="currentColor"><animate attributeName="opacity" values=".3;.3;1" dur="1.2s" repeatCount="indefinite"/></circle></svg>',
    search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    inspect: '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 8h12M2 13h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    read: '<svg viewBox="0 0 16 16"><path d="M3 2h10v12H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>',
    create: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    edit: '<svg viewBox="0 0 16 16"><path d="M11 2l3 3-8 8H3v-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    delete: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 16 16"><path d="M2 8l12-6-4 12-3-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    result: '<svg viewBox="0 0 16 16"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    code: '<svg viewBox="0 0 16 16"><path d="M5 4L1 8l4 4M11 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    list: '<svg viewBox="0 0 16 16"><circle cx="3" cy="4" r="1" fill="currentColor"/><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    done: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v4M8 11v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    generating: '<svg viewBox="0 0 16 16"><path d="M8 2v2M8 12v2M2 8h2M12 8h2M4 4l1.5 1.5M10.5 10.5L12 12M12 4l-1.5 1.5M5.5 10.5L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="2s" repeatCount="indefinite"/></path></svg>',
    tool: '<svg viewBox="0 0 16 16"><path d="M10 2l4 4-6 6-4-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 14l3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    ws: '<svg viewBox="0 0 16 16"><path d="M2 8c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 8c0-1.7.7-3 2-4M9 4c1.3 1 2 2.3 2 4" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>',
  };

  // ── Storage ────────────────────────────────────────────────────────
  function loadConversations() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      conversations = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(conversations)) conversations = [];
    } catch(e) { conversations = []; }
    activeConvId = localStorage.getItem(ACTIVE_KEY) || null;
    if (activeConvId && !getConv(activeConvId)) activeConvId = null;
    if (!activeConvId && conversations.length > 0) activeConvId = conversations[0].id;
    if (!activeConvId) newConversation(true);
  }

  function saveConversations() {
    try {
      if (conversations.length > MAX_CONVERSATIONS) conversations = conversations.slice(0, MAX_CONVERSATIONS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      if (activeConvId) localStorage.setItem(ACTIVE_KEY, activeConvId);
    } catch(e) {}
  }

  function getConv(id) {
    for (var i = 0; i < conversations.length; i++) {
      if (conversations[i].id === id) return conversations[i];
    }
    return null;
  }

  function getActiveMessages() {
    var c = getConv(activeConvId);
    return c ? c.messages : [];
  }

  function newConversation(silent) {
    var conv = {
      id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    conversations.unshift(conv);
    activeConvId = conv.id;
    if (!silent) {
      saveConversations();
      renderMessages();
      renderSidebar();
      var ta = document.getElementById('oc-chat-textarea');
      if (ta) ta.focus();
    }
    return conv;
  }

  function updateConvTitle(conv) {
    if (!conv || conv.title !== 'New conversation') return;
    for (var i = 0; i < conv.messages.length; i++) {
      if (conv.messages[i].role === 'user') {
        var t = conv.messages[i].text;
        conv.title = t.length > 40 ? t.substring(0, 40) + '...' : t;
        return;
      }
    }
  }

  function switchConversation(id) {
    if (id === activeConvId) return;
    activeConvId = id;
    localStorage.setItem(ACTIVE_KEY, id);
    isLoading = false;
    activitySteps = [];
    renderMessages();
    renderSidebar();
    scrollToBottom();
  }

  function deleteConversation(id) {
    conversations = conversations.filter(function(c) { return c.id !== id; });
    if (activeConvId === id) {
      activeConvId = conversations.length > 0 ? conversations[0].id : null;
      if (!activeConvId) newConversation(true);
    }
    saveConversations();
    renderMessages();
    renderSidebar();
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function mdLite(text) {
    if (!text) return '';
    if (typeof text !== 'string') text = String(text);
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/```([\s\S]*?)```/g, '<pre class="oc-code-block">$1</pre>')
      .replace(/`([^`]+)`/g, '<code class="oc-inline-code">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) { if (!/^https?:/i.test(url)) return text; return '<a href="' + url + '" target="_blank" rel="noopener" class="oc-link">' + text + '</a>'; })
      .replace(/\n/g, '<br>');
  }

  function timeAgo(ts) {
    var diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  function formatMs(ms) {
    if (ms < 1000) return ms + 'ms';
    var s = (ms / 1000).toFixed(1);
    return s + 's';
  }

  function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── OpenClaw WebSocket Client ──────────────────────────────────────
  // Native Gateway WebSocket protocol (inlined from openclaw-webchat SDK)

  function wsNextId() {
    return Date.now() + '-' + (++wsMessageId);
  }

  function wsSendFrame(frame) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  }

  function wsSendConnectRequest() {
    wsSendFrame({
      type: 'req',
      id: wsNextId(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'jada-nextcloud-webchat',
          version: '5.0',
          platform: 'browser',
          mode: 'node'
        },
        scopes: ['operator.read', 'operator.write'],
        auth: wsDeviceToken
          ? { deviceToken: wsDeviceToken }
          : { token: OPENCLAW_TOKEN }
      }
    });
  }

  function wsRequest(method, params) {
    if (wsState !== 'connected') {
      return Promise.reject(new Error('Not connected'));
    }
    var id = wsNextId();
    return new Promise(function(resolve, reject) {
      var timeout = setTimeout(function() {
        delete wsPendingRequests[id];
        reject(new Error('Request timeout: ' + method));
      }, 30000);

      wsPendingRequests[id] = {
        resolve: resolve,
        reject: reject,
        timeout: timeout
      };

      wsSendFrame({
        type: 'req',
        id: id,
        method: method,
        params: params || {}
      });
    });
  }

  function wsHandleFrame(frame) {
    switch (frame.type) {
      case 'req':
        // Server request — handle connect challenge
        if (frame.method === 'connect.challenge') {
          wsSendConnectRequest();
        }
        break;

      case 'res':
        wsHandleResponse(frame);
        break;

      case 'event':
        wsHandleEvent(frame);
        break;
    }
  }

  function wsHandleResponse(frame) {
    var payload = frame.payload;

    // Handle hello-ok (connection established)
    if (frame.ok && payload && payload.type === 'hello-ok') {
      if (payload.auth && payload.auth.deviceToken) {
        wsDeviceToken = payload.auth.deviceToken;
        try { localStorage.setItem('jada-device-token', wsDeviceToken); } catch(e) {}
      }
      if (!wsSessionKey && payload.snapshot && payload.snapshot.sessionDefaults && payload.snapshot.sessionDefaults.mainSessionKey) {
        wsSessionKey = payload.snapshot.sessionDefaults.mainSessionKey;
      }
      wsState = 'connected';
      wsReconnectAttempts = 0;
      setStatus('connected');
      console.log('[Jada] WebSocket connected to OpenClaw');
      return;
    }

    // Handle pending request responses
    var pending = wsPendingRequests[frame.id];
    if (pending) {
      clearTimeout(pending.timeout);
      delete wsPendingRequests[frame.id];
      if (frame.ok) {
        pending.resolve(frame.payload);
      } else {
        pending.reject(new Error((frame.error && frame.error.message) || 'Request failed'));
      }
    }
  }

  function wsHandleEvent(frame) {
    switch (frame.event) {
      case 'connect.challenge':
        wsSendConnectRequest();
        break;

      case 'message':
        // Complete message (non-streaming)
        if (frame.payload && frame.payload.message) {
          wsHandleCompleteMessage(frame.payload.message);
        }
        break;

      case 'stream.start':
        if (frame.payload && frame.payload.messageId) {
          wsHandleStreamStart(frame.payload.messageId);
        }
        break;

      case 'stream.chunk':
        if (frame.payload) {
          wsHandleStreamChunk(frame.payload.messageId, frame.payload.chunk, frame.payload.done);
        }
        break;

      case 'chat':
        wsHandleChatEvent(frame.payload);
        break;

      case 'agent':
        // Agent lifecycle events (tool calls, etc.)
        wsHandleAgentEvent(frame.payload);
        break;

      case 'health':
      case 'tick':
      case 'heartbeat':
      case 'presence':
        break;

      default:
        break;
    }
  }

  // ── Chat Event Handling (native OpenClaw protocol) ─────────────────
  // The gateway sends `chat` events with accumulated content on each delta.
  // We diff against lastStreamedContent to extract new chunks.

  function wsHandleChatEvent(payload) {
    if (!payload) return;
    var messageId = payload.runId || 'stream';
    var contentBlocks = (payload.message && payload.message.content) || [];
    var fullContent = '';
    for (var i = 0; i < contentBlocks.length; i++) {
      if (contentBlocks[i].type === 'text') fullContent += contentBlocks[i].text;
    }

    // Stream start
    if (!currentStreamMessageId && payload.state === 'delta') {
      currentStreamMessageId = messageId;
      lastStreamedContent = '';
      wsHandleStreamStart(messageId);
    }

    // Extract new chunk by diffing accumulated content
    if (fullContent.length > lastStreamedContent.length) {
      var newChunk = fullContent.slice(lastStreamedContent.length);
      if (newChunk && currentStreamMessageId) {
        wsHandleStreamChunk(currentStreamMessageId, newChunk, false);
      }
      lastStreamedContent = fullContent;
    }

    // Stream end
    if (payload.state === 'final') {
      wsHandleStreamEnd(messageId, fullContent);
      currentStreamMessageId = null;
      lastStreamedContent = '';
    }
  }

  function wsHandleAgentEvent(payload) {
    if (!payload) return;
    // Handle tool call indicators from agent events
    if (payload.type === 'tool_call' || payload.toolName) {
      var toolName = payload.toolName || payload.name || 'tool';
      if (isLoading) {
        // Complete current generating step and create tool step
        for (var i = 0; i < activitySteps.length; i++) {
          if (activitySteps[i].status === 'active' && activitySteps[i].icon === 'generating') {
            completeStep(activitySteps[i].id, 'done');
            break;
          }
        }
        createStep('Using tool: ' + toolName, 'tool', 'active');
      }
    }
  }

  // ── Stream Event Handlers ──────────────────────────────────────────
  var streamStartTime = null;
  var firstChunkReceived = false;
  var generatingStepId = null;

  function wsHandleStreamStart(messageId) {
    if (!isLoading) return;
    streamStartTime = Date.now();
    firstChunkReceived = false;
    generatingStepId = null;

    // Complete "connecting" step if still active
    if (activitySteps.length > 0 && activitySteps[0].status === 'active') {
      var connectMs = Date.now() - activitySteps[0].startTime;
      activitySteps[0].label = 'Connected (' + formatMs(connectMs) + ')';
      completeStep(activitySteps[0].id, 'done');
    }

    // Create "thinking" step
    createStep('Thinking...', 'think', 'active');
  }

  function wsHandleStreamChunk(messageId, chunk, done) {
    if (!isLoading) return;

    if (!firstChunkReceived) {
      firstChunkReceived = true;
      // Complete "thinking" step
      for (var i = 0; i < activitySteps.length; i++) {
        if (activitySteps[i].status === 'active' && activitySteps[i].icon === 'think') {
          var thinkMs = Date.now() - activitySteps[i].startTime;
          activitySteps[i].label = 'Thought (' + formatMs(thinkMs) + ')';
          completeStep(activitySteps[i].id, 'done');
          break;
        }
      }
      // Create "generating" step
      var genStep = createStep('Generating response...', 'generating', 'active');
      generatingStepId = genStep.id;
    }

    streamBuffer += chunk;

    // Check for new activity step based on content patterns
    var detected = detectStepFromContent(chunk);
    if (detected && generatingStepId) {
      completeStep(generatingStepId, 'done');
      var newStep = createStep(detected.label, detected.icon, 'active');
      generatingStepId = newStep.id;
    }

    // Update the streaming assistant message
    var conv = getConv(activeConvId);
    if (conv) {
      var lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg && lastMsg._streaming) {
        lastMsg.text = streamBuffer;
        renderStreamingMessage();
        scrollToBottom();
      }
    }

    if (done) {
      wsHandleStreamEnd(messageId, streamBuffer);
    }
  }

  function wsHandleStreamEnd(messageId, fullContent) {
    if (!isLoading) return;

    // Complete any remaining active steps
    for (var i = 0; i < activitySteps.length; i++) {
      if (activitySteps[i].status === 'active') {
        completeStep(activitySteps[i].id, 'done');
      }
    }

    // Add final "done" step with total time
    var totalMs = activitySteps.length > 0
      ? Date.now() - activitySteps[0].startTime
      : 0;
    createStep('Complete (' + formatMs(totalMs) + ')', 'done', 'done');

    // Finalize message
    var conv = getConv(activeConvId);
    if (conv) {
      for (var j = 0; j < conv.messages.length; j++) {
        if (conv.messages[j]._streaming) {
          delete conv.messages[j]._streaming;
          if (!conv.messages[j].text && fullContent) conv.messages[j].text = fullContent;
          break;
        }
      }
      conv.updatedAt = Date.now();
      updateConvTitle(conv);
    }

    isLoading = false;
    if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
    saveConversations();
    renderMessages();
    renderSidebar();
    updateSendButton();
    scrollToBottom();

    // Fade out activity feed after 4s
    setTimeout(function() {
      if (!isLoading) {
        activitySteps = [];
        renderActivityFeed();
      }
    }, 4000);

    if (!chatOpen) { unreadCount++; renderBadge(); }
  }

  function wsHandleCompleteMessage(message) {
    // Handle non-streaming complete message
    if (!isLoading) return;
    var content = '';
    if (typeof message.content === 'string') {
      content = message.content;
    } else if (message.content && message.role) {
      content = message.content;
    }

    var conv = getConv(activeConvId);
    if (conv) {
      for (var j = 0; j < conv.messages.length; j++) {
        if (conv.messages[j]._streaming) {
          delete conv.messages[j]._streaming;
          conv.messages[j].text = content;
          break;
        }
      }
      conv.updatedAt = Date.now();
      updateConvTitle(conv);
    }

    isLoading = false;
    if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
    saveConversations();
    renderMessages();
    updateSendButton();
    scrollToBottom();
  }

  // ── WebSocket Connection Management ────────────────────────────────

  function wsConnect() {
    if (wsState === 'connected' || wsState === 'connecting' || wsState === 'authenticating') return;

    wsState = 'connecting';
    setStatus('connecting');

    // Restore device token from localStorage
    if (!wsDeviceToken) {
      try { wsDeviceToken = localStorage.getItem('jada-device-token'); } catch(e) {}
    }

    var connectTimeout = setTimeout(function() {
      if (ws) ws.close();
      wsState = 'disconnected';
      setStatus('error');
      wsScheduleReconnect();
    }, WS_CONNECT_TIMEOUT);

    try {
      ws = new WebSocket(OPENCLAW_WS);

      ws.onopen = function() {
        wsState = 'authenticating';
        setStatus('connecting');
      };

      ws.onmessage = function(event) {
        try {
          var frame = JSON.parse(event.data);
          // If this is the hello-ok response, clear the connect timeout
          if (frame.type === 'res' && frame.ok && frame.payload && frame.payload.type === 'hello-ok') {
            clearTimeout(connectTimeout);
          }
          wsHandleFrame(frame);
        } catch(e) {
          // ignore parse errors
        }
      };

      ws.onerror = function() {
        clearTimeout(connectTimeout);
        wsState = 'disconnected';
        setStatus('error');
      };

      ws.onclose = function(event) {
        clearTimeout(connectTimeout);
        var wasConnected = wsState === 'connected';
        ws = null;
        wsState = 'disconnected';

        // Reject all pending requests
        var keys = Object.keys(wsPendingRequests);
        for (var i = 0; i < keys.length; i++) {
          var pending = wsPendingRequests[keys[i]];
          clearTimeout(pending.timeout);
          pending.reject(new Error('Disconnected'));
        }
        wsPendingRequests = {};

        if (wasConnected) {
          setStatus('error');
          console.log('[Jada] WebSocket disconnected:', event.code, event.reason);
        }
        wsScheduleReconnect();
      };
    } catch(e) {
      clearTimeout(connectTimeout);
      wsState = 'disconnected';
      setStatus('error');
      wsScheduleReconnect();
    }
  }

  function wsDisconnect() {
    wsClearReconnect();
    if (ws) {
      ws.close(1000, 'Client disconnect');
      ws = null;
    }
    wsState = 'disconnected';
    setStatus('error');
  }

  function wsScheduleReconnect() {
    wsClearReconnect();
    wsReconnectAttempts++;
    if (wsReconnectAttempts > WS_MAX_RECONNECT) {
      console.log('[Jada] Max reconnect attempts reached');
      setStatus('error');
      return;
    }
    wsState = 'reconnecting';
    // Exponential backoff capped at 30s
    var delay = Math.min(WS_RECONNECT_INTERVAL * Math.pow(1.5, wsReconnectAttempts - 1), 30000);
    wsReconnectTimer = setTimeout(function() {
      wsConnect();
    }, delay);
  }

  function wsClearReconnect() {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
  }

  // ── Send Message via WebSocket ─────────────────────────────────────

  function sendToAgent(userText) {
    if (isLoading) return;

    if (wsState !== 'connected') {
      // Try to reconnect and queue the message
      var conv = getConv(activeConvId);
      if (conv) {
        conv.messages.push({ role: 'system', text: 'Not connected to OpenClaw. Reconnecting...' });
        saveConversations();
        renderMessages();
      }
      wsConnect();
      return;
    }

    isLoading = true;

    var conv = getConv(activeConvId);
    if (!conv) { isLoading = false; return; }

    // Reset streaming state
    activitySteps = [];
    streamBuffer = '';
    currentStepId = null;
    currentStreamMessageId = null;
    lastStreamedContent = '';
    firstChunkReceived = false;

    // Create initial "connecting" step (will be completed when stream starts)
    createStep('Sending to OpenClaw...', 'ws', 'active');

    // Add placeholder assistant message for streaming
    var assistantMsg = { role: 'assistant', text: '', _streaming: true };
    conv.messages.push(assistantMsg);
    renderMessages();
    scrollToBottom();
    updateSendButton();

    // Start elapsed timer for activity feed
    if (activityTimer) clearInterval(activityTimer);
    activityTimer = setInterval(function() {
      if (isLoading) renderActivityFeed();
    }, 1000);

    // Send via WebSocket native protocol
    if (!wsSessionKey) {
      wsSessionKey = 'main';
    }

    wsRequest('chat.send', {
      sessionKey: wsSessionKey,
      message: userText,
      idempotencyKey: Date.now() + '-' + Math.random().toString(36).slice(2)
    }).catch(function(err) {
      console.error('[Jada] chat.send failed:', err);

      // Mark all active steps as error
      for (var i = 0; i < activitySteps.length; i++) {
        if (activitySteps[i].status === 'active') completeStep(activitySteps[i].id, 'error');
      }
      createStep('Error: ' + err.message, 'error', 'error');

      // Remove empty streaming message
      delete assistantMsg._streaming;
      var idx = conv.messages.indexOf(assistantMsg);
      if (idx >= 0 && !assistantMsg.text) conv.messages.splice(idx, 1);
      conv.messages.push({ role: 'system', text: 'Connection error: ' + err.message });

      isLoading = false;
      if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
      saveConversations();
      renderMessages();
      updateSendButton();
      scrollToBottom();
    });
  }

  // ── Activity Feed ──────────────────────────────────────────────────
  function createStep(label, icon, status) {
    var step = {
      id: ++stepIdCounter,
      label: label,
      icon: icon || 'think',
      status: status || 'active',
      content: '',
      startTime: Date.now(),
      endTime: null,
      expanded: true
    };
    for (var i = 0; i < activitySteps.length; i++) {
      activitySteps[i].expanded = false;
    }
    activitySteps.push(step);
    currentStepId = step.id;
    renderActivityFeed();
    scrollToBottom();
    return step;
  }

  function completeStep(stepId, status) {
    for (var i = 0; i < activitySteps.length; i++) {
      if (activitySteps[i].id === stepId) {
        activitySteps[i].status = status || 'done';
        activitySteps[i].endTime = Date.now();
        activitySteps[i].expanded = false;
        break;
      }
    }
    renderActivityFeed();
  }

  function getStep(stepId) {
    for (var i = 0; i < activitySteps.length; i++) {
      if (activitySteps[i].id === stepId) return activitySteps[i];
    }
    return null;
  }

  function detectStepFromContent(newText) {
    for (var i = 0; i < STEP_PATTERNS.length; i++) {
      if (STEP_PATTERNS[i].pattern.test(newText)) {
        return { label: STEP_PATTERNS[i].label, icon: STEP_PATTERNS[i].icon };
      }
    }
    return null;
  }

  // ── CSS ────────────────────────────────────────────────────────────
  function injectStyles() {
    var css = [
      // FAB
      '#oc-widget-btn{position:fixed;bottom:24px;right:24px;z-index:100000;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#0082c9,#0070b0);border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,130,201,0.4);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;}',
      '#oc-widget-btn:hover{transform:scale(1.1);box-shadow:0 6px 24px rgba(0,130,201,0.5);}',
      '#oc-widget-btn svg{width:28px;height:28px;fill:white;}',
      '#oc-widget-badge{position:absolute;top:-4px;right:-4px;background:#e53935;color:white;font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:none;align-items:center;justify-content:center;padding:0 5px;line-height:20px;}',
      '#oc-widget-status{position:absolute;bottom:2px;right:2px;width:12px;height:12px;border-radius:50%;border:2px solid white;background:#757575;transition:background .3s;}',
      '#oc-widget-status.connected{background:#4caf50;}',
      '#oc-widget-status.connecting{background:#ffc107;}',
      '#oc-widget-status.error{background:#e53935;}',

      // Chat window
      '#oc-chat-window{position:fixed;bottom:92px;right:24px;z-index:100000;width:420px;max-width:calc(100vw - 48px);height:600px;max-height:calc(100vh - 120px);background:#0d0d0d;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.6);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;border:1px solid rgba(255,255,255,0.06);}',
      '#oc-chat-window.open{display:flex;}',

      // Header
      '#oc-chat-header{background:linear-gradient(135deg,#0082c9,#006ba3);color:white;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
      '#oc-chat-header h3{margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;}',
      '#oc-header-actions{display:flex;gap:4px;}',
      '#oc-header-actions button{background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.85);cursor:pointer;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:500;transition:background .15s;}',
      '#oc-header-actions button:hover{background:rgba(255,255,255,0.2);color:white;}',
      '#oc-header-actions button.active{background:rgba(255,255,255,0.25);}',

      // Body container
      '#oc-chat-body{display:flex;flex:1;overflow:hidden;position:relative;}',

      // Sidebar
      '#oc-sidebar{width:0;overflow:hidden;background:#0a0a0a;border-right:1px solid #1a1a1a;transition:width .2s ease;flex-shrink:0;display:flex;flex-direction:column;}',
      '#oc-sidebar.open{width:200px;}',
      '#oc-sidebar-header{padding:10px 12px;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1a1a1a;flex-shrink:0;}',
      '#oc-sidebar-list{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#222 transparent;}',
      '.oc-conv-item{padding:10px 12px;cursor:pointer;border-bottom:1px solid #141414;transition:background .1s;position:relative;}',
      '.oc-conv-item:hover{background:#141414;}',
      '.oc-conv-item.active{background:#0e1a2a;border-left:3px solid #0082c9;}',
      '.oc-conv-title{font-size:13px;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;}',
      '.oc-conv-meta{font-size:11px;color:#555;display:flex;justify-content:space-between;align-items:center;}',
      '.oc-conv-delete{opacity:0;background:none;border:none;color:#e53935;cursor:pointer;font-size:14px;padding:0 2px;transition:opacity .15s;}',
      '.oc-conv-item:hover .oc-conv-delete{opacity:0.7;}',
      '.oc-conv-delete:hover{opacity:1!important;}',

      // Messages area
      '#oc-chat-messages{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:#333 transparent;}',
      '#oc-chat-messages::-webkit-scrollbar{width:5px;}',
      '#oc-chat-messages::-webkit-scrollbar-thumb{background:#333;border-radius:3px;}',

      // Message bubbles
      '.oc-msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.55;word-wrap:break-word;animation:oc-fadein .2s ease;}',
      '@keyframes oc-fadein{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}',
      '.oc-msg.user{align-self:flex-end;background:linear-gradient(135deg,#0082c9,#006ba3);color:white;border-bottom-right-radius:4px;}',
      '.oc-msg.assistant{align-self:flex-start;background:#161616;color:#ddd;border-bottom-left-radius:4px;border:1px solid #222;}',
      '.oc-msg.system{align-self:center;background:rgba(255,255,255,0.03);color:#777;font-size:11px;border-radius:8px;padding:5px 12px;}',
      '.oc-msg .oc-link{color:#89b4fa;}',
      '.oc-msg .oc-code-block{background:#111;color:#cdd6f4;padding:8px 10px;border-radius:6px;overflow-x:auto;font-size:12px;margin:6px 0;font-family:"SF Mono","Fira Code",monospace;}',
      '.oc-msg .oc-inline-code{background:#1e1e2e;color:#cdd6f4;padding:1px 5px;border-radius:3px;font-size:12px;font-family:"SF Mono","Fira Code",monospace;}',

      // Activity Feed
      '#oc-activity-feed{padding:0;max-height:0;overflow:hidden;background:#0a0a0a;border-top:1px solid transparent;transition:max-height .3s ease,padding .3s ease;flex-shrink:0;}',
      '#oc-activity-feed.active{max-height:200px;padding:6px 10px;border-top-color:#1a1a1a;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#222 transparent;}',

      '.oc-step{border-radius:8px;margin-bottom:4px;overflow:hidden;transition:all .2s ease;background:#111;border:1px solid #1a1a1a;}',
      '.oc-step.active{border-color:#0082c9;background:#0a1520;}',
      '.oc-step.done{opacity:0.7;}',
      '.oc-step.error{border-color:#e53935;background:#1a0a0a;}',

      '.oc-step-header{display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;user-select:none;font-size:12px;color:#aaa;transition:color .15s;}',
      '.oc-step.active .oc-step-header{color:#89b4fa;}',
      '.oc-step.done .oc-step-header{color:#666;}',
      '.oc-step.error .oc-step-header{color:#e57373;}',

      '.oc-step-icon{width:14px;height:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:inherit;}',
      '.oc-step-icon svg{width:14px;height:14px;}',
      '.oc-step-label{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;}',
      '.oc-step-time{font-size:10px;color:#555;font-variant-numeric:tabular-nums;flex-shrink:0;}',
      '.oc-step-chevron{width:12px;height:12px;color:#444;transition:transform .2s;flex-shrink:0;}',
      '.oc-step-chevron.expanded{transform:rotate(90deg);}',

      '.oc-step-body{max-height:0;overflow:hidden;transition:max-height .2s ease;padding:0 10px;}',
      '.oc-step-body.expanded{max-height:100px;padding:0 10px 6px;}',
      '.oc-step-body-content{font-size:11px;color:#666;line-height:1.4;}',

      '.oc-step-spinner{width:14px;height:14px;border:2px solid #1a2a3a;border-top-color:#0082c9;border-radius:50%;animation:oc-spin .7s linear infinite;flex-shrink:0;}',
      '@keyframes oc-spin{to{transform:rotate(360deg);}}',

      '.oc-cursor{display:inline-block;width:2px;height:14px;background:#0082c9;margin-left:2px;animation:oc-blink .8s step-end infinite;vertical-align:text-bottom;}',
      '@keyframes oc-blink{0%,100%{opacity:1;}50%{opacity:0;}}',

      // Input area
      '#oc-chat-input-area{padding:10px 14px;border-top:1px solid #1a1a1a;display:flex;align-items:flex-end;gap:8px;background:#0d0d0d;flex-shrink:0;}',
      '#oc-chat-textarea{flex:1;background:#161616;border:1px solid #2a2a2a;color:#e0e0e0;border-radius:12px;padding:10px 14px;font-size:13.5px;font-family:inherit;resize:none;outline:none;max-height:120px;min-height:20px;line-height:1.4;transition:border-color .15s;}',
      '#oc-chat-textarea::placeholder{color:#444;}',
      '#oc-chat-textarea:focus{border-color:#0082c9;}',
      '#oc-chat-send{width:36px;height:36px;border-radius:50%;border:none;background:linear-gradient(135deg,#0082c9,#0070b0);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .2s,transform .15s;}',
      '#oc-chat-send:hover:not(:disabled){transform:scale(1.05);}',
      '#oc-chat-send:disabled{opacity:0.3;cursor:default;}',
      '#oc-chat-send svg{width:18px;height:18px;fill:white;}',
      '#oc-chat-stop{width:36px;height:36px;border-radius:50%;border:none;background:#e53935;cursor:pointer;display:none;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s;}',
      '#oc-chat-stop:hover{transform:scale(1.05);}',
      '#oc-chat-stop svg{width:16px;height:16px;fill:white;}',

      // Welcome
      '.oc-welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#555;text-align:center;padding:24px;gap:4px;}',
      '.oc-welcome-icon{width:48px;height:48px;fill:#333;margin-bottom:8px;}',
      '.oc-welcome p{font-size:13px;margin:0;}',
      '.oc-welcome .oc-welcome-hint{font-size:11px;color:#383838;margin-top:8px;}',

      // Mobile
      '@media(max-width:480px){#oc-chat-window{bottom:0;right:0;left:0;width:100%;max-width:100%;height:100vh;max-height:100vh;border-radius:0;}#oc-widget-btn{bottom:16px;right:16px;}#oc-sidebar.open{width:180px;}}'
    ].join('\n');

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── UI Building ────────────────────────────────────────────────────
  function createWidget() {
    injectStyles();

    var chatSvg = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>';
    var sendSvg = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    var stopSvg = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

    // FAB
    var btn = document.createElement('button');
    btn.id = 'oc-widget-btn';
    btn.title = 'Chat with Jada';
    btn.innerHTML = chatSvg + '<div id="oc-widget-badge"></div><div id="oc-widget-status"></div>';
    btn.onclick = toggleChat;
    document.body.appendChild(btn);

    // Chat window
    var win = document.createElement('div');
    win.id = 'oc-chat-window';
    win.innerHTML = [
      '<div id="oc-chat-header">',
      '  <h3><svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> Jada</h3>',
      '  <div id="oc-header-actions">',
      '    <button id="oc-btn-history" title="Conversation history">&#9776;</button>',
      '    <button id="oc-btn-new" title="New conversation">+</button>',
      '    <button id="oc-btn-clear" title="Clear display">Clear</button>',
      '    <button id="oc-btn-close" title="Close">&times;</button>',
      '  </div>',
      '</div>',
      '<div id="oc-chat-body">',
      '  <div id="oc-sidebar">',
      '    <div id="oc-sidebar-header">History</div>',
      '    <div id="oc-sidebar-list"></div>',
      '  </div>',
      '  <div style="display:flex;flex-direction:column;flex:1;overflow:hidden">',
      '    <div id="oc-chat-messages"></div>',
      '    <div id="oc-activity-feed"></div>',
      '    <div id="oc-chat-input-area">',
      '      <textarea id="oc-chat-textarea" placeholder="Type a message..." rows="1"></textarea>',
      '      <button id="oc-chat-send" title="Send">' + sendSvg + '</button>',
      '      <button id="oc-chat-stop" title="Stop generating">' + stopSvg + '</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
    document.body.appendChild(win);

    // Event listeners
    document.getElementById('oc-btn-close').onclick = toggleChat;
    document.getElementById('oc-btn-clear').onclick = clearChat;
    document.getElementById('oc-btn-new').onclick = function() { newConversation(false); };
    document.getElementById('oc-btn-history').onclick = toggleSidebar;
    document.getElementById('oc-chat-send').onclick = sendMessage;
    document.getElementById('oc-chat-stop').onclick = stopGeneration;

    var textarea = document.getElementById('oc-chat-textarea');
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    textarea.addEventListener('input', autoResize);
  }

  function autoResize() {
    var ta = document.getElementById('oc-chat-textarea');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  // ── UI Actions ─────────────────────────────────────────────────────
  function toggleChat() {
    chatOpen = !chatOpen;
    var win = document.getElementById('oc-chat-window');
    if (chatOpen) {
      win.classList.add('open');
      unreadCount = 0;
      renderBadge();
      renderMessages();
      renderSidebar();
      setTimeout(function() {
        scrollToBottom();
        document.getElementById('oc-chat-textarea').focus();
      }, 50);
    } else {
      win.classList.remove('open');
      sidebarOpen = false;
      document.getElementById('oc-sidebar').classList.remove('open');
    }
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    var sb = document.getElementById('oc-sidebar');
    var btn = document.getElementById('oc-btn-history');
    if (sidebarOpen) {
      sb.classList.add('open');
      btn.classList.add('active');
      renderSidebar();
    } else {
      sb.classList.remove('open');
      btn.classList.remove('active');
    }
  }

  function sendMessage() {
    var ta = document.getElementById('oc-chat-textarea');
    var text = ta.value.trim();
    if (!text || isLoading) return;

    var conv = getConv(activeConvId);
    if (!conv) return;

    conv.messages.push({ role: 'user', text: text });
    conv.updatedAt = Date.now();
    updateConvTitle(conv);
    saveConversations();

    ta.value = '';
    ta.style.height = 'auto';
    renderMessages();
    renderSidebar();
    scrollToBottom();

    sendToAgent(text);
  }

  function stopGeneration() {
    // WebSocket doesn't have AbortController — just stop processing incoming events
    isLoading = false;
    for (var i = 0; i < activitySteps.length; i++) {
      if (activitySteps[i].status === 'active') completeStep(activitySteps[i].id, 'done');
    }
    createStep('Stopped by user', 'done', 'done');
    if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }

    // Finalize any streaming message
    var conv = getConv(activeConvId);
    if (conv) {
      for (var j = 0; j < conv.messages.length; j++) {
        if (conv.messages[j]._streaming) {
          delete conv.messages[j]._streaming;
          if (!conv.messages[j].text) conv.messages[j].text = '(Stopped)';
        }
      }
      saveConversations();
    }
    updateSendButton();
    renderMessages();
  }

  function clearChat() {
    var conv = getConv(activeConvId);
    if (!conv) return;
    conv.messages = [];
    isLoading = false;
    activitySteps = [];
    if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
    saveConversations();
    renderMessages();
    renderActivityFeed();
    updateSendButton();
  }

  // ── Rendering ──────────────────────────────────────────────────────
  function renderMessages() {
    var container = document.getElementById('oc-chat-messages');
    if (!container) return;

    var msgs = getActiveMessages();

    if (msgs.length === 0) {
      container.innerHTML = [
        '<div class="oc-welcome">',
        '  <svg class="oc-welcome-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
        '  <p><strong>Jada</strong></p>',
        '  <p>Your AI assistant</p>',
        '  <p class="oc-welcome-hint">Connected via WebSocket to OpenClaw</p>',
        '</div>'
      ].join('');
      updateSendButton();
      return;
    }

    var html = '';
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var cls = m.role === 'user' ? 'user' : (m.role === 'system' ? 'system' : 'assistant');

      if (m._streaming && m.text) {
        html += '<div class="oc-msg assistant" id="oc-streaming-msg">' + mdLite(m.text) + '<span class="oc-cursor"></span></div>';
      } else if (m._streaming && !m.text) {
        continue;
      } else {
        html += '<div class="oc-msg ' + cls + '">' + mdLite(m.text || '') + '</div>';
      }
    }

    container.innerHTML = html;
    updateSendButton();
    scrollToBottom();
  }

  function renderStreamingMessage() {
    var el = document.getElementById('oc-streaming-msg');
    if (el) {
      el.innerHTML = mdLite(streamBuffer) + '<span class="oc-cursor"></span>';
    } else {
      renderMessages();
    }
  }

  function renderActivityFeed() {
    var feed = document.getElementById('oc-activity-feed');
    if (!feed) return;

    if (activitySteps.length === 0) {
      feed.classList.remove('active');
      feed.innerHTML = '';
      return;
    }

    feed.classList.add('active');

    var html = '';
    for (var i = 0; i < activitySteps.length; i++) {
      var step = activitySteps[i];
      var elapsed = step.endTime
        ? formatMs(step.endTime - step.startTime)
        : formatMs(Date.now() - step.startTime);

      var iconHtml = step.status === 'active'
        ? '<div class="oc-step-spinner"></div>'
        : '<div class="oc-step-icon">' + (STEP_ICONS[step.icon] || STEP_ICONS.think) + '</div>';

      var chevronCls = step.expanded ? ' expanded' : '';

      html += '<div class="oc-step ' + step.status + '" data-step-id="' + step.id + '">';
      html += '<div class="oc-step-header">';
      html += iconHtml;
      html += '<span class="oc-step-label">' + escHtml(step.label) + '</span>';
      html += '<span class="oc-step-time">' + elapsed + '</span>';
      html += '<svg class="oc-step-chevron' + chevronCls + '" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      html += '</div>';

      if (step.content) {
        html += '<div class="oc-step-body' + (step.expanded ? ' expanded' : '') + '">';
        html += '<div class="oc-step-body-content">' + escHtml(step.content) + '</div>';
        html += '</div>';
      }

      html += '</div>';
    }

    feed.innerHTML = html;

    var stepHeaders = feed.querySelectorAll('.oc-step-header');
    for (var j = 0; j < stepHeaders.length; j++) {
      (function(header) {
        header.addEventListener('click', function() {
          var stepEl = header.parentElement;
          var id = parseInt(stepEl.getAttribute('data-step-id'));
          var step = getStep(id);
          if (step) {
            step.expanded = !step.expanded;
            renderActivityFeed();
          }
        });
      })(stepHeaders[j]);
    }

    feed.scrollTop = feed.scrollHeight;
  }

  function renderSidebar() {
    var list = document.getElementById('oc-sidebar-list');
    if (!list) return;

    if (conversations.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:#444;font-size:12px;text-align:center">No conversations yet</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < conversations.length; i++) {
      var c = conversations[i];
      var isActive = c.id === activeConvId;
      var msgCount = c.messages.filter(function(m) { return m.role !== 'system'; }).length;
      html += '<div class="oc-conv-item' + (isActive ? ' active' : '') + '" data-conv-id="' + c.id + '">';
      html += '<div class="oc-conv-title">' + escHtml(c.title) + '</div>';
      html += '<div class="oc-conv-meta">';
      html += '<span>' + msgCount + ' msg' + (msgCount !== 1 ? 's' : '') + ' · ' + timeAgo(c.updatedAt || c.createdAt) + '</span>';
      html += '<button class="oc-conv-delete" data-delete-id="' + c.id + '" title="Delete">&times;</button>';
      html += '</div></div>';
    }
    list.innerHTML = html;

    var items = list.querySelectorAll('.oc-conv-item');
    for (var j = 0; j < items.length; j++) {
      (function(item) {
        item.addEventListener('click', function(e) {
          if (e.target.classList.contains('oc-conv-delete')) return;
          switchConversation(item.getAttribute('data-conv-id'));
        });
      })(items[j]);
    }

    var delBtns = list.querySelectorAll('.oc-conv-delete');
    for (var k = 0; k < delBtns.length; k++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          deleteConversation(btn.getAttribute('data-delete-id'));
        });
      })(delBtns[k]);
    }
  }

  function updateSendButton() {
    var sendBtn = document.getElementById('oc-chat-send');
    var stopBtn = document.getElementById('oc-chat-stop');
    if (sendBtn) sendBtn.style.display = isLoading ? 'none' : 'flex';
    if (stopBtn) stopBtn.style.display = isLoading ? 'flex' : 'none';
    if (sendBtn) sendBtn.disabled = isLoading;
  }

  function renderBadge() {
    var badge = document.getElementById('oc-widget-badge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function setStatus(state) {
    var dot = document.getElementById('oc-widget-status');
    if (dot) dot.className = state;
  }

  function scrollToBottom() {
    var container = document.getElementById('oc-chat-messages');
    if (container) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          container.scrollTop = container.scrollHeight;
        });
      });
    }
  }

  // ── Init ───────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById('body-login') || document.getElementById('body-public')) return;
    console.log('[Jada] v5.0 — Native OpenClaw WebChat (WebSocket, no HTTP proxy)');

    loadConversations();
    createWidget();
    renderMessages();

    // Connect to OpenClaw Gateway via WebSocket
    wsConnect();
  }

  // Debug API
  window.__jadaWidget = {
    getState: function() {
      return {
        wsState: wsState, isLoading: isLoading, chatOpen: chatOpen,
        conversations: conversations.length, activeConvId: activeConvId,
        activitySteps: activitySteps.length, streamBuffer: streamBuffer.length,
        wsSessionKey: wsSessionKey, wsReconnectAttempts: wsReconnectAttempts
      };
    },
    getConversations: function() { return conversations; },
    getSteps: function() { return activitySteps; },
    exportData: function() { return JSON.stringify(conversations, null, 2); },
    reconnect: function() { wsDisconnect(); wsReconnectAttempts = 0; wsConnect(); },
    disconnect: wsDisconnect
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
