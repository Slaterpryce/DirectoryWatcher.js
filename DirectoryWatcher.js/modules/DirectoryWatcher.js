 ﻿/*
   ===========================================================================
 
   A Node.js module that handles monitoring a directory for changes

   exports the DirectoryWatcher object which emits six different events

   fileAdded        : When a file is added to a monitored directory
   fileChanged      : When a file is changed
   fileRemoved      : When a file is removed
   folderAdded      : When a folder is added (recursive mode only)
   folderRemoved    : When a folder is removed (recursive mode only)
   scannedDirectory : When a directory has been scanned

   Current Version: 0.0.1
                    December 19 2013 

   Author(s): George H. Slaterpryce III
   License: CPOL : The Code Project Open License 1.02
            http://www.codeproject.com/info/cpol10.aspx

   Copyright: (c) 2013 Slaterpryce Intellect Corp

   If you modify this code please add your name and what was modified to this
   header, as well as the date modified.

   Target Node.js version: v0.10.22

 ===========================================================================

*/

// Imports / Requires
var fs = require("fs"),
    path = require("path"),
    util = require("util"),
    events = require("events");

// A File Detail Object to store details about a file
// directory = parent directory of the file
// fullPath = the entire path including directory of the file.
// fileName = just the name of the file without the path
// size = the size in bytes of the file
// extension = the extension of the file (.js, .txt, etc)
// accessed = the last accessed date of the file
// modified = the last modified date of the file
// created = the last created date of the file
var FileDetail = function (directory, fullPath, fileName, size, extension, accessed, modified, created) {
  this.directory = directory;
  this.fullPath = fullPath;
  this.fileName = fileName;
  this.extension = extension;
  this.size = size;
  this.accessed = accessed;  
  this.modified = modified;
  this.created = created;  
};

// A basic object to hold the results of a FileDetail
// comparison.
var FileDetailComparisonResults = function () {
  this.different = false;
  this.differences = {};
};  

// A comparison method to detect changes between
// this and a passed in FileDetail object
// fd = FileDetail object to compare to
// Returns a FileDetailComparisonResults object
FileDetail.prototype.compareTo = function (fd) {
  var self = this,
    base,  
    compare,          
    results = new FileDetailComparisonResults();
  // loop through all the properties in FileDetail
  // object
  for (var key in self) {
    // if it's a date, handle it aas an ISOString
    // much cleaner.
    if (self[key] instanceof Date) {
    base = self[key].toISOString();
    compare = fd[key].toISOString();
    } else {
      // otherwise just set the compare and base
      // variables for comparison happening below
      base = self[key];
      compare = fd[key];
      }
      // base and compare objects don't match...
      if (base != compare) {
      // if the differences node doesn't exist
      // create it.
      if (!results.differences[key]) {
        results.differences[key] = {};
      }
      // record the differences
      results.differences[key].baseValue = self[key];
      results.differences[key].comparedValue = fd[key];
      // and then mark the resulting FileDetailComparisonResults
      // object as different.
      results.different = true;
    }
  }
  // return the results
  return results;
};

// Create an object that watches a given directory for any
// changes to files or folders in that directory
// root = root path of directory to watch
// recursive = [true / false] recursively monitor
//             all sub-folder and files
// Emits six events:
//   fileAdded        : When a file is added to a monitored directory
//   fileChanged      : When a file is changed
//   fileRemoved      : When a file is removed
//   folderAdded      : When a folder is added (recursive mode only)
//   folderRemoved    : When a folder is removed (recursive mode only)
//   scannedDirectory : When a directory has been scanned
var DirectoryWatcher = function (root, recursive) {  
  this.root = root;  // Root or base directory
  this.recursive = recursive;  // recursively monitor sub-folders?
  this.directoryStructure = {};  // object holding representation of directory structure
  this.timer = null;  // timer handling scan passes
  this.suppressInitialEvents = true;  // should we supress initial events?
  
  // set a self var
  var self = this;

  // Call the EvnetEmitter
  events.EventEmitter.call(this);

  /*===========================================================================
    Non Exposed Methods (Private)
    =========================================================================*/

  // Gets the parent node of the last folder in the path
  // given. calls selectCurrentNode so directy adding to the
  // directoryStructure still happens. Handy method for
  // figuring out what a node's parent is considering there
  // is no simple native .parent method I can find in 
  // JavaScript
  // dir = the directory to find the parent node for.
  // suppressEvents = Suppress any events that would be
  //                  true = Events will be suppressed
  //                  false = Events will be raised.
  var selectParentNode = function (dir, suppressEvents) {
    var hierarchy = dir.split(path.sep);
        newPath = "";
    hierarchy.pop();
    newPath = hierarchy.join(path.sep);
    return (selectCurrentNode(newPath, suppressEvents));  
  };

  // Get the node represented by the directory path passed in
  // from the directoryStructure object. 
  // dir = the directory to find the node for.
  // NOTE: if the path/ isn't found THIS METHOD WILL ADD IT 
  //       to the directoryStructure
  var selectCurrentNode = function (dir, suppressEvents) {
    var deepRoot = self.root.replace(path.basename(self.root), "");
    // create an array representing the folder hiearcy.
    // remove the root path so it's relative.  
    var hierarchy = dir.replace(self.root, path.basename(self.root)).split(path.sep);
    // set the current node to the directoryStructure root.
    var currentNode = self.directoryStructure;
    var currentPath = deepRoot;
    // loop through the hierarchy array
    for (var i = 0; i < hierarchy.length; i++) {
      currentPath += hierarchy[i] + path.sep;
      // if the node (folder) doesn't exist create it.
      if (currentNode[hierarchy[i]] == null) {
        currentNode[hierarchy[i]] = {};
        if (!suppressEvents) {
          self.emit("folderAdded", currentPath.substring(0, currentPath.length - 1));
        }
      }                  
      // set the currentNode to the latest one
      currentNode = currentNode[hierarchy[i]];        
    }
    // return the most current node.
    return currentNode;
  };

  // Record any file (or folder) into the directoryStructure
  // p = Path to file / folder
  // suppressEvents = Suppress any events that would be
  //                  true = Events will be suppressed
  //                  false = Events will be raised.
  // callback = The callback function to call on completion  
  var recordFile = function (p, suppressEvents, callback) {
    // get the stats for the passed in file or folder
    fs.stat(p, function (err, stats) {
      // throw any return errors.
      if (err) throw err;
      // if it's a file, create the FileDetail Object
      if (stats.isFile()) {
        // get the folder only portion of the passed in file
        var dir = path.dirname(p);      
        fd = new FileDetail(
          dir,              // the base directory
          p,                // the full path
          path.basename(p), // basename (name of file only)
          stats.size,       // size in bytes
          path.extname(p),  // extension
          stats.atime,      // The last access date / time
          stats.mtime,      // The last modified date / time
          stats.ctime       // the created date / time
        );
        // get appropriate node of the directoryStructure
        var currentNode = selectCurrentNode(dir, suppressEvents);
        // if the file already exists in the directoryStructure
        if (currentNode[fd.fileName]) {
          // detect if changed by comparing it.
          var fileCompare = currentNode[fd.fileName].compareTo(fd);
          if (fileCompare.different) {
            // if it's different overwrite teh old with the new
            currentNode[fd.fileName] = fd;
            if (!suppressEvents) {
              // emit the changes
              self.emit("fileChanged", fd, fileCompare.differences);
            }
          }
        } else {
          // if the file isn't already stored in the directoryStructure
          // add it.
          currentNode[fd.fileName] = fd;
          if (!suppressEvents) {
            // emit that a file has been added.
            self.emit("fileAdded", fd);
          }
        }
      } else if (stats.isDirectory()) {
        // if it's a directory and we're recursive
        // scan the passed in directory.
        if (self.recursive) { 
          self.scanDirectory(p, suppressEvents);      
        }
      }
      // fire off the callback function
      callback();
    });
  };

  // Method to detect if a folder has been deleted.
  // if it has it will be removed from the directoryStructure
  // object.
  // dir = Parent directory of folder to test
  // folderName = name of the folder to detect if it is deleted
  //              or not.
  // suppressEvents = Suppress any events that would be
  //                  true = Events will be suppressed
  //                  false = Events will be raised.
  var detectFolderDelete = function (dir, folderName, suppressEvents) {
    // It is noted in the documentation for node.js fs.Exists method
    // (http://nodejs.org/api/fs.html#fs_fs_exists_path_callback)
    // that it is an anachronism. and to just try and open
    // the file / path and check for errors...
    // I don't think that's very efficient for what we're trying to 
    // do here so I'm using the exists method. 
    // Because of this one day they *might* remove exists. if they
    // ever do, then we'll have to come back and update this call
    // to something else.
    fs.exists(dir, function (exists) {
      if (!exists) {
        if (!suppressEvents) {
          self.emit("folderRemoved", dir);
        }
        // if the folder doesn't exist, find the folder's parent
        // node then the folder object (and all of its children objects.
        // from the directoryStructure. unfortunatley doint this means
        // that we will never get an event for everything deleted.
        // downstream... might want to add a method to raise those events
        // later.
        var currentNode = selectParentNode(dir, suppressEvents);            
        delete currentNode[folderName];
      }
    });
  };  

  // Method to detect if a file has been deleted.
  // if it has it will be removed from the directoryStructure
  // object.
  // dir = Parent directory of folder to test
  // suppressEvents = Suppress any events that would be  
  //                  true = Events will be suppressed
  //                  false = Events will be raised.
  var detectFileDelete = function (fd, suppressEvents) {
    // see comment in detectFolderDelete about exists method
    fs.exists(fd.fullPath, function (exists) {
      if (!exists) {
        if (!suppressEvents) {
          self.emit("fileRemoved", fd.fullPath);
        }
        // remove the file if it no longer exists.
        var currentNode = selectCurrentNode(fd.directory, suppressEvents);
        delete currentNode[fd.fileName];
      }
    });
  };

  // Top level method for detecting deletions in the monitored directory
  // handles folder deletes and file deletes and routs them to their
  // appropriate handler methods.
  // dir = directory to detect deletes in
  // suppressEvents = Suppress any events that would be
  //                  true = Events will be suppressed
  //                  false = Events will be raised.
  var detectDeletes = function (dir, suppressEvents) {  
    // grab the current node  
    var currentNode = selectCurrentNode(dir, suppressEvents);
    // loop through the files / folders in the current node
    for (var key in currentNode) { 
      // determine if the object is a file or a folder
      // instance of FileDetail?
      if (currentNode[key] instanceof FileDetail) {
        // route the the file delete detector
        detectFileDelete(currentNode[key], suppressEvents);
      } else {
        // if it's not an instance of FileDetail then it
        // is a directory node. route it to the appropriate detector
        detectFolderDelete(dir + path.sep + key, key, suppressEvents);            
      }
    }    
  };

  /*===========================================================================
    Exposed Methods (Public)
    =========================================================================*/

  // The primary scanning method. Tries to be non blocking
  // as possible. Scanns a given directory. then attempts
  // to record each file in the directory.
  // dir = the directory to scan.
  // suppressEvents = Suppress any events that would be
  //                  raised this scan iteration.
  //                  true = Events will be suppressed
  //                  false = Events will be raised.
  this.scanDirectory = function (dir, suppressEvents) {    
    fs.readdir(dir, function (err, files) {
      // throw any errors that came up
      if (err) throw err;
      // get the number of files / folders in the directory
      var i = files.length;
      if (i === 0) {
        // if there are no files (0) then emit scanned directory
        if (!suppressEvents) {
          self.emit("scannedDirectory", dir);
        }      
      } else {
        // if there are files and folders loop through them.
        // reduce the count (i) after each callback so
        // we can know when to raise the scannedDirectory
        // event
        for (var f in files) {
          // Record the file
          recordFile(path.join(dir, files[f]), suppressEvents, function () {
            // decrement the number of files to be recorded. since this
            // is an async function this is the only way I could figure
            // out to determine when we're done scanning a particular
            // directory.
            i--;
            if (i == 0) {
              // Raise the scannedDirectory event if we aren't
              // suppressing events and we've gone through all the
              // files.
              if (!suppressEvents) {
                self.emit("scannedDirectory", dir);
              }
            }
          });
        }
      }
      // Detect any folder or file deletes
      detectDeletes(dir, suppressEvents);
    });  
  };

  // Starts this instance of the DirectoryWatcher monitoring
  // the given root path (set when the object was created)
  // and defines the interval to check for changes.
  // interval = Time (in milliseconds) between checks for
  //            update for the given monitored directory
  this.start = function (interval) {    
    if (interval) {
      // if interval exists and is greater than zero (if it doesn't exists it will evaluate false)
      // and if it's zero (0) it will evaluate false.
      self.timer = setInterval(function () { self.scanDirectory(self.root, false) }, interval); 
    } else {
      // if the interval is empty or 0 then kill monitoring
      self.stop();
    }
    // Initial scan of the directory... suppresses events for the first
    // scan through. The next scan will be after interval
    self.scanDirectory(self.root, self.suppressInitialEvents);
  };

  // Stops this instance of the DirectoryWatcher
  // from watching for changes
  this.stop = function () {
    clearTimeout(self.timer);
  };

};

// Inherit the Event Emitter
util.inherits(DirectoryWatcher, events.EventEmitter);

// Exports/Returns Object that watches a given directory for any
// changes to files or folders in that directory
// root = root path of directory to watch
// recursive = [true / false] recursively monitor
//             all sub-folder and files
// Emits six events:
//   fileAdded        : When a file is added to a monitored directory
//   fileChanged      : When a file is changed
//   fileRemoved      : When a file is removed
//   folderAdded      : When a folder is added (recursive mode only)
//   folderRemoved    : When a folder is removed (recursive mode only)
//   scannedDirectory : When a directory has been scanned
exports.DirectoryWatcher = function (root, recursive) {
  return new DirectoryWatcher(root, recursive);
};