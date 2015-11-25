var AWS = new require('aws-sdk');
//set region prior to loading of client objects
AWS.config.update({region: 'us-west-2'});

var _ = require('lodash');
//refill this in later based on local dir
var simpleGit = require('simple-git')();
var fs = require('fs');
var archiver = require('archiver');
var dynamodb = new AWS.DynamoDB();
var s3 = new AWS.S3({region: undefined});

//local requires
var utl = require('./modules/utl.js');

//not being used right now, might be useful in future
//to keep reference of current directory
var currentDir;

var repoPaths = {
	meta: 'https://github.com/im89097733/ContentMeta.git',
	base: 'https://github.com/im89097733/ROOT.git'
};

var params = {
	"RequestItems": {
	    "Version": {
	        "Keys": [
	            {"label": {"S":"Meta"}},
	            {"label": {"S":"BASE"}}
	        ]
	    }
	}
};
//Change this variable to specify version in dynamo (bootstrap, test, etc);
var verMapSelect = 'bootstrap_test';
var branchName = "test";

//use this object to determine write information for different paths and repos
//will add in version name and label after database query
var folderName = {
	meta: {
		s3Bucket: 'MetaVersions',
		writeName: 'Meta.zip'
	},
	base: {
		s3Bucket: 'BASEVersions',
		writeName: 'BASE.zip'
	}
};

//put in directories that need to be pushed
var dirArr = [];
//variable to hold references to new version numbers for s3
var verRefArr = [];

getDbItems()
	.then(function(){
		return getDirs();
	}, function(err){
		throw err;
	})
	.then(function(isEmpty){
		return new Promise(function(resCb, rejCb){
			var promArr = [];
			if (isEmpty){
				dirArr.forEach(function(obj){
					//push promise and pass zipFile the promise callback
					promArr.push(new Promise(function(resolve, reject){
						cloneRepo(obj, function(){
							zipFiles(obj, function(stream){
								setS3(obj.name, stream, resolve, reject);
							});
						});
					})
				);
				});
			}
			else {
				dirArr.forEach(function(obj){
					promArr.push(new Promise(function(resolve, reject){
						//go through folders in repo folder
						require('simple-git')(obj.dir).checkout(branchName)
								 .pull(repoPaths[obj.name], branchName, function(err, update){
								if (err) return reject(err);
								console.log('repo ' + obj.name + ' pulled');
								zipFiles(obj, function(stream){
									//call s3 function and pass in promise args to resolve in callback
									setS3(obj.name, stream, resolve, reject);
								});
							});
					}));
					//reset the git module to look at this file path
				});
			}
			return Promise.all(promArr).then(function(){
				return resCb();
			}).catch(function(err){
				throw err;
			});
		});
	})
	.then(function(){
		console.log('program completed');
	}, function(err){
		throw err;
	});
//push files to s3
function setS3(dir, stream, cbResolve, cbReject){
	console.log('s3 init');
	
	var s3Opts = getS3FolderName(dir);

	//pass read stream in to params object to push to s3
	var s3Params = {
		Bucket: 'peekaplatform/' + s3Opts.s3Bucket + '/' + s3Opts.bucketData,
		Key: s3Opts.writeName,
		Body: stream
	}

	s3.putObject(s3Params, function(err, data){
		if (err) cbReject(err);
		console.log('uploaded!');
		return cbResolve();
	});
}


//return the appropriate config for the directory being used
//pretty much a switch case
function getS3FolderName(name, writeObj){
	if (typeof writeObj !== undefined){
		folderName[name] = _.extend(folderName[name], writeObj);
	}
	return folderName[name];
}

//find the items in the database and increase the version by one
function getDbItems(){
	return new Promise(function(res, rej){
		var ddbItems = [];

		dynamodb.batchGetItem(params, function(err, data){
			if (err) return rej(err);
			data.Responses.Version.forEach(function(item){
				var newVerMap = item.ver;

				newVerMap.M[verMapSelect].N = utl.increaseDbNum(newVerMap.M[verMapSelect].N);
		
				getS3FolderName(item.label.S.toLowerCase(), {
					label: item.label.S.toLowerCase(),
					//TODO need to switch nodeTest to be more dynamic
					//for choosing version number
					bucketData: utl.getVerFolderName(newVerMap.M[verMapSelect].N)
				});
				

				for(var val in newVerMap.M){
					newVerMap.M[val].N = newVerMap.M[val].N.toString();
				}

				ddbItems.push({
					Key: {
						label: item.label
					},
					TableName: 'Version',
					UpdateExpression: 'SET #a = :map ',
					ExpressionAttributeNames: {
						'#a': 'ver'
					},
					ExpressionAttributeValues: {
						':map': newVerMap
					},
					ReturnValues: 'ALL_NEW'
				});
				//increase bootstrap version number in params object
				//update item in dynamo
			});
			var promArr = [];
			ddbItems.forEach(function(dbItem){
				promArr.push(new Promise(function(resolve, reject){
					dynamodb.updateItem(dbItem, function(err, data){
						if (err) return reject(err);
						//go to s3 and push the zips
						console.log('updated database with: ', data.Attributes.label.S);
						return resolve();
					});
				}));
			});
			return Promise.all(promArr).then(function(){
				return res();
			});
		});
	})
	//array to hold expression update objects
}


function getDirs(){
	//set promise to save myself from callback hell
	return new Promise(function(resolve, reject){
		fs.readdir(__dirname + '/repos', function(err, files){
			if (err) return reject(err);
			if (!files.length || files.length === 1 && files[0] === '.DS_Store'){
				dirArr = [{
					dir: __dirname + '/repos/base',
					name: 'base'
				}, {
					dir: __dirname + '/repos/meta',
					name: 'meta'
				}];
				return resolve(true);
			}
			else {
				files.forEach(function(dir){
					if (dir !== '.DS_Store' && dir !== '.gitignore'){
						currentDir = __dirname + '/repos/' + dir;
						dirArr.push({
							dir: currentDir,
							name: dir
						});
					}
				});
				return resolve(false);
			}
		});
	});

}
//go through repo server and find if empty


//choose which repo to clone
function cloneRepo(dir, cb){
		simpleGit.clone(repoPaths[dir.name], dir.dir, function(){
			require('simple-git')(dir.dir)
				.checkout('test', cb);
		});
}

//pull from repo if they exist
function pullRepo(dir, cb){
	simpleGit.checkout('test')
		.pull(repoPaths[dir], 'test', function(err, update){
			if (err) throw err;
			
			//zip up contents of folder
			zipFiles(dir);
		});
}

//zip up files after git merge
function zipFiles(dir, cb){
		var readStream;
		//TODO
		//bug where zip archiver is putting files in the repos folder instead of the base
		var writeStream = fs.createWriteStream(__dirname + '/' + dir.name + '.zip');
		var zipArchive = archiver('zip');

		writeStream.on('close', function() {
		   console.log('stream ended');
		   //make read stream after the zip has been written
		   readStream = fs.createReadStream(__dirname + '/' + dir.name + '.zip');
		   //pass to the s3 function
		   cb(readStream);
		});

		zipArchive.pipe(writeStream);

		zipArchive.directory(dir.dir, dir.name);

		zipArchive.on('error', function(err){
			throw err;
		});

		zipArchive.finalize();
}