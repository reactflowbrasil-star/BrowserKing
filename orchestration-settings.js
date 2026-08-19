(function(){
  'use strict';
  const defaultAgents=[
    {id:'agent-1',name:'Pesquisador',persona:'Investigador rigoroso e objetivo.',traits:'Curioso, factual, detalhista.',memory:'',learnedMemory:'',learnedFingerprints:[]},
    {id:'agent-2',name:'Analista crítico',persona:'Revisor cético que procura falhas e riscos.',traits:'Crítico, preciso, pragmático.',memory:'',learnedMemory:'',learnedFingerprints:[]}
  ];
  const defaults={enabled:false,learningEnabled:true,agentCount:3,roles:['Pesquisador','Analista critico','Planejador'],agents:defaultAgents,timeoutMs:45000};
  const byId=(id)=>document.getElementById(id);
  let currentAgents=[];
  function normalizeAgents(cfg){
    const total=Math.max(1,(Number(cfg.agentCount)||3)-1);const source=Array.isArray(cfg.agents)?cfg.agents:[];const legacy=Array.isArray(cfg.roles)?cfg.roles:[];
    return Array.from({length:total},(_,i)=>({...defaultAgents[i],id:source[i]?.id||`agent-${i+1}`,name:source[i]?.name||legacy[i]||`Especialista ${i+1}`,persona:source[i]?.persona||'',traits:source[i]?.traits||'',memory:source[i]?.memory||'',learnedMemory:source[i]?.learnedMemory||'',learnedFingerprints:Array.isArray(source[i]?.learnedFingerprints)?source[i].learnedFingerprints:[]}));
  }
  function readAgents(){return [...document.querySelectorAll('.agent')].map((card,i)=>({id:card.dataset.id||`agent-${i+1}`,name:card.querySelector('[data-field=name]').value.trim().slice(0,120),persona:card.querySelector('[data-field=persona]').value.trim().slice(0,4000),traits:card.querySelector('[data-field=traits]').value.trim().slice(0,2000),memory:card.querySelector('[data-field=memory]').value.trim().slice(0,8000),learnedMemory:currentAgents[i]?.learnedMemory||'',learnedFingerprints:currentAgents[i]?.learnedFingerprints||[]}));}
  function renderAgents(agents){
    currentAgents=agents;byId('agents').innerHTML=agents.map((agent,i)=>`<article class="agent" data-id="${escapeHtml(agent.id)}"><h3>Agente ${i+1}</h3><div class="field"><div><label>Nome</label><span class="hint">Identifica o parecer.</span></div><input type="text" data-field="name" maxlength="120" value="${escapeHtml(agent.name)}"></div><div class="field"><div><label>Persona</label><span class="hint">Quem o agente é e qual sua função.</span></div><textarea data-field="persona" maxlength="4000">${escapeHtml(agent.persona)}</textarea></div><div class="field"><div><label>Características</label><span class="hint">Tom, critérios e forma de raciocinar.</span></div><textarea data-field="traits" maxlength="2000">${escapeHtml(agent.traits)}</textarea></div><div class="field"><div><label>Memória privada</label><span class="hint">Contexto manual persistente.</span></div><div><textarea data-field="memory" maxlength="8000">${escapeHtml(agent.memory)}</textarea><div class="counter"><span data-memory-count>${agent.memory.length}</span>/8000</div></div></div><div class="field"><div><label>Memória aprendida</label><span class="hint">Gerada automaticamente e usada somente por este agente.</span></div><textarea readonly>${escapeHtml(agent.learnedMemory||'Nenhum aprendizado registrado.')}</textarea></div></article>`).join('');
  }
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function render(cfg){byId('enabled').checked=Boolean(cfg.enabled);byId('learningEnabled').checked=cfg.learningEnabled!==false;byId('agentCount').value=cfg.agentCount;byId('timeoutMs').value=Math.round(cfg.timeoutMs/1000);renderAgents(normalizeAgents(cfg));}
  async function load(){
    render(defaults);
    const data=await chrome.storage.local.get(['browserKingOrchestration','browserKingOrchestrationStatus','browserKingGeneralBehavior']);
    const cfg={...defaults,...(data.browserKingOrchestration||{})};
    render(cfg);

    const generalInstructions = data.browserKingGeneralBehavior || '';
    byId('generalInstructions').value = generalInstructions;
    byId('generalCount').textContent = generalInstructions.length;

    const run=data.browserKingOrchestrationStatus;
    if(run) byId('lastRun').textContent=`Última execução: ${new Date(run.timestamp).toLocaleString()} — ${run.completed}/${run.requested} especialistas concluídos em ${(run.durationMs/1000).toFixed(1)}s; ${run.learned||0} memória(s) atualizada(s)${run.failures?.length?`; ${run.failures.length} falha(s)`:''}.`;
  }
  byId('generalInstructions').addEventListener('input', () => {
    byId('generalCount').textContent = byId('generalInstructions').value.length;
  });
  byId('agentCount').addEventListener('change',()=>{const previous=readAgents();const total=Math.max(1,Math.min(5,(Number(byId('agentCount').value)||3)-1));renderAgents(Array.from({length:total},(_,i)=>previous[i]||{id:`agent-${i+1}`,name:`Especialista ${i+1}`,persona:'',traits:'',memory:''}));});
  byId('agents').addEventListener('input',(event)=>{if(event.target.matches('[data-field=memory]'))event.target.parentElement.querySelector('[data-memory-count]').textContent=event.target.value.length;});
  byId('save').addEventListener('click',async()=>{
    const agents=readAgents();const cfg={enabled:byId('enabled').checked,learningEnabled:byId('learningEnabled').checked,agentCount:Math.max(2,Math.min(6,Number(byId('agentCount').value)||3)),agents,roles:agents.map(agent=>agent.name),timeoutMs:Math.max(5000,Math.min(120000,(Number(byId('timeoutMs').value)||45)*1000))};
    const generalInstructions = byId('generalInstructions').value.trim().slice(0, 8000);
    await chrome.storage.local.set({
      browserKingOrchestration: cfg,
      browserKingGeneralBehavior: generalInstructions
    });
    byId('status').textContent='Configuração salva com sucesso.';
    setTimeout(()=>byId('status').textContent='',2500);
  });
  byId('clearLearned').addEventListener('click',async()=>{const data=await chrome.storage.local.get('browserKingOrchestration');const cfg={...defaults,...(data.browserKingOrchestration||{})};cfg.agents=normalizeAgents(cfg).map(agent=>({...agent,learnedMemory:'',learnedFingerprints:[]}));await chrome.storage.local.set({browserKingOrchestration:cfg});render(cfg);byId('status').textContent='Aprendizados removidos.';setTimeout(()=>byId('status').textContent='',2500);});
  load();
})();
