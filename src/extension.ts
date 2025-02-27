import * as vscode from 'vscode';
import * as child from 'child_process';
import { getMaintainabilityRemark } from './cyclomatic/threshold';
import { getActiveFilePath } from './utils/utils';
import { Stat, Column } from './entities/stat';
import { LanguageFileExtension } from './entities/language';
import { Error, ErrorType } from './entities/errors';

var stringTable = require('string-table');

// Global UI Components
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let terminal: vscode.Terminal;

let showStatusBar: boolean = true;
let averageComplexity: string;
var lastUpdatedTime: number = new Date().getTime();

// commands
const commandToggleStatus = "gocyclo.toggleStatus";
const commandTotalComplexity = "gocyclo.getTotalComplexity";

// common constants 
var goCycloBinaryPath = "";
// var goCycloLibraryGitUrl = "github.com/dwarakauttarkar/gocyclo/cmd/gocyclo@latest";
 
export function activate(context: vscode.ExtensionContext) {
	//get the os type
	const executableName = 'gocyclo'; 
	const osType = process.platform;
	const executablePath = context.asAbsolutePath(`src/bin/${executableName}-${osType}`);
	goCycloBinaryPath = executablePath;
	context.subscriptions.push(vscode.commands.registerCommand("gocyclo.runGoCycle", () => {
		showTotalComplexityInTerminal(getActiveWorkspacePath());
	}));

	context.subscriptions.push(vscode.commands.registerCommand(commandToggleStatus, () => {
		showStatusBar = !showStatusBar;
		updateStatusBar();
	}));

	context.subscriptions.push(vscode.commands.registerCommand(commandTotalComplexity, () => {
		showTotalComplexityInTerminal();
	}));

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
	statusBarItem.tooltip = "Click here to get function level analysis";
	statusBarItem.command = commandTotalComplexity;

	context.subscriptions.push(statusBarItem);
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBar));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(updateStatusBarItemWithTimeDelay));

	updateStatusBar();
}

function isStatusBarShow(): boolean {
	if (!showStatusBar) {
		statusBarItem.hide();
		return false;
	}

	if (vscode.window.activeTextEditor) {
		let fileExt = vscode.window.activeTextEditor.document.uri.fsPath.split(".").pop();
		if (fileExt !== LanguageFileExtension.GO) {
			statusBarItem.hide();
			return false;;
		}
	}
	return true;
}



function updateStatusBarItemWithTimeDelay(): void {
	if (new Date().getTime() - lastUpdatedTime < 1500) {
		return;
	}
	updateStatusBar();
}

function publishAverageComplexityToStatusBar(): Error | null {
	let currentFilepath = getActiveFilePath();
	let command = goCycloBinaryPath + " -avg " + currentFilepath;
	child.exec(command, function (error, stdout, stdin) {
		if (error !== undefined) {
			if (categorizeChildProcessError(error) === ErrorType.BINARY_NOT_FOUND) {
				console.error("gocyclo not found, initiating the setup. ", error);
			}
		} 
		try {
			let avgScoreObj = JSON.parse(stdout);
			averageComplexity = avgScoreObj.average;
			statusBarItem.text = '$(getting-started-beginner) Average Cyclomatic: ' + averageComplexity;
			statusBarItem.show();
		} catch (exception) {
			console.error("Error while parsing the output for average complexity", exception);
			statusBarItem.hide();
		}
	});
	return null;
}

function categorizeChildProcessError(err: child.ExecException | null): ErrorType {
	if (err === null) {
		return ErrorType.UNKNOWN;
	}
	const message = err.message.toLocaleLowerCase();
	if (err.message.includes("No such file or directory") || err.message.includes("not found")) {
		if (err.message.includes("gocyclo")) {
			return ErrorType.BINARY_NOT_FOUND;
		}
	}
	return ErrorType.UNKNOWN;
}

function showTotalComplexityInTerminal(currentFilePath: string = getActiveFilePath()) {

	let command = goCycloBinaryPath + " -top 10000 -ignore _test.go " + currentFilePath;
	child.exec(command, function (error, stdout, stdin) {
		const stats: Stat[] = JSON.parse(stdout);
		for (let i = 0; i < stats.length; i++) {
			stats[i].Remark = getMaintainabilityRemark(stats[i].MaintainabilityIndex)
		}
		console.log(stats);
		outputChannel = getClearOutPutChannel();
		printTotalCyclomaticMetadata(outputChannel);
		printTotalMaintainabilityMetadata(outputChannel);
		outputChannel.appendLine("Function Level Analysis");
		let out: string = stringTable.create(stats, {
			headers: [Column.PKGNAME, Column.FUNCNAME,
				Column.CYCLO_COMPLEXITY, Column.MAINTAINABILITY_INDEX,  Column.REMARK],
			capitalizeHeaders: true,

		});
		outputChannel.appendLine(out);
		outputChannel.show();
	});
}

function getClearOutPutChannel(): vscode.OutputChannel {
	if (outputChannel === undefined || outputChannel === null) {
		outputChannel = vscode.window.createOutputChannel("GoCyclo");
	}
	outputChannel.clear();
	return outputChannel;
}

function printTotalCyclomaticMetadata(outputChannel: vscode.OutputChannel) {
	outputChannel.appendLine("Average Cyclomatic Complexity: " + averageComplexity + "\n");
	outputChannel.appendLine("Cyclomatic Complexity Thresholds:");
	outputChannel.appendLine("1-10: GOOD | 11-20: MODERATE | 21-30: COMPLEX | 31-40: EXTREMELY COMPLEX | 40+: INSANE \n");
}

function printTotalMaintainabilityMetadata(outputChannel: vscode.OutputChannel) {
	outputChannel.appendLine("Maintainability Index Thresholds:");
	outputChannel.appendLine("1-20: INSANE | 21-40: EXTREMELY COMPLEX | 40-60: COMPLEX | 60-80: GOOD | 80+: EXCELLENT \n");
}

function updateStatusBar() {
	if (!isStatusBarShow()) {
		return;
	}

	if (vscode.window.activeTextEditor) {
		var error = publishAverageComplexityToStatusBar();
		if (error !== null && error.errorType === ErrorType.BINARY_NOT_FOUND) {
			// if binary not found, then setup the binary & retry
			publishAverageComplexityToStatusBar();
		}
		lastUpdatedTime = new Date().getTime();
	}
}

export function deactivate() { }
