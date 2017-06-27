"use strict";

var GitHubApi = require("github");
var ZenHubApi = require("zenhub-api");
var Multimap = require("multimap");
var ghmd = require("github-markdown");

// Owner
const gitOwner = "FlowDesigner";

// Repo
const gitRepo = "Customers";
//const gitRepo = "IoT-Product-Realization";

// File to update
const gitFile = "STATUS.md";
const gitFileMessage = "Customer status";

// SF:  
// Project to get columns from and cards for
// (NOte:  ID is currently hardcoded.  In the future use name and convert to ID)
//const gitProjId = 602527;		// "Backlog" from Customers repo

// Insert API auth tokens in this format in the tokens.js file:
//
// exports.zenHubToken = "";
// exports.gitHubToken = "";
//
const tokens = require("./tokens.js");

const recentlyClosedTime = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Maps for various lists
var openList = new Map();
var closedList = new Map();
var epicList = new Map();			// List of epics by ID and URL
var epicItems = new Multimap();		// Multimap of epics with associated issues
var gitRepoId;

const gitHubNL = "   \n"; // github markdown requires 3 blanks at the end of the line to recognize it as new line

var github = new GitHubApi({
        debug: false,
        protocol: "https",
        host: "api.github.com",
        Promise: require("bluebird")
    });

var zenhub = new ZenHubApi(tokens.zenHubToken);

github.authenticate({
    type: "oauth",
    token: tokens.gitHubToken
});

// this is the main app logic
getRepoId().catch(function (err) { console.log("Your Github token is incorrect"); throw err; })
.then(fetchIssues)
.then(fetchIssuesByPage) //.then(printIssues)
.then(fetchEpics).catch(function(err) { console.log("Your ZenHub token is incorrect"); throw err; }) //.then(printEpics)
.then(generateReport);
// the end

// get the repo id from the owner & name constants defined above
function getRepoId() {
    return github.repos.get({
        owner: gitOwner,
        repo: gitRepo
    }).then(function (res) { gitRepoId = res.data.id; });
}

// fetch all issues
function fetchIssues() {
    return github.issues.getForRepo({
        owner: gitOwner,
        repo: gitRepo,
        state: "all"
    });
}

// process issues one page at a time
function fetchIssuesByPage(res) {
    catalogIssues(res.data);
//    console.log("One page fetched");

    if (github.hasNextPage(res)) { // recursion with promises FTW
        return github.getNextPage(res).then(fetchIssuesByPage);
    }
}

// store the issues in two maps
function catalogIssues(res) {
    var nowMS = Date.now();

    res.forEach(function (issue) {
        if (issue !== undefined) {
			// Clean up the issue's title to remove any brackets "[]" from it
			// for later sorting of the epic title headings.
			var cleanTitle = issue.title.replace('[', '');
			cleanTitle = cleanTitle.replace(']', '');

            if (issue.state === "closed") { // one map for closed issues
                var issueDate = new Date(issue.closed_at);
                if (nowMS - issueDate.getTime() < recentlyClosedTime) {
                    closedList.set(issue.number, {
                        title: cleanTitle,
                        url: issue.html_url,
                        closed: issue.closed_at,
						hasEpic: false
                    });
                }
            } else { // and one for open ones
                openList.set(issue.number, {
                    title: cleanTitle,
                    url: issue.html_url,
					hasEpic: false
                });
            }
        }
    });
}

// print issues, just for debugging
function printIssues() {
    console.log("We got " + openList.size + " issues and " + closedList.size + " closed");
    openList.forEach(function (value, key) {
        console.log(key + "=" + value.title);
    });
}

// fetch all epics
function fetchEpics() {
    console.log("Fetching epics");
    return zenhub.getEpics({
        repo_id: gitRepoId
    }).then(collectEpics);
}

// print epics, just for debugging
function printEpics() {
    console.log("Epic items: " + epicItems.size);
    epicList.forEach(function (value, key) {
        console.log(key + "=" + value);
    });
}

// store epics in the map
function collectEpics(data) {
    data.epic_issues.forEach(function (epic) {
        if (epic !== undefined) {
            epicList.set(epic.issue_number, epic.issue_url);
        }
    });

    var promiseArray = [];

    // create a multimap containing issues for each epic
    epicList.forEach(function (value, key) {
        console.log("Fetching issues for epic " + key);
        promiseArray.push(zenhub.getEpicData({
                repo_id: gitRepoId,
                epic_id: key
            }).then(function (edata) {
                if (edata.issues.length === 0) { // epic itself can be an issue
                    epicItems.set(key, []);
                } else {
                    edata.issues.forEach(function (epissue) {
                        if (epissue !== undefined) {
                            epicItems.set(key, epissue.issue_number);
                        }
                    });
                }
            }));
    });

    console.log("Done with epic multimap");

    // this will ensure we are waiting for all asynchronous zenhub.getEpicData calls to finish
    return Promise.all(promiseArray);
}

// format all epics and issues and upload them to github
function generateReport() {
    var fileContent = "";
    var headersMD = [];
	var reportItems = new Map();

    console.log("Generating report...");

    // For each epic in the epic multimap, generate MD of epic and associated issues
    epicItems.forEachEntry(function (entry, key) {

        if (openList.has(key)) { 	// ignore closed epics
			console.log("   epic " + key);

            var epicMD = mdEpic(key); 	// github MD for the epic header
            var openMD = "";			// MD string of epic's open subitems
            var closedMD = "";			// MD string of epic's closed subitems
			
			// Add epic in MD format to array of headers
            headersMD.push(epicMD);

			// Mark epic itself (in the map of open issues) as having an epic
			openList.get(key).hasEpic = true;

			// For each subissue of the epic
            entry.forEach(function (item) {
                var iss;

				// See which list has the subissue, generate MD for it, add it to
				// associated MD string array, then mark it as belonging to an epic.
                if (openList.has(item)) {
                    iss = openList.get(item);
                    openMD += mdOpenItem(item, iss); 		// github md for open item
					iss.hasEpic = true;
                } else if (closedList.has(item)) {
                    iss = closedList.get(item);                    
                    closedMD += mdClosedItem(item, iss); 	// github md for closed item
					iss.hasEpic = true;
                };				
            });

			// MD formatted section of epic + bulletted heading of open and closed subissues, 
			// kept in a map with epic ID as key.  File's contents are generated from sorted
			// list of headings.
            var rep = (openMD !== "") ? "* Open" + gitHubNL + openMD : "";
            rep += (closedMD !== "") ? "* Recently closed" + gitHubNL + closedMD : "";
            reportItems.set(epicMD, rep);
        }
    });
	
    // let's sort the epics by name
	// SF:  Note:  This is sorting the entries which are in MD format, i.e., they begin with
	// "###", etc.  The "[" and "]" in the title were removed earlier when populating the maps.
    headersMD.sort().forEach(function (hdr) { fileContent += hdr + reportItems.get(hdr); });

	// For open and closed items (in MD string format)
	var noepicOpenItems = "";	
	var noepicClosedItems = "";

	// find open issues with no epics and make github MD for each of them
	openList.forEach(function (issue, number) {		
		if (!issue.hasEpic) {
			noepicOpenItems += mdOpenItem(number, issue);					
		}
	});
	
	// find closed issues with no epics and make github MD for each of them
	// SF:  Theoretically, this should never happen, 
	// i.e., there should be no items closed that don't belong to any epics.
	closedList.forEach(function (issue, number) {		
		if (!issue.hasEpic) {
           noepicClosedItems +=  mdClosedItem(number, issue);					
		}
	});
	
	// Heading section for "Issues with no epics" (triple bold).  Covers open as well as closed issues.
	// This gets formatted as bold, italics in black (unlike the epic headings which are bolded and blue).
	if (noepicOpenItems !== "" || noepicClosedItems !== "") {
		fileContent += "### *Issues with no epics*" + gitHubNL;
        fileContent += (noepicOpenItems   !== "") ? "* Open"            + gitHubNL + noepicOpenItems   : "";		
		fileContent += (noepicClosedItems !== "") ? "* Recently closed" + gitHubNL + noepicClosedItems : "";
	};
	
	// If -w flag is not present, just dump the report to the console
    if (process.argv.indexOf("-w") === -1) { 		
		if (process.argv.indexOf("-h") !== -1) { 	// generate HTML if -h flag is present
			fileContent = ghmd(`## ${gitOwner}/${gitRepo}` + gitHubNL + fileContent);
		};
		
        console.log(fileContent); 
    } else {
		console.log("Writing to " + gitOwner + "/" + gitRepo + "/" + gitFile + " ...");
        github.repos.getContent({ // now let's find out if the file already exists
            owner: gitOwner,
            repo: gitRepo,
            path: gitFile
        }).then(function (res) { // yes, update the existing file
            github.repos.updateFile({
                owner: gitOwner,
                repo: gitRepo,
                path: gitFile,
                message: gitFileMessage,
                sha: res.data.sha,
                content: new Buffer(fileContent).toString("base64")
            }, function (err, res) {
                console.log(err, res);
            });
        }).catch(function (err) { // no, create the file
            if (err.code === 404) { // but only on 404 error
                github.repos.createFile({
                    owner: gitOwner,
                    repo: gitRepo,
                    path: gitFile,
                    message: gitFileMessage,
                    content: new Buffer(fileContent).toString("base64")
                }, function (err, res) {
                    console.log(err, res);
                });
            } else { // any other error needs attention
                console.log(err);
            }
        });
    }
}

// Github MD helper functions returning MD strings

function mdEpic(issueId) {					// github md for epics
//	return `### [${openList.get(issueId).title}](${openList.get(issueId).url})` + gitHubNL;
	return `### [${openList.get(issueId).title}](${openList.get(issueId).url})` + gitHubNL;
}

function mdOpenItem(issueId, issue) {		// github md for open items
	return `[#${issueId} ${issue.title}](${issue.url})` + gitHubNL;	
}

// Closed items get the date appended
function mdClosedItem(issueId, issue) {		// github md for closed items
	var closedTime = new Date(issue.closed);
	return `[#${issueId} ${issue.title}](${issue.url}) (${closedTime.toLocaleDateString()})` + gitHubNL;
}
