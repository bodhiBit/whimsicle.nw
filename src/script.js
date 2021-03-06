/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
strict:true, undef:true, unused:true, curly:true, devel:true, indent:2,
maxerr:50, newcap:true, browser:true, node:true */
(function(){
  "use strict";
  var Fs = require("fs"),
      Path = require("path"),
      ChildProcess = require("child_process"),
      Gui = require("nw.gui");
      
  var appsPath = ".",
      appsUrl = "../",
      config,
      iframe,
      title = document.title,
      modified = false,
      startupFiles = [],
      textExtentions = [],
      binaryExtentions = [];
  
  function _init(){
    appsPath = realPath("[home]/whimsicle-apps");
    if (location.search === "?newinstall") {
      startupFiles.push("[apps]/config.json");
    }
    for (var i = 0; i < Gui.App.argv.length; i++) {
      var arg = Gui.App.argv[i];
      if (arg.substr(0,2) === "--") {
        var keyValPair = arg.substr(2).split("=");
        switch (keyValPair[0]) {
        case 'apps':
          appsPath = Path.resolve(keyValPair[1]);
          break;
        }
      } else {
        startupFiles.push(whimPath(arg, true));
      }
    }
    _startApp();
  }
  
  function _startApp() {
    Fs.exists(appsPath, function(exists){
      if (exists) {
        Gui.Window.get().maximize();
        window.addEventListener("message", _onMessage);
        Gui.Window.get().on("close", _onQuit);
        Gui.App.on("open", _onOpen);
        config = undefined;
        
        iframe = document.createElement("iframe");
        iframe.setAttribute("src", appsPath+"/");
        appsUrl = iframe.src;
        var startPage = "index.html";
        for (var i = 0; i < startupFiles.length; i++) {
          startPage += "#" + window.escape(startupFiles[i]);
        }
        iframe.setAttribute("src", appsUrl+startPage);
        iframe.setAttribute("nwdisable", true);
        document.body.appendChild(iframe);
      } else {
        _appendElement("h1", "Downloading apps");
        _appendElement("p", "Please wait - This may take a while...");
        
        var command =
          'git clone --recursive https://github.com/bodhiBit/whimsicle-apps.git "'+
          appsPath+'"';
        _appendElement("code", command);
        ChildProcess.exec(command, function(err, stdout, stderr){
          if (err) {
            _appendElement("pre", stdout+stderr);
            ChildProcess.exec("git --version", function(err){
              if (err) {
                location.assign("nogit.html");
              }
            });
          } else {
            var updateFile = "update.sh";
            if (process.platform === "win32") {
              updateFile = "update.bat";
            }
            doCopy(updateFile, appsPath+Path.sep+updateFile, function() {
              ChildProcess.exec("chmod +x '"+appsPath+Path.sep+updateFile+"'", function(){
                location.assign("?newinstall");
              });
            });
          }
        });
      }
    });
  }
  
  function _appendElement(tag, text) {
    var el = document.createElement(tag);
    el.textContent = text;
    document.body.appendChild(el);
  }
  
  function _onOpen(cmdline) {
    var argv = ("--"+cmdline).split(" ");
    var fileArgs = false;
    var multiArg = false;
    for (var i = 0; i < argv.length; i++) {
      var arg = argv[i];
      if (arg.substr(0,1) === "\"" || arg.substr(0,1) === "'" ) {
        multiArg = arg.substr(1);
        arg = "--multiArg";
      } else if (multiArg) {
        multiArg += " " + arg;
        arg = "--multiArg";
      }
      if (multiArg && (multiArg.substr(-1) === "\"" || multiArg.substr(-1) === "'" )) {
        arg = multiArg.substr(0, multiArg.length-1);
        multiArg = false;
      }
      if (arg.substr(0,2) === "--") {
        fileArgs = true;
      } else if (fileArgs) {
        iframe.contentWindow.postMessage(JSON.stringify({
          intent: "openPath",
          path: whimPath(arg)
        }), appsUrl+"/*");
      }
    }
  }
  
  function _onMessage(event) {
    var data = JSON.parse(event.data);
    if (event.source.location.toString().substr(0, appsUrl.length) === appsUrl) {
      if (data.syscall) {
        var path = realPath(data.path), destination;
        if (data.destination) {
          if ("[/\\".indexOf(data.destination.substr(0,1)) > -1) {
            destination = realPath(data.destination);
          } else {
            destination = realPath(Path.resolve(Path.dirname(path), data.destination));
          }
        }
        var respond = function(result) {
          result.realPath = path;
          result.realDestination = destination;
          reply(event, result);
        };
        switch (data.syscall) {
        case "config":
          if (data.config) {
            doWrite(appsPath+"/config.json", JSON.stringify(data.config, null, 2), "utf8", function(result) {
              result.config = getConfig();
              respond(result);
            });
          } else {
            respond({ success: true, status: "ok", config: getConfig() });
          }
          break;
        case "probe":
          doProbe(path, respond);
          break;
        case "read":
          doRead(path, data.encoding, respond);
          break;
        case "write":
          doWrite(path, data.data, data.encoding, respond);
          break;
        case "delete":
          doDelete(path, respond);
          break;
        case "rename":
          doRename(path, destination, respond);
          break;
        case "copy":
          doCopy(path, destination, respond);
          break;
        case "run":
          doRun(data.command, respond);
          break;
        case "open":
          doOpen(data.url, respond);
          break;
        default:
          respond({ success: false, status: "unknown command" });
        }
      } else if (data.intent) {
        switch (data.intent) {
        case "appInfo":
          modified = data.isModified;
          document.title = title + (modified?"*":"");
          reply(event, { success: true, status: "ok" });
          break;
        case "close":
          Gui.Window.get().close(true);
          reply(event, { success: true, status: "ok" });
          break;
        case "closeAll":
          Gui.Window.get().close();
          reply(event, { success: true, status: "ok" });
          break;
        case "quit":
          Gui.Window.get().close();
          reply(event, { success: true, status: "ok" });
          break;
        default:
          respond({ success: false, status: "unknown intent" });
        }
      } else {
        iframe.contentWindow.postMessage(JSON.stringify(data), appsUrl+"/*");
      }
    } else {
      console.log("System got an unauthorized message from "+event.source.location);
    }
  }
  
  function _onQuit() {
    if (modified) {
      if (confirm("There are unsaved changes!\nDiscard?")) {
        Gui.Window.get().close(true);
      }
    } else {
      Gui.Window.get().close(true);
    }
  }

  function _fileIsBinary(path, size, cb) {
    var ext = path.toLowerCase().substr(path.lastIndexOf(".")+1);
    if (textExtentions.indexOf(ext) > -1) {
      cb({ success: true, status: "ok", isBinary: false });
    } else if (binaryExtentions.indexOf(ext) > -1) {
      cb({ success: true, status: "ok", isBinary: true });
    } else if (size < 1024*1024) {
      Fs.readFile(path, function(err, data) {
        if (err) {
          cb({ success: false, status: "err", err: err });
        } else {
          var i=0, binary=false, ctrlCodes = [9, 10, 13];
          while (i<data.length && !binary){
            if(data[i] < 32 && ctrlCodes.indexOf(data[i]) < 0){
              binary=true;
            }
            i++;
          }
          if (binary) {
            binaryExtentions.push(ext);
          } else {
            textExtentions.push(ext);
          }
          cb({ success: true, status: "ok", isBinary: binary });
        }
      });
    } else {
      cb({ success: true, status: "ok", isBinary: true });
    }
  }
  
  function reply(event, data) {
    var attrname, _data = JSON.parse(event.data);
    for (attrname in data) {
      if (data.hasOwnProperty(attrname)) {
        _data[attrname] = data[attrname];
      }
    }
    event.source.postMessage(JSON.stringify(_data), appsUrl+"/*");
  }
  
  function getConfig() {
    var file = false;
    if (!config) {
      try {
        var data = Fs.readFileSync(appsPath+"/config.json", {encoding: "utf8"});
        if (data) {
          file = true;
          config = JSON.parse(data);
        }
      } catch (e) {
        config = {};
      }
    }
    if (config.appsUrl !== appsUrl) {
      config.appsUrl = appsUrl;
      if (!config.workspaces) {
        config.workspaces = {
          code: "[home]/code"
        };
      }
      config.workspaces.home = whimPath(process.env.HOME || (process.env.HOMEDRIVE+process.env.HOMEPATH));
      config.workspaces.apps = whimPath(appsPath);
      if (file) {
        Fs.writeFileSync(appsPath+"/config.json", JSON.stringify(config, null, 2));
      }
    }
    return config;
  }
  
  function realPath(path) {
    if (path) {
      while (path.substr(0, 1) === "[" && path.indexOf("]") > 0) {
        path = path.replace(/\\/g, "/"); // convertin to unix seperators
        path = path.replace(/\/\.\./g, ""); // removing any "/.." in path
        var config = getConfig();
        var workspace = path.substr(1);
        workspace = workspace.substr(0, workspace.indexOf("]"));
        if (config.workspaces[workspace]) {
          path = path.replace( "["+workspace+"]", config.workspaces[workspace]);
        } else {
          return undefined;
        }
      }
      path = path.replace(/\\/g, "/"); // convertin to unix seperators
      path = path.replace(/\/\.\./g, ""); // removing any "/.." in path
      if (Path.sep === "\\") {
        if (path.length > 1 && path.substr(0, 1) === "/") {
          path = path.substr(1);
        }
        if (path.substr(0, 1) !== "/") {
          path = path.substr(0, 1).toUpperCase() + ":" + path.substr(path.indexOf("/"));
        }
        path = path.replace(/\//g, Path.sep);
      } else {
        if (path.substr(0, 1) !== "/") {
          path = "/" + path;
        }
      }
      if (path.length > 3 && path.substr(-1) === Path.sep) {
        path = path.substr(0, path.length-1);
      }
      return path;
    } else {
      return undefined;
    }
  }
  
  function whimPath(path, useWorkspaces) {
    path = Path.resolve(process.cwd(), path);
    var config = getConfig();
    if (Path.sep === "\\") {
      path = path.substr(0,1).toUpperCase()+path.substr(1);
    }
    if (useWorkspaces) {
      for(var ws in config.workspaces) {
        if (config.workspaces.hasOwnProperty(ws)) {
          var wsPath = realPath("["+ws+"]/");
          if (wsPath && path.substr(0, wsPath.length) === wsPath) {
            path = "["+ws+"]" + path.substr(wsPath.length);
          }
        }
      }
    }
    if (Path.sep === "\\" && !(path.substr(0,1) === "/" || path.substr(0,1) === "[")) {
      var drive = path.substr(0,1).toUpperCase();
      path = Path.sep+drive+"-drive"+path.substr(2);
    }
    path = path.replace(/\\/g, "/");
    return path;
  }
  
  function doProbe(path, cb) {
    if (!path) { return cb({ success: false, status: "illegal path" }); }
    Fs.stat(path, function(err, stats){
      if (err) {
        cb({ success: false, status: "err", err: err });
      } else {
        _fileIsBinary(path, stats.size, function(result) {
          if (result.success) {
            stats.isBinary = result.isBinary;
          }
          stats.url = "file://" + path.replace(/\\/g, "/");
          stats.name = Path.basename(path);
          stats.isFile = stats.isFile();
          stats.isDir = stats.isDirectory();
          stats.isLink = stats.isSymbolicLink();
          cb({ success: true, status: "ok", properties: stats });
        });
      }
    });
  }
  
  function doRead(path, encoding, cb) {
    if (!path) { return cb({ success: false, status: "illegal path" }); }
    if (typeof encoding !== "string") {
      encoding = "utf8";
    }
    if (path === "\\") {
      var command = "wmic logicaldisk get name";
      ChildProcess.exec(command, function(err, stdout, stderr){
        var out = {
          err: err,
          stdout: stdout,
          stderr: stderr
        };
        if (err) {
          out.success = false;
          out.status = "err";
          cb(out);
        } else {
          var drives = stdout.trim().split(/\s+/);
          drives.shift();
          var entriesLeft = drives.length;
          var entries = [];
          var forloop = function(name){
            doProbe(name, function(r){
              if (!r.properties) {
                r.properties = {};
              }
              r.properties.name = name.substr(0,1)+"-drive";
              entries.push(r.properties);
              entriesLeft--;
              if (entriesLeft === 0) {
                cb({ success: true, status: "drive list read", entries: entries });
              }
            });
          };
          for(var i=0;i<drives.length;i++){
            forloop(drives[i]);
          }
        }
      });
    } else {
      Fs.stat(path, function(err, stats){
        if (err) {
          cb({ success: false, status: "err", err: err });
        } else if (stats.isDirectory()) {
          Fs.readdir(path, function(err, names){
            if (err) {
              cb({ success: false, status: "err", err: err });
            } else {
              var entriesLeft = names.length;
              var entries = [];
              if (entriesLeft === 0) {
                cb({ success: true, status: "directory empty", entries: entries });
              }
              var forloop = function(name){
                doProbe(path+Path.sep+name, function(r){
                  if (r.properties) { entries.push(r.properties); }
                  entriesLeft--;
                  if (entriesLeft === 0) {
                    cb({ success: true, status: "directory read", entries: entries });
                  }
                });
              };
              for(var i=0;i<names.length;i++){
                forloop(names[i]);
              }
            }
          });
        } else {
          Fs.readFile(path, { encoding: encoding }, function(err, data){
            if (err) {
              cb({ success: false, status: "err", err: err });
            } else {
              cb({ success: true, status: "file read", data: data });
            }
          });
        }
      });
    }
  }
  
  function doWrite(path, data, encoding, cb) {
    if (!path) { return cb({ success: false, status: "illegal path" }); }
    if (typeof data !== "string") {
      Fs.mkdir(path, function(err){
        if (err) {
          if (err.code === "EEXIST") {
            Fs.stat(path, function(staterr, stats){
              if (!staterr && stats.isDirectory()) {
                cb({ success: true, status: "already created" });
              } else {
                cb({ success: false, status: "err", err: err });
              }
            });
          } else if (err.code === "ENOENT") {
            var parent = Path.dirname(path);
            doWrite(parent, null, null, function(){
              doWrite(path, null, null, cb);
            });
          } else {
            cb({ success: false, status: "err", err: err });
          }
        } else {
          cb({ success: true, status: "directory created" });
        }
      });
    } else {
      Fs.exists(path, function(exists){
        var status = "file "+(exists?"overwritten":"created");
        Fs.writeFile(path, data, { encoding: encoding }, function(err){
          if (err) {
            if (err.code === "ENOENT") {
              var parent = Path.dirname(path);
              doWrite(parent, null, null, function(){
                doWrite(path, data, encoding, cb);
              });
            } else {
              cb({ success: false, status: "err", err: err });
            }
          } else {
            if (Path.basename(path) === "config.json") {
              localStorage.setItem(whimPath(path, true), data);
              config = undefined;
            }
            cb({ success: true, status: status });
          }
        });
      });
    }
  }
  
  function doDelete(path, cb) {
    if (!path) { return cb({ success: false, status: "illegal path" }); }
    Fs.stat(path, function(err, stats) {
      if (err) {
        if (err.code === "ENOENT") {
          cb({ success: true, status: "nothing to delete" });
        } else {
          cb({ success: false, status: "err", err: err });
        }
      } else if(stats.isDirectory()) {
        var command = "rm -R '"+path+"'";
        if (process.platform === "win32") {
          command = 'rmdir /s /q "'+path+'"';
        }
        ChildProcess.exec(command, function(err, stdout, stderr){
          var out = {
            err: err,
            stdout: stdout,
            stderr: stderr
          };
          if (err) {
            out.success = false;
            out.status = "err";
          } else {
            out.success = true;
            out.status = "directory deleted";
          }
          cb(out);
        });
      } else {
        Fs.unlink(path, function(err){
          if (err) {
            cb({ success: false, status: "err", err: err });
          } else {
            cb({ success: true, status: "file deleted" });
          }
        });
      }
    });
  }
  
  function doRename(path, destination, cb) {
    if (!path) { return cb({ success: false, status: "illegal path" }); }
    if (path === destination || !destination) { return cb({ success: false, status: "illegal destination" }); }
    Fs.rename(path, destination, function(err){
      if (err) {
        cb({ success: false, status: "err", err: err });
      } else {
        cb({ success: true, status: "ok" });
      }
    });
  }
  
  function doCopy(path, destination, cb) {
    if (!path) { return cb({ success: false, status: "illegal path" }); }
    if (path === destination || !destination) { return cb({ success: false, status: "illegal destination" }); }
    Fs.stat(path, function(err, stats){
      if (err) {
        cb({ success: false, status: "err", err: err });
      } else if (stats.isDirectory()) {
        var command = "cp -R '"+path+"' '"+destination+"'";
        if (process.platform === "win32") {
          command = 'xcopy /e /i "'+path+'" "'+destination+'"';
        }
        ChildProcess.exec(command, function(err, stdout, stderr){
          var out = {
            err: err,
            stdout: stdout,
            stderr: stderr
          };
          if (err) {
            out.success = false;
            out.status = "err";
          } else {
            out.success = true;
            out.status = "directory copied";
          }
          cb(out);
        });
      } else {
        var reader = Fs.createReadStream(path);
        var writer = Fs.createWriteStream(destination);
        reader.on("error", function(err){
          cb({ success: false, status: "err", err: err });
        });
        reader.on("end", function(){
          cb({ success: true, status: "file copied" });
        });
        reader.pipe(writer);
      }
    });
  }
  
  function doRun(command, cb) {
    var _command = command;
    var _config = { timeout: 60000 };
    if (typeof command === "object") {
      _command = command[process.platform];
      if (!_command) {
        _command = command.command;
      }
      _config = command;
      if (!_config.timeout) {
        _config.timeout = 60000;
      }
    }
    if (_config.paths) {
      for (var name in _config.paths) {
        if (_config.paths.hasOwnProperty(name)) {
          var path = realPath(_config.paths[name]);
          while (_command.indexOf("&"+name+";") > -1) {
            _command = _command.replace("&"+name+";", path);
          }
        }
      }
    }
    ChildProcess.exec(_command, _config, function(err, stdout, stderr){
      var out = {
        err: err,
        stdout: stdout,
        stderr: stderr
      };
      if (err) {
        out.success = false;
        out.status = "err";
      } else {
        out.success = true;
        out.status = "ok";
      }
      cb(out);
    });
  }
  
  function doOpen(url, cb) {
    var path;
    if (url.substr(0,1) === "/" || url.substr(0,1) === "[") {
      path = realPath(url);
    }
    
    if (path) {
      Gui.Shell.openItem(path);
    } else {
      Gui.Shell.openExternal(url);
    }
    cb({ success: true, status: "ok" });
  }
  
  _init();
}());