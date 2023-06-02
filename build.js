const esbuild = require('esbuild')


esbuild.buildSync({
    entryPoints: ['./publish/dist/esm/index.js'],
    platform: 'node',
    bundle: true,
    minify: false,
    outfile: './dist/index.js',
})
