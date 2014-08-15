Custom NField API web app
--


Disclaimer
--
To use this app you'll need a configured [node.js] server, use instructions on the site or [this instruction] to do so

To make any changes to it, you'll probably need some basic knowledge of javascript (front-end and back-end) and [Angular.js]

This is a list of all frameworks and plugins, used to buld this app (front-end):

 - [Angular.js]
 - [Pure.css]
 - [jQuery]
 - [jquery.fileDownload]
 - [Font Awesome]

Back-end modules are listed in the ```package.json```

---

Configuring app
--

To use this app you'll need a Nfield Manager account, that will be permanently connected to the API. Create one for these purposes

After installing and configuring node.js and installing all needed node modules with ```npm install```, you'll need to get your app ready to work:
 - Create  ```settings/``` directory in your app directory
 - Create ```apiuser.json```, ```settings.json``` and ```key``` files in ```settings/```

key
--

Contains secret key to be used by ```express.session()``` to encrypt the session cookie. It contains a long string to use for encryption

apiuser.json
--

This file contains server, domain and user credentials, needed for app to connect to NField API:

```json
{ 
  "domain" : "YRDMN",
  "user" : "apiuser",
  "password": "Y0urP45sW0rd",
  "token": "", // leave empty
  "server" : "https://yourapi.server.com"
}
```

settings.json
--

Contains server workflow settings:

```json
{
  "createLocalDownloadLog" : true,
  "startAutodownloadsOnRun" : true,
  "checkDownloadsOnRun" : true,
  "generateInterviewersList" : true,
  "localDownloadFolder" : "folderToDownloadDataTo"
}
```
 - **createLocalDownloadLog** create a log file, that will contain information about downloaded files
 - **startAutodownloadsOnRun** automatically restart autodownload processes if the server is restarted (in other way, autodownloads are paused)
 - **checkDownloadsOnRun** check all unfinished download requests if the server is restarted (else unfinished requests are deleted)
 - **generateInterviewersList** automatically generate a list of all interviewers, that are created on your domain in .dat and .sps formats
 - **localDownloadFolder** a folder to use, when a local download is requested

---

Done!
--
Be aware that by default this node.js app uses port 80 to run, you'll need to have the root rights to run it on this port (or just change it in the very beginning of ```server.js``` file)

After all this configuration just run
```sh
supervisor server.js
```
or just
```sh
node server.js
```
if you didn't install [supervisor], but I highly recommend to do so

---
License
--
[MIT]








[node.js]:http://nodejs.org
[angular.js]:http://angularjs.org/
[this instruction]:https://www.digitalocean.com/community/tutorials/how-to-install-and-run-a-node-js-app-on-centos-6-4-64bit
[Pure.css]:http://purecss.io/
[jQuery]:http://jquery.com/
[Font Awesome]:http://fortawesome.github.io/Font-Awesome/
[jquery.fileDownload]:https://github.com/johnculviner/jquery.fileDownload
[supervisor]:https://github.com/isaacs/node-supervisor
[MIT]:https://github.com/gribnoysup/nfield-data-downloader/blob/master/LICENSE
