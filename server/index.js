const express = require('express');
const fs = require('fs');
const ws = require('ws');
const msgHandler = require('./lib/message_handler')
const app = express();
const port = process.env.PW_PORT || 3000;
const kJsonFile = 'widgets.json';
const kDefaultJsonFile = 'widgets_default.json';
const kListFile = 'widgets_list.json';
const kRootDir = process.env.PW_ROOT || 'd:/backgrounds';

const kCmdWidgets = 'widgets';
const kCmdAdmin = 'admin';
const kCmdLoadFile = 'load-file';
const kCmdSaveJson = 'save-json';
const kCmdActivateFile = 'activate-file';

this._sockets = [];
this._connId = 1;
this._watching = false;

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
const sendResponse = (cmd, err, server) => {
  server.send(JSON.stringify({ cmd: cmd, result: err }),
    { binary: false });
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
    fs.copyFileSync(src, dst);
    updateList(filename);
  } catch(err) {
    console.error('Could not activate file %s. Err: %s', filename, err);
  }
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

const server = app.listen(port, () => {
  console.log(`Page watch app listening at http://localhost:${port}`)
});
server.on('upgrade', (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, socket => {
    wsServer.emit('connection', socket, request);
  });
});
