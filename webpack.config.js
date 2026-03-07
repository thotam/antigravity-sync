//@ts-check
"use strict";

const path = require("path");
const webpack = require("webpack");

/** @type {import('webpack').Configuration} */
const config = {
    target: "node",
    mode: "none",
    entry: "./src/extension.ts",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "extension.js",
        libraryTarget: "commonjs2",
    },
    externals: {
        vscode: "commonjs vscode",
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "ts-loader",
                    },
                ],
            },
        ],
    },
    plugins: [
        // follow-redirects cố import 'debug' (optional), bỏ qua để tránh warning
        new webpack.IgnorePlugin({
            resourceRegExp: /^debug$/,
            contextRegExp: /follow-redirects/,
        }),
    ],
    devtool: "nosources-source-map",
    infrastructureLogging: {
        level: "log",
    },
};

module.exports = config;
