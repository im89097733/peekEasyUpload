var utl = require('./modules/utl.js');
var expect = require('chai').expect;

describe('Utl Tests', function(){
	describe('Number Increases', function(){
		it('gets proper folder name', function(){
			var num = utl.getVerFolderName(10);
			var num1 = utl.getVerFolderName(110);
			var num2 = utl.getVerFolderName(234)

			expect(num).to.equal('ver 1.0');
			expect(num1).to.equal('ver 1.10');
			expect(num2).to.equal('ver 2.34');

		});
	});
})
