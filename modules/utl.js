//need to convert number to version folder name
function getVerFolderName(num){
	return 'ver ' + [num.toString().slice(0, 1), '.', num.toString().slice(1)].join().replace(/,/g,'');
}

//determine the new version number that needs to be returned to the server
function increaseDbNum(num){

}

module.exports = {
	getVerFolderName: getVerFolderName,
	increaseDbNum: increaseDbNum
}