let hostName;
let port;
let host;
let websocketUrl;
let widgets;
let sensorData;
let broadcastChannel;
let bc;
let ws;
let buttons = {};
let buttonsReady = false;
let lastOrientation = -1;
let currentProfile;
let zIndex = 10;
let nextId = 1;
let currentScreen = 0;

const kRetryIntervalMs = 1000;  // Retry connection every second if disconnected.

// Media types
const kVideo = 'video';
const kYoutube = 'youtube';
const kYoutubeShare = 'youtube_share';
const kButtons = 'buttons';

// IPC commands
const kCmdWidgets = 'widgets';
const kCmdButtons = 'buttons-action';
const kCmdSavePos = 'save-widget-pos';
const kSensorData = 'sensor-data';

// Internal widget data to avoid refreshing when not modified.
const kWidgetData = 'widget-data';

// Query string parameters
const kParamScreen = 'screen';

// Other constants
const kRtss = 'rtss=>process';
const kSteam = 'steam=>app';
const kGame = 'game=>poster';

// The minimum playback rate.
const kMinPlaybackRate = 0.1;

let reconnectTimer = 0;
const clearTimer = () => {
  if (reconnectTimer) {
    window.clearInterval(reconnectTimer);
    reconnectTimer = 0;
  }
};
const saveElementPos = () => {
  const tagId = divOverlay.id.split('_');
  const screen = parseInt(tagId[1]);
  const id = tagId[2];
  const x = divOverlay.offsetLeft;
  const y = divOverlay.offsetTop;

  //console.log('saving pos for', id, ' screen', screen, ' x', x, ' y');

  ws.send(JSON.stringify({ cmd: kCmdSavePos, data: { id, screen, x, y } }));
};
const getId = (o) => {
  return o.id || '';
};
const getScreen = () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has(kParamScreen)) {
    currentScreen = parseInt(urlParams.get(kParamScreen));
    console.log(`currentScreen=${currentScreen}`)
  }
};
export function setScreen(s) { currentScreen = s; }
export function setSensorData(data) { sensorData = data; }
const getType = (u) => {
  if (u.match(/\.mp4/i)) {
    return kVideo;
  } else if (u.match(/youtube\.com/i)) {
    return kYoutube;
  } else if (u.match(/youtu\.be/i)) {
    return kYoutubeShare;
  } else if (u.match(/buttons/)) {
    return kButtons;
  }
  return undefined;
};
const getOpacity = (o) => {
  if (o && o.opacity)
    return 'opacity:' + o.opacity + ';';
  return '';
};
const getPosCSS = (p) => {
  const x = p.x || 0;
  const y = p.y || 0;
  const w = p.w || 0;
  const h = p.h || 0;
  const z = typeof p.z === 'undefined' ? zIndex : p.z;
  let css = `position:absolute;left:${x};top:${y};`;
  if (w != 0) {
    css += `width:${w};`;
  }
  if (w != 0) {
    css += `height:${h};`;
  }
  css += `z-index:${z};`;
  zIndex += 10;
  return css;
};
const getPlaybackRate = (f) => {
  // e.g. formula(100.0/sensor=0)
  if (typeof sensorData !== 'object') {
    return 1;
  }
  let sensors = [];
  let m;
  const re = /sensor=([0-9]+)/g;
  while ((m = re.exec(f))) {
    f = f.replace(m[0], sensorData.sensors[m[1]]["valueRaw"]);
  }
  let v = eval(f);
  if (v < kMinPlaybackRate) {
    v = kMinPlaybackRate;
  }
  return v;
};
const getYoutubeUrl = (url, share) => {
  if (!share) {
    return url.replace(/\/watch\?v=/, '/embed/');
  }
  const embed_url = 'https://www.youtube.com/embed';
  return embed_url + url.substr(url.lastIndexOf('/'));
};
const getVideoTag = (o) => {
  const uri = '//' + host + '/' + o.uri;
  const updateInterval = o.update || 0;
  const playbackRate = o.playbackRate || undefined;
  return `<div class="dragabble" id="${getId(o)}" style="${getPosCSS(o.position)}"><video preload=true playsinline autoplay muted=true loop=true class="fsvideo" update-interval="${updateInterval}"` + 
    (playbackRate ? ` playback-rate="${playbackRate}"` : '') + '>' +
    `<source src="${uri}" type="video/mp4"></video></div>`;
}
const getYoutubeTag = (o, share) => {
  return '<div class="video-wrapper">' + 
    '<iframe src="' + getYoutubeUrl(o.uri, share) +
    '?controls=0&amp;autoplay=1&amp;html5=1&amp;mute=1&amp;loop=1" frameborder="0" ' +
    'allow="autoplay; encrypted-media;" allowfullscreen>' +
    '</iframe></div>';
};
const getImageTag = (o) => {
  // Assume image if not handled.
  //console.log('parsing uri', o.uri);
  let uri = getSensorValues(o.uri);
  if (uri.indexOf('http') !== -1) {
    uri = '//' + host + '/cache?uri=' + encodeURIComponent(uri);
  } else {
    uri = '//' + host + '/' + uri;
  }
  //console.log('uri for img', uri)
  const updateInterval = o.update || 0;
  const ts = Date.now();
  return '<img class="dragabble" id="' + getId(o) + '" src="' + uri + '" style="' + getPosCSS(o.position) +
    getOpacity(o) + '" update-interval="' + updateInterval + '">';
};
const getHashCode = (s) => {
  for (var i = 0, h = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return h;
};
const getButtonsData = (o) => {
  return JSON.stringify(o.buttons);
};
const getButtons = (o) => {
  buttons[o.id] = getButtonsData(o);
  return '<div class="buttons-wrapper dragabble" id="' + getId(o) + '" style="top:' + 
    o.position.y + ';position:absolute;">' +
    '<iframe src="' + o.uri + '&id=' + o.id + 
    '&h=' + getHashCode(buttons[o.id]) +
    '" frameborder="0" style="width:' + o.position.w + 
    ';height:' + o.position.h + '"></iframe></div>';
};
const createWidget = (o) => {
  const type = getType(o.uri);
  if (type === kVideo) {
    return getVideoTag(o);
  } else if (type === kYoutube || type === kYoutubeShare) {
    return getYoutubeTag(o, type === kYoutubeShare);
  } else if (type === kButtons) {
    return getButtons(o);
  }
  return getImageTag(o);
};
const startUpdater = () => {
  console.log('startUpdater');
  const img = document.getElementsByTagName('img');
  const video = document.getElementsByTagName('video');
  const img_list = Array.prototype.slice.call(img);
  const video_list = Array.prototype.slice.call(video);
  const list = Array.prototype.concat(img_list, video_list);
  if (list.length === 0)
    return;
  list.forEach(i => {
    const is_video = i.tagName === 'VIDEO';
    const interval = parseInt(i.getAttribute('update-interval'));
    if (interval > 0) {
      i.setAttribute('update-active', 'true');
      if (is_video) {
        const updatePlaybackRate = (i) => {
          i.playbackRate = getPlaybackRate(i.getAttribute('playback-rate'));
          setTimeout(() => {
            if (i.getAttribute('update-active') === 'true') {
              updatePlaybackRate(i);
            }
          }, interval);
        };
        updatePlaybackRate(i);
      } else {
        let source = i.getAttribute('data-source');
        if (!source) {
          source = i.src;
          i.setAttribute('data-source', source);
          i.addEventListener('load', () => {
            setTimeout(() => {
              if (i.getAttribute('update-active') === 'true') {
                const u = i.getAttribute('data-source') + '&t=' + Date.now();
                i.src = u;
              }
            }, interval);
          });
          i.addEventListener('error', () => {
            if (i.getAttribute('update-active') === 'true') {
              const src = i.getAttribute('data-source');
              console.log(`Error loading image ${src}. Retrying`);
              setTimeout(() => {
                if (i.getAttribute('update-active') === 'true') {
                  const u = src + '&t=' + Date.now();
                  i.src = u;
                }
              }, interval);
            }
          });
        }
      }
    } else if (is_video) {
      const playbackRate = parseFloat(i.getAttribute('playback-rate')) || 1.0;
      i.playbackRate = playbackRate;
    }
  });
};
const requestWidgets = () => {
  console.log('Requesting widgets');
  ws.send(JSON.stringify({ cmd: kCmdWidgets }));
};
const stopUpdater = () => {
  console.log('stopUpdater');
  const img = document.getElementsByTagName('img');
  const video = document.getElementsByTagName('video');
  const img_list = Array.prototype.slice.call(img);
  const video_list = Array.prototype.slice.call(video);
  const list = Array.prototype.concat(img_list, video_list);
  if (list.length === 0) {
    console.log('Nothing to stop');
    return;
  }
  console.log('Stopping %d items', list.length);
  list.forEach(i => {
    const interval = parseInt(i.getAttribute('update-interval'));
    if (interval > 0) {
      i.setAttribute('update-active', 'false');
    }
  });
};
const isDesktop = () => {
  return sensorData.sensors[kRtss]["value"].length === 0;
};
const isGame = () => {
  return sensorData.sensors[kRtss]["value"].length > 0;
}
const isSteam = () => {
  //console.log('sensorData.sensors[kSteam]["value"]', sensorData.sensors[kSteam]["value"]);
  return sensorData.sensors[kSteam]["value"] > 0;
};
const hasProfile = (profile) => {
  if (currentProfile && currentProfile.length > 0 && currentProfile === profile) {
    //console.log('hasProfile for', profile);
    return true;
  }
  return false;
}
const getSensorValues = (u) => {
  if (typeof sensorData !== 'object') return u;
  const r = /\$\[([^\]]*)./;
  let m;
  do {
    m = r.exec(u);
    if (m && m.length > 0) {
      const n = m[1];
      const v = typeof sensorData.sensors[n] === 'object' ? sensorData.sensors[n]["value"] : undefined;
      if (typeof v !== 'undefined') {
        u = u.replace(r, v);
      } else {
        u = u.replace(r, '');
      }
    }
  } while (m && m.length > 0);
  //console.log('getSensorValues', u);
  return u;
};
const shouldRender = (i, profile) => {
  const profileType = i.profileType || undefined;
  if (typeof sensorData !== 'object') {
    return false;  // don't render if no sensorData is available
  }
  const condition = () => {
    const expr = i.if || undefined;
    if (typeof expr === 'undefined')
      return true;
    
    try {
      const r = eval(getSensorValues(expr));
      //console.log('return', r, 'for', expr);
      return r;
    } catch(e) {
      console.error('Error parsing expression:', expr, ' err:', e);
      return false;
    }
  };
  if (!condition())
    return false;

  const pt = typeof profileType === 'undefined';
  if (profile === '*' && pt && condition()) {
    return true;
  }
  if (profile === 'desktop' && isDesktop() && (pt || profileType === 'desktop')) {
    // Render if no game running
    // console.log('profile===desktop and no game running');
    return true;
  }
  if (profileType === 'steam') {
    if (isSteam())
      console.log('STEAM');
    else
      console.log('NOT STEAM');
    return isSteam();
  }
  if (profile === 'game' && profileType !== 'desktop' && isGame()) {
    if (pt || profileType === 'game') {
      // Render if currently in game and no profile is defined for the widget
      // console.log('profile===game and no profile is defined for the widget');
      return true;
    } else if (hasProfile(profileType)) {
      // console.log('profile===game and has profile for game', profileType);
      return true;
    }
  }
  return pt || hasProfile(profileType);
};
const buildWidgetHtml = (container, profile = 'desktop') => {
  if (!widgets) {
    console.log('No widgets data');
    return;
  }

  let html = '';
  const widgetData = container.getAttribute(kWidgetData);
  const screen = currentScreen;
  zIndex = 10;  // reset initial z-index
  console.log(`screen=${screen} profile=${profile}`);
  widgets.widgets.map(i => {
    const enabled = typeof i.enabled === 'undefined' ? true : i.enabled;
    if (enabled && i.screen === screen && shouldRender(i, profile)) {
      html += createWidget(i);
    }
  });
  const htmlEncoded = Utils.encodeHtml(html);
  console.log(htmlEncoded)
  if (htmlEncoded !== widgetData) {
    stopUpdater();
    container.setAttribute(kWidgetData, htmlEncoded);
    container.innerHTML = html;
    if (buttonsReady) {
      sendButtonsData();
    }
    startUpdater();
    //enableDragging();
  } else {
    console.log('No widget changes');
  }
};
export function createWidgets(container, data, profile = 'desktop') {
  widgets = data;
  buildWidgetHtml(container, profile);
}
const connect = () => {
  try {
    ws = new WebSocket(websocketUrl);
    ws.onclose = () => {
      console.log('Socket closed');
      start();
    };
    ws.onopen = () => {
      console.log(`Connected to ${websocketUrl}`);
      requestWidgets();
    };
    ws.onmessage = (msg) => {
      const json = JSON.parse(msg.data);
      const cmd = json.cmd;
      const data = json.data;
      if (!cmd) return;

      const container = document.getElementById('container');
      if (cmd === kCmdWidgets) {
        createWidgets(container, data);
      } else if (cmd == kSensorData) {
        if (typeof data === 'object') {
          sensorData = data;
          if (sensorData.data === null) {
            //console.log('sensorData.data === null');
          } else {
            const firstTime = typeof currentProfile === 'undefined' &&
                sensorData.sensors[kRtss]["value"].length === 0;
            const cpLen = currentProfile ? currentProfile.length : 0;
            if (firstTime ||
                (cpLen === 0 && sensorData.sensors[kRtss]["value"].length > 0) ||
                (cpLen > 0 && sensorData.sensors[kRtss]["value"].length === 0)) {
              currentProfile = sensorData.sensors[kRtss]["value"];
              const profileType = currentProfile.length === 0 ? 'desktop' : 'game';
              console.log(`profileType changed to "${profileType}"`);
              buildWidgetHtml(container, profileType);
            }
          }
        } else {
          console.error('Invalid sensor data received');
        }
      }
    };
    return true;
  } catch(err) {
    console.log('Could not connect to WebSocket server at %s. Err: %s', url, err);
  }
  return false;
}
const reconnect = () => {
  if (connect()) {
    clearTimer();
  }
};
const start = () => {
  const o = screen.orientation || undefined;
  //console.log(o);
  if (typeof o === 'undefined') {
    if (typeof window.orientation !== 'undefined') {
      lastOrientation = window.orientation;
      window.addEventListener('orientationchange', function (event) {
        if (lastOrientation !== window.orientation) {
          lastOrientation = window.orientation;
          document.location.reload();
        }
      });
    } else {
      console.log('Orientation detection not supported');
    }
  } else {
    lastOrientation = screen.orientation.angle;
    screen.orientation.addEventListener('change', function (event) {
      if (lastOrientation !== screen.orientation.angle) {
        lastOrientation = screen.orientation.angle;
        requestWidgets();
      }
    });
  }
  clearTimer();
  reconnectTimer = window.setInterval(reconnect, kRetryIntervalMs);
};
const sendButtonsData = () => {
  Object.keys(buttons).forEach(i => {
    bc.postMessage({ buttons: buttons[i] });
  });
};
export function setHostConfig(config) {
  hostName = config.host || 'mr-pc';
  port = config.port || 30000;
  host = hostName + ':' + port;
  websocketUrl = 'ws://' + host;
}
export function bootLoader() {
  console.log(`hostName: ${hostName} port: ${port} host: ${host} websocketUrl: ${websocketUrl}`);

  bc = new BroadcastChannel('buttons-data');
  broadcastChannel = new BroadcastChannel('buttons-channel');
  broadcastChannel.onmessage = (m) => {
    //console.log('message received: %s', JSON.stringify(m));
    if (m.data.action === 'buttonsReady') {
      buttonsReady = true;
      sendButtonsData();
      return;
    }
    if (!ws) {
      console.error('WS not defined');
      return;
    }
    ws.send(JSON.stringify({ cmd: kCmdButtons, data: m.data }));
  };

  getScreen();
  start();
}
