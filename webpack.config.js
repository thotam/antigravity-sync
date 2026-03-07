//@ts-check
"use strict";

const path = require("path");
const webpack = require("webpack");
require("dotenv").config();

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
        // Inject Google OAuth credentials from .env at build time
        new webpack.DefinePlugin({
            "process.env.GOOGLE_CLIENT_ID": JSON.stringify(process.env.GOOGLE_CLIENT_ID),
            "process.env.GOOGLE_CLIENT_SECRET": JSON.stringify(process.env.GOOGLE_CLIENT_SECRET),
        }),
    ],
    devtool: "nosources-source-map",
    infrastructureLogging: {
        level: "log",
    },
};

module.exports = config;
