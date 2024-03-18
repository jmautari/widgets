import { config } from '../../js/config.js';
import { setHostConfig, setScreen, setSensorData, createWidgets } from '../../js/widgets.js';
import { setDraggable } from './dragndrop.js';

let hostName;
let port;
let host;
let websocketUrl;
let ws;
let currentFile;

const kRetryIntervalMs = 1000;  // Retry connection every second if disconnected.

// Media types
const kVideo = 'video';
const kYoutube = 'youtube';
const kYoutubeShare = 'youtube_share';

// IPC commands
const kCmdAdmin = 'admin';
const kCmdLoadWidgetData = 'load-widget-data';
const kCmdSaveJson = 'save-json';
const kCmdActivateFile = 'activate-file';
const kCmdSavePos = 'save-widget-pos';

// Internal widget data to avoid refreshing when not modified.
const kWidgetData = 'widget-data';

const kInfo = 'info';
const kWarning = 'warning';
const kError = 'error';

const kDefaultWidth = 1280;
const kDefaultHeight = 720;

const opts = {
  sensors_file: false,
  sensors_socket: 'localhost',
  port: 30001
};

let widgets;
let reconnectTimer = 0;
let editElement;
const clearTimer = () => {
  if (reconnectTimer) {
    window.clearInterval(reconnectTimer);
    reconnectTimer = 0;
  }
};
const showToast = (severity, msg) => {
  alert(msg);
};
const createOption = (i) => {
  return new Option(i.filename, i.filename);
};
const parseJson = (s) => {
  try {
    if (typeof s === 'Buffer')
      return s.toJSON();
    return JSON.parse(s.toString());
  } catch (err) {
    console.error('JSON', s.toString());
    console.error('Could not parse JSON. Err: %s', err);
    return undefined;
  }
};
const createSensorsClient = () => {
  const server = 'ws://' + opts.sensors_socket + ':' + opts.port;
  console.log(`Connecting to ${server}`);
  const s = new WebSocket(server);
  s.onopen = () => {
    console.log('Connection succeeded');
    s.send('1');
  };
  s.onmessage = (message) => {
    setSensorData(parseJson(message.data));
    // console.log(`Got message from ${server}: ${JSON.stringify(serverState._sensorData)}`);
  };
};
const loadFile = (filename, updateList) => {
  ws.send(JSON.stringify({
    cmd: kCmdLoadWidgetData,
    data: { filename: filename }
  }));
};
const removeOptions = (o) => {
  while (o.options.length) {
    o.options[0].remove();
  }
};
const setPos = (f, v) => {
  document.getElementById(f).value = v;
};
const getPos = (f) => {
  return document.getElementById(f).value;
};
const showProps = (src, left, top, width, height, zIndex, url) => {
  console.log(`left=${left} top=${top} width=${width} height=${height} zIndex=${zIndex} url=${url}`);
  const o = document.getElementById('properties');
  setPos('x', left);
  setPos('y', top);
  setPos('w', width);
  setPos('h', height);
  if (left < 0) left = 0;
  top = src.offsetTop + src.offsetHeight + document.getElementById('header').offsetHeight;
  console.log(`top=${top}`)
  o.style.left = `${left}px`;
  o.style.top = `${top}px`;
  o.style.display = 'block';
  if (editElement) {
    editElement.classList.remove('dragging');
  }
  editElement = src;
  editElement.classList.add('dragging');
  editElement.data = { src, url };
  setDraggable(editElement);
};
const widgetClicked = (event) => {
  event.preventDefault();
  const src = event.srcElement;
  const x = src.offsetLeft;
  const y = src.offsetTop;
  const w = src.offsetWidth;
  const h = src.offsetHeight;
  const z = src.style.zIndex;
  const url = src.src;
  showProps(src, x, y, w, h, z, url);
};
const setupWidgets = (container, data, profile = 'desktop') => {
  createWidgets(viewport, widgets, profile);
  const list = Array.from(document.getElementsByClassName('dragabble'));
  if (!list || list.length === 0) {
    console.log('No widgets found');
    return;
  }
  list.forEach((w, i) => {
    w.addEventListener('click', widgetClicked);
  });
};
const getScreens = () => {
  if (!widgets || !widgets.widgets) {
    console.log('No data');
    return;
  }
  let screens = [];
  widgets.widgets.forEach(w => {
    if (w.screen && w.screen > 0 && screens.indexOf(w.screen) === -1)
      screens.push(parseInt(w.screen));
  });
  screens.sort((a, b) => { return a - b });
  const o = document.getElementById('screen');
  removeOptions(o);
  o.options.add(new Option('--', '--'));
  screens.forEach(s => {
    o.options.add(new Option(s, s));
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
      document.getElementById('width').value = kDefaultWidth;
      document.getElementById('height').value = kDefaultHeight;
      setViewport();
      console.log('Connected, requesting data');
      ws.send(JSON.stringify({ cmd: kCmdAdmin }));
    };
    ws.onmessage = (msg) => {
      const json = JSON.parse(msg.data);
      const cmd = json.cmd;
      const data = json.data;
      if (!cmd) return;

      if (cmd === kCmdAdmin) {
        if (json.result !== 200) {
          showToast(kError, 'Something went wrong');
          return;
        }
        if (typeof data.list !== 'object') {
          showToast(kError, 'Invalid data');
          return;
        }
        console.log('Got data');
        removeOptions(document.getElementById('screen'));
        const o = document.getElementById('files');
        removeOptions(o);
        let selectedItem = undefined;
        data.list.forEach(i => {
          if (i.selected) {
            selectedItem = i;
          }
          o.options.add(createOption(i));
        });
        if (selectedItem) {
          loadFile(selectedItem.filename, false);
        }
      } else if (cmd === kCmdLoadWidgetData) {
        widgets = data;
        const viewport = document.getElementById('viewport');
        setupWidgets(viewport, widgets);
        getScreens();
      } else if (cmd === kCmdSavePos) {
        if (json.result !== 200) {
          showToast(kError, 'Could not save file');
        } else {
          const o = document.getElementById('save_props');
          o.innerText = 'Saved!';
          window.setTimeout(() => {
            o.innerText = 'Save';
          }, 2000);
        }
      }
    };
    return true;
  } catch (err) {
    console.log('Could not connect to WebSocket server at %s. Err: %s', url, err);
  }
  return false;
};
const activateFile = () => {
  const o = document.getElementById('files');
  ws.send(JSON.stringify({
    cmd: kCmdActivateFile,
    data: {
      filename: o.value
    }
  }));
};
const saveJsonAsFile = (filename, overwrite) => {
  let json;
  const text = document.getElementById('editor').innerText;
  try {
    json = JSON.parse(text);
    ws.send(JSON.stringify({ cmd: kCmdSaveJson,
      data: {
        filename: filename,
        overwrite: overwrite,
        json: JSON.stringify(json, null, 2)
      }
    }));
    currentFile = filename;
  } catch(err) {
    alert('JSON parsing error');
  }
};
const loadJson = () => {
  let o = document.getElementById('files');
  if (o && o.value) {
    loadFile(o.value, false);
  } else {
    showToast(kError, 'Invalid selection');
  }
};
const saveJson = () => {
};
const saveJsonAs = () => {
  while (true) {
    const filename = prompt('Enter filename', '');
    if (typeof filename !== 'string') {
      return;
    } else if (!filename.match(/[a-z0-9]/gi)) {
      alert('Invalid filename. Use alphanumeric characters only');
    } else {
      saveJsonAsFile('widgets_' + filename + '.json', false);
      return;
    }
  }
};
const setViewport = () => {
  const o = document.getElementById('viewport');
  const w = document.getElementById('width').value;
  const h = document.getElementById('height').value;
  o.style.width = `${w}px`;
  o.style.height = `${h}px`;
};
const screenChanged = () => {
  closeProps();
  const o = document.getElementById('screen');
  if (o.selectedIndex < 1) return;
  document.getElementById('profile').selectedIndex = 0;
  setScreen(o.selectedIndex);
  const viewport = document.getElementById('viewport');
  setupWidgets(viewport, widgets);
};
const profileChanged = () => {
  const o = document.getElementById('profile');
  const viewport = document.getElementById('viewport');
  setupWidgets(viewport, widgets, o.value);
};
const saveProps = () => {
  if (typeof editElement === 'undefined') return;
  const id = editElement.data.src.id;
  const s = editElement.data.src.style;
  const x = getPos('x');
  const y = getPos('y');
  const w = getPos('w');
  const h = getPos('h');
  s.left = `${x}px`;
  s.top = `${y}px`;
  s.width = `${w}px`;
  s.height = `${h}px`;
  // s.zIndex = getPos('z');
  ws.send(JSON.stringify({
    cmd: kCmdSavePos,
    data: { id, pos: { x, y, w, h } }
  }));
  const o = document.getElementById('save_props');
  o.innerText = 'Saving';
};
const closeProps = () => {
  const o = document.getElementById('properties');
  o.style.display = 'none';
  editElement = undefined;
};
const reconnect = () => {
  if (connect()) {
    clearTimer();
  }
};
const start = () => {
  clearTimer();
  reconnectTimer = window.setInterval(reconnect, kRetryIntervalMs);
};

hostName = config.host || 'mr-pc';
port = config.port || 30000;
host = hostName + ':' + port;
websocketUrl = 'ws://' + host;

document.getElementById('load').addEventListener('click', loadJson);
document.getElementById('save').addEventListener('click', saveJson);
document.getElementById('save_as').addEventListener('click', saveJsonAs);
document.getElementById('set_viewport').addEventListener('click', setViewport);
document.getElementById('screen').addEventListener('change', screenChanged);
document.getElementById('profile').addEventListener('change', profileChanged);
document.getElementById('save_props').addEventListener('click', saveProps);
document.getElementById('close_props').addEventListener('click', closeProps);

createSensorsClient();
setHostConfig(config);
start();
