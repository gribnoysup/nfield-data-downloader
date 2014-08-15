var appFactories = angular.module('app-factories', []);

appFactories.factory("Socket", ["$rootScope", function($rootScope){

    var socket = io.connect('');
    
    return {
        on: function (eventName, callback) {
            socket.on(eventName, function () {  
                var args = arguments;
                $rootScope.$apply(function () {
                    callback.apply(socket, args);
                });
            });
        },
        emit: function (eventName, data, callback) {
            socket.emit(eventName, data, function () {
                var args = arguments;
                $rootScope.$apply(function () {
                    if (callback) {
                        callback.apply(socket, args);
                    }
                });
            });
        }
    };

}]);

appFactories.factory("jqDownload", [function(){
    return {
        start: function(url){
            return $.fileDownload(url);
        }
    };
}]);

appFactories.factory("Global", [function(){
    return {
        User: "",
        Token: "",
        Surveys: [],
        Downloads: [],
        Autodownloads: {},
        Errors: [],
        ClientSettings: {
            "ClientAutodownload": false,
            "DownloadsInList" : 20
        }
    };
}]);

appFactories.factory("API", ["$http", "Global", function($http, Global){
    return {
        CheckSession: function(){
            return $http({
                method:"GET",
                url:"api/v1/session"
            });
        },
        SignIn: function(params){
            return $http({
                method:"GET",
                url:"api/v1/login",
                params: params
            });
        },
        GetSurveyList: function(){
            return $http({
                method:"GET",
                url:"api/v1/survey/list",
                headers: {
                    'Authorization': 'Basic ' + Global.Token
                }
            });
        },
        GetSurveyStatus: function(id){
            return $http({
                method:"GET",
                url:"api/v1/survey/status/" + id,
                headers: {
                    'Authorization': 'Basic ' + Global.Token
                }
            });
        },
        RequestDownload: function(options){
            return $http({
                method:"POST",
                url:"api/v1/downloadrequest/" + options.SurveyId,
                headers: {
                    'Authorization': 'Basic ' + Global.Token
                },
                data: options
            });
        },
        GetDownloadsList: function(){
            return $http({
                method:"GET",
                url:"api/v1/downloads",
                headers: {
                    'Authorization': 'Basic ' + Global.Token
                }
            });
        },
        GetAutodownloadsList: function(){
            return $http({
                method:"GET",
                url:"api/v1/autodownloads",
                headers: {
                    'Authorization': 'Basic ' + Global.Token
                }
            });
        },
        StartAutodownload: function(id){
            return $http({
                method:"POST",
                url:"/api/v1/autodownloads/start/" + id,
                headers: {
                    'Authorization': 'Basic ' + Global.Token
                }
            });
        },
        PauseAutodownload: function(id){
            return $http({
                method:"POST",
                url:"/api/v1/autodownloads/pause/" + id,
                headers: {
                    'Authorization': 'Basic ' + Global.Token
                }
            });
        },
        StopAutodownload: function(id){
            return $http({
                method:"POST",
                url:"/api/v1/autodownloads/stop/" + id,
                headers: {
                    'Authorization': 'Basic ' + Global.Token
                }
            });
        }
    };
}]);