"use strict";

const Promise = require('bluebird');
const DockerCompose = require('../index');

const Compose = new DockerCompose();

// docker-compose -p frontNginx -f /usr/lib/sky-node-front-nginx/docker-compose.yml start

Promise.try( _ => {
	let opts = {
		f: '/usr/lib/sky-node-front-nginx/docker-compose.yml',
		p: 'frontNginx'
	}
	let env = {
		DIYA_REPO: 'master',
		SKY_NODE_REGISTRY: 'local'
	}
	let cmd_opts = {
		v: ''
	}

	// let opts = {
	// 	p: 'frontNginx',
	// 	f: '/usr/lib/sky-node-front-nginx/docker-compose.yml'
	// }
	// let env = {
	// 	SKY_NODE_REGISTRY: 'local'
	// }

	return Compose.putInitParams(opts).putEnv(env).start()
		.then( ret => console.log(`Success: ${ret}`))
		.catch( err => console.log(`Errorrrrrrrrrr: ${err.stack}`))
})