'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const readline = require('readline');
const { classify } = require('./policy');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const RELAY_TOKEN_PATH = path.join(ROOT, '..', '.browserking-remote.json');
const LOG_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'HatClaw', 'audit');
fs.mkdirSync(LOG_DIR, { recursive: true });

function loadConfig() {
  const defaults = { allowedRoots: [path.join(os.homedir(), 'Desktop'), path.join(os.homedir(), 'Documents'), path.join(os.homedir(), 'Downloads')], maxReadBytes: 2_000_000, shellTimeoutMs: 30_000 };
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch { return defaults; }
}
const config = loadConfig();

class CodexAppServer {
  constructor() { this.child=null; this.nextId=1; this.pending=new Map(); this.waiters=[]; }
  async start() {
    if (this.child && !this.child.killed) return;
    this.child=spawn('codex',['app-server','--stdio'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    this.child.on('exit',()=>{ const error=new Error('Codex App Server encerrou'); for(const p of this.pending.values())p.reject(error); this.pending.clear(); this.child=null; });
    readline.createInterface({input:this.child.stdout}).on('line',line=>{ try{this.onMessage(JSON.parse(line));}catch{} });
    await this.call('initialize',{clientInfo:{name:'hatclaw',title:'HatClaw',version:'1.4.0'},capabilities:{experimentalApi:true}});
    this.notify('initialized',{});
  }
  send(message){ this.child.stdin.write(JSON.stringify(message)+'\n'); }
  notify(method,params){ this.send({method,params}); }
  call(method,params={}){ const id=this.nextId++; return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.send({method,id,params});}); }
  onMessage(message){
    if(message.id!=null && (message.result!==undefined || message.error)){const p=this.pending.get(message.id);if(p){this.pending.delete(message.id);message.error?p.reject(new Error(message.error.message||'Erro do Codex')):p.resolve(message.result);}return;}
    if(message.id!=null && message.method){ this.send({id:message.id,result:{decision:'decline'}}); return; }
    for(const waiter of [...this.waiters]) waiter(message);
  }
  waitFor(test,timeout=180000){return new Promise((resolve,reject)=>{const fn=m=>{if(!test(m))return;cleanup();resolve(m);};const timer=setTimeout(()=>{cleanup();reject(new Error('Tempo esgotado aguardando o Codex'));},timeout);const cleanup=()=>{clearTimeout(timer);this.waiters=this.waiters.filter(x=>x!==fn);};this.waiters.push(fn);});}
  async account(){await this.start();const result=await this.call('account/read',{refreshToken:false});const account=result?.account||result;return {authenticated:Boolean(account?.type||account?.email),authMode:account?.type||null,planType:account?.planType||null,email:account?.email||null};}
  async login(){await this.start();const current=await this.account();if(current.authenticated)return {...current,message:`Conta ChatGPT já conectada${current.planType?` (${current.planType})`:''}.`};const result=await this.call('account/login/start',{type:'chatgpt',useHostedLoginSuccessPage:true,appBrand:'chatgpt'});return {authenticated:false,authUrl:result.authUrl,loginId:result.loginId,message:'Login oficial aberto no navegador.'};}
  async logout(){await this.start();await this.call('account/logout',{});return {authenticated:false,message:'Conta ChatGPT desconectada.'};}
  async chat(params){
    await this.start();
    const messages=Array.isArray(params.messages)?params.messages:[];
    const tools=Array.isArray(params.tools)?params.tools:[];
    const instructionMessages=messages.filter(m=>m?.role==='system'||m?.role==='developer');
    const conversationMessages=messages.filter(m=>m?.role!=='system'&&m?.role!=='developer');
    const developerInstructions=instructionMessages
      .map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content))
      .filter(Boolean)
      .join('\n\n');
    const history=conversationMessages.map(m=>`${String(m.role||'user').toUpperCase()}: ${typeof m.content==='string'?m.content:JSON.stringify(m.content)}`).join('\n\n');
    const toolGuide=tools.length ? `\n\nFERRAMENTAS DISPONIVEIS:\n${tools.map(t=>JSON.stringify(t.function||t)).join('\n')}\n\nRetorne JSON com content e tool_calls. Quando precisar agir, use tool_calls com name e arguments como uma string JSON. Quando responder normalmente, use tool_calls vazio.` : '';
    const text=history+toolGuide;
    const thread=await this.call('thread/start',{model:params.model||'gpt-5.6-terra',cwd:os.tmpdir(),approvalPolicy:'never',sandbox:'read-only',serviceName:'hatclaw',...(developerInstructions?{developerInstructions}:{})});
    const threadId=thread.thread.id;
    let answer='';
    const completed=this.waitFor(m=>{if(m?.params?.threadId!==threadId)return false;if(m.method==='item/agentMessage/delta')answer+=m.params.delta||'';if(m.method==='item/completed'&&m.params?.item?.type==='agentMessage')answer=m.params.item.text||answer;return m.method==='turn/completed';});
    const outputSchema=tools.length?{type:'object',properties:{content:{type:'string'},tool_calls:{type:'array',items:{type:'object',properties:{name:{type:'string'},arguments:{type:'string'}},required:['name','arguments'],additionalProperties:false}}},required:['content','tool_calls'],additionalProperties:false}:undefined;
    await this.call('turn/start',{threadId,input:[{type:'text',text}],model:params.model||'gpt-5.6-terra',approvalPolicy:'never',sandboxPolicy:{type:'readOnly'},...(outputSchema?{outputSchema}:{})});
    const completion=await completed;
    if(completion.params?.turn?.status==='failed'||completion.params?.turn?.error){
      const rawError=completion.params?.turn?.error?.message||'O turno do Codex falhou';
      if(/flagged as potentially violating|usage polic/i.test(rawError)){
        throw new Error('O Codex não processou este pedido. Reformule o objetivo de forma operacional e específica; a conta continua conectada.');
      }
      throw new Error(rawError);
    }
    if(!answer.trim())throw new Error('O Codex concluiu sem produzir resposta; selecione um modelo Codex atual.');
    let parsed=null;try{parsed=tools.length?JSON.parse(answer):null;}catch{}
    const toolCalls=Array.isArray(parsed?.tool_calls)?parsed.tool_calls.map(call=>({id:`call_${crypto.randomUUID().replace(/-/g,'')}`,type:'function',function:{name:call.name,arguments:typeof call.arguments==='string'?call.arguments:JSON.stringify(call.arguments||{})}})):[];
    const message={role:'assistant',content:parsed?.content??answer,...(toolCalls.length?{tool_calls:toolCalls}:{})};
    return {id:`chatcmpl-${crypto.randomUUID()}`,object:'chat.completion',created:Math.floor(Date.now()/1000),model:params.model||'gpt-5.6-terra',choices:[{index:0,message,finish_reason:toolCalls.length?'tool_calls':'stop'}]};
  }
}
const codexServer=new CodexAppServer();

function audit(entry) {
  const date = new Date().toISOString().slice(0, 10);
  const safe = { ...entry, timestamp: new Date().toISOString() };
  if (safe.params?.sensitive) safe.params = { ...safe.params, text: '[REDACTED]' };
  if (safe.params?.command) safe.params = { ...safe.params, command: String(safe.params.command)
    .replace(/(password|passwd|token|secret|api[_-]?key)\s*[=:]\s*[^\s;|]+/gi, '$1=[REDACTED]') };
  fs.appendFileSync(path.join(LOG_DIR, `${date}.jsonl`), JSON.stringify(safe) + '\n');
}

function resolveAllowed(input, allowMissing = false) {
  if (!input || typeof input !== 'string') throw new Error('A path is required');
  const resolved = path.resolve(input);
  const comparable = allowMissing ? path.dirname(resolved) : resolved;
  let canonical;
  try { canonical = fs.realpathSync.native(comparable); } catch { throw new Error('Path does not exist'); }
  const permitted = config.allowedRoots.some(root => {
    let base;
    try { base = fs.realpathSync.native(path.resolve(root)); } catch { return false; }
    return canonical.toLowerCase() === base.toLowerCase() || canonical.toLowerCase().startsWith(base.toLowerCase() + path.sep);
  });
  if (!permitted) throw new Error('Path is outside allowed roots');
  return resolved;
}

function psQuote(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function finiteNumber(value, name) { const number=Number(value); if(!Number.isFinite(number)) throw new Error(`${name} must be a finite number`); return Math.trunc(number); }
function runPowerShell(script, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-EncodedCommand', encoded], { windowsHide: true });
    let stdout = '', stderr = '', killed = false;
    const cap = chunk => String(chunk).slice(0, 1_000_000);
    child.stdout.on('data', d => { stdout = (stdout + cap(d)).slice(-1_000_000); });
    child.stderr.on('data', d => { stderr = (stderr + cap(d)).slice(-1_000_000); });
    const timer = setTimeout(() => { killed = true; child.kill(); }, Math.min(Math.max(timeoutMs, 1000), 120000));
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); killed ? reject(new Error('PowerShell timed out')) : resolve({ code, stdout, stderr }); });
  });
}

async function confirm(action, params) {
  const summary = action === 'powershell.run' ? String(params.command).slice(0, 500) : JSON.stringify(params).slice(0, 500);
  const script = `$answer=(New-Object -ComObject WScript.Shell).Popup(${psQuote(`HatClaw solicita:\n\n${action}\n${summary}\n\nPermitir esta ação?`)},0,'Confirmação de segurança',4+32); if($answer -eq 6){'ALLOW'}else{'DENY'}`;
  const result = await runPowerShell(script, 120000);
  return result.stdout.includes('ALLOW');
}

async function execute(action, p) {
  switch (action) {
    case 'codex.status': return codexServer.account();
    case 'codex.login': return codexServer.login();
    case 'codex.logout': return codexServer.logout();
    case 'codex.chat': return codexServer.chat(p);
    case 'system.info': return { platform: os.platform(), release: os.release(), hostname: os.hostname(), allowedRoots: config.allowedRoots, auditDirectory: LOG_DIR };
    case 'screen.capture': { const out=path.join(os.tmpdir(),`browserking-${Date.now()}.png`); await runPowerShell(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing;$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;$i=New-Object Drawing.Bitmap $b.Width,$b.Height;$g=[Drawing.Graphics]::FromImage($i);$g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size);$i.Save(${psQuote(out)});$g.Dispose();$i.Dispose()`); return { path: out }; }
    case 'mouse.move': await runPowerShell(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Cursor]::Position=New-Object Drawing.Point(${finiteNumber(p.x,'x')},${finiteNumber(p.y,'y')})`); return { moved: true };
    case 'mouse.click': await runPowerShell(`Add-Type @'\nusing System;using System.Runtime.InteropServices;public class M{[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);}\n'@;[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`); return { clicked: true };
    case 'keyboard.type': { const encoded=Buffer.from(String(p.text||''),'utf8').toString('base64'); await runPowerShell(`Add-Type -AssemblyName System.Windows.Forms;$old=[Windows.Forms.Clipboard]::GetDataObject();[Windows.Forms.Clipboard]::SetText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${psQuote(encoded)})));[Windows.Forms.SendKeys]::SendWait('^v');Start-Sleep -Milliseconds 100;if($old){[Windows.Forms.Clipboard]::SetDataObject($old)}`); return { typed:String(p.text||'').length }; }
    case 'keyboard.hotkey': await runPowerShell(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait(${psQuote((p.keys || []).join('+'))})`); return { sent: true };
    case 'window.list': { const r=await runPowerShell(`Get-Process|Where-Object MainWindowHandle -ne 0|Select-Object Id,ProcessName,MainWindowTitle|ConvertTo-Json -Compress`); return { windows: JSON.parse(r.stdout || '[]') }; }
    case 'window.focus': await runPowerShell(`(New-Object -ComObject WScript.Shell).AppActivate(${finiteNumber(p.pid,'pid')})|Out-Null`); return { focused: true };
    case 'window.close': await runPowerShell(`Stop-Process -Id ${finiteNumber(p.pid,'pid')} -ErrorAction Stop`); return { closed: true };
    case 'file.list': { const target=resolveAllowed(p.path); return { entries: fs.readdirSync(target,{withFileTypes:true}).map(e=>({name:e.name,type:e.isDirectory()?'directory':'file'})) }; }
    case 'file.read': { const target=resolveAllowed(p.path); const stat=fs.statSync(target); if(stat.size>config.maxReadBytes) throw new Error('File exceeds read limit'); return { content: fs.readFileSync(target,'utf8'), size: stat.size }; }
    case 'file.write': { const target=resolveAllowed(p.path,true); fs.writeFileSync(target,String(p.content || ''),{flag:p.overwrite?'w':'wx'}); return { written:true,path:target }; }
    case 'file.delete': { const target=resolveAllowed(p.path); const stat=fs.statSync(target); stat.isDirectory()?fs.rmdirSync(target):fs.unlinkSync(target); return { deleted:true }; }
    case 'file.move': { const from=resolveAllowed(p.from),to=resolveAllowed(p.to,true); fs.renameSync(from,to); return { moved:true }; }
    case 'directory.create': { const target=resolveAllowed(p.path,true); fs.mkdirSync(target); return { created:true }; }
    case 'process.launch': { const target=resolveAllowed(p.path); spawn(target,Array.isArray(p.args)?p.args:[],{detached:true,stdio:'ignore'}).unref(); return { launched:true }; }
    case 'powershell.run': return runPowerShell(String(p.command || ''), Number(p.timeoutMs || config.shellTimeoutMs));
    case 'audit.read': { const file=path.join(LOG_DIR,`${new Date().toISOString().slice(0,10)}.jsonl`); return { entries:fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').slice(-100).map(JSON.parse):[] }; }
    case 'relay.token': {
      const parsed = JSON.parse(fs.readFileSync(RELAY_TOKEN_PATH, 'utf8'));
      const token = String(parsed?.token || '').trim();
      if (!token) throw new Error('Relay token is unavailable');
      return { token };
    }
    default: throw new Error('Unsupported action');
  }
}

async function handle(message) {
  const requestId = message?.requestId || crypto.randomUUID();
  const action = String(message?.action || '');
  const params = message?.params && typeof message.params === 'object' ? message.params : {};
  const decision = classify(action, params);
  const record = { requestId, action, risk: decision.risk, params, status: 'requested' };
  try {
    if (!decision.allowed) throw new Error(decision.reason);
    if (decision.confirmation && !(await confirm(action, params))) { record.status='denied'; audit(record); return { requestId, ok:false, error:'Action denied by user' }; }
    const result = await execute(action, params);
    record.status='completed'; audit(record); return { requestId, ok:true, result };
  } catch (error) { record.status='failed'; record.error=error.message; audit(record); return { requestId, ok:false, error:error.message }; }
}

function startProtocol() {
  let buffer = Buffer.alloc(0);
  process.stdin.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readUInt32LE(0); if (size > 4_000_000) process.exit(2); if (buffer.length < 4 + size) break;
      const payload = buffer.subarray(4,4+size); buffer=buffer.subarray(4+size);
      Promise.resolve().then(()=>handle(JSON.parse(payload.toString('utf8')))).then(reply=>{const body=Buffer.from(JSON.stringify(reply));const header=Buffer.alloc(4);header.writeUInt32LE(body.length);process.stdout.write(Buffer.concat([header,body]));});
    }
  });
}

if (require.main === module) startProtocol();

module.exports = { handle, resolveAllowed, runPowerShell, startProtocol };
