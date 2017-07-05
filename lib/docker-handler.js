'use strict'

const log     = require('d1-logger')
const debug   = require('debug')('sky-node:DockerHandler')
const Promise = require('bluebird')
const Tar     = require('tar-fs')
const inspect = require('util').inspect
// inspect.defaultOptions = { colors: true, breakLength: 1, depth: 4 } // inside this class, somehow, dockerode's callback error pops up when using inspect for unknown reasons

/**
 * Helper class that provides promisified dockerode's API and some additional helper methods that are shared among two project SkyNode and Frontend Nginx
 * @param {Object} docker - docker object from dockerode
 */
var DockerHandler = function (docker) {
    this.docker = docker
}

/**
 * Inspect image
 * @param {string} id - id or name of image
 * @returns {Promise.<Object>} - data of image
 *
 */
DockerHandler.prototype.inspectImage = function (id) {
    var image = this.docker.getImage(id)
    return new Promise((resolve, reject) => {
        image.inspect((err, data) => {
            if (!!err) {
                log.warn(`Image ${id}: inspection fails. Error: ${err.message}`)
                reject(err)
                return
            }
            debug(`Image ${id}: inspection succeeds`)
            resolve(data)
        })
    })
}

/**
 * Inspect container
 * @param {string} con_id - id or name of container
 * @returns {Promise.<Object>} - data of container
 *
 */
DockerHandler.prototype.inspectContainer = function (con_id) {
    var container = this.docker.getContainer(con_id)
    return new Promise((resolve, reject) => {
        container.inspect((err, data) => {
            if (!!err) {
                log.warn(`Container ${con_id}: inspection fails. Error: ${err.message}`)
                reject(err)
                return
            }
            debug(`Container ${con_id}: inspection succeeds`)
            resolve(data)
        })
    })
}

/**
 * Inspect network
 * @param {string} id - network id/name
 * @returns {Promise.<Object>} - data of container
 *
 */
DockerHandler.prototype.inspectNetwork = function (id) {
    debug(`inspectNetwork(${id})`)
    var network = this.docker.getNetwork(id)
    return new Promise((resolve, reject) => {
        network.inspect((err, data) => {
            if (!!err) {
                log.warn(`Network ${id}: inspection fails. Error: ${err.message}`)
                reject(err)
                return
            }
            debug(`Network ${id}: inspection succeeds`)
            resolve(data)
        })
    })
}

DockerHandler.prototype.startContainer = function (con_id, opts) {
    var container = this.docker.getContainer(con_id)
    return new Promise((resolve, reject) => {
        container.start(opts, (err, data) => {
            if (!!err) {
                log.error(`Container ${con_id}: start fails. Error: ${err.message}`)
                reject(err)
                return
            }
            debug(`Container ${con_id}: start succeeds`)
            resolve(data)
        })
    })
}

/**
 * Like run command from Docker's CLI
 * @param {string} image - Image name to be used.
 * @param {Array} cmd - Command to run in array format.
 * @param {Object} streamo - Output stream
 * @param {Object} createOptions - Container create options (optional)
 * @param {Object} startOptions - Container start options (optional)
 */
DockerHandler.prototype.run = function (image, cmd, streamo, createOptions, startOptions) {
    return new Promise((resolve, reject) => {
        this.docker.run(image, cmd, streamo, createOptions, startOptions, (err, data, container) => {
            if (!!err) {
                log.error(`Image: run fails. Error: ${err.message}`)
                reject(err)
                return
            }
            debug(`Image: run succeeds`)
            resolve({
                data: data,
                container: container
            })
        })
    })
}

/**
 * Docker exec. Cannot use Promisify because some classes are not exposed to the external world.
 * In fact, many dockerode functions have two return options, one calls the input callback,
 * one returns a promise if the input callback is not provided. However, many cases, I failed to test
 * the promise-in-return case. Therefore, I stick with this manual promisification.
 *
 * @param {Object} container
 * @param {Array.<String>} cmd - array of alphanumeric strings that forms a complete command
 * @returns {Promise.<Object>} execution object
 */
DockerHandler.prototype.exec = function (container, cmd) {
    let options = {
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true
    };
    return new Promise((resolve, reject) => {
        container.exec(options, function(err, exec) {
            if (err != null) {
                reject(err);
                return
            }
            exec.start((err, stream) => {
                if (err != null) {
                    reject(err)
                    return;
                }
                stream.pipe(process.stdout, {end: true})
                stream.on('end', _ => {
                    exec.inspect((err, data) => {
                        if (err != null) {
                            debug(`exec start inspect error: ${err.message}`)
                            reject(err);
                            return
                        }
                        debug(`exec start inspect data: ${inspect(data)}`)
                        if (data == null || data.Running || data.ExitCode != 0) {
                            reject(err)
                            return
                        }
                        resolve(data)
                    });
                });
            });
        });
    })
}

/**
 * Copy file from docker container to local machine
 * @param {Object} container
 * @param {string} src
 * @param {string} dst_path
 * @param {string} dst_file
 * @returns {Promise.<>}
 */
DockerHandler.prototype.copyDockerFiles = function (container, src, dst_path, dst_file) {
    let dst = dst_path.endsWith('/') ? [dst_path, dst_file].join('') : [dst_path, dst_file].join('/')
    return new Promise.try( _ => container.getArchive({ path: src }) ) // Geting tarball of source file from container
        .then(data => {
            data.pipe(Tar.extract(dst_path))
        })
}


/**
 * List all available networks
 * @returns {Promise.<Array.<Object>>}
 */
DockerHandler.prototype.listNetworks = function () {
    return Promise.try( _ => this.docker.listNetworks({}) ) // Attention: this function mix asynchronous call and promise. Take care of future updates from dockerode's authors
		.then( networks => {
			debug(`Found ${networks == null ? 0 : networks.length} networks`)
			return networks == null ? null : networks.map( network => {
				let cast = this.getNetwork(network.Id)
                for (let prop in network) {
				    if (!network.hasOwnProperty(prop)) {
				        continue
                    }
                    cast[prop] = network[prop]
                }
                return cast
			})
		})
        .catch(err => {
            log.error(`Error listing networks: ${err.stack}`)
            throw err
        })
}

/**
 * Search for network having name of siteNetworkName. docker.getNetwork requires input id
 * @param {string} name
 * @returns {Promise.<Object>}
 */
DockerHandler.prototype.getNetworkByName = function (name) {
    return this.listNetworks()
        .then(networks => {
            if (networks == null) return null
            return networks.filter(network => {
                debug(`network.Name = ${network.Name} vs ${name} = expected name`)
                return network.Name === name
            })
        })
        .then(results => {
            debug(`Found ${results == null ? 0 : results.length} networks named ${name}`)
            if (results == null || results.length == 0) { // network not found
                throw new Error('No networks found')
            } else if (results.length > 1) {
                throw new Error(`More than one networks exist with name ${name}`)
            }
            return results[0]
        })
}

/**
 * Find list of matching containers
 * @param name
 * @returns {Promise.<TResult>}
 */
DockerHandler.prototype.listContainersByName = function (name) {
    return Promise.promisify(this.docker.listContainers).bind(this.docker)
        ({
            filters: {
                name: [name]
            }
        })
        .then(conts => {
			// Create dockerode container objects from pure Javascript object
			let clone;
			if (conts != null) {
				clone = conts.map( cont => {
					let obj = this.docker.getContainer(cont.Id);
					for (let prop in cont) {
						obj[prop] = cont[prop];
					}
					return obj;
				})
			}
			debug(`Found ${conts.length} containers named ${name}`)
            return clone
        })
        .catch(err => {
            log.error(`Error in finding containers by name: ${err.message}`)
            throw err
        })
}

/**
 * Connect container from network
 * @param container
 * @param network
 * @returns {Promise.<>}
 */
DockerHandler.prototype.connectContainerToNetwork = function (container, network) {
    return new Promise((resolve, reject) => {
        network.connect({container: container.Id}, (err, data) => {
            if (!!err) {
                reject(err)
                return
            }
            resolve(data)
        })
    })
}

/**
 * Disconnect container from network
 * @param {Container} container - nginx container to be disconnected
 * @param {Network} network - site network
 * @returns {Promise.<>}
 */
DockerHandler.prototype.disconnectContainerFromNetwork = function (container, network) {
    return new Promise((resolve, reject) => {
        network.disconnect({
            container: container.Id,
            force: true
        }, (err, data) => {
            if (!!err) {
                log.error(`Disconnecting network and container.Id = ${container.Id}: failed`)
                reject(err)
                return
            }
            debug(`Disconnecting network and container.Id = ${container.Id}: success`)
            resolve(data)
        })
    })
}

/**
 * Find old existing volume data. Check if there already exist a volume that was
 * previously created for a site with the same name, but was only `down`-ed and not `nuke`-ed.
 *
 * volumeData = site_id + '_db-data'
 * volumeKeys = site_id + '_db-keys'
 * volumeLogs = site_id + '_db-logs'
 *
 * @param site_id
 * @returns {Promise.<TResult>} list of old volume names, featuring data, keys, logs
 * @private
 */
DockerHandler.prototype.findExistingVolumes = function (site_id) {
    let p = Promise.promisify(this.docker.listVolumes.bind(this.docker))
    return p({})
        .then(data => {
            let volumes = data.Volumes
            if (!volumes) return null
            let out = volumes.reduce((prev, cur) => {
                if (!!cur.Name && cur.Name.includes(site_id)) prev.push(cur.Name)
                return prev
            }, [])
            return data
        })
        .catch(err => {
            log.error(`Site ${site_id}: find existing volumes: failed. ${err.stack}`)
            throw err
        })
}

/**
 * Check existence of network by name/raw-id
 * @param {string} name of raw-id of network
 * @returns {Promise.<boolean>}
 */
DockerHandler.prototype.doesNetworkExist = function (id) {
	debug(`doesNetworkExist(${id})`)
	return this.inspectNetwork(id)
        .then(_ => true)
        .catch(err => {
            log.warn(`Network ${id} might not exist: Inspection fails: ${err.message}`)
            return false
        })
}

/**
 * Check existence of network by name/raw-id
 * @param {string} name of raw-id of network
 * @returns {Promise.<boolean>}
 */
DockerHandler.prototype.doesImageExist = function (id) {
	debug(`doesImageExist(${id})`)
	return this.inspectImage(id)
        .then(_ => true)
        .catch(err => {
            log.warn(`Image ${id} might not exist: Inspection fails: ${err.message}`)
            return false
        })
}

/**
 * Check existence of container by name/raw-id
 * @param {string} name of raw-id of network
 * @returns {Promise.<boolean>}
 */
DockerHandler.prototype.doesContainerExist = function (id) {
	debug(`doesContainerExist(${id})`)
	return this.inspectContainer(id)
        .then(_ => true)
        .catch(err => {
            log.warn(`Container ${id} might not exist: Inspection fails: ${err.message}`)
            return false
        })
}

/**
 * Check existence of containers by names/raw-ids
 * @param {Array.<string>} ids - names or raw-ids of containers
 * @returns {Promise.<Array.<boolean>>} - boolean status of containers
 */
DockerHandler.prototype.doContainersExist = function (...ids) {
    let pz = [...ids].map( id => this.doesContainerExist(id) )
    return Promise.all(pz)
}

/**
 * Check existence of network by name/raw-id and create one
 * @param {string} name of raw-id of network
 * @returns {Promise.<boolean>}
 */
DockerHandler.prototype.createOverlayNetwork = function (id) {
	debug(`createOverlayNetwork(${id})`)
    return Promise.try( _ => this.doesNetworkExist(id) )
        .then( exist => {
            if (exist) {
                log.warn(`Network ${id} already exists`)
                return Promise.resolve()
            }
            return Promise.promisify(this.docker.createNetwork.bind(this.docker))({
                "Name": id,
                "Driver": "overlay",
            })
            .then(_ => log.info(`Network ${id} is created successfully`) )
        })
        .catch( err => {
            log.error(`Network ${id} creation FAILS`)
            throw err
        })
}

/**
 * Build docker image
 * @param {string} file - location to file
 * @param {Object} opts - options
 * @return {Promise.<>}
 */
DockerHandler.prototype.buildImage = function (file, opts) {
    return new Promise((resolve, reject) => {
        this.docker.buildImage(file, opts, (err, stream) => {
            if (err != null) return reject(err)
            stream.pipe(process.stdout, {end: true})
            stream.on('end', _ => {
                resolve()
            });
        })
    })
}

/**
 * Get container by name or id
 * @param id
 */
DockerHandler.prototype.getContainer = function (id) {
    return this.docker.getContainer(id)
}

/**
 * Get network by name or id
 * @param id
 */
DockerHandler.prototype.getNetwork = function (id) {
	return this.docker.getNetwork(id);
}

DockerHandler.CONTAINER = {
    STATUS: {
        created: 'created',
        restarting: 'restarting',
        running: 'running',
        paused: 'paused',
        exited: 'exited'
    }
}

module.exports = DockerHandler