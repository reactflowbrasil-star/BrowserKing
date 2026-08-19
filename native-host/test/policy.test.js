const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../policy');

test('rejects unknown actions',()=>assert.equal(classify('system.destroy').allowed,false));
test('PowerShell always requires confirmation',()=>assert.equal(classify('powershell.run',{}).confirmation,true));
test('destructive file actions require confirmation',()=>assert.equal(classify('file.delete',{}).confirmation,true));
test('sensitive typing requires confirmation',()=>assert.equal(classify('keyboard.type',{sensitive:true}).confirmation,true));
test('ordinary mouse movement is permitted without confirmation',()=>assert.deepEqual(classify('mouse.move',{}),{allowed:true,confirmation:false,risk:'standard'}));
