var downloadManager = angular.module("downloadManager", ['ngAnimate', 'app-factories', 'app-controllers']);

downloadManager.directive('downloadOptions', function(){
    return {
        restrict: 'E',
        templateUrl: 'src/templates/download-options.html',
        replace: true
    };
});