const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { handle, resolveAllowed, buildAssistantMessage } = require('../host');

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

test('tool response always includes visible assistant content',()=>{
  const message=buildAssistantMessage(JSON.stringify({
    content:'',
    tool_calls:[{name:'computer',arguments:'{"action":"screenshot"}'}]
  }),[{name:'computer'}]);
  assert.match(message.content,/executar a ação solicitada/i);
  assert.equal(message.tool_calls.length,1);
});

test('tool response accepts fenced JSON envelopes',()=>{
  const message=buildAssistantMessage('```json\n{"content":"Vou preparar a mensagem.","tool_calls":[]}\n```',[{name:'computer'}]);
  assert.equal(message.content,'Vou preparar a mensagem.');
  assert.equal(message.tool_calls,undefined);
});
