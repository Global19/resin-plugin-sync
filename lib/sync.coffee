Promise = require('bluebird')
_ = require('lodash')
chalk = require('chalk')
resin = require('resin-sdk')
rsync = require('./rsync')
shell = require('./shell')
tree = require('./tree')

module.exports =
	signature: 'sync <uuid> [source]'
	description: 'sync your changes with a device'
	permission: 'user'
	options: [
			signature: 'ignore'
			parameter: 'paths'
			description: 'comma delimited paths to ignore when syncing'
			alias: 'i'
		,
			signature: 'before'
			parameter: 'command'
			description: 'execute a command before syncing'
			alias: 'b'
		,
			signature: 'progress'
			boolean: true
			description: 'show progress'
			alias: 'p'
		,
			signature: 'watch'
			boolean: true
			description: 'watch files'
			alias: 'w'
		,
			signature: 'delay'
			parameter: 'ms'
			description: 'watch debouce delay'
			alias: 'd'
	]
	action: (params, options, done) ->

		# TODO: Add comma separated options to Capitano
		if options.ignore?
			options.ignore = _.words(options.ignore)

		_.defaults params,
			source: process.cwd()

		# Change directory to allow child processes inherit
		# the correct working directory automatically
		process.chdir(params.source)

		console.info("Connecting with: #{params.uuid}")

		performSync = ->
			Promise.try ->
				return shell.runCommand(options.before) if options.before?
			.then ->
				command = rsync.getCommand(_.merge(params, options))
				console.info('Running command...')
				console.log(chalk.cyan(command))
				return shell.runCommand(command)
			.tap ->
				console.info('Synced, restarting device')
			.then ->
				return resin.models.device.restart(params.uuid)

		resin.models.device.isOnline(params.uuid).tap (isOnline) ->
			throw new Error('Device is not online') if not isOnline
		.then(performSync)
		.then ->
			if options.watch
				watch = tree.watch params.source,
					ignore: options.ignore
					delay: options.delay

				watch.on 'watching', (watcher) ->
					console.info("Watching path: #{watcher.path}")

				# tree automatically throttles changes
				watch.on 'change', (type, filePath) ->
					console.info("- #{type.toUpperCase()}: #{filePath}")
					performSync().catch(done)

				watch.on('error', done)
		.nodeify(done)
