const express = require('express');
const fs = require('fs');
const ws = require('ws');
const { createCanvas } = require('canvas');
const msgHandler = require('./lib/message_handler');
const { basename } = require('path');
const { execFile } = require("child_process")
const app = express();
const port = process.env.PW_PORT || 30000;
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
const kCmdButtons = 'buttons-action';

const kButtonsActivateProfile = 'activateProfile';
const kButtonsActionStartProgram = 'startProgram';

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

this._sockets = [];
this._connId = 1;
this._watching = false;
this._graphs = [];

this._sensorData = undefined;

app.use(express.static(kRootDir));
app.use(express.static(__dirname + '/../client'));

const parseJson = (s) => {
  try {
    return JSON.parse(s);
  } catch (err) {
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
  let includes = [];
  let nestedIncludes = [];
  const addInclude = (include) => {
    if (includes.indexOf(include) === -1) {
      includes.push(include);
    } else {
      console.warn('Ignoring duplicated entry: %s', include);
    }
  };
  data.widgets.forEach(w => {
    const include = w.include || undefined;
    if (typeof include === 'undefined') {
      return;
    } else if (typeof include === 'string') {
      addInclude(include);
    } else if (typeof include === 'object') {
      include.forEach(i => addInclude(i));
    }
  });
  includes.forEach(i => {
    const filename = kRootDir + '/widgets_' + i + '.json';
    if (!fs.existsSync(filename)) {
      console.warn('File %s is not valid', filename);
      return;
    }
    try {
      const json = parseJson(readFile(filename));
      if (!json) {
        return;
      }
      json.widgets.forEach(w => {
        if (typeof w.include === 'string') {
          nestedIncludes.push(w.include);
        }
      });
    } catch(err) {
      console.error('Could not parse %s', err);
    }
  });
  nestedIncludes.forEach(i => {
    addInclude(i);
  });
  includes.forEach(i => {
    const filename = kRootDir + '/widgets_' + i + '.json';
    if (!fs.existsSync(filename)) {
      console.warn('File %s is not valid', filename);
      return;
    }
    console.log('Including file %s', filename);
    try {
      const json = parseJson(readFile(filename));
      if (!json) {
        return;
      }
      json.widgets.forEach(w => data.widgets.push(w));
    } catch (err) {
      console.error('Could not parse %s', err);
    }
  });  return data;
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
        const jsonData = parseJson(data);
        if (!jsonData) {
          return;
        }
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
const startProgram = (path) => {
  if (!fs.existsSync(path)) {
    console.error('Path %s does not exist', path);
    return;
  }
  console.log('Starting %s', path);
  try {
    execFile(path);
    console.log('Process should be running now');
  } catch(err) {
    console.error('Could not start process. Err: %s', err);
  }
};
const activateFile = (filename) => {
  console.log('Activating %s', filename);
  const src = kRootDir + '/' + filename;
  const dst = kRootDir + '/' + kJsonFile;
  try {
    const json = parseJson(readFile(src));
    if (!json) {
      return;
    }
    const data = loadWidgetData(json);
    fs.writeFileSync(dst, JSON.stringify(data));
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
msgHandler.on(kCmdButtons,
  (client, server, params) => {
    if (params.action === kButtonsActivateProfile) {
      activateFile('widgets_' + params.data.profile + '.json');
    } else if (params.action === kButtonsActionStartProgram) {
      startProgram(params.data.path);
    }
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
    const percent = (val - min) / (max - min);
    const endAngle = PI2 + PI * (1.0 - angle);
    const startAngle = angle * PI;
    const endPercentAngle = !cc ?
      startAngle + (endAngle - startAngle) * percent :
      startAngle - (endAngle - startAngle) * percent;
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
    if (rounded) {
      ctx.lineCap = 'round';
    }
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
app.get('/graph', (req, res) => {
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
  let graph = this._graphs[id] || getDefaultGraphData();
  try {
    if (typeof this._sensorData !== 'object') {
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
    sensors.forEach(i => {
      const o = { ts: now, value: this._sensorData.sensors[i][kValueRaw] };
      if (typeof graph.dataPoints[i] !== 'object') {
        graph.dataPoints[i] = [];
      }
      graph.dataPoints[i].push(o);
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
    this._graphs[id] = graph;

    res.setHeader('content-type', 'image/png');
    res.send(canvas.toBuffer('image/png'));
  } catch (err) {
    console.error(err);
    res.send('Error');
  }
});
app.get('/buttons', (req, res) => {
  const buttons = decodeURIComponent(req.query.buttons || '');
  try {
    const data = JSON.parse(buttons);
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
  <div class="wrap">`;
data.forEach(i => {
  h += `<div class="` + i.class + `" `;
  if (i.style) {
    h += ` style="` + i.style + `" `;
  }
  h += `onclick='onAction(` + i.action + `)'>
    <i class="ff fa-3x`;
  if (i.image) {
    if (i.image.match(/fa\-/i)) {
      h += ' ' + i.image + `">`;
    } else {
      h += `"><img src="` + i.image + `">`;
    }
  }
  h += `</i><span class="label bottom">` + i.title + `</span></div>`;
});
h += `
  </div>
  <script src="buttons-js?v=1"></script>
</body>
</html>`;
    res.setHeader('content-type', 'text/html');
    res.send(h);
  } catch(err) {
    console.error(err);
  }
});
app.get('/buttons-css', (req, res) => {
  try {
    const file = './css/component.css';
    const css = readFile(file);
    res.setHeader('content-type', 'text/css');
    res.send(css);
  } catch(err) {
    console.error(err);
  }
});
app.get('/buttons-js', (req, res) => {
  try {
    const file = './buttons-js/index.js';
    const js = readFile(file);
    res.setHeader('content-type', 'text/javascript');
    res.send(js);
  } catch (err) {
    console.error(err);
  }
});

const getDefaultGraphData = () => {
  return {
    lastUpdate: Date.now(),
    dataPoints: {},
  };
};

const server = app.listen(port, () => {
  console.log(`Page watch app listening at http://localhost:${port}`);
  const filename = kRootDir + '/' + kSensorsFile;
  if (fs.existsSync(filename)) {
    setInterval(() => {
      try {
        const data = readFile(filename);
        if (!data) {
          console.warn('Could not ready sensors file');
          return;
        }
        const json = parseJson(data);
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
