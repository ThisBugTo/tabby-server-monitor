const path = require('path')
const builtinModules = require('module').builtinModules

module.exports = {
    target: 'node',
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: path.resolve(__dirname, 'src/index.ts'),
    context: __dirname,
    devtool: 'source-map',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        pathinfo: true,
        libraryTarget: 'commonjs2',
    },
    resolve: {
        extensions: ['.ts', '.js', '.json'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    transpileOnly: true,
                },
            },
        ],
    },
    externals: [
        ...builtinModules,
        'electron',
        '@electron/remote',
        'ngx-toastr',
        '@ng-bootstrap/ng-bootstrap',
        'zone.js',
        /^@angular\//,
        /^@ng-bootstrap/,
        /^ngx-/,
        /^rxjs/,
        /^tabby-/,
        /^terminus-/,
    ],
    optimization: {
        minimize: false,
    },
    ignoreWarnings: [/Failed to parse source map/],
}
