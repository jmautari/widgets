'use strict';

let hostName;
let port;
let host;
let websocketUrl;

const kRetryIntervalMs = 1000;  // Retry connection every second if disconnected.

// Media types
const kVideo = 'video';
const kYoutube = 'youtube';
const kYoutubeShare = 'youtube_share';

// IPC commands
const kCmdWidgets = 'widgets';

// Internal widget data to avoid refreshing when not modified.
const kWidgetData = 'widget-data';

// Query string parameters
const kParamScreen = 'screen';

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
const getYoutubeUrl = (url, share) => {
  if (!share) {
    return url.replace(/\/watch\?v=/, '/embed/');
  }
  const embed_url = 'https://www.youtube.com/embed';
  return embed_url + url.substr(url.lastIndexOf('/'));
};
const getVideoTag = (o) => {
  const uri = '//' + host + '/' + o.uri;
  return '<div style="' + getPosCSS(o.position) +
    '"><video preload=true playsinline autoplay muted=true loop=true class="fsvideo">' + 
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
  return '<img src="' + uri + '" style="' + getPosCSS(o.position) + '">';
};
const createWidget = (o) => {
  const type = getType(o.uri);
  if (type === kVideo) {
    return getVideoTag(o);
  } else if (type === kYoutube || type === kYoutubeShare) {
    return getYoutubeTag(o, type === kYoutubeShare);
  }
  return getImageTag(o);
};
const connect = () => {
  try {
    const ws = new WebSocket(websocketUrl);
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
          if (i.screen === screen)
            html += createWidget(i);
        });
        const htmlEncoded = Utils.encodeHtml(html);
        if (htmlEncoded !== widgetData) {
          container.setAttribute(kWidgetData, htmlEncoded);
          container.innerHTML = html;
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
bootLoader(() => {
  hostName = config.host || 'mr-pc';
  port = config.port || 3000;
  host = hostName + ':' + port;
  websocketUrl = 'ws://' + host;

  start();
});
