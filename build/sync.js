var Promise, chalk, resin, rsync, shell, tree, _;

Promise = require('bluebird');

_ = require('lodash');

chalk = require('chalk');

resin = require('resin-sdk');

rsync = require('./rsync');

shell = require('./shell');

tree = require('./tree');

module.exports = {
  signature: 'sync <uuid> [source]',
  description: 'sync your changes with a device',
  permission: 'user',
  options: [
    {
      signature: 'ignore',
      parameter: 'paths',
      description: 'comma delimited paths to ignore when syncing',
      alias: 'i'
    }, {
      signature: 'before',
      parameter: 'command',
      description: 'execute a command before syncing',
      alias: 'b'
    }, {
      signature: 'progress',
      boolean: true,
      description: 'show progress',
      alias: 'p'
    }, {
      signature: 'watch',
      boolean: true,
      description: 'watch files',
      alias: 'w'
    }
  ],
  action: function(params, options, done) {
    var performSync;
    if (options.ignore != null) {
      options.ignore = _.words(options.ignore);
    }
    _.defaults(params, {
      source: process.cwd()
    });
    process.chdir(params.source);
    console.info("Connecting with: " + params.uuid);
    performSync = function() {
      return Promise["try"](function() {
        if (options.before != null) {
          return shell.runCommand(options.before);
        }
      }).then(function() {
        var command;
        command = rsync.getCommand(_.merge(params, options));
        console.info('Running command...');
        console.log(chalk.cyan(command));
        return shell.runCommand(command);
      }).tap(function() {
        return console.info('Synced, restarting device');
      }).then(function() {
        return resin.models.device.restart(params.uuid);
      });
    };
    return resin.models.device.isOnline(params.uuid).tap(function(isOnline) {
      if (!isOnline) {
        throw new Error('Device is not online');
      }
    }).then(performSync).then(function() {
      var watch;
      if (options.watch) {
        watch = tree.watch(params.source);
        watch.on('watching', function(watcher) {
          return console.info("Watching path: " + watcher.path);
        });
        watch.on('change', function(type, filePath) {
          console.info("- " + (type.toUpperCase()) + ": " + filePath);
          return performSync()["catch"](done);
        });
        return watch.on('error', done);
      }
    }).nodeify(done);
  }
};