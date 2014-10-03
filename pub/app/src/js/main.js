var downloadManager = angular.module('downloadManager', ['ngAnimate', 'app-factories', 'app-controllers']);

downloadManager.directive('downloadOptions', function(){
    return {
        restrict: 'E',
        templateUrl: 'src/templates/download-options.html',
        replace: true
    };
});

downloadManager.directive('assignInterviewers', function(){
    return {
        restrict: 'E',
        templateUrl: 'src/templates/assign-interviewers.html',
        replace: true
    };
});

downloadManager.directive('dropTarget', function(){
    return function($scope, $element){
        $element.on('drop', function(event){
            event.stopPropagation();
            event.preventDefault();
            
            $scope.$apply(function(){
                $scope.interviewersData = undefined;
            });
            
            // dataTransfer check
            event.dataTransfer = event.dataTransfer || event.originalEvent.dataTransfer;
            
            var file = event.dataTransfer.files[0],
                readFile,
                reader = new FileReader();
            
            reader.onload = function(e) {
                var data = e.target.result;
                switch (file.type) {
                    case 'application/vnd.ms-excel':
                        readFile = XLS.read(data, {type: 'binary'});
                        break;
                    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                        readFile = XLSX.read(data, {type: 'binary'});
                        break;
                    case 'text/plain':
                        readFile = data;
                        break;
                    default:
                        console.log(file);
                        console.log('Unsupported file format, use .xls, .xlsx or .txt');
                }
                
                $scope.$apply(function(){
                    $scope.interviewersData = readFile;
                });
            };
            
            reader.readAsBinaryString(file);
            
            $element.removeClass('dragged-over');
            
        });
        
        $element.on('dragenter', function(event){
            event.stopPropagation();
            event.preventDefault();
            $element.addClass('dragged-over');
        });
        
        $element.on('dragleave', function(event){
            event.stopPropagation();
            event.preventDefault();
            $element.removeClass('dragged-over');
        });
        
        $element.on('dragover', function(event){
            event.stopPropagation();
            event.preventDefault();
        });
    };
});