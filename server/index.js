const express = require('express');
const fs = require('fs');
const ws = require('ws');
const msgHandler = require('./lib/message_handler')
const app = express();
const port = process.env.PW_PORT || 3000;
const json_file = 'widgets.json';
const root_dir = process.env.PW_ROOT || 'd:/backgrounds';

this._sockets = [];
this._connId = 1;
this._watching = false;

app.use(express.static(root_dir));
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

const sendFile = (id) => {
  try {
    fs.readFile(root_dir + '/' + json_file, 'utf8', (err, data) => {
      if (err) {
        console.error('Cannot read file %s. Err: %s', json_file, err);
        return;
      }
      try {
        const jsonData = JSON.parse(data);
        if (id !== undefined) {
          this._sockets[id].send(JSON.stringify({ cmd: 'widgets', result: 200, data: jsonData }),
            { binary: false });
          return;
        }
        for (const [client, server] of Object.entries(this._sockets)) {
          if (server) {
            server.send(JSON.stringify({ cmd: 'widgets', result: 200, data: jsonData }),
              { binary: false });
          }
        }
      } catch(err) {
        // Keep retrying every second in case of parsing error.
        setTimeout(() => {
          sendFile(id);
        }, 1000);
      }
    });
  } catch(err) {
    console.log('Could not read file. Err: %s', err);
  }
};

fs.watch(root_dir, { encoding: 'utf8' }, (eventType, filename) => {
  if (!this._watching) {
    this._watching = true;
    return;
  }
  if (eventType === 'change' && filename && filename === json_file) {
    sendFile();
  }
  this._watching = false;
});

msgHandler.on('widgets',
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
    sendFile(client.connId);
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
