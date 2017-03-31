"use strict";

const Promise       = require('bluebird');
const DockerCompose = require('../lib/docker-compose');
const DockerHandler = require('../lib/docker-handler');
const Docker        = require('dockerode');
const fs            = require('fs');
const inspect       = require('util').inspect
inspect.defaultOptions = { colors: true, breakLength: 1, depth: 4 } // dockerode's callback error pops up when using inspect for unknown reasons


// docker-compose -p frontNginx -f /usr/lib/sky-node-front-nginx/docker-compose.yml start

let handler = new DockerHandler(getDocker());

Promise.resolve()
.then( _ => testInspectContainer() )
.then( _ => testListContainerByName() )
.then( _ => testGetNetwork() )
.then( _ => testListNetwork() )
.then( _ => testInspectNetwork() )
.then( _ => testGetNetworkByName() )
.then( _ => testDoesNetworkExist() )
.catch( err => console.log(`Errorrr: ${err.stack}`) )

function getDocker () {
    let socket = '/var/run/docker.sock'
    const stats = fs.statSync(socket)

    if (!stats.isSocket()) {
        throw new Error('Are you sure the docker is running?');
    }

    return new Docker({
        socketPath: socket
    })
}

function testInspectContainer() {
    let id = 'frontnginx_front-nginx_1'
    return Promise.try( _ => handler.inspectContainer(id) )
        .then( ret => console.log(`Inspect container returns ${inspect(ret)}\n\n`) )
}

function testListContainerByName() {
    let name = 'frontnginx_front-nginx_1'
    return Promise.try( _ => handler.listContainersByName(name) )
        .then( ret => console.log(`List container by name returns ${JSON.stringify(ret)}\n\n`) )
}

function testInspectNetwork() {
    let id = 'azerty_default'
    return Promise.try( _ => handler.inspectNetwork(id) )
		.then( ret => console.log(`Inspect network returns ${JSON.stringify(ret)}\n\n`) )
}

function testListNetwork() {
    return Promise.try( _ => handler.listNetworks({}) )
		.then( ret => console.log(`List networks returns ${JSON.stringify(ret)}\n\n`) )
}

function testGetNetworkByName() {
	let name = 'azerty_default'
    return Promise.try( _ => handler.getNetworkByName(name) )
		.then( ret => console.log(`Get network by Name returns ${JSON.stringify(ret)}\n\n`) )
}

function testDoesNetworkExist() {
	let id = 'azerty_default'
    return Promise.try( _ => handler.getNetworkByName(id) )
		.then( ret => console.log(`Does network exist returns ${JSON.stringify(ret)}\n\n`) )
}

function testGetNetwork() {
	let id = 'azerty_default'
	return Promise.try( _ => handler.getNetwork(id) )
		.then( ret => console.log(`Get network returns ${JSON.stringify(ret)}\n\n`) )
}

function testDockerCompose() {
	Promise.try(_ => {
		let opts = {
			f: ['example.yaml'],
			p: 'example'
		}
		let env = {
			DIYA_REPO: 'master',
			SKY_NODE_REGISTRY: 'local'
		}
		let cmd_opts = {
			v: ''
		}

		return DockerCompose.putInitParams(opts).putEnv(env).start()
			.then(ret => console.log(`Success: ${ret}`))
			.catch(err => console.log(`Error: ${err.stack}`))
	})
}
