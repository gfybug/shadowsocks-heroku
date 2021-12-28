// Generated by CoffeeScript 1.10.0
(function() {
  var Encryptor, KEY, LOCAL_ADDRESS, METHOD, PORT, WebSocket, WebSocketServer, config, configContent, configFile, configFromArgs, fs, http, inetNtoa, k, net, options, parseArgs, path, ref, server, timeout, v, wss;

  net = require("net");

  fs = require("fs");

  path = require("path");

  http = require("http");

  WebSocket = require('ws');

  WebSocketServer = WebSocket.Server;

  parseArgs = require("minimist");

  Encryptor = require("./encrypt").Encryptor;

  options = {
    alias: {
      'b': 'local_address',
      'r': 'remote_port',
      'k': 'password',
      'c': 'config_file',
      'm': 'method'
    },
    string: ['local_address', 'password', 'method', 'config_file'],
    "default": {
      'config_file': path.resolve(__dirname, "config.json")
    }
  };

  inetNtoa = function(buf) {
    return buf[0] + "." + buf[1] + "." + buf[2] + "." + buf[3];
  };

  configFromArgs = parseArgs(process.argv.slice(2), options);

  configFile = configFromArgs.config_file;

  configContent = fs.readFileSync(configFile);

  config = JSON.parse(configContent);

  if (process.env.PORT) {
    config['remote_port'] = +process.env.PORT;
  }

  if (process.env.KEY) {
    config['password'] = process.env.KEY;
  }

  if (process.env.METHOD) {
    config['method'] = process.env.METHOD;
  }

  for (k in configFromArgs) {
    v = configFromArgs[k];
    config[k] = v;
  }

  timeout = Math.floor(config.timeout * 1000);

  LOCAL_ADDRESS = config.local_address;

  PORT = config.remote_port;

  KEY = config.password;

  METHOD = config.method;

  if ((ref = METHOD.toLowerCase()) === "" || ref === "null" || ref === "table") {
    METHOD = null;
  }

  server = http.createServer(function(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/plain'
    });
    return res.end("Welcome to Heroku https://github.com/gfybug/shadowsocks-heroku");
  });

  wss = new WebSocketServer({
    server: server
  });

  wss.on("connection", function(ws) {
    var addrLen, cachedPieces, encryptor, headerLength, remote, remoteAddr, remotePort, stage;
    console.log("server connected");
    console.log("concurrent connections:", wss.clients.length);
    encryptor = new Encryptor(KEY, METHOD);
    stage = 0;
    headerLength = 0;
    remote = null;
    cachedPieces = [];
    addrLen = 0;
    remoteAddr = null;
    remotePort = null;
    ws.on("message", function(data, flags) {
      var addrtype, buf, e, error;
      data = encryptor.decrypt(data);
      if (stage === 5) {
        if (!remote.write(data)) {
          ws._socket.pause();
        }
        return;
      }
      if (stage === 0) {
        try {
          addrtype = data[0];
          if (addrtype === 3) {
            addrLen = data[1];
          } else if (addrtype !== 1) {
            console.warn("unsupported addrtype: " + addrtype);
            ws.close();
            return;
          }
          if (addrtype === 1) {
            remoteAddr = inetNtoa(data.slice(1, 5));
            remotePort = data.readUInt16BE(5);
            headerLength = 7;
          } else {
            remoteAddr = data.slice(2, 2 + addrLen).toString("binary");
            remotePort = data.readUInt16BE(2 + addrLen);
            headerLength = 2 + addrLen + 2;
          }
          remote = net.connect(remotePort, remoteAddr, function() {
            var i, piece;
            console.log("connecting", remoteAddr);
            i = 0;
            while (i < cachedPieces.length) {
              piece = cachedPieces[i];
              remote.write(piece);
              i++;
            }
            cachedPieces = null;
            return stage = 5;
          });
          remote.on("data", function(data) {
            data = encryptor.encrypt(data);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data, {
                binary: true
              });
              if (ws.bufferedAmount > 0) {
                remote.pause();
              }
            }
          });
          remote.on("end", function() {
            ws.close();
            return console.log("remote disconnected");
          });
          remote.on("drain", function() {
            return ws._socket.resume();
          });
          remote.on("error", function(e) {
            ws.terminate();
            return console.log("remote: " + e);
          });
          remote.setTimeout(timeout, function() {
            console.log("remote timeout");
            remote.destroy();
            return ws.close();
          });
          if (data.length > headerLength) {
            buf = new Buffer(data.length - headerLength);
            data.copy(buf, 0, headerLength);
            cachedPieces.push(buf);
            buf = null;
          }
          return stage = 4;
        } catch (error) {
          e = error;
          console.warn(e);
          if (remote) {
            remote.destroy();
          }
          return ws.close();
        }
      } else {
        if (stage === 4) {
          return cachedPieces.push(data);
        }
      }
    });
    ws.on("ping", function() {
      return ws.pong('', null, true);
    });
    ws._socket.on("drain", function() {
      if (stage === 5) {
        return remote.resume();
      }
    });
    ws.on("close", function() {
      console.log("server disconnected");
      console.log("concurrent connections:", wss.clients.length);
      if (remote) {
        return remote.destroy();
      }
    });
    return ws.on("error", function(e) {
      console.warn("server: " + e);
      console.log("concurrent connections:", wss.clients.length);
      if (remote) {
        return remote.destroy();
      }
    });
  });

  server.listen(PORT, LOCAL_ADDRESS, function() {
    var address;
    address = server.address();
    return console.log("server listening at", address);
  });

  server.on("error", function(e) {
    if (e.code === "EADDRINUSE") {
      console.log("address in use, aborting");
    }
    return process.exit(1);
  });

}).call(this);
