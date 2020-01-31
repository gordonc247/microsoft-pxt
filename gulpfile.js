const fs = require("fs");
const os = require("os");
const path = require("path");

const gulp = require("gulp");
const ts = require("gulp-typescript");
const merge = require("merge-stream");
const concat = require("gulp-concat");
const header = require("gulp-header");
const ju = require("./jakeutil");

const exec = ju.exec;
const rimraf = ju.rimraf;

const isWin32 = os.platform() === "win32";

const clean = () => rimraf("built").then(() => rimraf("temp"));



/********************************************************
                    TypeScript build
*********************************************************/

const copyTypescriptServices = () => gulp.src("node_modules/typescript/lib/typescriptServices.d.ts")
    .pipe(gulp.dest("built"));

const pxtlib = () => compileTsProject("pxtlib");
const pxtcompiler = () => compileTsProject("pxtcompiler");
const pxtpy = () => compileTsProject("pxtpy");
const pxtsim = () => compileTsProject("pxtsim");
const pxtblocks = () => compileTsProject("pxtblocks");
const pxtwinrt = () => compileTsProject("pxtwinrt");
const pxtrunner = () => compileTsProject("pxtrunner");
const pxteditor = () => compileTsProject("pxteditor");
const pxtweb = () => compileTsProject("docfiles/pxtweb", "built/web");
const backendutils = () => compileTsProject("backendutils")
const cli = () => compileTsProject("cli", "built", true);
const webapp = () => compileTsProject("webapp", "built/webapp", true);

const pxtblockly = () => gulp.src([
        "webapp/public/blockly/blockly_compressed.js",
        "webapp/public/blockly/blocks_compressed.js",
        "webapp/public/blockly/msg/js/en.js",
        "built/pxtblocks.js"
    ])
    .pipe(concat("pxtblockly.js"))
    .pipe(gulp.dest("built"));

const pxtapp = () => gulp.src([
        "node_modules/lzma/src/lzma_worker-min.js",
        "built/pxtlib.js",
        "built/pxtwinrt.js",
        "built/pxteditor.js",
        "built/pxtsim.js"
    ])
    .pipe(concat("pxtapp.js"))
    .pipe(gulp.dest("built/web"));

const pxtworker = () => gulp.src([
        "node_modules/typescript/lib/typescript.js",
        "node_modules/fuse.js/dist/fuse.min.js",
        "node_modules/lzma/src/lzma_worker-min.js",
        "built/pxtlib.js",
        "built/pxtcompiler.js",
        "built/pxtpy.js"
    ])
    .pipe(concat("pxtworker.js"))
    .pipe(header(`"use strict";\n`,))
    .pipe(gulp.dest("built/web"));

const pxtembed = () => gulp.src([
        "node_modules/typescript/lib/typescript.js",
        "node_modules/lzma/src/lzma_worker-min.js",
        "built/pxtlib.js",
        "built/pxtcompiler.js",
        "built/pxtpy.js",
        "built/pxtblockly.js",
        "built/pxteditor.js",
        "built/pxtsim.js",
        "built/pxtrunner.js"
    ])
    .pipe(concat("pxtembed.js"))
    .pipe(gulp.dest("built/web"));

const pxtjs = () => gulp.src([
        "node_modules/typescript/lib/typescript.js",
        "built/pxtlib.js",
        "built/pxtcompiler.js",
        "built/pxtpy.js",
        "built/pxtsim.js",
        "built/cli.js"
    ])
    .pipe(concat("pxt.js"))
    .pipe(header( `
        "use strict";
        // make sure TypeScript doesn't overwrite our module.exports
        global.savedModuleExports = module.exports;
        module.exports = null;
    `))
    .pipe(gulp.dest("built"));

const pxtdts = () => gulp.src("built/cli.d.ts")
    .pipe(concat("pxt.d.ts"))
    .pipe(gulp.dest("built"));


const targetjs = () => exec("node built/pxt.js buildtarget", true);

const buildcss = () => exec("node built/pxt.js buildcss", true);

const pxtTravis = () => exec("node built/pxt.js travis", true);


function compileTsProject(dirname, destination, useOutdir) {
    if (!destination) destination = "built";
    let opts = useOutdir ? {
        outDir: path.resolve(destination)
    } : {
        out: path.resolve(destination, path.basename(dirname) + ".js")
    };

    let configPath = path.join(dirname, "tsconfig.json");
    let tsProject = ts.createProject(configPath, opts);
    let tsResult = tsProject.src()
        .pipe(tsProject());

    return merge(
        tsResult.js.pipe(gulp.dest(destination)),
        tsResult.dts.pipe(gulp.dest(destination))
    );
}

// TODO: Copied from Jakefile; should be async
function pxtcommon() {
    const std = {}
    const files = ju.expand(['libs/pxt-common', 'libs/pxt-python'], ".ts")
    for (let f of files) {
        std[path.basename(f)] = fs.readFileSync(f, "utf8")
    }
    fs.writeFileSync("built/pxt-common.json", JSON.stringify(std, null, 4))
    return Promise.resolve();
}

// TODO: Copied from Jakefile; should be async
function updatestrings() {
    let errCnt = 0;
    const translationStrings = {}
    const translationHelpStrings = {}

    function processLf(filename) {
        if (!/\.(ts|tsx|html)$/.test(filename)) return
        if (/\.d\.ts$/.test(filename)) return

        //console.log('extracting strings from %s', filename);
        fs.readFileSync(filename, "utf8").split('\n').forEach((line, idx) => {
            function err(msg) {
                console.log("%s(%d): %s", filename, idx, msg);
                errCnt++;
            }

            while (true) {
                let newLine = line.replace(/\blf(_va)?\s*\(\s*(.*)/, (all, a, args) => {
                    let m = /^("([^"]|(\\"))+")\s*[\),]/.exec(args)
                    if (m) {
                        try {
                            let str = JSON.parse(m[1])
                            translationStrings[str] = 1
                        } catch (e) {
                            err("cannot JSON-parse " + m[1])
                        }
                    } else {
                        if (!/util\.ts$/.test(filename))
                            err("invalid format of lf() argument: " + args)
                    }
                    return "BLAH " + args
                })
                if (newLine == line) return;
                line = newLine
            }
        })
    }

    let fileCnt = 0;
    const paths = ju.expand1(["pxtlib", "pxtblocks", "pxtblocks/fields", "webapp/src"]);
    paths.forEach(pth => {
        fileCnt++;
        processLf(pth);
    });

    Object.keys(translationHelpStrings).forEach(k => translationStrings[k] = k)
    let tr = Object.keys(translationStrings)
    tr.sort()

    if (!fs.existsSync("built")) fs.mkdirSync("built");
    fs.writeFileSync("built/localization.json", JSON.stringify({ strings: tr }, null, 1))
    let strings = {};
    tr.forEach((k) => { strings[k] = k; });
    fs.writeFileSync("built/strings.json", JSON.stringify(strings, null, 2));

    console.log("Localization extraction: " + fileCnt + " files; " + tr.length + " strings");
    if (errCnt > 0)
        console.log("%d errors", errCnt);

    return Promise.resolve();
}



/********************************************************
                  Webapp dependencies
*********************************************************/

const semanticjs = () => gulp.src(ju.expand([
        "node_modules/semantic-ui-less/definitions/globals",
        "node_modules/semantic-ui-less/definitions/modules/accordion.js",
        "node_modules/semantic-ui-less/definitions/modules/checkbox.js",
        "node_modules/semantic-ui-less/definitions/modules/dimmer.js",
        "node_modules/semantic-ui-less/definitions/modules/dropdown.js",
        "node_modules/semantic-ui-less/definitions/modules/embed.js",
        "node_modules/semantic-ui-less/definitions/modules/modal.js",
        "node_modules/semantic-ui-less/definitions/modules/popup.js",
        "node_modules/semantic-ui-less/definitions/modules/search.js",
        "node_modules/semantic-ui-less/definitions/modules/sidebar.js",
        "node_modules/semantic-ui-less/definitions/modules/transition.js",
        "node_modules/semantic-ui-less/definitions/behaviors"],
    ".js"))
    .pipe(concat("semantic.js"))
    .pipe(gulp.dest("built/web"));

const copyJquery = () => gulp.src("node_modules/jquery/dist/jquery.min.js")
    .pipe(concat("jquery.js"))
    .pipe(gulp.dest("built/web"));

const copyWebapp = () =>
    gulp.src([
        "node_modules/bluebird/js/browser/bluebird.min.js",
        "node_modules/applicationinsights-js/dist/ai.0.js",
        "node_modules/typescript/lib/typescript.js",
        "built/pxtlib.js",
        "built/pxtcompiler.js",
        "built/pxtpy.js",
        "built/pxtblocks.js",
        "built/pxtblockly.js",
        "built/pxtsim.js",
        "built/pxtrunner.js",
        "built/pxteditor.js",
        "built/pxtwinrt.js",
        "built/webapp/src/worker.js"
    ])
    .pipe(gulp.dest("built/web"));

const copySemanticFonts = () => gulp.src("node_modules/semantic-ui-less/themes/default/assets/fonts/*")
    .pipe(gulp.dest("built/web/fonts"))

const copyPlaygroundHelpers = () => gulp.src("libs/pxt-common/pxt-helpers.ts")
    .pipe(concat("pxt-helpers.js"))
    .pipe(gulp.dest("docs/static/playground/pxt-common/"));

const copyPlaygroundCore = () => gulp.src("libs/pxt-common/pxt-core.d.ts")
    .pipe(concat("pxt-core.d.js"))
    .pipe(gulp.dest("docs/static/playground/pxt-common/"));

const copyPlayground = gulp.parallel(copyPlaygroundCore, copyPlaygroundHelpers)

const browserifyWebapp = () => process.env.PXT_ENV == 'production' ?
    exec('node node_modules/browserify/bin/cmd ./built/webapp/src/app.js -g [ envify --NODE_ENV production ] -g uglifyify -o ./built/web/main.js') :
    exec('node node_modules/browserify/bin/cmd built/webapp/src/app.js -o built/web/main.js --debug')

const buildSVGIcons = () => {
    let webfontsGenerator = require('webfonts-generator')
    let name = "xicon"

    return new Promise((resolve, reject) => {
        webfontsGenerator({
            fontName: name,
            files: ju.expand(["svgicons"], ".svg"),
            dest: "built/fonts/", // fake
            templateOptions: {
                classPrefix: name + ".",
                baseClass: name
            },
            // The following icons have fixed code points because they are referenced in the code
            codepoints: {
                function: 0xf109,
                bucket: 0xf102,
                undo: 0xf118,
                redo: 0xf111,
                rectangularselection: 0xf113
            },
            writeFiles: false,
        }, function (error, res) {
            if (error) {
                reject(error)
            } else {
                let css = res.generateCss()
                let data = res["woff"].toString("base64")
                css = css.replace(/^\s*src:[^;]+;/m,
                    "    src: url(data:application/x-font-woff;charset=utf-8;base64," + data + ") format(\"woff\");")
                css = css.replace(/line-height:\s*1;/, "")
                // SUI css file would override our icons without !important;
                // our icons have xicon class so it never happens the other way around
                css = css.replace(/(content:.*);/g, (f, m) => m + " !important;")
                console.log("Generated icons.css -", css.length, "bytes")
                let html = "<!doctype html>\n<html><body style='font-size: 30px'><style>@import './icons.css';</style>\n"
                css.replace(/\.(\w+):before /g, (f, n) => {
                    html += `<div style="margin:20px;"> <i class="${name} ${n}"></i> <span style='padding-left:1em; font-size:0.8em; opacity:0.5;'>${n}</span> </div>\n`
                })
                html += "</body></html>\n"
                fs.writeFileSync("built/web/icons.html", html)
                fs.writeFileSync("built/web/icons.css", css)
                resolve();
            }
        })
    })
}



/********************************************************
                     Monaco editor
*********************************************************/

const copyMonacoBase = () => gulp.src("node_modules/monaco-editor/min/vs/base/**/*")
    .pipe(gulp.dest("webapp/public/vs/base"));

const copyMonacoEditor = () => gulp.src([
        "node_modules/monaco-editor/min/vs/editor/**/*",
        "!**/editor.main.js"
    ])
    .pipe(gulp.dest("webapp/public/vs/editor"));

const copyMonacoLoader = () => gulp.src("node_modules/monaco-editor/min/vs/loader.js")
    .pipe(gulp.dest("webapp/public/vs"));

const copyMonacoEditorMain = () => gulp.src("node_modules/monaco-editor/dev/vs/editor/editor.main.js")
    .pipe(gulp.dest("built/web/vs/editor/"));

const copyMonacoBasicLanguages = () => gulp.src([
        "node_modules/monaco-editor/min/vs/basic-languages/src/bat.js",
        "node_modules/monaco-editor/min/vs/basic-languages/src/cpp.js",
        "node_modules/monaco-editor/min/vs/basic-languages/src/python.js",
        "node_modules/monaco-editor/min/vs/basic-languages/src/markdown.js"
    ])
    .pipe(gulp.dest("webapp/public/vs/basic-languages/src/"));

const copyMonacoJSON = () => gulp.src("webapp/public/vs/language/json/**/*")
    .pipe(gulp.dest("webapp/public/vs/language/json"));

const copyMonacoTypescript = () => gulp.src([
        "node_modules/pxt-monaco-typescript/release/src/mode.js",
        "node_modules/pxt-monaco-typescript/release/src/worker.js"
    ])
    .pipe(gulp.dest("built/web/vs/language/typescript/src/"));

const copyMonacoTypescriptServices = () => gulp.src("node_modules/pxt-monaco-typescript/release/lib/typescriptServices.js")
    .pipe(gulp.dest("built/web/vs/language/typescript/lib/"));

const stripMonacoSourceMaps = () => {
    ju.stripSrcMapSync("webapp/public/vs/")
    return Promise.resolve();
}

const copyMonaco = gulp.series(gulp.parallel(
    copyMonacoBase,
    copyMonacoEditor,
    copyMonacoLoader,
    copyMonacoEditorMain,
    copyMonacoJSON,
    copyMonacoBasicLanguages,
    copyMonacoTypescript,
    copyMonacoTypescriptServices
), stripMonacoSourceMaps);



/********************************************************
                      Blockly
*********************************************************/

const copyBlocklyCompressed = () => gulp.src([
        "node_modules/pxt-blockly/blocks_compressed.js",
        "node_modules/pxt-blockly/blockly_compressed.js"
    ])
    .pipe(gulp.dest("webapp/public/blockly/"));

const copyBlocklyEnJs = () => gulp.src("node_modules/pxt-blockly/msg/js/en.js")
    .pipe(gulp.dest("webapp/public/blockly/msg/js/"));

const copyBlocklyEnJson = () => gulp.src("node_modules/pxt-blockly/msg/json/en.json")
    .pipe(gulp.dest("webapp/public/blockly/msg/json/"));

const copyBlockly = gulp.parallel(copyBlocklyCompressed, copyBlocklyEnJs, copyBlocklyEnJson);



/********************************************************
                 Tests and Linting
*********************************************************/

const lint = () => Promise.all(
        ["cli", "pxtblocks", "pxteditor", "pxtlib", "pxtcompiler",
        "pxtpy", "pxtrunner", "pxtsim", "pxtwinrt", "webapp",
        "docfiles/pxtweb"].map(dirname =>
    exec(`node node_modules/tslint/bin/tslint --project ./${dirname}/tsconfig.json`, true)))
    .then(() => console.log("linted"))

const testdecompiler = testTask("decompile-test", "decompilerunner.js");
const testlang = testTask("compile-test", "compilerunner.js");
const testerr = testTask("errors-test", "errorrunner.js");
const testfmt = testTask("format-test", "formatrunner.js");
const testpydecomp = testTask("pydecompile-test", "pydecompilerunner.js");
const testpycomp = testTask("pyconverter-test", "pyconvertrunner.js");
const testpytraces = testTask("runtime-trace-tests", "tracerunner.js");
const testtutorials = testTask("tutorial-test", "tutorialrunner.js");

const buildKarmaRunner = () => compileTsProject("tests/blocklycompiler-test", "built/tests/", true);
const runKarma = () => {
    let command;
    if (isWin32) {
        command = "node_modules/.bin/karma.cmd start karma.conf.js ";
    }
    else {
        command = "./node_modules/.bin/karma start karma.conf.js ";
        if (process.env.GITHUB_ACTIONS)
            command = "xvfb-run --auto-servernum " + command;
    }
    return exec(command, true);
}
const karma = gulp.series(buildKarmaRunner, runKarma);

const testAll = gulp.parallel(
    testdecompiler,
    testlang,
    testerr,
    testfmt,
    // testpydecomp,
    testpycomp,
    testpytraces,
    testtutorials,
    karma
)

const update = () => exec("git pull", true).then(() => exec("npm install", true))

function testTask(testFolder, testFile) {
    const buildTs = () => compileTsProject("tests/" + testFolder, "built/tests", true);

    const buildTestRunner = () => gulp.src([
            "node_modules/typescript/lib/typescript.js",
            "built/pxtlib.js",
            "built/pxtcompiler.js",
            "built/pxtpy.js",
            "built/pxtsim.js",
            "built/tests/" + testFolder + "/" + testFile,
        ])
        .pipe(concat("runner.js"))
        .pipe(header(`
            "use strict";
            // make sure TypeScript doesn't overwrite our module.exports
            global.savedModuleExports = module.exports;
            module.exports = null;
        `))
        .pipe(gulp.dest('built/tests/' + testFolder));

    const testArgs = " built/tests/" + testFolder + "/runner.js --reporter dot";


    const runTest = () => isWin32 ?
        exec(path.resolve("node_modules/.bin/mocha.cmd") + testArgs, true) :
        exec("./node_modules/.bin/mocha" + testArgs, true);

    return gulp.series(buildTs, buildTestRunner, runTest);
}

const buildAll = gulp.series(
    updatestrings,
    copyTypescriptServices,
    gulp.parallel(pxtlib, pxtweb),
    gulp.parallel(pxtcompiler, pxtsim, backendutils),
    gulp.parallel(pxtpy, gulp.series(pxtblocks, pxtblockly)),
    pxteditor,
    gulp.parallel(pxtrunner, pxtwinrt, cli, pxtcommon),
    gulp.parallel(pxtjs, pxtdts, pxtapp, pxtworker, pxtembed),
    targetjs,
    gulp.parallel(buildcss, buildSVGIcons),
    webapp,
    browserifyWebapp,
    gulp.parallel(semanticjs, copyJquery, copyWebapp, copyPlayground, copySemanticFonts, copyMonaco, copyBlockly)
);

const travis = gulp.series(buildAll, lint, testAll, targetjs, pxtTravis);

exports.default = buildAll;

exports.lint = lint
exports.clean = clean;
exports.build = buildAll;
exports.updatestrings = updatestrings;

exports.testdecompiler = testdecompiler;
exports.testlang = testlang;
exports.testerr = testerr;
exports.testfmt = testfmt;
exports.testpydecomp = testpydecomp;
exports.testpycomp = testpycomp;
exports.testpytraces = testpytraces;
exports.testtutorials = testtutorials;
exports.test = testAll;
exports.travis = travis;
exports.karma = karma;
exports.update = update;