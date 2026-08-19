const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { handle, resolveAllowed } = require('../host');

test('host rejects an unknown action through its public handler', async()=>{
  const result=await handle({requestId:'test-unknown',action:'not.real',params:{}});
  assert.equal(result.ok,false);
  assert.match(result.error,/Unknown action/);
});

test('system info reports security boundaries', async()=>{
  const result=await handle({requestId:'test-info',action:'system.info',params:{}});
  assert.equal(result.ok,true);
  assert.ok(Array.isArray(result.result.allowedRoots));
  assert.ok(result.result.auditDirectory);
});

test('filesystem blocks paths outside configured roots',()=>{
  assert.throws(()=>resolveAllowed(path.parse(process.cwd()).root),/outside allowed roots/);
});
