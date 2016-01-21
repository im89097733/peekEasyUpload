var AWS = new require('aws-sdk');
//set region prior to loading of client objects
AWS.config.update({region: 'us-west-2'});

var _ = require('lodash');
//refill this in later based on local dir
var fs = require('fs');
var archiver = require('archiver');
var dynamodb = new AWS.DynamoDB();
var s3 = new AWS.S3({region: undefined});

//local requires
var utl = require('./modules/utl.js');

//not being used right now, might be useful in future
//to keep reference of current directory
var currentDir;

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
var dirArr = [{
		dir: '/usr/local/apache-tomcat-8.0.20/webapps/ROOT',
		name: 'base'
	}, {
		dir: '/usr/local/peekaplatform/ContentMeta',
		name: 'meta'
	}];
//variable to hold references to new version numbers for s3
var verRefArr = [];

getDbItems()
	.then(function(){
		return new Promise(function(resCb, rejCb){
			var promArr = [];
			dirArr.forEach(function(obj){
				//push promise and pass zipFile the promise callback
				promArr.push(new Promise(function(resolve, reject){
					zipFiles(obj, function(stream){
						setS3(obj.name, stream, resolve, reject);
					});
				}));
			});
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

		zipArchive.bulk([
			{src: getFileArr(), cwd: dir.dir, expand: true, dest: dir.name}
		])

		zipArchive.on('error', function(err){
			throw err;
		});

		zipArchive.finalize();

		function getFileArr(){
			if (dir.name === 'meta'){
				return ['**/*', '!**/.DS_Store', '!.git/**.*', '!.gitignore']
			}
			else if (dir.name === 'base'){
				return ['404.html', 'content/*.html', 'CSS/*.css', 'fragments/*.html', 'scripts/*.js', 'WEB-INF/**/*.*', 'index.html']
			}
		}
}