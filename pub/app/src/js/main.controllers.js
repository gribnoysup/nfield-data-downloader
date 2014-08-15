var appControllers = angular.module('app-controllers', []);

appControllers.controller("UserCtrl", ["$scope", "Socket", "Global", "API", function($scope, Socket, Global, API){
    
    var sckt = Socket;
    var api = API;
    
    $scope.glbl = Global;
    $scope.error = {};
    
    sckt.on('ping', function(){
        console.log('ping');
        
        setTimeout(function() {
            sckt.emit('pong');
        }, 1 * 60 * 1000);
        
    });
    
    api.CheckSession().success(function(data){
        if (data !== "false"){
            $scope.glbl.User = data.name;
            $scope.glbl.Token = data.token;
            sckt.emit("loggedin", {
                name: data.name,
                AuthenticationToken: data.token
            });
            api.GetSurveyList().success(function(data){
                if (data.statusCode == 200){
                    $scope.glbl.Surveys = data.body;
                } else {
                    $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
                }
            });
            api.GetDownloadsList().success(function(data){
                if (data.statusCode == 200){
                    console.log($scope.glbl.Downloads);
                    data.body.forEach(function(e, i){
                        e.ReqBody.Parameters = JSON.parse(e.ReqBody.Parameters);
                        console.log(e.ReqBody);
                        $scope.glbl.Downloads.push(e.ReqBody);
                    });
                } else {
                    $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
                }
            });
            api.GetAutodownloadsList().success(function(data){
                if (data.statusCode == 200){
                    data.body.forEach(function(e, i){
                        console.log(e);
                        $scope.glbl.Autodownloads[e._id] = e;
                    });
                } else {
                    $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
                }
            });
        }
    });
    
    $scope.SignIn = function(cred){
        api.SignIn(cred).success(function(data){
            if (data.statusCode == 200 ) {
                $scope.glbl.User = data.name;
                $scope.glbl.Token = data.AuthenticationToken;
                
                sckt.emit("loggedin", {
                    name: data.name,
                    AuthenticationToken: data.AuthenticationToken
                });
                api.GetSurveyList().success(function(data){
                    if (data.statusCode == 200){
                        $scope.glbl.Surveys = data.body;
                    } else {
                        $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
                    }
                });
                api.GetDownloadsList().success(function(data){
                    if (data.statusCode == 200){
                        data.body.forEach(function(e, i){
                            e.ReqBody.Parameters = JSON.parse(e.ReqBody.Parameters);
                            console.log(e.ReqBody);
                            $scope.glbl.Downloads.push(e.ReqBody);
                        });
                        $scope.glbl.Downloads;
                    } else {
                        $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
                    }
                });
                api.GetAutodownloadsList().success(function(data){
                    if (data.statusCode == 200){
                        data.body.forEach(function(e, i){
                            console.log(e);
                            $scope.glbl.Autodownloads[e._id] = e;
                        });
                    } else {
                        $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
                    }
                });
            } else {
                $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
            }
        });
    };
    
    $scope.LogOut = function(){
        api.GetSurveyList().success(function(data){
            if (data.statusCode == 200){
                $scope.glbl.Surveys = data.body;
            }
            console.log(data);
        });
    };
    
}]);

appControllers.controller("SurveyListCtrl", ["$scope", "Socket", "Global", "API", "$rootScope", function($scope, Socket, Global, API, $rootScope){
    
    $scope.$watch('options.SurveyId', function(newVal){
        if (newVal || $scope.selectedOption) {
            $rootScope.blurred = true;
        } else {
            $rootScope.blurred = false;
        }
    });
    
    $scope.$watch('selectedOption', function(newVal){
        if (newVal || $scope.options.SurveyId) {
            $rootScope.blurred = true;
        } else {
            $rootScope.blurred = false;
        }
    });
    
    var api = API,
        today = new Date();
    
    $scope.glbl = Global;
    
    $scope.SurveyTypes = [
        {value: 0, name: "HIDE", count: 0},
        {value: 1, name: "Started", count: 0},
        {value: 2, name: "HIDE", count: 0},
        {value: 3, name: "Closed", count: 0},
        {value: 4, name: "Finished", count: 0}
    ];
    
    $scope.OptionsList = ["Downloads", "Assign interviewers", "Quota"];
    
    $scope.filter = { 'Status' : 1 };
    
    $scope.options = {
        "SurveyId" : "",
        "DownloadFileName" : "",
        "DownloadTestInterviewData": false, 
        "auto": false, 
        "DownloadSuccessfulLiveInterviewData": false, 
        "DownloadNotSuccessfulLiveInterviewData": false, 
        "DownloadSuspendedLiveInterviewData": false, 
        "autotime": 15, 
        "local": false, 
        "DownloadParaData": false, 
        "DownloadCapturedMedia": false, 
        "DownloadClosedAnswerData": false, 
        "DownloadOpenAnswerData": false, 
        "allData": true, 
        "StartDate": today.getFullYear() + "-" + ((today.getMonth() + 1) < 10 ? "0" + (today.getMonth() + 1) : (today.getMonth() + 1)) + "-" + (today.getDate() < 10 ? "0" + today.getDate() : today.getDate()), 
        "EndDate": today.getFullYear() + "-" + ((today.getMonth() + 1) < 10 ? "0" + (today.getMonth() + 1) : (today.getMonth() + 1)) + "-" + (today.getDate() < 10 ? "0" + today.getDate() : today.getDate())
    };
    
    var updateStatus = function(){
        $scope.disabled = {
            UnderConstruction: 0,
            Started: 0,
            Closed: 0,
            Finished: 0
        };
        $scope.glbl.Surveys.forEach(function(e,i){
            api.GetSurveyStatus(e.SurveyId).success(function(data){
                if (data.statusCode == 200){
                    e.Status = data.body;
                    $scope.SurveyTypes[data.body].count++;
                } else {
                    $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
                }
            });
        });
    };
    
    $scope.$watch('glbl.Surveys', function(newVal, oldVal){
        console.log("survey list has changed!");
        updateStatus();
    });
    
    $scope.requestDownload = function(options){
        
        if (options.allData) {
            options.StartDate = "";
            options.EndDate = "";
        }
        
        api.RequestDownload($scope.options).success(function(data){
            if (data.statusCode == 200){
                data.body.Parameters = JSON.parse(data.body.Parameters);
                $scope.glbl.Downloads.push(data.body);
            } else {
                $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
            }
        });
    };
    
}]);

appControllers.controller("ErrorsCtrl", ["$scope", "Global", function($scope, Global){
    
    $scope.glbl = Global;
    
    $scope.hideError = function(arrElem){
        var i = $scope.glbl.Errors.indexOf(arrElem);
        if (i !== -1) {
            $scope.glbl.Errors.splice(i, 1);
        }
    };
    
}]);

appControllers.controller("DownloadsCtrl", ["$scope", "Global", "Socket", "API", "jqDownload", function($scope, Global, Socket, API, jqDownload){
    
    var sckt = Socket;
    
    $scope.glbl = Global;
    $scope.orderSelector = '';
    $scope.asc = true;
    
    $scope.order = function(order){
        if ($scope.orderSelector === order){
            $scope.asc = !$scope.asc;
        } else {
            $scope.orderSelector = order;
        }
    };
    
    sckt.on('update download', function(data){
        
        if (data.ClientReqStatus === 0 && data.ReqBody.Status === 4 && $scope.glbl.ClientSettings.ClientAutodownload){
            jqDownload.start(data.ReqBody.ResultUrl).done(console.log("YAY!"));
        }
        
        data.ReqBody.Parameters = JSON.parse(data.ReqBody.Parameters);
        
        $scope.glbl.Downloads.forEach(function(e, i){
            if (e.Id == data.ReqBody.Id) {
                $scope.glbl.Downloads[i] = data.ReqBody;
            }
        });
    });
    
    sckt.on('new download', function(data){
        console.log("new download!");
        if (data.statusCode == 200){
            data.body.Parameters = JSON.parse(data.body.Parameters);
            $scope.glbl.Downloads.push(data.body);
        } else {
            $scope.glbl.Errors.push({code: data.statusCode, message: data.message});
        }
    });
    
}]);

appControllers.controller("AutodownloadsCtrl", ["$scope", "Global", "Socket", "API", function($scope, Global, Socket, API){
    var sckt = Socket,
        api = API;
        
    $scope.glbl = Global;
    
    sckt.on('update autodownload', function(data){
        if (data.statusCode == 200){
            $scope.glbl.Autodownloads[data.body._id] = data.body;
        }
        console.log(data);
    });
    
    sckt.on('new autodownload', function(data){
        if (data.statusCode == 200){
            $scope.glbl.Autodownloads[data.body._id] = data.body;
        }
        console.log(data);
    });
    
    $scope.StopAutodownload = function(id){
        api.StopAutodownload(id).success(function(data){
            if (data.statusCode == 200){
                delete $scope.glbl.Autodownloads[id];
            }
        });
    };
    
    $scope.StartAutodownload = function(id){
        api.StartAutodownload(id).success(function(data){
            if (data.statusCode == 200) {
                console.log("Autodownload Started");
            }
        });
    };
    
    $scope.PauseAutodownload = function(id){
        api.PauseAutodownload(id).success(function(data){
            if (data.statusCode == 200) {
                console.log("Autodownload Paused");
            }
        });
    };
    
}]);