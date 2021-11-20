'use strict';

let hostName;
let port;
let host;
let websocketUrl;
let sensorData;
let broadcastChannel;
let bc;
let ws;
let buttons = {};
let buttonsReady = false;

const kRetryIntervalMs = 1000;  // Retry connection every second if disconnected.

// Media types
const kVideo = 'video';
const kYoutube = 'youtube';
const kYoutubeShare = 'youtube_share';
const kButtons = 'buttons';

// IPC commands
const kCmdWidgets = 'widgets';
const kCmdButtons = 'buttons-action';
const kSensorData = 'sensor-data';

// Internal widget data to avoid refreshing when not modified.
const kWidgetData = 'widget-data';

// Query string parameters
const kParamScreen = 'screen';

// The minimum playback rate.
const kMinPlaybackRate = 0.1;

let reconnectTimer = 0;
const clearTimer = () => {
  if (reconnectTimer) {
    window.clearInterval(reconnectTimer);
    reconnectTimer = 0;
  }
};
const getScreen = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has(kParamScreen) ? parseInt(urlParams.get(kParamScreen)) : 0;
};
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
const getPosCSS = (p) => {
  const x = p.x || 0;
  const y = p.y || 0;
  const w = p.w || 0;
  const h = p.h || 0;
  let css = 'position:absolute;left:' + x + ';top:' + y + ';';
  if (w != 0) {
    css += 'width:' + w + ';';
  }
  if (w != 0) {
    css += 'height:' + h + ';';
  }
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
  return '<div style="' + getPosCSS(o.position) +
    '"><video preload=true playsinline autoplay muted=true loop=true class="fsvideo"' +
    '" update-interval="' + updateInterval + '"' + 
    (playbackRate ? ' playback-rate="' + playbackRate + '"' : '') + '>' +
    '<source src="' + uri + '" type="video/mp4"></video></div>';
}
const getYoutubeTag = (o, share) => {
  return '<div class="video-wrapper">' + 
    '<iframe src="' + getYoutubeUrl(o.uri, share) +
    '?controls=0&amp;autoplay=1&amp;html5=1&amp;mute=1&amp;loop=1" frameborder="0" ' +
    'allow="autoplay; encrypted-media;" allowfullscreen>' +
    '</iframe></div>';
}
const getImageTag = (o) => {
  // Assume image if not handled.
  const uri = '//' + host + '/' + o.uri;
  const updateInterval = o.update || 0;
  return '<img src="' + uri + '" style="' + getPosCSS(o.position) +
    '" update-interval="' + updateInterval + '">';
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
  return '<div class="buttons-wrapper" style="top:' + 
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
              console.log('Erro loading image. Retrying');
              setTimeout(() => {
                if (i.getAttribute('update-active') === 'true') {
                  const u = i.getAttribute('data-source') + '&t=' + Date.now();
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
const stopUpdater = () => {
  const img = document.getElementsByTagName('img');
  const list = Array.prototype.slice.call(img);
  if (list.length === 0)
    return;
  list.forEach(i => {
    const interval = parseInt(i.getAttribute('update-interval'));
    if (interval > 0) {
      i.setAttribute('update-active', 'false');
    }
  });
};
const connect = () => {
  try {
    ws = new WebSocket(websocketUrl);
    ws.onclose = () => {
      console.log('Socket closed');
      start();
    };
    ws.onopen = () => {
      console.log('Connected, requesting widgets');
      ws.send(JSON.stringify({ cmd: kCmdWidgets }));
    };
    ws.onmessage = (msg) => {
      const json = JSON.parse(msg.data);
      const cmd = json.cmd;
      const data = json.data;
      if (!cmd) return;

      if (cmd === kCmdWidgets) {
        const container = document.getElementById('container');
        let html = '';
        const widgetData = container.getAttribute(kWidgetData);
        const screen = getScreen();
        data.widgets.map(i => {
          if (i.screen === screen) {
            html += createWidget(i);
          }
        });
        const htmlEncoded = Utils.encodeHtml(html);
        if (htmlEncoded !== widgetData) {
          stopUpdater();
          container.setAttribute(kWidgetData, htmlEncoded);
          container.innerHTML = html;
          if (buttonsReady) {
            sendButtonsData();
          }
          startUpdater();
        }
      } else if (cmd == kSensorData) {
        if (typeof data === 'object') {
          sensorData = data;
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
  clearTimer();
  reconnectTimer = window.setInterval(reconnect, kRetryIntervalMs);
};
const sendButtonsData = () => {
  Object.keys(buttons).forEach(i => {
    bc.postMessage({ buttons: buttons[i] });
  });
};
bootLoader(() => {
  hostName = config.host || 'mr-pc';
  port = config.port || 30000;
  host = hostName + ':' + port;
  websocketUrl = 'ws://' + host;

  bc = new BroadcastChannel('buttons-data');
  broadcastChannel = new BroadcastChannel('buttons-channel');
  broadcastChannel.onmessage = (m) => {
    console.log('message received: %s', JSON.stringify(m));
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

  start();
});
