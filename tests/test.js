var compose = require('../lib/docker-compose')('example.yaml');

compose.up()
    .then(function(result) {
        console.log(result)
        return compose.start('test');
    })
    .then(function(result) {
        console.log(result);
        return compose.kill('test');
    })
    .then(function() {
        return compose.ps();
    })
    .then(console.log)
    .catch(function(error) {
        console.log(error);
    })
    .finally(function() {
        compose.down();
    })