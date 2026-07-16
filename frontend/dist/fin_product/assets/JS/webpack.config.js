const moduleAlias = require('module-alias');

// Set up aliases for assert and stream
moduleAlias.addAliases({
    assert: require.resolve('assert/'),
    stream: require.resolve('stream-browserify'),
});