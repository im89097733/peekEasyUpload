var utl = require('./modules/utl.js');
var expect = require('chai').expect;

describe('Utl Tests', function(){
	describe('Get Folder Name String', function(){
		it('gets proper folder name', function(){
			var num = utl.getVerFolderName(10);
			var num1 = utl.getVerFolderName(110);
			var num2 = utl.getVerFolderName(234);

			expect(num).to.equal('ver 1.0');
			expect(num1).to.equal('ver 1.10');
			expect(num2).to.equal('ver 2.34');
		});
	});
	describe('Increases Number', function(){
		it('works with base version 1.0', function(){
			var num = utl.increaseDbNum(10);
			expect(num).to.equal(11);
		});
		it('works with large numbers', function(){
			var num = utl.increaseDbNum(1234);
			expect(num).to.equal(1235);
		});
		it('doesn\'t change first number group', function(){
			var num = utl.increaseDbNum(199);
			expect(num).to.equal(1100);
		});
	});
});
