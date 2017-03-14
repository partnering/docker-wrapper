"use strict";

const Promise       = require('bluebird');
const DockerCompose = require('../lib/docker-compose');
const DockerHandler = require('../lib/docker-handler');
const Docker        = require('dockerode');
const fs            = require('fs');

// docker-compose -p frontNginx -f /usr/lib/sky-node-front-nginx/docker-compose.yml start

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

function testDockerHandler() {
    let handler = new DockerHandler(getDocker());
    return handler.listNetworks()
}

function getDocker () {
    const stats = fs.statSync('/var/run/docker.sock')

    if (!stats.isSocket()) {
        throw new Error('Are you sure the docker is running?');
    }

    return new Docker({
        socketPath: Constants.SOCKET
    })
}
