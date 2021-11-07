'use strict';

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
const kCmdLoadFile = 'load-file';
const kCmdSaveJson = 'save-json';
const kCmdActivateFile = 'activate-file';

// Internal widget data to avoid refreshing when not modified.
const kWidgetData = 'widget-data';

const kInfo = 'info';
const kWarning = 'warning';
const kError = 'error';

let reconnectTimer = 0;
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
const loadFile = (filename, updateList) => {
  ws.send(JSON.stringify({
    cmd: kCmdLoadFile,
    data: { filename: filename, updateList: updateList }
  }));
};
const connect = () => {
  try {
    ws = new WebSocket(websocketUrl);
    ws.onclose = () => {
      console.log('Socket closed');
      start();
    };
    ws.onopen = () => {
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
        let o = document.getElementById('files');
        while (o.options.length) {
          o.options[0].remove();
        }
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
      } else if (cmd === kCmdLoadFile) {
        let o = document.getElementById('editor');
        o.innerHTML = JSON.stringify(data, null, 2);
        setTimeout(() => {
          var range = document.createRange();
          var sel = window.getSelection();
          range.setStart(o.childNodes[0], 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          o.focus();
        }, 100);
      } else if (cmd === kCmdSaveJson) {
        if (json.result == 200) {
          loadFile(currentFile, true);
        } else if (json.result == 304) {
          alert('Cannot overwrite existing file');
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
const saveJson = () => {
  const files = document.getElementById('files');
  const filename = files.options[files.selectedIndex].value;
  saveJsonAsFile(filename, true);
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
const filesChanged = () => {
  const o = document.getElementById('files');
  loadFile(o.value, false);
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
bootLoader(() => {
  hostName = config.host || 'mr-pc';
  port = config.port || 30000;
  host = hostName + ':' + port;
  websocketUrl = 'ws://' + host;

  document.getElementById('files').addEventListener('change', filesChanged);
  document.getElementById('activate').addEventListener('click', activateFile);
  document.getElementById('save').addEventListener('click', saveJson);
  document.getElementById('save_as').addEventListener('click', saveJsonAs);

  start();
});
