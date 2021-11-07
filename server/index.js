const express = require('express');
const fs = require('fs');
const ws = require('ws');
const { createCanvas } = require('canvas');
const msgHandler = require('./lib/message_handler');
const { basename } = require('path');
const app = express();
const port = process.env.PW_PORT || 3000;
const kJsonFile = 'widgets.json';
const kDefaultJsonFile = 'widgets_default.json';
const kListFile = 'widgets_list.json';
const kDotFile = '1x1.png';
const kSensorsFile = 'sensors.json';
const kRootDir = process.env.PW_ROOT || 'd:/backgrounds';

const kCmdWidgets = 'widgets';
const kCmdAdmin = 'admin';
const kCmdLoadFile = 'load-file';
const kCmdSaveJson = 'save-json';
const kCmdActivateFile = 'activate-file';
const kSensorData = 'sensor-data';

const kMaxWidth = 488;
const kMaxHeight = 488;

this._sockets = [];
this._connId = 1;
this._watching = false;

this._sensorData = undefined;

app.use(express.static(kRootDir));
app.use(express.static(__dirname + '/../client'));

const wsServer = new ws.Server({ noServer: true });
wsServer.on('connection', (ws, wc) => {
  ws.on('message', (message) => {
    try {
      msgHandler.process(wc.socket, ws, JSON.parse(message));
    } catch (err) {
      console.log('Invalid JSON while parsing incoming WS message. Err: %s', err);
    }
  })
});

const onFileSaved = (filename, server) => {
  sendFile(kCmdAdmin, kListFile, server);
};
const loadWidgetData = (data) => {
  let includes = [];
  data.widgets.forEach(w => {
    const include = w.include || undefined;
    if (typeof include === 'undefined') {
      return;
    } else if (typeof include === 'string') {
      includes.push(include);
    } else {
      includes = include;
    }
  });
  includes.forEach(i => {
    const filename = kRootDir + '/widgets_' + i + '.json';
    if (!fs.existsSync(filename)) {
      return;
    }
    console.log('Including file %s', filename);
    try {
      const json = JSON.parse(readFile(filename));
      json.widgets.forEach(w => data.widgets.push(w));
    } catch(err) {
      console.error('Could not parse %s', err);
    }
  });
  return data;
};
const sendResponse = (cmd, err, server) => {
  try {
    server.send(JSON.stringify({ cmd: cmd, result: err }),
      { binary: false });
  } catch(err) {
    console.error('Error sending error response. Err: %s', err);
  }
};
const sendSensorData = () => {
  if (typeof this._sensorData !== 'object') {
    return;
  }
  try {
    for (const [client, server] of Object.entries(this._sockets)) {
      if (server) {
        server.send(JSON.stringify({ cmd: kSensorData, result: 200, data: this._sensorData }),
          { binary: false });
      }
    }
  } catch (err) {
    console.log('Could not send sensor data. Err: %s', err);
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
        const jsonData = JSON.parse(data);
        if (id !== undefined) {
          let server;
          if (typeof id === 'object') {
            server = id;
          } else {
            server = this._sockets[id];
          }
          server.send(JSON.stringify({ cmd: cmd, result: 200, data: jsonData }),
            { binary: false });
          return;
        }
        for (const [client, server] of Object.entries(this._sockets)) {
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
    console.error(err);
  }
  return undefined;
};
const addToList = (fname) => {
  const filename = kRootDir + '/' + kListFile;
  try {
    let json = JSON.parse(readFile(filename));
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
    let json = JSON.parse(readFile(filename));
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
const activateFile = (filename) => {
  console.log('Activating %s', filename);
  const src = kRootDir + '/' + filename;
  const dst = kRootDir + '/' + kJsonFile;
  try {
    const json = loadWidgetData(JSON.parse(readFile(src)));
    fs.writeFileSync(dst, JSON.stringify(json));
    updateList(filename);
  } catch(err) {
    console.error('Could not activate file %s. Err: %s', filename, err);
  }
};
const get1x1dot = () => {
  const filename = kRootDir + '/' + kDotFile;
  return fs.readFileSync(filename);
};

fs.watch(kRootDir, { encoding: 'utf8' }, (eventType, filename) => {
  if (!this._watching) {
    this._watching = true;
    return;
  }
  if (eventType === 'change' && filename && filename === kJsonFile) {
    sendFile(kCmdWidgets, kJsonFile);
  }
  this._watching = false;
});

msgHandler.on(kCmdWidgets,
  (client, server) => {
    if (client.connId === undefined) {
      client.connId = this._connId++;
      console.log('Adding socket %d', client.connId);
      this._sockets[client.connId] = server;
      this._sockets[client.connId].on('close', () => {
        console.log('Disconnecting socket %d', client.connId);
        this._sockets[client.connId] = undefined;
      });
    }
    sendFile(kCmdWidgets, kJsonFile, client.connId);
  });
msgHandler.on(kCmdAdmin,
  (client, server) => {
    const filename = kRootDir + '/' + kListFile;
    if (!fs.existsSync(filename)) {
      // Copy current widgets.json as widgets_default.json
      const src = kRootDir + '/' + kJsonFile;
      const dst = kRootDir + '/' + kDefaultJsonFile;
      try {
        fs.copyFileSync(src, dst);
      } catch(err) {
        sendResponse(kCmdAdmin, 500, server);
        return;
      }
      try {
        // Create widgets list file
        fs.writeFileSync(filename, JSON.stringify(
          {
            list: [
              { filename: kDefaultJsonFile, selected: true }
            ]
          }));
      } catch(err) {
        sendResponse(kCmdAdmin, 500, server);
        return;
      }
    }
    sendFile(kCmdAdmin, kListFile, server);
  });
msgHandler.on(kCmdLoadFile,
  (client, server, params) => {
    sendFile(kCmdLoadFile, params.filename, server);
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
  try {
    if (typeof this._sensorData !== 'object') {
      res.setHeader('content-type', 'image/png');
      res.send(get1x1dot());
      return;
    }
    let val = this._sensorData.sensors[sensor][value];
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
    res.setHeader('content-type', 'image/png');
    res.send(canvas.toBuffer('image/png'));
  } catch(err) {
    res.send('Error');
  }
});
app.get('/text', (req, res) => {
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
    const fontSize = parseInt(size) * 2;
    context.textBaseline = 'top';
    context.font = 'bold ' + fontSize + 'pt ' + fontName;
    context.textAlign = align;
    if (shadowColor) {
      context.fillStyle = '#' + shadowColor;
      context.fillText(text, x + 4, 4, w);
    }
    context.fillStyle = '#' + color;
    context.fillText(text, x, 0, w);
    res.setHeader('content-type', 'image/png');
    res.send(canvas.toBuffer('image/png'));
  } catch (err) {
    res.send('Error');
  }
});
app.get('/gauge', (req, res) => {
  const PI = Math.PI;
  const PI2 = PI * 2;
  const outerWidth = 30;
  const innerWidth = 20;
  const sensor = req.query.sensor;
  const value = req.query.value;
  const color = req.query.color || 'fff';
  const dotted = parseInt(req.query.dotted || 0);
  const outline = parseInt(req.query.outline || 1);
  const angle = 1.0 - ((req.query.startangle || 360.0) / 360.0);
  const size  = -1 * (req.query.size || 0);
  const min = req.query.min || 0;
  const max = req.query.max || 1000;
  const w = parseInt(req.query.w || kMaxWidth);
  const h = parseInt(req.query.h || kMaxHeight);
  const cc = parseInt(req.query.cc || 0);  // counter clockwise?
  const cx = w / 2;
  const cy = h / 2;
  const radius = cx - 2 * (outerWidth - innerWidth);
  try {
    if (typeof this._sensorData !== 'object') {
      res.setHeader('content-type', 'image/png');
      res.send(get1x1dot());
      return;
    }
    let val = this._sensorData.sensors[sensor][value];
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.globalAlpha = 0.5;
    val = parseInt(val);
    if (val > max) {
      val = max;
    }
    const percent = (val - min) / (max - min)* 100;
    const endAngle = PI2 + PI * (1.0 - angle + size);
    const startAngle = angle * PI;
    const endPercentAngle = !cc ?
      startAngle + (endAngle - startAngle) * percent / 100 :
      startAngle - (endAngle - startAngle) * percent / 100;
    //console.log('size=%d startAngle=%f endAngle=%f endPercentAngle=%f val=%f', size, startAngle, endAngle, endPercentAngle, val);
    if (outline) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, cc ? PI - startAngle : startAngle, cc ? PI - endAngle : endAngle);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = outerWidth;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.globalAlpha = 1.0;
    ctx.arc(cx, cy, radius, cc ? PI - startAngle : startAngle, cc ? PI - endPercentAngle : endPercentAngle);
    ctx.strokeStyle = '#' + color;
    ctx.lineWidth = innerWidth;
    ctx.lineCap = 'round';
    if (dotted) {
      ctx.setLineDash([2, 4]);
    }
    ctx.stroke();
    res.setHeader('content-type', 'image/png');
    res.send(canvas.toBuffer('image/png'));
  } catch (err) {
    res.send('Error');
  }
});

const server = app.listen(port, () => {
  console.log(`Page watch app listening at http://localhost:${port}`);
  const filename = kRootDir + '/' + kSensorsFile;
  if (fs.existsSync(filename)) {
    setInterval(() => {
      try {
        const json = JSON.parse(fs.readFileSync(filename));
        this._sensorData = json;
      } catch(err) {
        console.error('JSON parsing error: %s', err);
      }
      sendSensorData();
    }, 1000);
  }
});
server.on('upgrade', (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, socket => {
    wsServer.emit('connection', socket, request);
  });
});
