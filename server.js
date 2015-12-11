var express = require('express'),
  app = express(),
  nedb = require('nedb'),
  fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');

var port = process.env.PORT || 80,
  SECRETKEY = '', //read from /{appfolder}/secret/key file
  nfieldapi = '', 
  apiSettings = {}, //read from /{appfolder}/secret/settings.json file
  APIuser = {}, //read from /{appfolder}/secret/apiuser.json file
  AutodownloadIntervals = {};

var request;

function translit(str) {
  var result = '';
  var en_to_ru = {
    'а': 'a',
    'б': 'b',
    'в': 'v',
    'г': 'g',
    'д': 'd',
    'е': 'e',
    'ё': 'jo',
    'ж': 'zh',
    'з': 'z',
    'и': 'i',
    'й': 'j',
    'к': 'k',
    'л': 'l',
    'м': 'm',
    'н': 'n',
    'о': 'o',
    'п': 'p',
    'р': 'r',
    'с': 's',
    'т': 't',
    'у': 'u',
    'ф': 'f',
    'х': 'h',
    'ц': 'c',
    'ч': 'ch',
    'ш': 'sh',
    'щ': 'sch',
    'ъ': '',
    'ы': 'y',
    'ь': '',
    'э': 'je',
    'ю': 'ju',
    'я': 'ja',
    ' ': '_',
    'і': 'i',
    'ї': 'i'
  };
  for (var i = 0; i < str.length; i++) {
    if (str.charAt(i).toLowerCase() in en_to_ru) {
      result = result + en_to_ru[str.charAt(i).toLowerCase()];
    } else {
      result = result + str.charAt(i).toLowerCase();
    }
  }
  return result;
}

function BytesToStuff(bytes, flag){
  
  var result = {
      'val' : 0,
      'measure' : ''
    },
    iter = 0,
    measure = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  result.val = bytes;
  result.measure = 'B';
  
  if (flag){
    return result;
  }
  
  while (result.val >= 1024) {
    result.val = result.val / 1024;
    iter++;
  }
  
  result.val = Math.round(result.val);
  result.measure = measure[iter];
  
  return result;
  
}
  
process.env.PWD = process.cwd();

/* **** CONFIGURING API SERVER **** */

APIuser = JSON.parse(fs.readFileSync(path.join('settings', 'apiuser.json'), 'utf8'));
apiSettings = JSON.parse(fs.readFileSync(path.join('settings', 'settings.json'), 'utf8'));

if (apiSettings.request && apiSettings.request.use) {
  request = require('request').defaults(apiSettings.request);
} else {
  request = require('request');
}

function recursiveMkdir (fullPath, root) {
  var fullPathArr = fullPath.split('/');
  var dir = fullPathArr.shift();
  
  try {
    fs.mkdirSync(path.join(root, dir));
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw new Error(err);
    }
  }
  
  return !fullPathArr.length || recursiveMkdir(fullPathArr.join('/'), root + '/' + dir);
  
}

if (typeof apiSettings.localDownloadFolder !== 'undefined' && apiSettings.localDownloadFolder !== '') {
  fs.stat(path.join(process.env.PWD, apiSettings.localDownloadFolder), function (err, stats) {
    if (err.code == 'ENOENT') {
      recursiveMkdir(apiSettings.localDownloadFolder, process.env.PWD);
    }
  });
}

nfieldapi = APIuser.server;

/* **** CONFIGURING APP **** */

function allowCrossDomain(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

  if ('OPTIONS' == req.method) {
    res.send(200);
  } else {
    next();
  }
}

SECRETKEY = fs.readFileSync(path.join('settings', 'key'), 'utf8');

// app.use(express.logger());

app.use(express.cookieParser());
app.use(express.session({ secret: SECRETKEY }));

app.use('/', express.static(path.join(process.env.PWD, 'pub', 'app')));

app.use('/database', express.directory(path.join(process.env.PWD, 'db')));

app.use('/downloads', express.directory(path.join(process.env.PWD, apiSettings.localDownloadFolder)));
app.use('/downloads', express.static(path.join(process.env.PWD, apiSettings.localDownloadFolder)));

app.use(allowCrossDomain);
app.use(express.bodyParser());

/* ****** LOADING DBs ****** */

var Users = new nedb({
  filename: path.join(process.env.PWD, 'db', 'users.db'),
  autoload: true
});

var Autodownloads = new nedb({
  filename: path.join(process.env.PWD, 'db', 'autodownloads.db'),
  autoload: true
});

var Downloads = new nedb({
  filename: path.join(process.env.PWD, 'db', 'downloads.db'),
  autoload: true
});

/* ****** PERSISTANT DB MINIFYING ****** */

Downloads.persistence.setAutocompactionInterval(30 * 60000);
Users.persistence.setAutocompactionInterval(60 * 60000);
Autodownloads.persistence.setAutocompactionInterval(120 * 60000);

/* **** STARTING SERVER **** */

var server = app.listen(port, function(){
  console.log('server listening to port ' + port);    
});

var io = require('socket.io').listen(server, { log: false });

/* **** DOWNLOAD FUNCTIONS **** */

// TODO: ДОБАВИТЬ '_FULL' В КОНЕЦ НАЗВАНИЯ ФАЙЛА, ЕСЛИ ЭТО ПОЛНАЯ ВЫГРУЗКА

var downloadLocally = function(dest, url, filename, cb){
  
  fs.mkdir(path.join(process.env.PWD, dest), function (e) {
    
    var tempFilename = filename.split('.');
    
    tempFilename = tempFilename[0] + '.tmp';
    
    if (e && e.code === 'EEXIST') {
      // console.log('Folder '' + dest + '' already exist');
    } else {
      console.log('Folder "' + dest + '" created');
    }
    
    var file = fs.createWriteStream(path.join(process.env.PWD, dest, tempFilename));
    
    var data = request(url);
    
    data.on('data', function (chunk) {
      file.write(chunk);
    });
    
    data.on('end', function () {
      file.end();
      
      fs.rename(
        path.join(process.env.PWD, dest, tempFilename),
        path.join(process.env.PWD, dest, filename),
        function(){
          
          if (apiSettings.createLocalDownloadLog) {
          
            var stat = fs.statSync(path.join(process.env.PWD, dest, filename)),
              size = {},
              logFile = fs.createWriteStream(path.join(process.env.PWD, dest, 'filedownload.log'), {'flags': 'a'}),
              now = new Date(stat.mtime),
              date = now.getFullYear() + '.' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '.' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate()),
              time = (now.getHours() < 10 ? '0' + now.getHours() : now.getHours()) + ':' + (now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes()) + ':' + (now.getSeconds() < 10 ? '0' + now.getSeconds() : now.getSeconds());
              
            size = BytesToStuff(stat.size, true);
            
            
            logFile.write(filename + '\t' + date + '\t' + time + '\t' + size.val + '\r\n');
            logFile.end();
          
          }
          
          if (typeof (cb) == 'function') cb();
        }
      );
    });
    
  });
};

var CheckDownload = function(ReqId, cb) {
  NFIELD.GetSpecificBackgroundTask(ReqId, function(error, response, body){

    if (response && response.statusCode == 200){
      body = JSON.parse(body);
      Downloads.update({ 'ReqBody.Id' : body.Id }, { $set: { ReqBody: body } }, {}, function(err, doc){
        Downloads.findOne({ 'ReqBody.Id' : body.Id }, function(err, doc){
          var tempDoc = doc,
            fileName = JSON.parse(doc.ReqBody.Parameters);
          
          if (tempDoc.Local === true && tempDoc.ReqBody.ResultUrl) {
            downloadLocally(apiSettings.localDownloadFolder, tempDoc.ReqBody.ResultUrl, (fileName.DownloadFileName + '.zip'));
          }
          
          Users.findOne({ name : doc.User.toLowerCase() }, function(err, doc){
            if (SocketClients[doc.socketId]){
              SocketClients[doc.socketId].emit('update download', tempDoc);
              if (tempDoc.ReqBody.Status !== 4){
                setTimeout(function(){
                  CheckDownload(ReqId);
                }, 1000);
              }
            } else {
              // console.warn('ERR:', doc.socketId, 'CAN NOT BE FOUND IN SOCKETS');
              if (tempDoc.ReqBody.Status !== 4){
                setTimeout(function(){
                  CheckDownload(ReqId);
                }, 1000);
              }
            }
          });
        });
      });
    } else if (response && response.statusCode == 404) {
      console.warn('Download is no longer avaliable!');
      if (typeof (cb) == 'function') cb();
    } else if (error) {
      console.trace('Error:', error);
      setTimeout(function(){
        CheckDownload(ReqId, cb);
      }, 60 * 1000);
    }
  });
};

var InitialDownloadsCheck = function(){
  Downloads.find({}, function(err, docs){
    if (apiSettings.checkDownloadsOnRun) {
    
      docs.forEach(function(e, i){
        if (e.ReqBody.Status !== 4) {
          CheckDownload(e.ReqBody.Id, function(){
            Downloads.remove({ _id: e._id }, {}, function(){
              console.log(e._id, 'deleted from DB');
            });
          });
        }
      });
    
    } else {
      
      docs.forEach(function(e, i){
        if (e.ReqBody.Status !== 4) {
          Downloads.remove({ _id: e._id }, {}, function(){
            console.log(e._id, 'deleted from DB');
          });
        }
      });

    }
  });
};

var StartAutodownload = function(id, cb){

  Autodownloads.findOne({ _id: id }, function(err, doc){

    var now = new Date(),
      today = now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
    
    doc.Settings.StartDate = today + 'T00:00:00Z';
    doc.Settings.EndDate = today + 'T23:59:59Z';
    
    doc.Settings.DownloadFileName = doc.Settings.DownloadFileName + ' ' + now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate()) + ' ' + (now.getHours() < 10 ? '0' + (now.getHours()) : (now.getHours())) + '-' + (now.getMinutes() < 10 ? '0' + (now.getMinutes()) : (now.getMinutes())) + '-' + (now.getSeconds() < 10 ? '0' + (now.getSeconds()) : (now.getSeconds()));
    doc.Settings.DownloadFileName = translit(doc.Settings.DownloadFileName);
    
    NFIELD.RequestDownload(doc.Settings, function(err, resp, body){
      if (resp) {
        
        Downloads.insert({
          User: doc.User.toLowerCase(),
          Local: doc.Settings.local,
          ProjectName: doc.Settings.DownloadFileName,
          ReqBody: body,
          ClientReqStatus: 0 // 0 - not yet downloaded, 1 - already downloaded by the client
        }, function(err, newDoc){
          Users.findOne({ name : doc.User.toLowerCase() }, function(err, doc){
            if (SocketClients[doc.socketId]){
              SocketClients[doc.socketId].emit('new download', { statusCode: 200, body: body });
            }
            CheckDownload(newDoc.ReqBody.Id);
          });
        });
        
        AutodownloadIntervals[doc._id] = setInterval(function(){
          
          Autodownloads.findOne({ _id: doc._id }, function(err, doc){
            
            // console.log(doc);
            
            var now = new Date(),
              today = now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
  
              doc.Settings.StartDate = today + 'T00:00:00Z';
              doc.Settings.EndDate = today + 'T23:59:59Z';
  
              doc.Settings.DownloadFileName = doc.Settings.DownloadFileName + ' ' + now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate()) + ' ' + (now.getHours() < 10 ? '0' + (now.getHours()) : (now.getHours())) + '-' + (now.getMinutes() < 10 ? '0' + (now.getMinutes()) : (now.getMinutes())) + '-' + (now.getSeconds() < 10 ? '0' + (now.getSeconds()) : (now.getSeconds()));
              doc.Settings.DownloadFileName = translit(doc.Settings.DownloadFileName);
  
              NFIELD.RequestDownload(doc.Settings, function(err, resp, body){
                      
                if (resp && resp.statusCode == 202) {
                  Downloads.insert({
                    User: doc.User.toLowerCase(),
                    Local: doc.Settings.local,
                    ProjectName: doc.Settings.DownloadFileName,
                    ReqBody: body,
                    ClientReqStatus: 0 // 0 - not yet downloaded, 1 - already downloaded by the client
                  }, function(err, newDoc){
                    Users.findOne({ name: doc.User.toLowerCase() }, function(err, doc){
                      if (SocketClients[doc.socketId]){
                        SocketClients[doc.socketId].emit('new download', { statusCode: 200, body: body });
                      }
                      CheckDownload(newDoc.ReqBody.Id);
                    });
                  });
                } else if (resp) {
                  console.trace('Error %d:', resp.statusCode, body);
                } else if (err) {
                  console.trace('Error:', err);
                }
                
              });
          });
                  
        }, doc.Settings.autotime * 60 * 1000);
        
        Autodownloads.update({ _id: doc._id }, { $set: { Status: 1 } }, {}, function(err){
          Autodownloads.findOne({ _id: doc._id }, function(err, doc){
            var tempDoc = doc;
            Users.findOne({ name: doc.User.toLowerCase() }, function(err, doc){
              if (SocketClients[doc.socketId]){
                SocketClients[doc.socketId].emit('update autodownload', { statusCode: 200, body: tempDoc });
              }
            });
            if (typeof (cb) == 'function') cb();
          });
        });
      
      } else if (err) {
        console.trace('Error:', err);
        setTimeout(function(){
          StartAutodownload(id, cb);
        }, 60 * 1000);
      }
      
    });
  });
};

var InitialAutodownloadsCheck = function(){
  Autodownloads.find({ }, function(err, docs){
    
    docs.forEach(function(doc, i){
      
      if (!apiSettings.startAutodownloadsOnRun) {
        
        Autodownloads.findOne({ _id: doc._id }, function(err, doc){
          Autodownloads.update({ _id: doc._id }, { $set: { Status: 0 } }, {});
        });
        
      } else {
      
        if (doc.Status === 1) {
      
          var now = new Date(),
            today = now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
          
          doc.Settings.StartDate = today + 'T00:00:00Z';
          doc.Settings.EndDate = today + 'T23:59:59Z';
          
          doc.Settings.DownloadFileName = doc.Settings.DownloadFileName + ' ' + now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate()) + ' ' + (now.getHours() < 10 ? '0' + (now.getHours()) : (now.getHours())) + '-' + (now.getMinutes() < 10 ? '0' + (now.getMinutes()) : (now.getMinutes())) + '-' + (now.getSeconds() < 10 ? '0' + (now.getSeconds()) : (now.getSeconds()));
          doc.Settings.DownloadFileName = translit(doc.Settings.DownloadFileName);
          
          NFIELD.RequestDownload(doc.Settings, function(err, resp, body){
            
            if (resp && resp.statusCode == 202) {
              Downloads.insert({
                User: doc.User.toLowerCase(),
                Local: doc.Settings.local,
                ProjectName: doc.Settings.DownloadFileName,
                ReqBody: body,
                ClientReqStatus: 0 // 0 - not yet downloaded, 1 - already downloaded by the client
              }, function(err, newDoc){
                Users.findOne({ name: doc.User.toLowerCase() }, function(err, doc){
                  if (SocketClients[doc.socketId]){
                    SocketClients[doc.socketId].emit('new download', { statusCode: 200, body: body });
                  }
                  CheckDownload(newDoc.ReqBody.Id);
                });
              });
              
              AutodownloadIntervals[doc._id] = setInterval(function(){
                
                Autodownloads.findOne({ _id: doc._id }, function(err, doc){
                  
                  var now = new Date(),
                    today = now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
        
                  doc.Settings.StartDate = today + 'T00:00:00Z';
                  doc.Settings.EndDate = today + 'T23:59:59Z';
        
                  doc.Settings.DownloadFileName = doc.Settings.DownloadFileName + ' ' + now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate()) + ' ' + (now.getHours() < 10 ? '0' + (now.getHours()) : (now.getHours())) + '-' + (now.getMinutes() < 10 ? '0' + (now.getMinutes()) : (now.getMinutes())) + '-' + (now.getSeconds() < 10 ? '0' + (now.getSeconds()) : (now.getSeconds()));
                  doc.Settings.DownloadFileName = translit(doc.Settings.DownloadFileName);
        
                  NFIELD.RequestDownload(doc.Settings, function(err, resp, body){
                            
                    if (resp && resp.statusCode == 202) {
                      Downloads.insert({
                        User: doc.User.toLowerCase(),
                        Local: doc.Settings.local,
                        ProjectName: doc.Settings.DownloadFileName,
                        ReqBody: body,
                        ClientReqStatus: 0 // 0 - not yet downloaded, 1 - already downloaded by the client
                      }, function(err, newDoc){
                        
                        Users.findOne({ name: doc.User.toLowerCase() }, function(err, doc){
                          if (SocketClients[doc.socketId]){
                            SocketClients[doc.socketId].emit('new download', { statusCode: 200, body: body });
                          }
                          CheckDownload(newDoc.ReqBody.Id);
                        });
                        
                      });
                    } else if (resp) {
                      console.trace('Error %d:', resp.statusCode, body);
                    } else if (err) {
                      console.trace('Error:', err);
                    }
                    
                  });
                  
                });
                        
              }, doc.Settings.autotime * 60 * 1000);
            } else if (resp) {
              
              console.trace('Error %d:', resp.statusCode, body);
              
              Autodownloads.findOne({ _id: doc._id }, function(err, doc){
                Autodownloads.update({ _id: doc._id }, { $set: { Status: 0 } }, {}, function(err){
                  Autodownloads.findOne({ _id: doc._id }, function(err, doc){
                    var tempDoc = doc;
                    Users.findOne({ name: doc.User.toLowerCase() }, function(err, doc){
                      if (SocketClients[doc.socketId]){
                        SocketClients[doc.socketId].emit('update autodownload', { statusCode: 200, body: tempDoc });
                      }
                    });
                  });
                });
              });
              
            } else if (err) {
              
              console.trace('Error:', err);
              
              Autodownloads.findOne({ _id: doc._id }, function(err, doc){
                Autodownloads.update({ _id: doc._id }, { $set: { Status: 0 } }, {}, function(err){
                  Autodownloads.findOne({ _id: doc._id }, function(err, doc){
                    var tempDoc = doc;
                    Users.findOne({ name: doc.User.toLowerCase() }, function(err, doc){
                      if (SocketClients[doc.socketId]){
                        SocketClients[doc.socketId].emit('update autodownload', { statusCode: 200, body: tempDoc });
                      }
                    });
                  });
                });
              });
              
            }
            
          });
        
        }
      
      }
    
    });
    
  });
};

/* **** NFIELD API REQs **** */

var NFIELD = {
  SignIn : function(login, password, cb){
    request({
        url: nfieldapi + 'v1/SignIn',
      method: 'POST',
      json: {
        'Domain': APIuser.domain,
        'Username': login,
        'Password': password
      }
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  GetSurveyList : function(cb){
    request({
      url: nfieldapi + 'v1/Surveys',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      }
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  GetSurveyStatus : function(id, cb){
    request({
      url: nfieldapi + 'v1/Surveys/' + id + '/Fieldwork/Status',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  GetInterviewersList : function(cb){
    request({
      url: nfieldapi + 'v1/Interviewers',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  GetBackgroundTasks : function(cb){
    request({
      url: nfieldapi + 'v1/BackgroundTasks',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  GetSpecificBackgroundTask : function(id, cb){
    request({
      url: nfieldapi + 'v1/BackgroundTasks/' + id,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  RequestDownload : function(options, cb){
    request({
      url: nfieldapi + 'v1/Surveys/' + options.SurveyId + '/Data',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
      json: {
        'SurveyId': options.SurveyId,
        'DownloadTestInterviewData': options.DownloadTestInterviewData,
        'DownloadSuccessfulLiveInterviewData': options.DownloadSuccessfulLiveInterviewData,
        'DownloadRejectedLiveInterviewData': options.DownloadRejectedLiveInterviewData,
        'DownloadNotSuccessfulLiveInterviewData': options.DownloadNotSuccessfulLiveInterviewData,
        'DownloadSuspendedLiveInterviewData': options.DownloadSuspendedLiveInterviewData,
        'DownloadParaData': options.DownloadParaData,
        'DownloadCapturedMedia': options.DownloadCapturedMedia,
        'DownloadClosedAnswerData': options.DownloadClosedAnswerData,
        'DownloadOpenAnswerData': options.DownloadOpenAnswerData,
        'DownloadFileName': options.DownloadFileName,
        'StartDate': options.StartDate,
        'EndDate': options.EndDate
      }
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  GetInterviewersForSurvey : function(surveyId, cb){
    request({
      url: nfieldapi + 'v1/Surveys/' + surveyId + '/Interviewers',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  AddInterviewerToSurvey : function(surveyId, interviewerId, cb){
    request({
      url: nfieldapi + 'v1/Surveys/' + surveyId + '/Interviewers',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
      json: {
        'InterviewerId': interviewerId
      }
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  AssignInterviewerToSurvey : function(surveyId, interviewerId, cb){
    request({
      url: nfieldapi + 'v1/Surveys/' + surveyId + '/Assignment',
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
      json: {
        'InterviewerId': interviewerId,
        'Assign': true
      }
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  GetQuotaForSurvey : function(surveyId, cb){
    request({
      url: nfieldapi + 'v1/Surveys/' + surveyId + '/Quota',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  SetQuotaForSurvey : function(surveyId, quota, cb){
    request({
      url: nfieldapi + 'v1/Surveys/' + surveyId + '/Quota',
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
      json: quota
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  },
  CreateInterviewer : function(interviewer, cb) {
    request({
      url: nfieldapi + 'v1/Interviewers',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + APIuser.token
      },
      json: interviewer
    }, function (error, response, body) {
      if (typeof (cb) == 'function') cb(error, response, body);
    });
  }
};

var GenerateInterviewersList = function(cb){
  NFIELD.GetInterviewersList(function(err, res, body){
    if (err) {
      console.trace('Error:', err);
    } else if (res) {
      if (res.statusCode == 200){
        if (typeof body == 'string'){
          body = JSON.parse(body);
        }
        
        var wStreamDAT = fs.createWriteStream(path.join(process.env.PWD, apiSettings.localDownloadFolder, 'interviewers.dat')),
          wStreamSPS = fs.createWriteStream(path.join(process.env.PWD, apiSettings.localDownloadFolder, 'interviewers.sps'));
        
        var text = '',
          data = '',
          login = '',
          name = '';
        
        data = 'STRING SRVYR  (A25). \r\n';
        data += 'RECODE INTERNR\r\n';
        
        body.forEach(function(e, i){
          
          login = e.UserName;
          name = (e.FirstName + ' ' + e.LastName).replace('\t',' ');
          
          for (var j = e.UserName.length; j <= 100; j++){
            login = login + ' ';
          }
          
          text += e.ClientInterviewerId + login  + name + '\r\n';
          data += '  (\'' + e.ClientInterviewerId + '\' = \'' + e.UserName + '\')' + '\r\n';
          
        });
        
        data += '  INTO SRVYR.\r\n';
        data += 'IF RTRIM (SRVYR)=\'\' SRVYR=INTERNR.\r\n';
        data += 'EXE.\r\n';
        
        wStreamDAT.write(text);
        wStreamSPS.write(data);
        
        wStreamDAT.end(function(){
          wStreamSPS.end(function() {
            if (typeof (cb) == 'function') cb();
          });
        });
        
      } else {
        console.trace('Error %d:', res.statusCode, body);
      }
    }
  });
};

/* ******** INITIATING SIGN IN CYCLE ******** */

function SignInToApi(user, password, callback){
  NFIELD.SignIn(user, password, function(err, resp, body){
    if (err) {
      
      console.trace('Error:', err);
      
      setTimeout(function() {
        SignInToApi(user, password, callback);
      }, 60 * 1000);
      
    } else if (resp) {
      if (resp.statusCode == 200){
        
        if (typeof (callback) == 'function') callback(err, resp, body);
        
      } else {
        
        console.trace('Error %d: ', resp.statusCode, body);
        
      }
    }
  });   
}

var SysIntervals = {
  GenerateInterviewersListInterval: {},
  LogInInterval: {}
};

SignInToApi(APIuser.user, APIuser.password, function(err, resp, body){
  APIuser.token = body.AuthenticationToken;
  
  InitialDownloadsCheck();
  
  InitialAutodownloadsCheck();
  
  if (apiSettings.generateInterviewersList) {
    
    GenerateInterviewersList(function(){
      console.log('Interviewers lists generated');
      
      SysIntervals.GenerateInterviewersListInterval = setInterval(function(){
        GenerateInterviewersList(function(){
          console.log('Interviewers lists generated');
        });
      }, 60 * 60 * 1000);
      
    });
    
  }
  
  SysIntervals.LogInInterval = setInterval(function(){
    SignInToApi(APIuser.user, APIuser.password, function(err, resp, body){
      APIuser.token = body.AuthenticationToken;
    });
  }, 12 * 60000);
});

/* **** WEB APP API **** */

app.get('/api/v1/session', function(req, res, next){
  if (req.session.name && req.session.token) {
    Users.findOne({ name: req.session.name.toLowerCase() }, function(err, doc){
      if (doc && doc.token == req.session.token) {
        res.send({ name: req.session.name.toLowerCase(), token: req.session.token });
      } else {
        res.send(false);
      }
    });
  } else {
    res.send(false);
  }
});

app.get('/api/v1/login', function(req, res, next){
  if (req.query.name && req.query.password){
    NFIELD.SignIn(req.query.name, req.query.password, function(err, resp, body){
      if (err) {
        
        console.trace('Error:', err);
        res.send({ statusCode: 503, message: err});
        
      } else if (resp) {
        
        body.statusCode = resp.statusCode;
        
        if (resp.statusCode == 200){
          body.name = req.query.name;
          req.session.name = req.query.name;
          req.session.token = body.AuthenticationToken;
          Users.findOne({ name: req.query.name.toLowerCase() }, function(err, doc){
            if (doc) {
              Users.update({ _id: doc._id }, { $set: { token: body.AuthenticationToken } }, {});
            } else {
              Users.insert({
                name:  req.query.name.toLowerCase(),
                token: body.AuthenticationToken,
                requests: [],
                socketId: ' '
              });
            }
          });
        } else {
          body.message = 'Somethig went wrong while trying to log in, try to reload';
        }
        
        res.send(body);
        
      }
      
    });
  }
});

app.get('/api/v1/downloads', function(req, res, next){
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    Downloads.find({ User: req.session.name.toLowerCase() }, function(err, docs){
      res.send({ statusCode: 200, body: docs });
    });
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.get('/api/v1/survey/list', function(req, res, next){
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    NFIELD.GetSurveyList(function(err, resp, body){
      if (err) {
        
        console.trace('Error:', err);
        res.send({ statusCode: 503, message: err});
        
      } else if (resp) {
        if (resp.statusCode == 200){
          res.send({ statusCode: resp.statusCode, body: JSON.parse(body) });
        } else {
          res.send({ statusCode: resp.statusCode, message: 'Somethig went wrong while trying to get survey list, try to reload'});
        }
      }
    });
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.get('/api/v1/survey/status/:id', function(req, res, next){
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    if (req.params.id) {
      NFIELD.GetSurveyStatus(req.params.id, function(err, resp, body){
        if (err) {
          console.trace('Error:', err);
          res.send({ statusCode: 503, message: err});
        } else if (resp) {
          res.send({ statusCode: resp.statusCode, body: body});
        }
      });
    }
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.post('/api/v1/downloadrequest/:id', function(req, res, next){
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    if (req.params.id) {
      
      var tempName = req.body.DownloadFileName,
        now = new Date(),
        today = now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
      
      if (req.body.auto) {
        
        req.body.StartDate = today + 'T00:00:00Z';
        req.body.EndDate = today + 'T23:59:59Z';
        
        req.body.DownloadFileName = tempName + ' ' + now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate()) + ' ' + (now.getHours() < 10 ? '0' + (now.getHours()) : (now.getHours())) + '-' + (now.getMinutes() < 10 ? '0' + (now.getMinutes()) : (now.getMinutes())) + '-' + (now.getSeconds() < 10 ? '0' + (now.getSeconds()) : (now.getSeconds()));
        req.body.DownloadFileName = translit(req.body.DownloadFileName);
        
        NFIELD.RequestDownload(req.body, function(err, resp, body){
          if (err) {
            
            console.trace('Error:', err);
            res.send({ statusCode: 503, message: 'Somethig went wrong while trying to download "' + tempName + '"'});
            
          } else if (resp) {
          
            if (resp.statusCode == 202) {
              
              res.send({ statusCode: 200, body: body });
              req.body.DownloadFileName = tempName;
              
              Downloads.insert({
                User: req.session.name.toLowerCase(),
                Local: req.body.local,
                ProjectName: tempName,
                ReqBody: body,
                ClientReqStatus: 0 // 0 - not yet downloaded, 1 - already downloaded by the client
              }, function(err, newDoc){
                
                CheckDownload(newDoc.ReqBody.Id);
                
              });
              
              Autodownloads.insert({
                User: req.session.name.toLowerCase(),
                Status: 1, //1 - going, 0 - paused
                Settings: req.body
              }, function(err, doc){
                
                var DownloadInterval = setInterval(function(){
  
                  Autodownloads.findOne({ _id: doc._id }, function(err, doc){
                    
                    var now = new Date(),
                      today = now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
                      
                    doc.Settings.StartDate = today + 'T00:00:00Z';
                    doc.Settings.EndDate = today + 'T23:59:59Z';
                    
                    doc.Settings.DownloadFileName = doc.Settings.DownloadFileName + ' ' + now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate()) + ' ' + (now.getHours() < 10 ? '0' + (now.getHours()) : (now.getHours())) + '-' + (now.getMinutes() < 10 ? '0' + (now.getMinutes()) : (now.getMinutes())) + '-' + (now.getSeconds() < 10 ? '0' + (now.getSeconds()) : (now.getSeconds()));
                    doc.Settings.DownloadFileName = translit(doc.Settings.DownloadFileName);
                    
                    NFIELD.RequestDownload(doc.Settings, function(err, resp, body){
                      
                      if (resp && resp.statusCode == 202) {
                        Downloads.insert({
                          User: req.session.name.toLowerCase(),
                          Local: req.body.local,
                          ProjectName: tempName,
                          ReqBody: body,
                          ClientReqStatus: 0 // 0 - not yet downloaded, 1 - already downloaded by the client
                        }, function(err, newDoc){
                          
                          Users.findOne({ name: req.session.name.toLowerCase() }, function(err, doc){
                            if (SocketClients[doc.socketId]){
                              SocketClients[doc.socketId].emit('new download', { statusCode: 200, body: body });
                            }
                            CheckDownload(newDoc.ReqBody.Id);
                          });
                        });
                      } else if (err) {
                        console.trace('Error:', err);
                      }
                      
                    });
                    
                  });
                  
                }, req.body.autotime * 60 * 1000);
                
                AutodownloadIntervals[doc._id] = DownloadInterval;
                
                var tempDoc = doc;
                
                Users.findOne({ name: req.session.name.toLowerCase() }, function(err, doc){
                  if (SocketClients[doc.socketId]){
                    SocketClients[doc.socketId].emit('new autodownload', { statusCode: 200, body: tempDoc });
                  }
                });
              });
              
            } else if (resp.statusCode == 400) {
              
              var resBody = '';
              
              if (body.hasOwnProperty('filter')) {
                resBody = body.filter;
              }
              if (body.hasOwnProperty('file name')) {
                resBody = body['file name'];
              }
              if (body.hasOwnProperty('startDate')) {
                resBody = body.startDate;
              }
              if (body.hasOwnProperty('endDate')) {
                resBody = body.endDate;
              }
              
              res.send({ statusCode: 400, message: resBody });
              
            }
          }
        });
      } else {
        
        req.body.DownloadFileName = tempName + ' ' + now.getFullYear() + '-' + ((now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1)) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate()) + ' ' + (now.getHours() < 10 ? '0' + (now.getHours()) : (now.getHours())) + '-' + (now.getMinutes() < 10 ? '0' + (now.getMinutes()) : (now.getMinutes())) + '-' + (now.getSeconds() < 10 ? '0' + (now.getSeconds()) : (now.getSeconds()));
        req.body.DownloadFileName = translit(req.body.DownloadFileName);
        
        if (req.body.StartDate != '' || req.body.EndDate != '') {
        
          req.body.StartDate = req.body.StartDate + 'T00:00:00Z';
          req.body.EndDate = req.body.EndDate + 'T23:59:59Z';
          
        }
        
        console.log(req.body.StartDate, req.body.EndDate);
        
        NFIELD.RequestDownload(req.body, function(err, resp, body){
          if (err) {
            
            console.trace('Error:', err);
            res.send({ statusCode: 503, message: 'Somethig went wrong while trying to download "' + tempName + '"'});
            
          } else if (resp) {
            if (resp.statusCode == 202) {
              res.send({ statusCode: 200, body: body });
              Downloads.insert({
                User: req.session.name.toLowerCase(),
                Local: req.body.local,
                ProjectName: tempName,
                ReqBody: body,
                ClientReqStatus: 0 // 0 - not yet downloaded, 1 - already downloaded by the client
              }, function(err, newDoc){
                CheckDownload(newDoc.ReqBody.Id);
              });
            } else if (resp.statusCode == 400) {
              var resBody = '';
              
              if (body.hasOwnProperty('filter')) {
                resBody = body.filter;
              }
              if (body.hasOwnProperty('file name')) {
                resBody = body['file name'];
              }
              if (body.hasOwnProperty('startDate')) {
                resBody = body.startDate;
              }
              if (body.hasOwnProperty('endDate')) {
                resBody = body.endDate;
              }
              
              res.send({ statusCode: 400, message: resBody });
            }
          }
        });
      }
    }
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.get('/api/v1/autodownloads', function(req, res, next){
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    Autodownloads.find({ User: req.session.name.toLowerCase() }, function(err, docs){
      res.send({ statusCode: 200, body: docs });
    });
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.post('/api/v1/autodownloads/:action/:id', function(req, res, next){
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    if (req.params.id){
      switch (req.params.action){
        case 'start':
          StartAutodownload(req.params.id, function(){
            res.send({ statusCode: 200 });
          });
          break;
        case 'pause':
          Autodownloads.findOne({ _id: req.params.id }, function(err, doc){
            clearInterval(AutodownloadIntervals[req.params.id]);
            Autodownloads.update({ _id: req.params.id }, { $set: { Status: 0 } }, {}, function(err){
              Autodownloads.findOne({ _id: req.params.id }, function(err, doc){
                var tempDoc = doc;
                Users.findOne({ name: req.session.name.toLowerCase() }, function(err, doc){
                  if (SocketClients[doc.socketId]){
                    SocketClients[doc.socketId].emit('update autodownload', { statusCode: 200, body: tempDoc });
                  }
                  res.send({ statusCode: 200 });
                });
              });
            });
          });
          break;
        case 'stop':
          Autodownloads.findOne({ _id: req.params.id }, function(err, doc){
            clearInterval(AutodownloadIntervals[req.params.id]);
            delete AutodownloadIntervals[req.params.id];
            Autodownloads.remove({ _id: req.params.id }, function(){
              res.send({ statusCode: 200 });
            });
          });
          break;
      }
    }
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.post('/api/v1/:id/interviewers/getstatus', function(req, res, next){
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    
    res.send({ statusCode: 200 });
    
    if (typeof req.body == 'string'){
      req.body = JSON.parse(req.body);
    }
    
    var arrayOfInterviewers = req.body,
      surveyId = req.params.id;
      
    Users.findOne({ name: req.session.name.toLowerCase() }, function(err, doc){
      
      NFIELD.GetInterviewersList(function(err, responce, body){
        if (err) {
          console.trace('Error:', err);
        } else if (responce) {
          if (responce.statusCode == 200){
            if (typeof body == 'string'){
              body = JSON.parse(body);
            }
            
            for (var j = arrayOfInterviewers.length - 1; j >= 0; j--) {
              arrayOfInterviewers[j].IsChecked = true;
              for (var i = body.length - 1; i >= 0; i--) {
                if (body[i].UserName.toUpperCase() === arrayOfInterviewers[j].UserName.toUpperCase()) {
                  arrayOfInterviewers[j].InterviewerId = body[i].InterviewerId;
                  break;
                }
              }
            }
            
            NFIELD.GetInterviewersForSurvey(surveyId, function(err, responce, body){
              if (typeof body == 'string'){
                body = JSON.parse(body);
              }
              
              for (var j = arrayOfInterviewers.length - 1; j >= 0; j--) {
                for (var i = body.length - 1; i >= 0; i--) {
                  if (body[i].InterviewerId === arrayOfInterviewers[j].InterviewerId) {
                    arrayOfInterviewers[j].IsOnProject = true;
                    arrayOfInterviewers[j].IsAssigned = body[i].IsAssigned;
                    break;
                  } else if (body[i].InterviewerId !== arrayOfInterviewers[j].InterviewerId && i === 0) {
                    arrayOfInterviewers[j].IsOnProject = false;
                    arrayOfInterviewers[j].IsAssigned = false;
                  }
                }
                
                if (SocketClients[doc.socketId]){
                  SocketClients[doc.socketId].emit('update interviewer', arrayOfInterviewers[j]);
                }
              }
              
            });
  
          }
        }
      });
    
    });
    
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.post('/api/v1/survey/add/:surveyId/:interviewerId', function(req, res, next) {
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    NFIELD.AddInterviewerToSurvey(req.params.surveyId, req.params.interviewerId, function(err, responce, body){
      res.send({ statusCode: responce.statusCode });
    });
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.post('/api/v1/survey/assign/:surveyId/:interviewerId', function(req, res, next) {
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    NFIELD.AssignInterviewerToSurvey(req.params.surveyId, req.params.interviewerId, function(err, responce, body){
      res.send({ statusCode: responce.statusCode });
    });
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

app.post('/api/v1/interviewer/create', function(req, res, next){
  if (req.headers.authorization.split(' ')[1] == req.session.token){
    NFIELD.CreateInterviewer(req.body, function(err, responce, body){
      if (body && !body.NfieldErrorCode) {
        res.status(200).send(body);
      } else {
        res.status(204).send('User already exists');
      }
    });
  } else {
    res.send({ statusCode: 401, message: 'Access denied'});
  }
});

/* **** SOCKETS STUFF **** */

var SocketClients = {};

io.sockets.on('connection', function (socket) {
  
  SocketClients[socket.id] = socket;
  
  socket.emit('ping');
  
  socket.on('loggedin', function(data){
    Users.findOne({ name: data.name.toLowerCase() }, function(err, doc){
      if (doc && doc.token == data.AuthenticationToken) {
        console.log('%s (%s) connected', doc.name, socket.id);
        Users.update({ _id: doc._id}, { $set: { socketId: socket.id } }, {});
      }
    });
    
  });
  
  socket.on('pong', function(){
    
    setTimeout(function() {
      socket.emit('ping');
    }, 5 * 60 * 1000);
    
  });
  
  /* *********************** */
  
  socket.on('disconnect', function () {
    
    Users.findOne({ socketId: socket.id }, function(err, doc){
      if (doc && doc.name) {
        console.log('%s (%s) disconnected', doc.name, socket.id);
      }
      delete SocketClients[socket.id];
    });
    
  });
  
});