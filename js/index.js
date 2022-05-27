const { dialog } = require("electron").remote;
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const os = require("os");
const process = require("process");
const configPath = path.join(process.cwd(), "config.json");

const valueToLanguage = [
    "8086",
    "C",
    "C++",
    "Java",
    "lisp",
    "m2",
    "mira",
    "pasc",
    "Text",
];
const valueToMonacoLanguage = [
    "mips",
    "c",
    "cpp",
    "java",
    "plaintext",
    "m3",
    "plaintext",
    "pascal",
    "plaintext",
];

function chooseDirectory() {
    dialog
        .showOpenDialog({
            title: "请选择文件夹",
            properties: ["openDirectory"],
        })
        .then((ret) => {
            if (!ret.canceled && ret.filePaths.length == 1) {
                $("#directory-input").val(ret.filePaths[0]);
            }
        });
}

function processInputFileFilter() {
    const dir = $("#directory-input").val();
    const filter = eval($("#input-file-fliter").val());
    const fileList = [];

    if (fs.existsSync(dir)) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((file) => {
            if (file.isFile() && filter(file.name)) {
                fileList.push(path.join(dir, file.name));
            }
        });
    }
    $("#file-list").val(fileList.join("\n"));
}

async function processSIM() {
    const fileList = $("#file-list").val() + "\n\n";
    const language = valueToLanguage[Number($("#language-select").val())];
    const threshold = Number($("#threshold").val());
    let tempFilePath = path.join(os.tmpdir(), "SIM" + Math.random().toString());
    fs.writeFileSync(tempFilePath, fileList);
    const fd = await fs.promises.open(tempFilePath);

    let exePath = path.join(__dirname, "/SIM/sim_" + language + ".exe");
    console.log(exePath);

    const ret = child_process.spawnSync(
        exePath,
        ["-i", "-p", "-O", "-M", "-t", threshold.toString()],
        {
            maxBuffer: 10 * 1024 * 1024 * 1024,
            stdio: [fd, "pipe", "pipe"],
        }
    );

    await fd.close();
    fs.unlinkSync(tempFilePath);

    const out = ret.stdout.toString("utf-8");
    const err = ret.stderr.toString("utf-8");
    $("#sim-stdout").text(out);
    $("#sim-stderr").text(err);
}

function processResultFilter() {
    const out = $("#sim-stdout").text();
    const resArr = out.split("\n");
    let startIndex = resArr.indexOf("\r") + 1;
    let tableData = [];
    while (startIndex < resArr.length - 1) {
        let tempObj = {};
        let tempStrArray = resArr[startIndex].split(" ");
        tempObj.fileAName = path.basename(tempStrArray[0]);
        tempObj.similarPercentage = Number(tempStrArray[3]);
        tempObj.fileBName = path.basename(tempStrArray[6]);
        tableData.push(tempObj);
        startIndex++;
    }
    const fliter = eval($("#result-fliter").val());
    tableData = tableData.filter((v) =>
        fliter(v.fileAName, v.fileBName, v.similarPercentage)
    );
    const tableBody = $("#result-table>tbody").empty();
    tableData.forEach((v) => {
        tableBody.append(
            $(
                `<tr onclick="diff()"><th>${v.fileAName}</th><th>${v.fileBName}</th><th>${v.similarPercentage}</th></tr>`
            )
        );
    });
}

function diff() {
    const dir = $("#directory-input").val();
    const language = valueToMonacoLanguage[Number($("#language-select").val())];
    const tr = $(event.currentTarget);
    const fileAName = tr.find("th")[0].innerHTML;
    const fileBName = tr.find("th")[1].innerHTML;
    const percentage = tr.find("th")[2].innerHTML;
    const fileAPath = path.join(dir, fileAName);
    const fileBPath = path.join(dir, fileBName);
    const fileA = fs.readFileSync(fileAPath).toString("utf-8");
    const fileB = fs.readFileSync(fileBPath).toString("utf-8");
    $("#diffModalLabel").text(
        `${fileAName} <===> ${fileBName} Similarity: ${percentage}%`
    );
    window.editor.setModel({
        original: monaco.editor.createModel(fileA, language),
        modified: monaco.editor.createModel(fileB, language),
    });
    $("#diffModal").modal();
}

function loadConfig() {
    const config = JSON.parse(fs.readFileSync(configPath));
    $("#directory-input").val(config.directory ?? "");
    $("#input-file-fliter").val(config.fileFilter ?? "");
    $("#language-select").val(config.language ?? "");
    $("#threshold").val(config.threshold ?? "");
    $("#result-fliter").val(config.resultFilter ?? "");
}

function saveConfig(config) {
    fs.writeFileSync(
        configPath,
        JSON.stringify(
            config ?? {
                directory: $("#directory-input").val(),
                fileFilter: $("#input-file-fliter").val(),
                language: $("#language-select").val(),
                threshold: $("#threshold").val(),
                resultFilter: $("#result-fliter").val(),
            }
        )
    );
}
function resetConfig() {
    saveConfig({
        directory: os.homedir(),
        fileFilter: "(filename) => true",
        language: "2",
        threshold: 75,
        resultFilter: `(fileAName, fileBName, percentage) => {\n    const A = fileAName.split("-");\n    const B = fileBName.split("-");\n    return A[0] != B[0] && A[1] == B[1];\n};`,
    });
    loadConfig();
}

(function () {
    const amdLoader = require("./node_modules/monaco-editor/min/vs/loader.js");
    const amdRequire = amdLoader.require;
    const amdDefine = amdLoader.require.define;
    function uriFromPath(_path) {
        var pathName = path.resolve(_path).replace(/\\/g, "/");
        if (pathName.length > 0 && pathName.charAt(0) !== "/") {
            pathName = "/" + pathName;
        }
        return encodeURI("file://" + pathName);
    }
    amdRequire.config({
        baseUrl: uriFromPath(
            path.join(__dirname, "./node_modules/monaco-editor/min")
        ),
    });

    // workaround monaco-css not understanding the environment
    self.module = undefined;

    amdRequire(["vs/editor/editor.main"], function () {
        window.editor = window.monaco.editor.createDiffEditor(
            document.getElementById("container"),
            { readOnly: true, automaticLayout: true }
        );
    });
})();

(function () {
    if (!fs.existsSync(configPath)) {
        resetConfig();
    } else {
        loadConfig();
    }
    window.onbeforeunload = () => saveConfig();
})();
