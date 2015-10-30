//need to convert number to version folder name
function getVerFolderName(num){
	return 'ver ' + [num.toString().slice(0, 1), '.', num.toString().slice(1)].join().replace(/,/g,'');
}

//determine the new version number that needs to be returned to the server
//need to keep first number for grouping in S3
function increaseDbNum(num){
	var groupNum = num.toString().slice(0,1);
	var verNum = parseInt(num.toString().slice(1));
	verNum++;
	return parseInt(groupNum + verNum.toString());
}

module.exports = {
	getVerFolderName: getVerFolderName,
	increaseDbNum: increaseDbNum
}