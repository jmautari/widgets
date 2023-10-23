const express = require('express');
const fs = require('fs');
const ws = require('ws');
const https = require('https');
const path = require('path');
const { createCanvas } = require('canvas');
const msgHandler = require('./lib/message_handler');
const { basename } = require('path');
const { exec, execFile } = require("child_process");
const { urlencoded } = require('express');
const app = express();
const port = process.env.PW_PORT || 30000;
const kJsonFile = 'widgets.json';
const kDefaultJsonFile = 'widgets_default.json';
const kListFile = 'widgets_list.json';
const kDotFile = '1x1.png';
const kSensorsFile = 'sensors.json';
const kRootDir = process.env.PW_ROOT || 'd:/backgrounds';
const kCacheTime = 31557600;
const kPlaySoundProgram = kRootDir + '/playsound.exe';
const kSensorsProgram = kRootDir + '/widget-sensors.exe';

const kCmdWidgets = 'widgets';
const kCmdAdmin = 'admin';
const kCmdLoadFile = 'load-file';
const kCmdLoadWidgetData = 'load-widget-data';
const kCmdSaveJson = 'save-json';
const kCmdActivateFile = 'activate-file';
const kCmdButtons = 'buttons-action';
const kCmdSavePos = 'save-widget-pos';

const kButtonsActivateProfile = 'activateProfile';
const kButtonsActionStartProgram = 'startProgram';
const kButtonsActionPlaySound = 'playSound';

const kValueRaw = 'valueRaw';
const kSensorData = 'sensor-data';
const kGraphColors = [
  'FF6633', 'FFB399', 'FF33FF', 'FFFF99', '00B3E6',
  'E6B333', '3366E6', '999966', '99FF99', 'B34D4D',
  '80B300', '809900', 'E6B3B3', '6680B3', '66991A',
  'FF99E6', 'CCFF1A', 'FF1A66', 'E6331A', '33FFCC',
  '66994D', 'B366CC', '4D8000', 'B33300', 'CC80CC',
  '66664D', '991AFF', 'E666FF', '4DB3FF', '1AB399',
  'E666B3', '33991A', 'CC9999', 'B3B31A', '00E680',
  '4D8066', '809980', 'E6FF80', '1AFF33', '999933',
  'FF3380', 'CCCC00', '66E64D', '4D80CC', '9900B3',
  'E64D66', '4DB380', 'FF4D4D', '99E6E6', '6666FF'];
const kMaxWidth = 488;
const kMaxHeight = 488;

class ServerState {
  _sockets = [];
  _connId = 1;
  _watching = false;
  _graphs = [];
  _vars = [];
  _monitoring = [];
  _sensorData = undefined;
};

const serverState = new ServerState();
this._opts = {
  sensors_file: false,
  sensors_socket: 'localhost',
  port: 30001
};

app.use(express.static(kRootDir, {
  maxAge: kCacheTime,
  extensions: ["mp4", "gif"],
  cacheControl: true,
  immutable: true,
}));
app.use(express.static(__dirname + '/../client'));
app.set('etag', false);

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

const wsServer = new ws.Server({ noServer: true });
wsServer.on('connection', (ws, wc) => {
  ws.on('message', (message) => {
    try {
      const json = parseJson(message);
      if (!json) {
        return;
      }
      msgHandler.process(wc.socket, ws, json);
    } catch (err) {
      console.log('Invalid JSON while parsing incoming WS message. Err: %s', err);
    }
  })
});

const onFileSaved = (filename, server) => {
  sendFile(kCmdAdmin, kListFile, server);
};
const loadWidgetData = (data) => {
  serverState._vars = {};
  let includes = [];
  let nestedIncludes = [];
  const addInclude = (include) => {
    if (includes.indexOf(include) === -1) {
      console.log('Adding %s to include list', include);
      includes.push(include);
    } else {
      console.warn('Ignoring duplicated entry: %s', include);
    }
  };
  data.widgets.forEach(w => {
    const include = w.include || undefined;
    if (typeof include === 'string') {
      addInclude(include);
    } else if (Array.isArray(include)) {
      include.forEach(i => addInclude(i));
    }
  });
  includes.forEach(i => {
    const filename = kRootDir + '/widgets_' + i + '.json';
    if (!fs.existsSync(filename)) {
      console.warn('File %s is not valid and has been ignored', filename);
    } else {
      try {
        let json = parseJson(readFile(filename));
        if (!json) {
          return;
        }
        if (typeof json.vars === 'undefined') {
          json.vars = [];
        }
        const addNestedIncludes = (o) => {
          o.forEach(w => {
            if (typeof w.include === 'string') {
              nestedIncludes.push(w.include);
            } else if (Array.isArray(w.include)) {
              w.include.forEach(i => nestedIncludes.push(i));
            }
          });
        };
        if (Array.isArray(json.widgets)) {
          addNestedIncludes(json.widgets);
        }
        if (Array.isArray(json.vars)) {
          addNestedIncludes(json.vars);
        }
      } catch(err) {
        console.error('Could not parse %s', err);
      }
    }
  });
  nestedIncludes.forEach(i => {
    addInclude(i);
  });
  if (typeof data.vars !== 'undefined') {
    if (typeof data.vars === 'string') {
      data.vars = [ data.vars ];
    }
    if (Array.isArray(data.vars)) {
      data.vars.forEach(i => addInclude(i));
    }
  } else {
    data.vars = [];
  }
  if (typeof data.constants === 'undefined') {
    data.constants = {};
  }
  includes.forEach(i => {
    const filename = kRootDir + '/widgets_' + i + '.json';
    if (!fs.existsSync(filename)) {
      console.warn('File %s is not valid', filename);
      return;
    }
    console.log('Including file %s (%s)', i, filename);
    let widget_index;
    try {
      const json = parseJson(readFile(filename));
      if (!json) {
        return;
      }
      widget_index = 1;
      if (Array.isArray(json.widgets)) {
        json.widgets.forEach(w => {
          w.id = `${i}_${widget_index}`;  // nth index in this file
          data.widgets.push(w);
          widget_index++;
        });
      }
      console.log(`File ${i} has ${widget_index} widgets`);
      if (Array.isArray(json.vars)) {
        json.vars.forEach(w => data.vars.push(w));
      }
      if (typeof json.constants === 'object') {
        Object.keys(json.constants).forEach(k => {
          // console.log('%s=%s', k, json.constants[k]);
          data.constants[k] = json.constants[k];
        });
      }
    } catch (err) {
      console.error('Could not parse %s', err);
    }
  });
  if (typeof data.vars === 'string') {
    includeVars(data.vars);
  } else if (Array.isArray(data.vars)) {
    data.vars.forEach(v => includeVars(v));
  }
  console.log('callnig parseVars');
  data.widgets.forEach(w => {
    if (w.uri) {
      w.uri = replaceVars(w.uri);
      // console.log('w.uri', w.uri);
    }
  });
  // console.log(data);
  return data;
};
const getVars = (json) => {
  Object.keys(json).forEach(k => {
    const v = encodeURIComponent(json[k]);
    // console.log('[%s]=%s', k, json[k]);
    serverState._vars[k] = v;
  });
};
const includeVars = (f) => {
  const fname = 'widgets_' + f + '.json';
  const filename = kRootDir + '/' + fname;
  if (!fs.existsSync(filename)) {
    console.warn('File %s is not valid', filename);
    return;
  }
  // console.log('Including vars %s', filename);
  try {
    const json = parseJson(readFile(filename));
    if (!json) {
      return;
    }
    getVars(json);
    startMonitoring(fname);
  } catch (err) {
    console.error('Could not parse %s', err);
  }
};
const sendResponse = (cmd, err, server) => {
  try {
    server.send(JSON.stringify({ cmd: cmd, result: err }),
      { binary: false });
  } catch(err) {
    console.error('Error sending error response. Err: %s', err);
    setTimeout(() => {
      sendResponse(cmd, err, server);
    }, 1000);
  }
};
const sendSensorData = () => {
  if (typeof serverState._sensorData !== 'object') {
    console.log(`No sensor data (${typeof serverState._sensorData})`);
    return;
  }
  try {
    for (const [client, server] of Object.entries(serverState._sockets)) {
      if (server) {
        server.send(JSON.stringify({ cmd: kSensorData, result: 200, data: serverState._sensorData }),
          { binary: false });
      }
    }
  } catch (err) {
    console.log('Could not send sensor data. Err: %s', err);
    // Keep retrying every second in case of parsing error.
    /*
    setTimeout(() => {
      sendSensorData();
    }, 1000);
    */
  }
};
const sendData = (cmd, jsonData, id) => {
  console.log('Sending data');
  try {
    const str = JSON.stringify({ cmd: cmd, result: 200, data: jsonData });
    if (id !== undefined) {
      let server;
      if (typeof id === 'object') {
        server = id;
      } else {
        server = serverState._sockets[id];
      }
      server.send(str, { binary: false });
      return;
    }
    for (const [client, server] of Object.entries(serverState._sockets)) {
      if (server) {
        server.send(str, { binary: false });
      }
    }
  } catch(err) {
    console.log('Could not read file. Err: %s', err);
  }
};
const sendFile = (cmd, file, id) => {
  try {
    fs.readFile(kRootDir + '/' + file, 'utf8', (err, data) => {
      if (err) {
        console.error('Cannot read file %s. Err: %s', file, err);
        return;
      }
      try {
        const jsonData = parseJson(data);
        if (!jsonData) {
          return;
        }
        const vars = jsonData.vars || undefined;
        if (typeof vars === 'string') {
          includeVars(vars);
        } else if (Array.isArray(vars)) {
          vars.forEach(v => includeVars(v));
        }
        if (typeof jsonData.constants === 'object') {
          // Object.keys(jsonData.constants).forEach(k => console.log('%s=%s', k, jsonData.constants[k]));
          getVars(jsonData.constants);
        }
        if (id !== undefined) {
          let server;
          if (typeof id === 'object') {
            server = id;
          } else {
            server = serverState._sockets[id];
          }
          server.send(JSON.stringify({ cmd: cmd, result: 200, data: jsonData }),
            { binary: false });
          return;
        }
        for (const [client, server] of Object.entries(serverState._sockets)) {
          if (server) {
            server.send(JSON.stringify({ cmd: cmd, result: 200, data: jsonData }),
              { binary: false });
          }
        }
      } catch(err) {
        // Keep retrying every second in case of parsing error.
        setTimeout(() => {
          sendFile(cmd, file, id);
        }, 1000);
      }
    });
  } catch(err) {
    console.log('Could not read file. Err: %s', err);
  }
};
const readFile = (filename) => {
  try {
    return fs.readFileSync(filename);
  } catch(err) {
    if (err.toString().indexOf('EBUSY') == -1)
      console.error(err);
  }
  return undefined;
};
const addToList = (fname) => {
  const filename = kRootDir + '/' + kListFile;
  try {
    let json = parseJson(readFile(filename));
    if (!json) {
      return;
    }
    json.list.push({filename: fname, selected: false});
    fs.writeFileSync(filename, JSON.stringify(json, null, 2));
  } catch(err) {
    console.error('Cannot write file %s. Err: %s', filename, err);
  }
};
const saveFile = (cmd, server, params) => {
  const filename = kRootDir + '/' + params.filename;
  try {
    if (!params.overwrite && fs.existsSync(filename)) {
      sendResponse(cmd, 304, server);
      return;
    }
    fs.writeFileSync(filename, params.json);
    if (!params.overwrite) {
      // Add to list
      addToList(params.filename);
      onFileSaved(params.filename, server);
    }
    sendResponse(cmd, 200, server);
  } catch(err) {
    sendResponse(cmd, 500, server);
  }
};
const updateList = (fname) => {
  const filename = kRootDir + '/' + kListFile;
  try {
    let json = parseJson(readFile(filename));
    if (!json) {
      return;
    }
    json.list.forEach(i => {
      if (i.selected && i.filename !== fname) {
        i.selected = false;
      } else if (i.filename === fname) {
        i.selected = true;
      }
    });
    fs.writeFileSync(filename, JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Cannot write file %s. Err: %s', filename, err);
  }

};
const replaceBackSlash = (i) => {
  return i.replace(/\\/g, '/');
};
const startProgram = (path) => {
  let args = [];
  const getProgramPath = (p) => {
    const s = p.indexOf('"');
    if (s === -1) {
      return replaceBackSlash(p);
    }
    const e = p.lastIndexOf('"');
    if (e === -1) {
      return replaceBackSlash(p);
    }
    args = p.substr(e + 2).split(' ');
    p = p.substr(s + 1, e - 1);
    console.log('p=%s', p);
    return replaceBackSlash(p);
  };
  const getPath = (p) => {
    const i = p.lastIndexOf('/');
    if (i === -1) {
      console.log('/ not found');
      return p;
    }
    console.log('path=%s', p.substr(0, i));
    return p.substr(0, i);
  };
  const p = getProgramPath(path);
  const cleanPath = p.replace(/\"/, '');
  if (!fs.existsSync(cleanPath)) {
    console.error('Path %s does not exist', cleanPath);
    return;
  }
  console.log('Starting %s with args %s', p, args);
  try {
    const dir = getPath(p);
    const opt = { detached: true, cwd: dir, stdio: 'ignore' };
    const proc = exec('"' + p + '" ' + args.join(' '), opt);
    if (proc) {
      console.log('Process should be running now');
      proc.unref();
    }
  } catch(err) {
    console.error('Could not start process. Err: %s', err);
  }
};
const playSound = (path) => {
  startProgram('"' + kPlaySoundProgram + '" ' + path);
};
const saveCurrentProfile = (filename) => {
  try {
    fs.writeFileSync(kRootDir + '/.current', filename);
    console.log('Current profile %s saved to .current file', filename);
  } catch(e) {
    console.log('Could not save profile as %s', filename);
  }
};
const activateFile = (filename) => {
  console.log('Activating %s', filename);
  saveCurrentProfile(filename);
  const src = kRootDir + '/' + filename;
  const dst = kRootDir + '/' + kJsonFile;
  try {
    let json = parseJson(readFile(src));
    if (!json) {
      return;
    }
    if (typeof json.vars === 'undefined') {
      json.vars = [];
    }
    const data = loadWidgetData(json);
    fs.writeFileSync(dst, JSON.stringify(data, null, 2));
    updateList(filename);
  } catch(err) {
    console.error('Could not activate file %s. Err: %s', filename, err);
  }
};
const get1x1dot = () => {
  const filename = kRootDir + '/' + kDotFile;
  return fs.readFileSync(filename);
};
const getClock = (format) => {
  const date = new Date();
  const padLeft = (v) => {
    const s = '00' + v;
    return s.substr(-2);
  };
  const formatMap = {
    MM: padLeft(date.getMonth() + 1, 2),
    dd: padLeft(date.getDate(), 2),
    yy: padLeft(date.getFullYear().toString().slice(-2)),
    yyyy: date.getFullYear(),
    hh: padLeft(date.getHours()),
    mm: padLeft(date.getMinutes()),
    ss: padLeft(date.getSeconds()),
    br: '\n',
  };
  return format.replace(/MM|dd|yyyy|yy|hh|mm|ss|br/g, m => formatMap[m]);
};
const replaceVars = (o) => {
  const vars = serverState._vars;
  const r = /\$\{([^\}]*)./;
  let m;
  do {
    m  = r.exec(o);
    if (m && m.length > 0) {
      if (typeof vars[m[1]] !== 'undefined') {
        const v = vars[m[1]];
        if (typeof v !== 'undefined') {
          o = o.replace(r, v);
        } else {
          o = o.replace(r, '');
        } 
      } else {
        o = o.replace(r, '');
      }
    }
  } while (m && m.length > 0);
  return o;
};
const parseVars = (o) => {
  const vars = serverState._vars;
  Object.keys(o).forEach(k => {
    const r = /\$\{([^\}]+)/g;
    const m  = r.exec(o[k]);
    if (m && m.length > 0) {
      if (typeof o !== 'undefined') {
        if (typeof vars[m[1]] !== 'undefined') {
          const v = vars[m[1]];
          if (typeof v !== 'undefined') {
            o[k] = v;
          }
        }
      }
    }
  });
};
const startMonitoring = (f) => {
  if (serverState._monitoring.indexOf(f) !== -1) return;
  console.log('Monitoring vars file', f);
  serverState._monitoring.push(f);
};

fs.watch(kRootDir, { encoding: 'utf8' }, (eventType, filename) => {
  if (!serverState._watching) {
    serverState._watching = true;
    return;
  }
  if (filename && eventType === 'change') {
    if (filename === kJsonFile) {
      sendFile(kCmdWidgets, kJsonFile);
    } else if (serverState._monitoring.indexOf(filename) !== -1) {
      console.log('Vars file', filename, ' has changed. Reloading data');
      const current_profile = getCurrentProfile();
      if (current_profile && current_profile.length > 0)
        activateFile(current_profile);
    }
  }
  serverState._watching = false;
});

const updateFile = (file, index, pos) => {
  const { x, y, w, h } = pos;
  try {
    const data = JSON.parse(fs.readFileSync(file));
    const e = data.widgets || undefined;
    if (!e) return false;
    const i = index - 1;
    if (e.length < i) return false;
    e[i].position.x = x === 'auto' ? x : `${x}px`;
    e[i].position.y = y === 'auto' ? y : `${y}px`;
    e[i].position.w = w === 'auto' ? w : `${w}px`;
    e[i].position.h = h === 'auto' ? h : `${h}px`;
    try {
      fs.copyFileSync(file, file + '.old');
    } catch(err) {
      console.log('Could not save backup file. Aborting save operation.', err);
      return false;
    }
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch(err) {
      console.log('Could not update widgets file. Aborting save operation.', err);
      return false;
    }
    console.log('File', file, 'updated successfully');
    return true;
  } catch(err) {
    console.log('Error parsing file %s. %s', file, err);
  }
};
const getCurrentProfile = () => {
  const fname = kRootDir + '/.current';
  try {
    if (!fs.existsSync(fname)) return '';
    return fs.readFileSync(fname);
  } catch(e) {
    console.log('Could not read .current file', e);
    return '';
  }
}

msgHandler.on(kCmdWidgets,
  (client, server) => {
    if (client.connId === undefined) {
      client.connId = serverState._connId++;
      console.log('Adding socket %d', client.connId);
      serverState._sockets[client.connId] = server;
      serverState._sockets[client.connId].on('close', () => {
        console.log('Disconnecting socket %d', client.connId);
        serverState._sockets[client.connId] = undefined;
      });
    }
    sendFile(kCmdWidgets, kJsonFile, client.connId);
  });
msgHandler.on(kCmdSavePos,
  (client, server, params) => {
    const widget_id = params.id.split('_');
    const {x, y, w, h} = params.pos;
    const file = widget_id[0];
    const index = widget_id[1];
    const filename = kRootDir + '/' + `widgets_${file}.json`;
    let widget_index = 1;
    console.log(`Saving widget ${index} pos x:${x} y:${y} w:${w} h:${h} to file ${filename}`);
    if (updateFile(filename, index, params.pos)) {
      sendData(kCmdSavePos, 'OK', server);
      return;
    }
    //const current_profile = getCurrentProfile();
    //console.log(`current_profile=${current_profile}`);
    sendData(kCmdSavePos, `Could not update file ${filename}`, server);
  });
msgHandler.on(kCmdButtons,
  (client, server, params) => {
    //console.log(params);
    const doAction = (p) => {
      if (p.action === kButtonsActivateProfile) {
        activateFile('widgets_' + p.data.profile + '.json');
      } else if (p.action === kButtonsActionStartProgram) {
        startProgram(p.data.path);
      } else if (p.action === kButtonsActionPlaySound) {
        playSound(p.data.path);
      }
    };
    if (Array.isArray(params)) {
      params.forEach(p => doAction(p));
    } else {
      doAction(params);
    }
  });
msgHandler.on(kCmdAdmin,
  (client, server) => {
    const filename = kRootDir + '/' + kListFile;
    try {
      // Create widgets list file
      let list = [];
      list.push({ filename: 'widgets_default.json', selected: false });
      const files = fs.readdirSync(kRootDir);
      files.forEach(file => {
        if (path.extname(file) === '.json' &&
            file !== 'widgets_default.json' &&
            file.indexOf('widgets_') === 0 &&
            file !== kListFile) {
          list.push({ filename: file, selected: false });
        }
      });
      let widget_list = { list };
      fs.writeFileSync(filename, JSON.stringify(widget_list));
    } catch(err) {
      sendResponse(kCmdAdmin, 500, server);
      return;
    }
    sendFile(kCmdAdmin, kListFile, server);
  });
msgHandler.on(kCmdLoadFile,
  (client, server, params) => {
    sendFile(kCmdLoadFile, params.filename, server);
  });
msgHandler.on(kCmdLoadWidgetData,
  (client, server, params) => {
    const src = kRootDir + '/' + params.filename;
    console.log('Loading %s', src);
    try {
      let json = parseJson(readFile(src));
      if (!json) {
        console.log('Error loading %s', src);
        return;
      }
      if (typeof json.vars === 'undefined') {
        json.vars = [];
      }
      const data = loadWidgetData(json);
      sendData(kCmdLoadWidgetData, data, server);
    } catch (err) {
      console.log('Error loading widget data', err);
    }
  });
msgHandler.on(kCmdSaveJson,
  (client, server, params) => {
    saveFile(kCmdSaveJson, server, params);
  });
msgHandler.on(kCmdActivateFile,
  (client, server, params) => {
    activateFile(params.filename);
  });
app.get('/', (req, res) => {
  res.send('Page Watch')
});
app.get('/sensors', (req, res) => {
  //console.log('req.query', JSON.stringify(req.query));
  parseVars(req.query);
  const sensor = req.query.sensor;
  const value = req.query.value;
  const color = req.query.color || 'fff';
  const shadowColor = req.query.shadowcolor || undefined;
  const size = req.query.size || 32;
  const fontName = req.query.fontname || 'Consolas';
  const align = req.query.align || 'left';
  const type = req.query.type || 'str';
  const w = parseInt(req.query.w || kMaxWidth);
  const h = parseInt(req.query.h || kMaxHeight);
  let x = align === 'left' ? 0 : align === 'center' ? w / 2 : w;
  const y = 0;
  //console.log('sensor', sensor);
  try {
    if (typeof serverState._sensorData !== 'object') {
      res.setHeader('content-type', 'image/png');
      res.send(get1x1dot());
      return;
    }
    let val = serverState._sensorData.sensors[sensor][value];
    const canvas = createCanvas(w, h);
    const context = canvas.getContext('2d');
    const fontSize = parseInt(size) * 2;
    if (type === 'int') {
      val = parseInt(val);
    }
    context.textBaseline = 'top';
    context.font = 'bold ' + fontSize + 'pt ' + fontName;
    context.textAlign = align;
    if (shadowColor) {
      context.fillStyle = '#' + shadowColor;
      context.fillText(val, x + 4, y + 4, w);
    }
    context.fillStyle = '#' + color;
    context.fillText(val, x, y, w);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(canvas.toBuffer('image/png'));
  } catch(err) {
    res.send('Error');
  }
});
app.get('/text', (req, res) => {
  parseVars(req.query);
  const text = req.query.text || 'Text here';
  const color = req.query.color || 'fff';
  const shadowColor = req.query.shadowcolor || undefined;
  const size = req.query.size || 32;
  const fontName = req.query.fontname || 'Consolas';
  const align = req.query.align || 'left';
  const w = parseInt(req.query.w || kMaxWidth);
  const h = parseInt(req.query.h || kMaxHeight);
  let x = align === 'left' ? 0 : align === 'center' ? w / 2 : w;
  const y = 0;
  try {
    const canvas = createCanvas(w, h);
    const context = canvas.getContext('2d');
    const fontSize = parseInt(size) * 2 || 10;    
    context.textBaseline = 'top';
    context.font = 'bold ' + fontSize + 'pt ' + fontName;
    context.textAlign = align;
    if (shadowColor) {
      context.fillStyle = '#' + shadowColor;
      context.fillText(text, x + 4, 4, w);
    }
    context.fillStyle = '#' + color;
    context.fillText(text, x, 0, w);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(canvas.toBuffer('image/png'));
  } catch (err) {
    res.send('Error');
  }
});
app.get('/gauge', (req, res) => {
  parseVars(req.query);
  const PI = Math.PI;
  const PI2 = PI * 2;
  const outerWidth = 30;
  const innerWidth = 20;
  const sensor = req.query.sensor;
  const value = req.query.value;
  const color = req.query.color || 'fff';
  const bgcolor = req.query.bgcolor || 'eee';
  const dotted = parseInt(req.query.dotted || 0);
  const outline = parseInt(req.query.outline || 1);
  const angle = 1.0 - ((req.query.startangle || 360.0) / 360.0);
  const size  = req.query.size || 1.0;
  const rounded = req.query.rounded || false;
  const min = req.query.min || 0;
  const max = req.query.max || 1000;
  const w = parseInt(req.query.w || kMaxWidth);
  const h = parseInt(req.query.h || kMaxHeight);
  const cc = parseInt(req.query.cc || 0);  // counter clockwise?
  const cx = w / 2;
  const cy = h / 2;
  const radius = cx - 2 * (outerWidth - innerWidth);
  try {
    if (typeof serverState._sensorData !== 'object') {
      res.setHeader('content-type', 'image/png');
      res.send(get1x1dot());
      return;
    }
    let val = serverState._sensorData.sensors[sensor][value];
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.globalAlpha = 0.5;
    val = parseInt(val);
    if (val > max) {
      val = max;
    }
    const percent = (val - min) / (max - min);
    const endAngle = PI2 + PI * (1.0 - angle);
    const startAngle = angle * PI;
    if (startAngle < endAngle) return;

    const endPercentAngle = !cc ?
      startAngle + (endAngle - startAngle) * percent :
      startAngle - (endAngle - startAngle) * percent;
    //console.log('size=%d startAngle=%f endAngle=%f endPercentAngle=%f val=%f', size, startAngle, endAngle, endPercentAngle, val);
    if (outline) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, cc ? PI - startAngle : startAngle, cc ? PI - endAngle : endAngle);
      ctx.strokeStyle = '#' + bgcolor;
      ctx.lineWidth = outerWidth;
      if (dotted) {
        ctx.setLineDash([2, 4]);
      }
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.globalAlpha = 1.0;
    ctx.arc(cx, cy, radius, cc ? PI - startAngle : startAngle, cc ? PI - endPercentAngle : endPercentAngle);
    ctx.strokeStyle = '#' + color;
    ctx.lineWidth = outerWidth;
    if (rounded) {
      ctx.lineCap = 'round';
    }
    if (dotted) {
      ctx.setLineDash([2, 4]);
    }
    ctx.stroke();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(canvas.toBuffer('image/png'));
  } catch (err) {
    res.send('Error');
  }
});
app.get('/cache', (req, res) => {
  parseVars(req.query);
  const sendDotFile = () => {
    console.log('Sending file %s', file);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(kRootDir + '/dot.png');
  };
  const sendText = (kCmdLoadWidgetData, loadWidgetData(params.filename), server)
  const sendFile = (file) => {
    // res.setHeader('Content-Type', 'image/png');
    if (fs.existsSync(file)) {
      console.log('Sending file %s', file);
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(file);
    } else {
      sendDotFile();
    }
    res.status(200);
  };
  const uri = req.query.uri || undefined;
  if (typeof uri === 'undefined') {
    sendDotFile();
    return;
  }
  const dir = kRootDir + '/cache/images';
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch(e) {
      console.error('Could not create cache dir at %s', dir);
      res.status(500);
      return;
    }
  }
  parseVars(uri);
  const re = /[^a-z0-9]+/gi;
  const file = dir + '/' + uri.replace(re, '-');
  // console.log('Caching %s to %s', uri, file);
  if (!fs.existsSync(file) && uri.indexOf('$') === -1) {
    const tempFile = file + '.tmp';
    const stream = fs.createWriteStream(tempFile);
    const request = https.get(uri, function(response) {
      if (response.statusCode !== 200) {
        console.error('Download of %s returned %d', uri, response.statusCode);
        stream.end();
        try {
          fs.unlinkSync(tempFile);
        } catch(e) {
          console.error('Error deleting file. Err:', e);
        }
        sendDotFile();
        return;
      }
      response.pipe(stream);

      stream.on("finish", () => {
        console.log('finish');
        stream.close();
        if (fs.existsSync(tempFile)) {
          const fsize = fs.statSync(tempFile).size;
          if (fsize > 0) {
            try {
              console.log('Renaming file %s to %s', tempFile, file);
              fs.renameSync(tempFile, file);
            } catch(err) {
              fs.unlinkSync(tempFile);
              console.error('Could not rename file %s to %s', tempFile, file, ' Err:', err);
              sendFile(kRootDir + '/dot.png');
              return;
            }
            console.log("Download of %s done. Sending %d bytes", uri, fsize);
            sendFile(file);
          } else {
            console.error('Invalid file size. Deleting %s', tempFile);
            fs.unlinkSync(tempFile);
          }
        } else if (fs.existsSync(file)) {
          try {
            if (fs.statSync(file).size > 0) {
              sendFile(file);
            } else {
              console.error('Invalid file size. Deleting %s', tempFile);
              fs.unlinkSync(file);
            }
          } catch(e) {
            sendDotFile();
            return;
          }
        }
      }).on('error', () => {
        console.log('error');
        fs.unlink(file);
      });
    });
    request.on('error', (err) => {
      fs.unlink(file);
    });
  } else {
    sendFile(file);
  }
});
app.get('/clock', (req, res) => {
  parseVars(req.query);
  const format = req.query.format || 'MM/dd/yyyy';
  const color = req.query.color || 'fff';
  const shadowColor = req.query.shadowcolor || undefined;
  const size = req.query.size || 32;
  const fontName = req.query.fontname || 'Consolas';
  const align = req.query.align || 'left';
  const w = parseInt(req.query.w || kMaxWidth);
  const h = parseInt(req.query.h || kMaxHeight);
  let x = align === 'left' ? 0 : align === 'center' ? w / 2 : w;
  const y = 0;
  try {
    const clockText = getClock(decodeURIComponent(format));
    const canvas = createCanvas(w, h);
    const context = canvas.getContext('2d');
    const fontSize = parseInt(size) * 2;
    context.textBaseline = 'top';
    context.font = 'bold ' + fontSize + 'pt ' + fontName;
    context.textAlign = align;
    if (shadowColor) {
      context.fillStyle = '#' + shadowColor;
      context.fillText(clockText, x + 4, 4, w);
    }
    context.fillStyle = '#' + color;
    context.fillText(clockText, x, 0, w);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(canvas.toBuffer('image/png'));
  } catch (err) {
    res.send('Error');
  }
});
app.get('/graph', (req, res) => {
  parseVars(req.query);
  const id = req.query.id || 0;
  let sensors = req.query.sensors || [];
  let ranges = req.query.ranges || [];
  let colors = req.query.colors || kGraphColors;
  const color = req.query.color || 'ffffff';
  const alpha = req.query.alpha || 0.5;
  const w = parseInt(req.query.w || kMaxWidth);
  const h = parseInt(req.query.h || kMaxHeight);
  const margin = req.query.margin || 20;
  const samplePeriod = w - margin * 2;
  const lineWidth = req.query.lineWidth || 1;
  const fill = req.query.fill || false;
  let graph = serverState._graphs[id] || getDefaultGraphData();
  try {
    if (typeof serverState._sensorData !== 'object') {
      res.setHeader('content-type', 'image/png');
      res.send(get1x1dot());
      return;
    }
    if (typeof sensors === 'string') {
      sensors = sensors.split(',');
    }
    if (typeof ranges === 'string') {
      ranges = ranges.split(',');
    }
    for (var i = 0; i < ranges.length; i++) {
      ranges[i] = ranges[i].split(';');
    }
    if (typeof colors === 'string') {
      colors = colors.split(',');
    }
    const now = Date.now();
    const expired = now - samplePeriod;
    if (typeof sensors !== 'object') {
      sensors = [ sensors ];
    }
    sensors.forEach(i => {
      if (serverState._sensorData.sensors[i] && serverState._sensorData.sensors[i][kValueRaw]) {
        const o = { ts: now, value: serverState._sensorData.sensors[i][kValueRaw] };
        if (typeof graph.dataPoints[i] !== 'object') {
          graph.dataPoints[i] = [];
        }
        graph.dataPoints[i].push(o);
      }
    });
    Object.keys(graph.dataPoints).forEach(i => {
      const size = graph.dataPoints[i].length;
      if (size > samplePeriod) {
        graph.dataPoints[i].splice(0, size - samplePeriod);
      }
    });

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.globalAlpha = alpha;

    let r = 0;
    let px;
    sensors.forEach(i => {
      ctx.beginPath();
      ctx.strokeStyle = '#' + colors[r];
      px = 1;
      ctx.moveTo(margin + px, h - margin);
      const min = parseFloat(ranges[r][0]);
      const max = parseFloat(ranges[r][1]);
      let y;
      graph.dataPoints[i].forEach(c => {
        let v = parseFloat(c.value);
        v = ((v - min) * 100) / (max - min);
        y = (h - margin) - (h - margin) * v / 100;
        ctx.lineTo(margin + px, y);
        if (fill) {
          ctx.lineTo(margin + px,  h - margin);
          ctx.moveTo(margin + px, y);
        }
        px += lineWidth;
      });
      ctx.stroke();
      r++;
    });
    serverState._graphs[id] = graph;

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(canvas.toBuffer('image/png'));
  } catch (err) {
    console.error(err);
    res.send('Error');
  }
});
app.get('/buttons', (req, res) => {
  parseVars(req.query);
  const buttons = decodeURIComponent(req.query.buttons || '');
  try {
    let h = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="description" content="Page Watch buttons frame">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title></title>
  <link rel="stylesheet" href="buttons-css?v=1">
  <link rel="stylesheet" href="https://pro.fontawesome.com/releases/v5.13.0/css/all.css">
</head>
<body>
  <div id="buttons-container">`;

    
    h += `</div>
      <script src="buttons-js?v=1"></script>
    </body>
    </html>`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.send(h);
  } catch(err) {
    console.error(err);
  }
});
app.get('/buttons-css', (req, res) => {
  parseVars(req.query);
  try {
    const file = './css/component.css';
    const css = readFile(file);
    res.setHeader('Content-Type', 'text/css');
    res.setHeader('Cache-Control', 'no-store');
    res.send(css);
  } catch(err) {
    console.error(err);
  }
});
app.get('/buttons-js', (req, res) => {
  parseVars(req.query);
  try {
    const file = './buttons-js/index.js';
    const js = readFile(file);
    res.setHeader('Content-Type', 'text/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.send(js);
  } catch(err) {
    console.error(err);
  }
});

const getDefaultGraphData = () => {
  return {
    lastUpdate: Date.now(),
    dataPoints: {},
  };
};

const createSensorsClient = () => {
  const server = 'ws://' + this._opts.sensors_socket + ':' + this._opts.port;
  console.log(`Connecting to ${server}`);
  const s = new ws.WebSocket(server);
  s.on('open', function() {
    console.log('Connection succeeded');
    s.on('message', function(message) {
      serverState._sensorData = parseJson(message);
      // console.log(`Got message from ${server}: ${JSON.stringify(serverState._sensorData)}`);
    });
  });
  this._sensorClient = s;
};

const requestSensorsData = () => {
  try {
    this._sensorClient.send('1');
    sendSensorData();
  } catch(err) {
    console.log(`Error requesting data. Err: ${err}`);
  }
};

const server = app.listen(port, () => {
  console.log(`Page watch app listening at http://localhost:${port}`);
  if (this._opts.file && fs.existsSync(kSensorsProgram)) {
    console.log('Trying to start %s for sensor monitoring', kSensorsProgram);
    try {
      const monitor = execFile(kSensorsProgram, [ kRootDir ],
          { cwd: kRootDir }, (error, stdout, stderr) => {
        if (error) {
          console.log(error);
          throw error;
        }
        console.log(stdout);
      });
      if (monitor) {
        console.log('Sensor monitoring started');
        const filename = kRootDir + '/' + kSensorsFile;
        if (fs.existsSync(filename)) {
          setInterval(() => {
            try {
              const data = readFile(filename);
              if (!data) {
                //console.warn('Could not read sensors file');
                return;
              }
              const json = parseJson(data);
              serverState._sensorData = json;
            } catch (err) {
              console.error('JSON parsing error: %s', err);
            }
            sendSensorData();
          }, 1000);
        }
      } else {
        throw { program: kSensorsProgram };
      }
    } catch(error) {
      console.log('Cannot start program. %s', error);
    }
  } else if (this._opts.sensors_socket && this._opts.port) {
    createSensorsClient();
    setInterval(() => {
      try {
        requestSensorsData();
      } catch (err) {
        console.error('Error requesting sensors data. Error: %s', err);
      }
    }, 1000);
  } else {
    console.log('%s not found. Sensor monitoring is disabled', kSensorsProgram);
  }
});
server.on('upgrade', (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, socket => {
    wsServer.emit('connection', socket, request);
  });
});
