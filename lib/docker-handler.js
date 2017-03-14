'use strict'

const log = require('d1-logger')
const debug = require('debug')('front-nginx:DockerHandler')
const Promise = require('bluebird')

/**
 * Helper class that provides promisified dockerode's API and some additional methods
 * @param docker
 */
var DockerHandler = function (docker) {
    this.docker = docker
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
                log.error(`Container ${con_id}: inspection fails. Error: ${err.message}`)
                reject(err)
                return
            }
            log.debug(`Container ${con_id}: inspection succeeds`)
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
    var network = this.docker.getNetwork(id)
    return new Promise((resolve, reject) => {
        network.inspect((err, data) => {
            if (!!err) {
                log.error(`Network ${id}: inspection fails. Error: ${err.message}`)
                reject(err)
                return
            }
            log.debug(`Network ${id}: inspection succeeds`)
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
            log.debug(`Container ${con_id}: start succeeds`)
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
    return new Promise(function (resolve, reject) {
        this.docker.run(image, cmd, streamo, createOptions, startOptions, (err, data, container) => {
            if (!!err) {
                log.error(`Image: run fails. Error: ${err.message}`)
                reject(err)
                return
            }
            log.debug(`Image: run succeeds`)
            resolve({
                data: data,
                container: container
            })
        })
    })
}

/**
 * List all available networks
 * @returns {Promise.<Array.<Object>>}
 */
DockerHandler.prototype.listNetworks = function () {
    return Promise.promisify(this.docker.listNetworks).bind(this.docker)({})
        .then(networks => {
            return networks
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
            return networks.filter(network => {
                return network.Name === name
            })
        })
        .then(results => {
            log.debug(`Found ${!!results ? results.length : -1} networks named ${name}`)
            if (!results || !results.length) { // network not found
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
        .then(results => {
            log.debug(`Found ${results.length} containers named ${name}`)
            return results
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
            log.debug(`Disconnecting network and container.Id = ${container.Id}: success`)
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
            log.debug(`Site ${site_id}: find existing volumes: ${JSON.stringify(out)}`)
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
DockerHandler.prototype.networkExists = function (id) {
    return this.inspectNetwork(id)
        .then(_ => true)
        .catch(err => {
            log.warn(`Network ${id} might not exist: Inspection fails: ${err.message}`)
            return false
        })
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