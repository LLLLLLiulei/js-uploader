// const webpack = require('webpack')
// const path = require('path')
// const os = require('os')
// const ExtractTextPlugin = require('extract-text-webpack-plugin')
// const HtmlWebpackPlugin = require('html-webpack-plugin')

// // Webpack Config
// module.exports = {
//   entry: {
//     main: './src/index.ts',
//     vendor: ['rxjs', 'tslib'],
//   },
//   devtool: 'cheap-module-source-map',
//   cache: true,
//   output: {
//     filename: '[name].js',
//     path: path.join(__dirname, 'dist'),
//     publicPath: '/',
//     libraryTarget: 'umd',
//   },
//   resolve: {
//     modules: [path.join(__dirname, 'src'), 'node_modules'],
//     extensions: ['.ts', '.js'],
//     alias: {
//       lovefield: path.join(process.cwd(), 'node_modules/lovefield/dist/lovefield.js'),
//     },
//   },

//   devServer: {
//     hot: true,
//     // enable HMR on the server

//     contentBase: path.resolve(__dirname, 'dist'),
//     // match the output path

//     publicPath: '/',
//     // match the output `publicPath`

//     watchOptions: { aggregateTimeout: 300, poll: 1000 },
//   },

//   node: {
//     global: true,
//     process: false,
//   },

//   plugins: [
//     new webpack.LoaderOptionsPlugin({
//       debug: true,
//     }),
//     new webpack.HotModuleReplacementPlugin(),
//     new webpack.NoEmitOnErrorsPlugin(),
//     new webpack.DefinePlugin({
//       'process.env': {
//         NODE_ENV: JSON.stringify('development'),
//       },
//     }),
//   ],

//   mode: 'development',

//   module: {
//     noParse: [/tman\/browser\/tman\.js/, /sinon\/pkg\/sinon\.js/],
//     rules: [
//       {
//         test: /\.tsx?$/,
//         enforce: 'pre',
//         exclude: /node_modules/,
//         loader: 'tslint-loader',
//       },
//       {
//         test: /\.js$/,
//         enforce: 'pre',
//         loaders: ['source-map-loader'],
//         include: /rxjs/,
//       },
//       {
//         test: /\.ts$/,
//         use: 'ts-loader',
//         exclude: /node_modules/,
//       },
//       { test: /\.css$/, loaders: ['style-loader', 'css-loader'] },
//       { test: /\.html$/, loaders: ['raw-loader'] },
//     ],
//   },
// }

const path = require('path')

module.exports = {
  entry: {
    renderer: './src/test.ts',
  },
  // entry: './src/index.ts',
  // entry: './src/main.ts',
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          comments: false,
          presets: ['@babel/preset-env'],
        },
      },
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.html$/,
        use: 'vue-html-loader',
      },
      {
        test: /\.vue$/,
        use: {
          loader: 'vue-loader',
          options: {
            // extractCSS: process.env.NODE_ENV === 'production',
            // loaders: {
            //   sass: 'vue-style-loader!css-loader!sass-loader?indentedSyntax=1',
            //   scss: 'vue-style-loader!css-loader!sass-loader',
            //   less: 'vue-style-loader!css-loader!less-loader',
            // },
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.tsx'],
  },
  output: {
    filename: '[name].js',
    // libraryTarget: 'commonjs2',
    path: path.resolve(__dirname, 'dist'),
  },
  target: 'web',
  plugins: [],
}
