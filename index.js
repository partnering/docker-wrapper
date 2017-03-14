'use strict';

var spawn = require('child_process').spawn;
var Promise = require('bluebird');

var DockerCompose = function () {};

/**
 * Construct arguments for spawned process.
 * Support multiple values for one flag, in which, values come under the form of array
 * i.e. multiple yml files can be inputted as: { f: [ docker-compose-a.yml, docker-compose-b.yml ] }
 * @param {Object} opts
 * @returns {Array}
 * @private
 */
DockerCompose.prototype._buildParams = function (opts) {
	if (!opts) {
		return []
	}
	let args = []
	for (let opt in opts) {
		let value = opts[opt]
		if (Array.isArray(value)) {
			for (let val of value) {
				args.push((opt.length === 1 ? '-' : '--').concat(opt));
				if (!!val) args.push(val);
			}
		} else {
			args.push((opt.length === 1 ? '-' : '--').concat(opt));
			if (!!opts[opt]) args.push(opts[opt]); // not all options have attached values
		}
	}
	return args;
}

/**
 *
 * @param {string} command
 * @param {Object} [opts]
 * @param {string | Array} [services]
 * @param {Object} [sub_opts]
 * @returns {*}
 * @private
 */
DockerCompose.prototype._execute = function (command, opts, services, sub_opts) {
	if (!this.opts || !this.env) throw new Error(`Primary options or environment properties unset`);
	return new Promise((resolve, reject) => {
		let stdout = '';
		let stderr = '';

		let args = this._buildParams(this.opts);
		args.push(command);
		if (!!opts) args = args.concat(this._buildParams(opts));
		if (!!services) {
			if (Array.isArray(services)) {
				args = args.concat(services);
			} else {
				args.push(services);
			}
		}
		if (!!sub_opts) args.push(sub_opts); // Some commands support an additional parameter

		let env = process.env;
		for (let item in this.env) {
			env[item] = this.env[item];
		}

		console.log(`args: ${JSON.stringify(args)}`)
		console.log(`docker-compose ${args.join(' ')}`)
		console.log(`env: ${JSON.stringify(this.env)}`)

		let cmd = spawn('docker-compose', args, { env: env });

		cmd.stdout.on('data', function (data) {
			stdout += data;
		});

		cmd.stderr.on('data', function (data) {
			stderr += data;
		});

		cmd.on('close', (code) => {
			if (code !== 0) {
				reject(new Error("Command exited: " + code + "\n" + stderr));
			}
			else {
				resolve(stdout);
			}
		});
	})
	.finally( _ => this.env = null );
}

/**
 * Put primary options to docker-compose. Be always used before any operations
 * Reference: http://blog.schoolofdevops.com/wp-content/uploads/2016/10/Docker-compose-Cheat-Sheet-V1-1.pdf
 *
 * @param {Object} opts
 * @returns {DockerCompose}
 */
DockerCompose.prototype.putInitParams = function (opts) {
	this.opts = opts;
	return this;
};

/**
 * Put environment variables to docker-compose
 * @param {Object} env
 * @returns {DockerCompose}
 */
DockerCompose.prototype.putEnv = function (env) {
	this.env = env;
	return this;
};

/**
 * Reference: http://blog.schoolofdevops.com/wp-content/uploads/2016/10/Docker-compose-Cheat-Sheet-V1-1.pdf
 * @param opts
 * @returns {Promise.<string>} stdout / stderr
 */
DockerCompose.prototype.up = function (opts) {
	return this._execute('up', opts);
};

DockerCompose.prototype.down = function (opts) {
	return this._execute('down', opts);
};

DockerCompose.prototype.ps = function (opts) {
	return this._execute('ps', opts);
};

DockerCompose.prototype.start = function (opts, services) {
	return this._execute('start', opts, services);
};

DockerCompose.prototype.stop = function (opts, services) {
	return this._execute('stop', opts, services);
};

DockerCompose.prototype.restart = function (opts, services) {
	return this._execute('restart', opts, services);
};

DockerCompose.prototype.kill = function (opts, services) {
	return this._execute('kill', opts, services);
};

DockerCompose.prototype.pull = function (opts, services) {
	return this._execute('pull', opts, services);
};

DockerCompose.prototype.create = function (opts, services) {
	return this._execute('create', opts, services);
};

DockerCompose.prototype.version = function (opts) {
	return this._execute('version', opts);
};

DockerCompose.prototype.pause = function (opts, services) {
	return this._execute('pause', opts, services);
};

DockerCompose.prototype.unpause = function (opts, services) {
	return this._execute('unpause', opts, services);
};

DockerCompose.prototype.scale = function (opts, services) {
	return this._execute('scale', opts, services);
};

DockerCompose.prototype.rm = function (opts, services) {
	return this._execute('rm', opts, services);
};

DockerCompose.prototype.port = function (opts, service, private_port) {
	return this._execute('port', opts, service, private_port);
};

DockerCompose.prototype.run = function (opts, service, command) {
	return this._execute('run', opts, service, command);
}

// logs is going to require special handling since it attaches to containers
// logs: (services, options) => { return run('logs', options, services); },

/**
 * {@link DockerCompose}.{@link putInitParams()}.{@link putEnv()}.{@link pseudOperation()}
 * where pseudOperation may be {@link up()}
 * @constructor
 */
const instance = new DockerCompose()

module.exports = instance