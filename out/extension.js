"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const child = require("child_process");
const threshold_1 = require("./cyclomatic/threshold");
const utils_1 = require("./utils/utils");
const stat_1 = require("./entities/stat");
const language_1 = require("./entities/language");
const errors_1 = require("./entities/errors");
var stringTable = require('string-table');
// Global UI Components
let statusBarItem;
let outputChannel;
let showStatusBar = true;
let averageComplexity;
let goPath;
var lastUpdatedTime = new Date().getTime();
// commands
const commandToggleStatus = "gocyclo.toggleStatus";
const commandTotalComplexity = "gocyclo.getTotalComplexity";
// common constants
const goCycloBinaryPath = "/tmp/gocyclo/gocyclo";
const goCycloLibraryGitUrl = "github.com/dwarakauttarkar/gocyclo/cmd/gocyclo@latest";
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("gocyclo.runGoCycle", (folderUri) => {
        console.log(folderUri);
        showTotalComplexityInTerminal(folderUri.path);
    }));
    context.subscriptions.push(vscode.commands.registerCommand(commandToggleStatus, () => {
        showStatusBar = !showStatusBar;
        updateStatusBar();
    }));
    context.subscriptions.push(vscode.commands.registerCommand(commandTotalComplexity, () => {
        showTotalComplexityInTerminal();
    }));
    setup();
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.tooltip = "Click here to get function level analysis";
    statusBarItem.command = commandTotalComplexity;
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBar));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(updateStatusBarItemWithTimeDelay));
    updateStatusBar();
}
exports.activate = activate;
function isStatusBarShow() {
    if (!showStatusBar) {
        statusBarItem.hide();
        return false;
    }
    if (vscode.window.activeTextEditor) {
        let fileExt = vscode.window.activeTextEditor.document.uri.fsPath.split(".").pop();
        if (fileExt !== language_1.LanguageFileExtension.GO) {
            statusBarItem.hide();
            return false;
            ;
        }
    }
    return true;
}
function updateStatusBarItemWithTimeDelay() {
    if (new Date().getTime() - lastUpdatedTime < 1500) {
        return;
    }
    updateStatusBar();
}
function publishAverageComplexityToStatusBar() {
    let currentFilepath = (0, utils_1.getActiveFilePath)();
    let command = goCycloBinaryPath + " -avg " + currentFilepath;
    child.exec(command, function (error, stdout, stdin) {
        if (error !== undefined) {
            if (categorizeChildProcessError(error) === errors_1.ErrorType.BINARY_NOT_FOUND) {
                console.error("gocyclo binary not found, initiating the setup", error);
                setup();
            }
        }
        try {
            let avgScoreObj = JSON.parse(stdout);
            averageComplexity = avgScoreObj.average;
            statusBarItem.text = '$(getting-started-beginner) Avg Cyclomatic: ' + averageComplexity;
            statusBarItem.show();
        }
        catch (exception) {
            console.error("Error while parsing the output for average complexity", exception);
            statusBarItem.hide();
        }
    });
    return null;
}
function categorizeChildProcessError(err) {
    if (err === null) {
        return errors_1.ErrorType.UNKNOWN;
    }
    if (err.message.includes("No such file or directory") && err.message.includes("gocyclo")) {
        return errors_1.ErrorType.BINARY_NOT_FOUND;
    }
    return errors_1.ErrorType.UNKNOWN;
}
function setup() {
    // setting up go path in global variable
    let workspace = vscode.workspace.getConfiguration();
    let allAsJSON = JSON.parse(JSON.stringify(workspace));
    goPath = allAsJSON.go.gopath;
    console.log("go path is: " + goPath);
    // installing go cyclo if not already available
    child.exec('go install ' + goCycloLibraryGitUrl, function (error, stdout, stdin) {
        if (error !== undefined) {
            console.error(error);
            return;
        }
        else {
            console.log("setup goCyclo completed");
        }
    });
    console.log("successfully installed gocyclo");
    // creating tmp folder if not available
    child.exec('mkdir -p /tmp/gocyclo', function (error, stdout, stdin) {
        if (error !== undefined) {
            console.error(error);
            return;
        }
        else {
            console.log("setup tmp folder completed");
        }
    });
    console.log("successfully created tmp folder");
    // moving the gocyclo binary to tmp folder
    child.exec('mv ' + goPath + '/bin/gocyclo /tmp/gocyclo', function (error, stdout, stdin) {
        if (error !== undefined) {
            console.error(error);
            return;
        }
        else {
            console.log("setup tmp folder completed");
        }
    });
    console.log("successfully moved gocyclo to tmp folder");
    console.log("setup completed");
}
function showTotalComplexityInTerminal(currentFilePath = (0, utils_1.getActiveFilePath)()) {
    let command = goCycloBinaryPath + " -top 1000 " + currentFilePath;
    child.exec(command, function (error, stdout, stdin) {
        const stats = JSON.parse(stdout);
        for (let i = 0; i < stats.length; i++) {
            stats[i].Remark = (0, threshold_1.getCyclomaticThresholdDescription)(stats[i].Complexity);
        }
        console.log(stats);
        outputChannel = getClearOutPutChannel();
        printTotalComplexityMetadata(outputChannel);
        outputChannel.appendLine("Function Level Analysis");
        let out = stringTable.create(stats, {
            headers: [stat_1.Column.PKGNAME, stat_1.Column.FUNCNAME, stat_1.Column.COMPLEXITY, stat_1.Column.REMARK],
            capitalizeHeaders: true,
        });
        outputChannel.appendLine(out);
        outputChannel.show();
    });
}
function getClearOutPutChannel() {
    if (outputChannel === undefined || outputChannel === null) {
        outputChannel = vscode.window.createOutputChannel("GoCyclo");
    }
    outputChannel.clear();
    return outputChannel;
}
function printTotalComplexityMetadata(outputChannel) {
    outputChannel.appendLine("Average Cyclomatic Complexity: " + averageComplexity + "\n");
    outputChannel.appendLine("Thresholds:");
    outputChannel.appendLine("[1-10: GOOD]; [11-20: MODERATE]; [21-30: COMPLEX]; [31-40: EXTREMELY COMPLEX]; [40+: INSANE !] \n");
}
function updateStatusBar() {
    if (!isStatusBarShow()) {
        return;
    }
    if (vscode.window.activeTextEditor) {
        var error = publishAverageComplexityToStatusBar();
        if (error !== null && error.errorType === errors_1.ErrorType.BINARY_NOT_FOUND) {
            // if binary not found, then setup the binary & retry
            publishAverageComplexityToStatusBar();
        }
        lastUpdatedTime = new Date().getTime();
    }
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map