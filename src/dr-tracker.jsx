import { useState, useMemo, useEffect, useCallback } from "react";

const dowOfDate = ds => new Date(ds+"T12:00:00").getDay();
const isWeekend = ds => { const d=dowOfDate(ds); return d===0||d===6; };
const dowName   = ds => new Date(ds+"T12:00:00").toLocaleDateString("sq-AL",{weekday:"long"});
const fmtDate   = ds => new Date(ds+"T12:00:00").toLocaleDateString("sq-AL",{day:"numeric",month:"short",year:"numeric"});
const fmtE      = v  => `€${Math.round(parseFloat(v||0))}`;
const DAYS_SQ   = ["E Diele","E Hënë","E Martë","E Mërkurë","E Enjte","E Premte","E Shtunë"];
const MONTHS    = ["Janar","Shkurt","Mars","Prill","Maj","Qershor","Korrik","Gusht","Shtator","Tetor","Nëntor","Dhjetor"];
const DAY_HDRS  = ["Hë","Ma","Më","En","Pr","Sh","Di"];
const INST_COLORS = ["#818CF8","#3BBFB3","#F59E0B","#F43F5E","#34D399","#60A5FA","#C084FC","#FB923C"];
const C = {bg:"#07101E",surface:"#0D1828",card:"#111E30",border:"#1C2E47",b2:"#243654",text:"#E6EDF8",sub:"#8FA3BE",muted:"#445870",green:"#34D399",red:"#FB7185",amber:"#FBBF24",frz:"#818CF8",ftm:"#3BBFB3"};
const DEFAULT_INSTITUTIONS = [
  {id:"FERIZAJ",name:"SP Publik",type:"public",color:"#818CF8",schedColor:"#FB7185",prices:{mon:112,fri:177,sat:317,sun:231}},
  {id:"FATIM",name:"S Private",type:"private",color:"#3BBFB3",schedColor:"#3BBFB3",prices:{weekday:85,weekend:160}},
];

function getAutoPrice(inst,ds,shiftType,isFesta){
  if(!inst||isFesta) return "";
  const dow=dowOfDate(ds);
  if(inst.type==="public"){const p=inst.prices||{mon:112,fri:177,sat:317,sun:231};if(dow===5)return p.fri;if(dow===6)return p.sat;if(dow===0)return p.sun;return p.mon;}
  if(inst.type==="private"){const p=inst.prices||{weekday:85,weekend:160};return shiftType==="FESTE"?p.weekend:p.weekday;}
  return "";
}
const getPrivateShiftType=ds=>isWeekend(ds)?"FESTE":"E_ZAK";
function shiftDurationHours(inst,ds,shiftType,isFesta){if(!inst)return 24;if(inst.type==="public")return 24;if(isFesta||shiftType==="FESTE")return 24;return 12;}

const DB_NAME="regjistri_im",DB_VER=1,STORES=["records","schedules","institutions","settings"];
function openDB(){return new Promise((res,rej)=>{const req=indexedDB.open(DB_NAME,DB_VER);req.onupgradeneeded=e=>{const db=e.target.result;STORES.forEach(s=>{if(!db.objectStoreNames.contains(s))db.createObjectStore(s);});};req.onsuccess=e=>res(e.target.result);req.onerror=e=>rej(e.target.error);});}
async function idbGet(store,key){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(store,"readonly");const req=tx.objectStore(store).get(key);req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
async function idbSet(store,key,value){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");const req=tx.objectStore(store).put(value,key);req.onsuccess=()=>res();req.onerror=()=>rej(req.error);});}
function useIDB(storeName,lsKey,defaultVal){
  const[value,setValue]=useState(()=>{try{const s=localStorage.getItem(lsKey);return s?JSON.parse(s):defaultVal;}catch{return defaultVal;}});
  useEffect(()=>{idbGet(storeName,"data").then(v=>{if(v!==undefined)setValue(v);}).catch(()=>{});},[storeName]);
  const persist=useCallback(v=>{setValue(v);idbSet(storeName,"data",v).catch(()=>{});try{localStorage.setItem(lsKey,JSON.stringify(v));}catch{}},[storeName,lsKey]);
  return[value,persist];
}
function useRecords(){const[records,persist]=useIDB("records","dr_v3",[]);return{records,add:rec=>persist([...records,{...rec,id:Date.now()}]),remove:id=>persist(records.filter(r=>r.id!==id)),update:(id,d)=>persist(records.map(r=>r.id===id?{...r,...d}:r))};}
function useSchedules(){
  const[schedules,persist]=useIDB("schedules","dr_sched_v1",[]);
  return{schedules,
    toggle:(date,hospId)=>{const ex=schedules.find(s=>s.date===date);if(ex&&ex.hospital===hospId)persist(schedules.filter(s=>s.date!==date));else if(ex)persist(schedules.map(s=>s.date===date?{...s,hospital:hospId}:s));else persist([...schedules,{id:Date.now(),date,hospital:hospId}]);},
    clear:date=>persist(schedules.filter(s=>s.date!==date)),
    setGcEventId:(date,gcId)=>persist(schedules.map(s=>s.date===date?{...s,gcEventId:gcId}:s)),
  };
}
function useInstitutions(){const[institutions,persist]=useIDB("institutions","dr_institutions_v1",DEFAULT_INSTITUTIONS);return{institutions,addInstitution:inst=>persist([...institutions,{...inst,id:"INST_"+Date.now()}]),updateInstitution:(id,d)=>persist(institutions.map(i=>i.id===id?{...i,...d}:i)),removeInstitution:id=>persist(institutions.filter(i=>i.id!==id))};}
function useSettings(){const[settings,persist]=useIDB("settings","dr_settings_v1",{});return{settings,setSetting:(k,v)=>persist({...settings,[k]:v}),setSettings:persist};}

async function gcCreateEvent(token,calId,inst,sched){
  const ds=sched.date,dur=shiftDurationHours(inst,ds,sched.shiftType||"H24",sched.isFesta||false);
  const startDt=ds+"T07:00:00",endDt=new Date(new Date(ds+"T07:00:00").getTime()+dur*3600000).toISOString().slice(0,19);
  const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId||"primary")}/events`,{method:"POST",headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({summary:`${inst.name} - Kujd.`,start:{dateTime:startDt,timeZone:"Europe/Belgrade"},end:{dateTime:endDt,timeZone:"Europe/Belgrade"},colorId:inst.type==="public"?"9":"7"})});
  if(!r.ok)throw new Error(await r.text());
  return(await r.json()).id;
}
async function gcDeleteEvent(token,calId,eventId){if(!eventId)return;await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId||"primary")}/events/${eventId}`,{method:"DELETE",headers:{"Authorization":`Bearer ${token}`}});}

function Pill({label,color}){return <span style={{background:color+"22",color,border:`1px solid ${color}44`,borderRadius:6,padding:"1px 7px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;}
function Seg({active,color,onClick,children,small}){return <button onClick={onClick} style={{flex:1,padding:small?"8px 0":"11px 0",borderRadius:9,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${active?color:C.border}`,background:active?color+"20":"transparent",color:active?color:C.muted,fontWeight:700,fontSize:small?13:14}}>{children}</button>;}
function calGrid(vd){const yr=vd.getFullYear(),mo=vd.getMonth(),firstDay=(new Date(yr,mo,1).getDay()+6)%7,dim=new Date(yr,mo+1,0).getDate();return{yr,mo,cells:[...Array(firstDay).fill(null),...Array.from({length:dim},(_,i)=>i+1)]};}
function ConfirmDialog({title,message,onConfirm,onCancel}){return(<div style={{position:"fixed",inset:0,background:"#000000BB",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onCancel}><div style={{background:C.card,border:`1px solid ${C.b2}`,borderRadius:16,padding:24,width:"100%",maxWidth:340}} onClick={e=>e.stopPropagation()}><div style={{color:C.text,fontWeight:700,fontSize:16,marginBottom:8}}>{title}</div><div style={{color:C.muted,fontSize:13,marginBottom:20}}>{message}</div><div style={{display:"flex",gap:10}}><button onClick={onCancel} style={{flex:1,padding:"11px 0",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.sub,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Anulo</button><button onClick={onConfirm} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:C.red,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Largo</button></div></div></div>);}

function Modal({onClose,onSave,initial,institutions}){
  const today=new Date().toISOString().slice(0,10),firstInst=institutions[0]||DEFAULT_INSTITUTIONS[0];
  const initForm=()=>{if(initial)return{...initial};const st=firstInst.type==="private"?getPrivateShiftType(today):"H24";return{hospital:firstInst.id,type:"SHIFT",date:today,shiftType:st,isFesta:false,amount:String(getAutoPrice(firstInst,today,st,false)),note:""};};
  const[form,setForm]=useState(initForm);const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const inst=institutions.find(i=>i.id===form.hospital)||firstInst,isPrivate=inst.type==="private",isShift=form.type==="SHIFT",isEdit=!!initial;
  const changeHosp=id=>{const ni=institutions.find(i=>i.id===id)||firstInst,st=ni.type==="private"?getPrivateShiftType(form.date):"H24",type=ni.type==="public"?"SHIFT":form.type,price=type==="SHIFT"?getAutoPrice(ni,form.date,st,false):"";setForm(f=>({...f,hospital:id,type,shiftType:st,isFesta:false,amount:String(price),note:f.note}));};
  const changeDate=date=>{const st=isPrivate&&isShift?getPrivateShiftType(date):form.shiftType;if(isEdit)setForm(f=>({...f,date,shiftType:st}));else setForm(f=>({...f,date,shiftType:st,amount:f.isFesta?f.amount:String(getAutoPrice(inst,date,st,false))}));};
  const toggleFesta=()=>{const nf=!form.isFesta;setForm(f=>({...f,isFesta:nf,amount:nf?"":String(getAutoPrice(inst,f.date,f.shiftType,false))}));};
  const valid=form.date&&form.amount!=="";
  const inp={width:"100%",boxSizing:"border-box",background:C.surface,border:`1px solid ${C.b2}`,borderRadius:9,padding:"11px 13px",color:C.text,fontSize:16,outline:"none",fontFamily:"inherit",marginBottom:12};
  const lbl={display:"block",color:C.sub,fontSize:11,fontWeight:700,letterSpacing:0.8,marginBottom:6,textTransform:"uppercase"};
  return(<div style={{position:"fixed",inset:0,background:"#000000BB",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}><div style={{background:C.card,border:`1px solid ${C.b2}`,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
    <div style={{width:36,height:4,borderRadius:2,background:C.muted,margin:"0 auto 20px"}}/>
    <label style={lbl}>Institucioni</label>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>{institutions.map(i=><button key={i.id} onClick={()=>changeHosp(i.id)} style={{padding:"9px 14px",borderRadius:9,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${form.hospital===i.id?i.color:C.border}`,background:form.hospital===i.id?i.color+"20":"transparent",color:form.hospital===i.id?i.color:C.muted,fontWeight:700,fontSize:13}}>{i.name}</button>)}</div>
    {isPrivate&&<><label style={lbl}>Lloji</label><div style={{display:"flex",gap:10,marginBottom:18}}><Seg active={isShift} color={inst.color} onClick={()=>setForm(f=>({...f,type:"SHIFT",amount:isEdit?f.amount:String(getAutoPrice(inst,f.date,f.shiftType,f.isFesta))}))}>Kujdestari</Seg><Seg active={!isShift} color={C.amber} onClick={()=>setForm(f=>({...f,type:"PATIENT",isFesta:false}))}>Pacient</Seg></div></>}
    <label style={lbl}>Data</label>
    <input type="date" value={form.date} onChange={e=>changeDate(e.target.value)} style={inp}/>
    {isShift&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:-8,marginBottom:14}}><span style={{color:C.sub,fontSize:12}}>{dowName(form.date)}</span><button onClick={toggleFesta} style={{padding:"3px 10px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,border:`1px solid ${form.isFesta?C.amber:C.border}`,background:form.isFesta?C.amber+"18":"transparent",color:form.isFesta?C.amber:C.muted}}>Festë</button></div>}
    <label style={lbl}>Cmimi (€)</label>
    <input type="number" placeholder={form.isFesta?"Shkruaj cmimin...":""} value={form.amount} onChange={e=>set("amount",e.target.value)} style={{...inp,fontSize:24,fontWeight:800,color:C.green}}/>
    <label style={lbl}>Shenim (opsional)</label>
    <textarea value={form.note} onChange={e=>set("note",e.target.value)} placeholder="..." rows={2} style={{...inp,resize:"none"}}/>
    <div style={{display:"flex",gap:10,marginTop:4}}><button onClick={onClose} style={{flex:1,padding:"13px 0",borderRadius:11,border:`1px solid ${C.border}`,background:"transparent",color:C.sub,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:15}}>Anulo</button><button onClick={()=>{if(valid){onSave(form);onClose();}}} style={{flex:2,padding:"13px 0",borderRadius:11,border:"none",background:valid?inst.color:C.muted,color:"#fff",fontWeight:800,cursor:valid?"pointer":"default",fontFamily:"inherit",fontSize:15}}>Ruaj</button></div>
  </div></div>);
}

function RecordRow({r,onEdit,onDelete,institutions}){
  const[confirmDel,setConfirmDel]=useState(false);
  const inst=institutions.find(i=>i.id===r.hospital)||{name:r.hospital,color:C.muted,type:"public"};
  const isShift=r.type==="SHIFT",dow=dowOfDate(r.date);
  const shiftLabel=isShift?(r.isFesta?"Festë":inst.type==="public"?(dow===5?"Premte":dow===6?"Shtunë":dow===0?"Diele":"E Zakonshme"):(r.shiftType==="FESTE"?"Weekend":"E Zakonshme")):"";
  return(<>
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:8}}>
      <div style={{width:3,alignSelf:"stretch",borderRadius:4,background:inst.color,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:2}}>
          <Pill label={inst.name} color={inst.color}/>
          {isShift?<Pill label={shiftLabel} color={r.isFesta?C.amber:inst.color}/>:<Pill label="Pacient" color={C.amber}/>}
          <span style={{color:C.muted,fontSize:12}}>{fmtDate(r.date)}</span>
        </div>
        {r.note&&<div style={{color:C.muted,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.note}</div>}
      </div>
      <span style={{color:C.green,fontWeight:800,fontSize:17,flexShrink:0}}>{fmtE(r.amount)}</span>
      {onEdit&&<div style={{display:"flex",flexDirection:"column",gap:4}}><button onClick={()=>onEdit(r)} style={{background:"transparent",border:"none",color:C.sub,cursor:"pointer",fontSize:15,padding:"2px 4px"}}>✏️</button><button onClick={()=>setConfirmDel(true)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:15,padding:"2px 4px"}}>🗑</button></div>}
    </div>
    {confirmDel&&<ConfirmDialog title="Largo regjistrim?" message={`${inst.name} · ${fmtDate(r.date)} · ${fmtE(r.amount)}`} onConfirm={()=>{onDelete(r.id);setConfirmDel(false);}} onCancel={()=>setConfirmDel(false)}/>}
  </>);
}

function CalendarView({records,schedules,onAdd,institutions}){
  const[vd,setVd]=useState(new Date()),[sel,setSel]=useState(null),today=new Date(),{yr,mo,cells}=calGrid(vd);
  const dayMap=useMemo(()=>{const m={};records.forEach(r=>{const d=new Date(r.date+"T12:00:00");if(d.getFullYear()===yr&&d.getMonth()===mo){const k=d.getDate();if(!m[k])m[k]=[];m[k].push(r);}});return m;},[records,yr,mo]);
  const schedMap=useMemo(()=>{const m={};schedules.forEach(s=>{const d=new Date(s.date+"T12:00:00");if(d.getFullYear()===yr&&d.getMonth()===mo)m[d.getDate()]=s;});return m;},[schedules,yr,mo]);
  const isToday=d=>d&&today.getDate()===d&&today.getMonth()===mo&&today.getFullYear()===yr;
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
      <button onClick={()=>{setVd(new Date(yr,mo-1,1));setSel(null);}} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:18}}>‹</button>
      <div style={{color:C.text,fontWeight:800,fontSize:18}}>{MONTHS[mo]} {yr}</div>
      <button onClick={()=>{setVd(new Date(yr,mo+1,1));setSel(null);}} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:18}}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,margin:"12px 0 3px"}}>{DAY_HDRS.map(d=><div key={d} style={{textAlign:"center",color:C.muted,fontSize:10,fontWeight:700}}>{d}</div>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
      {cells.map((day,i)=>{
        const recs=day?(dayMap[day]||[]):[],sched=day?schedMap[day]:null,si=sched?institutions.find(ins=>ins.id===sched.hospital):null;
        const isT=isToday(day),isSel=day===sel,visits=recs.filter(r=>r.type!=="SHIFT"),shifts=recs.filter(r=>r.type==="SHIFT");
        const hasShift=shifts.some(r=>r.type==="SHIFT"&&r.hospital&&institutions.find(ins=>ins.id===r.hospital));
        const shiftInst=hasShift?institutions.find(ins=>ins.id===shifts.find(r=>r.type==="SHIFT").hospital):null;
        const fillColor=shiftInst?(shiftInst.type==="public"?shiftInst.schedColor:shiftInst.color):null;
        const is12h=sched&&si?.type==="private"&&!isWeekend(sched.date);
        const lineColor=si?.schedColor||C.red;
        const schedShadow=sched?(is12h?`inset 0 3px 0 0 ${lineColor}`:`inset 0 3px 0 0 ${lineColor}, inset 0 -3px 0 0 ${lineColor}`):"none";
        return(<div key={i} onClick={()=>day&&setSel(isSel?null:day)} style={{minHeight:52,borderRadius:9,padding:"3px",cursor:day?"pointer":"default",
          background:fillColor?fillColor+"4D":isSel?"#1E2D4A":recs.length?C.surface:"transparent",
          border:isT?"1px solid #FFFFFF":isSel?`1px solid ${C.b2}`:recs.length?`1px solid ${C.border}`:"1px solid transparent",
          opacity:day?1:0,boxShadow:schedShadow}}>
          {day&&<>
            <div style={{fontSize:11,textAlign:"center",marginBottom:2,color:isT?"#FFFFFF":isSel?C.text:C.sub,fontWeight:isT||isSel?800:400}}>{day}</div>
            {shifts.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:2,justifyContent:"center",marginBottom:1}}>{shifts.map(r=>{const ri=institutions.find(ins=>ins.id===r.hospital);return <div key={r.id} style={{width:5,height:5,borderRadius:"50%",background:ri?ri.color:C.muted}}/>;})}</div>}
            {visits.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:2,justifyContent:"center"}}>{visits.map(r=><div key={r.id} style={{width:5,height:5,borderRadius:1,background:C.amber}}/>)}</div>}
          </>}
        </div>);
      })}
    </div>
    <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:10,alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:1,background:C.amber}}/><span style={{color:C.muted,fontSize:11}}>Vizitë</span></div>
      {institutions.map(i=><div key={i.id+"sc"} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:14,height:3,borderRadius:1,background:i.schedColor||i.color}}/><span style={{color:C.muted,fontSize:11}}>Orar {i.name}</span></div>)}
      {institutions.map(i=>{const fc=i.type==="public"?i.schedColor:i.color;return <div key={i.id+"sh"} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:12,height:12,borderRadius:3,background:fc+"4D",border:`1px solid ${fc}88`}}/><span style={{color:C.muted,fontSize:11}}>Kujd. {i.name}</span></div>;})}
    </div>
    {sel&&(<div style={{marginTop:12,background:C.surface,border:`1px solid ${C.b2}`,borderRadius:14,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{color:C.sub,fontSize:13,fontWeight:700}}>{sel} {MONTHS[mo]}</span>
        <button onClick={()=>onAdd(`${yr}-${String(mo+1).padStart(2,"0")}-${String(sel).padStart(2,"0")}`)} style={{background:C.frz,border:"none",color:"#fff",borderRadius:8,padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>+ Shto</button>
      </div>
      {schedMap[sel]&&(()=>{const si2=institutions.find(i=>i.id===schedMap[sel].hospital)||{name:"?",color:C.muted};return <div style={{marginBottom:8,padding:"6px 10px",borderRadius:8,background:si2.color+"18",border:`1px solid ${si2.color}44`}}><span style={{color:si2.color,fontWeight:700,fontSize:13}}>Kujdestari — {si2.name}</span></div>;})()}
      {(dayMap[sel]||[]).length===0&&!schedMap[sel]?<div style={{color:C.muted,fontSize:13}}>Asgjë e regjistruar.</div>:(dayMap[sel]||[]).map(r=><RecordRow key={r.id} r={r} institutions={institutions}/>)}
    </div>)}
  </div>);
}

function OrariView({schedules,toggle,clear,setGcEventId,institutions,settings}){
  const[vd,setVd]=useState(new Date()),[sel,setSel]=useState(null),[gcStatus,setGcStatus]=useState({});
  const today=new Date(),{yr,mo,cells}=calGrid(vd);
  const schedMap=useMemo(()=>{const m={};schedules.forEach(s=>{const d=new Date(s.date+"T12:00:00");if(d.getFullYear()===yr&&d.getMonth()===mo)m[d.getDate()]=s;});return m;},[schedules,yr,mo]);
  const isToday=d=>d&&today.getDate()===d&&today.getMonth()===mo&&today.getFullYear()===yr;
  const dateStr=day=>`${yr}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const gcSync=async(date,hospId,isAdd)=>{
    const token=settings?.gcToken;if(!token)return;
    const calId=settings?.gcCalendarId||"primary",inst=institutions.find(i=>i.id===hospId);if(!inst)return;
    setGcStatus(s=>({...s,[date]:"syncing"}));
    try{
      const sched=schedules.find(s=>s.date===date);
      if(isAdd){const gcId=await gcCreateEvent(token,calId,inst,{date,...(sched||{})});setGcEventId(date,gcId);}
      else await gcDeleteEvent(token,calId,sched?.gcEventId);
      setGcStatus(s=>({...s,[date]:"ok"}));setTimeout(()=>setGcStatus(s=>({...s,[date]:undefined})),3000);
    }catch{setGcStatus(s=>({...s,[date]:"err"}));setTimeout(()=>setGcStatus(s=>({...s,[date]:undefined})),4000);}
  };
  const handleToggle=async(date,hospId)=>{const ex=schedules.find(s=>s.date===date),removing=ex&&ex.hospital===hospId;if(removing)await gcSync(date,hospId,false);toggle(date,hospId);if(!removing)setTimeout(()=>gcSync(date,hospId,true),300);};
  return(<div>
    {settings?.gcToken&&<div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,padding:"6px 10px",background:C.green+"12",border:`1px solid ${C.green}33`,borderRadius:8}}><div style={{width:6,height:6,borderRadius:"50%",background:C.green,flexShrink:0}}/><span style={{color:C.green,fontSize:12}}>Google Calendar i lidhur</span></div>}
    <div style={{color:C.sub,fontSize:12,marginBottom:14}}>Preki një ditë dhe cakto kujdestaritë.</div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
      <button onClick={()=>{setVd(new Date(yr,mo-1,1));setSel(null);}} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:18}}>‹</button>
      <div style={{color:C.text,fontWeight:800,fontSize:18}}>{MONTHS[mo]} {yr}</div>
      <button onClick={()=>{setVd(new Date(yr,mo+1,1));setSel(null);}} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:18}}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,margin:"12px 0 3px"}}>{DAY_HDRS.map(d=><div key={d} style={{textAlign:"center",color:C.muted,fontSize:10,fontWeight:700}}>{d}</div>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:16}}>
      {cells.map((day,i)=>{
        const sched=day?schedMap[day]:null,si=sched?institutions.find(ins=>ins.id===sched.hospital):null;
        const isT=isToday(day),isSel=day===sel,st=day?gcStatus[dateStr(day)]:null;
        const is12h=sched&&si?.type==="private"&&!isWeekend(sched.date)&&!(schedules.find(s=>s.date===sched.date)?.isFesta);
        const lineColor=si?.schedColor||C.red;
        const lineShadow=is12h?`inset 0 3px 0 0 ${lineColor}`:`inset 0 3px 0 0 ${lineColor}, inset 0 -3px 0 0 ${lineColor}`;
        return(<div key={i} onClick={()=>day&&setSel(isSel?null:day)} style={{minHeight:52,borderRadius:9,padding:"4px 3px",cursor:day?"pointer":"default",background:isSel?C.surface:"transparent",border:isT?"1px solid #FFFFFF":isSel?`1px solid ${C.b2}`:"1px solid transparent",opacity:day?1:0,boxShadow:sched?lineShadow:"none"}}>
          {day&&<><div style={{fontSize:11,textAlign:"center",marginBottom:2,color:isT?"#FFFFFF":si?si.color:isSel?C.text:C.sub,fontWeight:isT||si||isSel?800:400}}>{day}</div>
          {si&&<div style={{fontSize:9,textAlign:"center",color:si.color,fontWeight:700,lineHeight:1.1}}>{si.name.slice(0,3).toUpperCase()}</div>}
          {st==="syncing"&&<div style={{fontSize:8,textAlign:"center",color:C.amber}}>⟳</div>}
          {st==="ok"&&<div style={{fontSize:8,textAlign:"center",color:C.green}}>✓</div>}
          {st==="err"&&<div style={{fontSize:8,textAlign:"center",color:C.red}}>!</div>}</>}
        </div>);
      })}
    </div>
    {sel&&<div style={{background:C.surface,border:`1px solid ${C.b2}`,borderRadius:14,padding:16}}>
      <div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:4}}>{sel} {MONTHS[mo]} — {dowName(dateStr(sel))}</div>
      {schedMap[sel]&&(()=>{const si=institutions.find(i=>i.id===schedMap[sel].hospital)||{name:"?",color:C.muted};return <div style={{color:C.sub,fontSize:13,marginBottom:12}}>Kujdestari aktuale: <span style={{color:si.color,fontWeight:700}}>{si.name}</span></div>;})()}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:schedMap[sel]?10:0}}>
        {institutions.map(inst=><button key={inst.id} onClick={()=>handleToggle(dateStr(sel),inst.id)} style={{flex:1,minWidth:"calc(50% - 4px)",padding:"9px 0",borderRadius:9,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${schedMap[sel]?.hospital===inst.id?inst.color:C.border}`,background:schedMap[sel]?.hospital===inst.id?inst.color+"20":"transparent",color:schedMap[sel]?.hospital===inst.id?inst.color:C.muted,fontWeight:700,fontSize:13}}>{inst.name}</button>)}
      </div>
      {schedMap[sel]&&<button onClick={async()=>{await gcSync(dateStr(sel),schedMap[sel].hospital,false);clear(dateStr(sel));setSel(null);}} style={{width:"100%",padding:"8px 0",borderRadius:9,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:13,fontWeight:600}}>Largo kujdestaritën</button>}
    </div>}
    {Object.keys(schedMap).length>0&&<div style={{marginTop:16}}>
      <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:0.8,marginBottom:10}}>KUJDESTARI {MONTHS[mo].toUpperCase()}</div>
      {Object.entries(schedMap).sort((a,b)=>+a[0]-+b[0]).map(([day,s])=>{const inst=institutions.find(i=>i.id===s.hospital)||{name:s.hospital,color:C.muted};return(<div key={day} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:6}}><div style={{width:3,alignSelf:"stretch",borderRadius:4,background:inst.color}}/><span style={{color:C.sub,fontSize:13,fontWeight:600,minWidth:28}}>{day}</span><span style={{color:C.muted,fontSize:12}}>{dowName(s.date)}</span><Pill label={inst.name} color={inst.color}/>{s.gcEventId&&<span style={{color:C.green,fontSize:10}}>📅</span>}<button onClick={async()=>{await gcSync(s.date,s.hospital,false);clear(s.date);}} style={{marginLeft:"auto",background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:15,padding:"2px 4px"}}>✕</button></div>);})}
    </div>}
  </div>);
}

function buildPrivateText(inst,shifts,patients,mo,yr){
  const L=[];L.push(`${MONTHS[mo]} - ${inst.name}`);L.push("────────────────");
  if(shifts.length){L.push("KUJDESTARI:");[...shifts].sort((a,b)=>a.date.localeCompare(b.date)).forEach(r=>{const d=new Date(r.date+"T12:00:00"),f=r.isFesta?" (Festë)":"",n=r.note?` (${r.note})`:"";L.push(`  ${String(d.getDate()).padStart(2," ")}  ${DAYS_SQ[d.getDay()]}${f}${n}`);});}
  if(patients.length){if(shifts.length)L.push("");L.push("TJERA:");L.push("  Data  Shënim          Çmimi");[...patients].sort((a,b)=>a.date.localeCompare(b.date)).forEach(r=>{const d=new Date(r.date+"T12:00:00"),n=(r.note||"—").padEnd(14);L.push(`  ${String(d.getDate()).padStart(2," ")}    ${n}  ${fmtE(r.amount)}`);});}
  L.push("────────────────");L.push(`TOTAL: ${fmtE([...shifts,...patients].reduce((s,r)=>s+parseFloat(r.amount||0),0))}`);return L.join("\n");
}
function buildPublicText(inst,shifts,mo,yr){
  const L=[];L.push(`${MONTHS[mo]} - ${inst.name}`);L.push("────────────────");L.push("KUJDESTARI:");
  [...shifts].sort((a,b)=>a.date.localeCompare(b.date)).forEach(r=>{const d=new Date(r.date+"T12:00:00"),dow=d.getDay(),dl=r.isFesta?"Festë":dow===5?"Premte":dow===6?"Shtunë":dow===0?"Diele":"E Zakonshme",n=r.note?` (${r.note})`:"";L.push(`  ${String(d.getDate()).padStart(2," ")}  ${DAYS_SQ[dow]}${n}  ${fmtE(r.amount)}`);});
  L.push("────────────────");L.push(`TOTAL: ${fmtE(shifts.reduce((s,r)=>s+parseFloat(r.amount||0),0))}`);return L.join("\n");
}
async function copyText(t){try{await navigator.clipboard.writeText(t);}catch{const ta=document.createElement("textarea");ta.value=t;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);}}
function CopyBtn({text,label="⎘ Kopjo"}){const[st,setSt]=useState("idle");return <button onClick={async()=>{await copyText(text);setSt("ok");setTimeout(()=>setSt("idle"),2500);}} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:9,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${st==="ok"?C.green:C.border}`,background:st==="ok"?C.green+"18":C.surface,color:st==="ok"?C.green:C.sub,fontSize:12,fontWeight:700}}>{st==="ok"?"✓ Kopjuar":label}</button>;}

function ReportView({records,institutions}){
  const now=new Date(),[mode,setMode]=useState("monthly"),[vd,setVd]=useState(new Date(now.getFullYear(),now.getMonth(),1)),[yr,setYr]=useState(now.getFullYear());
  const moYr=vd.getFullYear(),moMo=vd.getMonth();
  const monthlyData=useMemo(()=>{const b={};institutions.forEach(i=>{b[i.id]={shifts:[],patients:[],total:0};});records.forEach(r=>{const d=new Date(r.date+"T12:00:00");if(d.getFullYear()!==moYr||d.getMonth()!==moMo)return;if(!b[r.hospital])b[r.hospital]={shifts:[],patients:[],total:0};b[r.hospital].total+=parseFloat(r.amount||0);if(r.type==="SHIFT")b[r.hospital].shifts.push(r);else b[r.hospital].patients.push(r);});return b;},[records,moYr,moMo,institutions]);
  const yearlyData=useMemo(()=>{const ms=Array.from({length:12},(_,m)=>({mo:m,byInst:{}}));institutions.forEach(i=>ms.forEach(m=>{m.byInst[i.id]={shifts:[],patients:[],total:0};}));records.forEach(r=>{const d=new Date(r.date+"T12:00:00");if(d.getFullYear()!==yr)return;const mo=d.getMonth();if(!ms[mo].byInst[r.hospital])ms[mo].byInst[r.hospital]={shifts:[],patients:[],total:0};ms[mo].byInst[r.hospital].total+=parseFloat(r.amount||0);if(r.type==="SHIFT")ms[mo].byInst[r.hospital].shifts.push(r);else ms[mo].byInst[r.hospital].patients.push(r);});return ms;},[records,yr,institutions]);
  const shiftRow=(r,inst)=>{const dow=dowOfDate(r.date),hl=r.isFesta?"Festë":inst?.type==="public"?(dow===5?"Premte":dow===6?"Shtunë":dow===0?"Diele":"E Zakonshme"):(r.shiftType==="FESTE"?"Fundjave":"E Zakonshme");return <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.sub,fontSize:13}}>{new Date(r.date+"T12:00:00").getDate()} — <span style={{color:r.isFesta?C.amber:C.sub}}>{hl}</span>{r.note?<span style={{color:C.muted}}> · {r.note}</span>:""}</span><span style={{color:C.green,fontWeight:700,fontSize:14}}>{fmtE(r.amount)}</span></div>;};
  const buildYearText=()=>{const L=[`Raport Vjetor ${yr}`,"════════════════"];institutions.forEach(inst=>{L.push(`\n${inst.name.toUpperCase()}`);L.push("────────────────");yearlyData.forEach(({mo,byInst})=>{const d=byInst[inst.id];if(!d||d.total===0)return;L.push(`${MONTHS[mo].padEnd(10)}  ${fmtE(d.total)}`);});L.push(`TOTAL: ${fmtE(yearlyData.reduce((s,{byInst})=>s+(byInst[inst.id]?.total||0),0))}`);});L.push(`\n════════════════\nGJITHSEJ: ${fmtE(yearlyData.reduce((s,{byInst})=>s+Object.values(byInst).reduce((a,d)=>a+d.total,0),0))}`);return L.join("\n");};
  return(<div>
    <div style={{display:"flex",gap:8,marginBottom:16}}><Seg active={mode==="monthly"} color={C.frz} onClick={()=>setMode("monthly")} small>Mujor</Seg><Seg active={mode==="yearly"} color={C.frz} onClick={()=>setMode("yearly")} small>Vjetor</Seg></div>
    {mode==="monthly"&&<>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><button onClick={()=>setVd(new Date(moYr,moMo-1,1))} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:18}}>‹</button><div style={{textAlign:"center"}}><div style={{color:C.text,fontWeight:800,fontSize:18}}>{MONTHS[moMo]} {moYr}</div><div style={{color:C.green,fontWeight:700,fontSize:15}}>{fmtE(Object.values(monthlyData).reduce((s,d)=>s+d.total,0))} total</div></div><button onClick={()=>setVd(new Date(moYr,moMo+1,1))} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:18}}>›</button></div>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(institutions.length,3)},1fr)`,gap:8,marginBottom:20}}>{institutions.map(inst=><div key={inst.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 8px",textAlign:"center"}}><div style={{color:inst.color,fontWeight:800,fontSize:18}}>{fmtE(monthlyData[inst.id]?.total||0)}</div><div style={{color:C.muted,fontSize:10,marginTop:3}}>{inst.name}</div></div>)}</div>
      {institutions.filter(i=>i.type==="public").map(inst=>{const d=monthlyData[inst.id];if(!d||d.shifts.length===0)return null;return <div key={inst.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,marginBottom:12,overflow:"hidden"}}><div style={{background:C.surface,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:inst.color,fontWeight:800,fontSize:15}}>{inst.name}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{color:C.green,fontWeight:700}}>{fmtE(d.total)}</span><CopyBtn text={buildPublicText(inst,d.shifts,moMo,moYr)} label="⎘ Kopjo"/></div></div><div style={{padding:"6px 16px 10px"}}>{[...d.shifts].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>shiftRow(r,inst))}</div></div>;})}
      {institutions.filter(i=>i.type==="private").map(inst=>{const d=monthlyData[inst.id];if(!d||(d.shifts.length===0&&d.patients.length===0))return null;const sT=d.shifts.reduce((s,r)=>s+parseFloat(r.amount||0),0),pT=d.patients.reduce((s,r)=>s+parseFloat(r.amount||0),0),gT=sT+pT;return <div key={inst.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,marginBottom:12,overflow:"hidden"}}><div style={{background:C.surface,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:inst.color,fontWeight:800,fontSize:15}}>{inst.name}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{color:C.green,fontWeight:700}}>{fmtE(gT)}</span><CopyBtn text={buildPrivateText(inst,d.shifts,d.patients,moMo,moYr)} label="⎘ Kopjo"/></div></div>
      {d.shifts.length>0&&<div style={{padding:"6px 16px 2px"}}><div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:0.7,padding:"8px 0 4px"}}>KUJDESTARI</div>{[...d.shifts].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>shiftRow(r,inst))}</div>}
      {d.patients.length>0&&<div style={{padding:"6px 16px 10px"}}><div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:0.7,padding:"8px 0 4px"}}>TJERA</div>{[...d.patients].sort((a,b)=>a.date.localeCompare(b.date)).map(r=><div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.sub,fontSize:13}}>{new Date(r.date+"T12:00:00").getDate()}{r.note?<span style={{color:C.muted}}> — {r.note}</span>:""}</span><span style={{color:C.green,fontWeight:700,fontSize:14}}>{fmtE(r.amount)}</span></div>)}</div>}
      </div>;})}
      {Object.values(monthlyData).every(d=>d.total===0)&&<div style={{color:C.muted,textAlign:"center",padding:48,fontSize:14}}>Nuk ka regjistrime për {MONTHS[moMo]}.</div>}
    </>}
    {mode==="yearly"&&<>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><button onClick={()=>setYr(y=>y-1)} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:18}}>‹</button><div style={{textAlign:"center"}}><div style={{color:C.text,fontWeight:800,fontSize:18}}>{yr}</div><div style={{color:C.green,fontWeight:700,fontSize:15}}>{fmtE(yearlyData.reduce((s,{byInst})=>s+Object.values(byInst).reduce((a,d)=>a+d.total,0),0))} total</div></div><button onClick={()=>setYr(y=>y+1)} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:18}}>›</button></div>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(institutions.length,3)},1fr)`,gap:8,marginBottom:16}}>{institutions.map(inst=>{const tot=yearlyData.reduce((s,{byInst})=>s+(byInst[inst.id]?.total||0),0),sh=yearlyData.reduce((s,{byInst})=>s+(byInst[inst.id]?.shifts.length||0),0);return <div key={inst.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 8px",textAlign:"center"}}><div style={{color:inst.color,fontWeight:800,fontSize:18}}>{fmtE(tot)}</div><div style={{color:C.muted,fontSize:10,marginTop:2}}>{inst.name}</div><div style={{color:C.muted,fontSize:10}}>{sh} kujd.</div></div>;})}  </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}><CopyBtn text={buildYearText()} label="⎘ Kopjo raportin vjetor"/></div>
      {institutions.map(inst=>{const hasD=yearlyData.some(({byInst})=>(byInst[inst.id]?.total||0)>0);if(!hasD)return null;const tot=yearlyData.reduce((s,{byInst})=>s+(byInst[inst.id]?.total||0),0);return <div key={inst.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,marginBottom:12,overflow:"hidden"}}><div style={{background:C.surface,padding:"12px 16px",display:"flex",justifyContent:"space-between"}}><span style={{color:inst.color,fontWeight:800,fontSize:15}}>{inst.name}</span><span style={{color:C.green,fontWeight:700}}>{fmtE(tot)}</span></div><div style={{padding:"6px 16px 10px"}}>{yearlyData.map(({mo,byInst})=>{const d=byInst[inst.id];if(!d||d.total===0)return null;return <div key={mo} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.sub,fontSize:13,minWidth:70}}>{MONTHS[mo]}</span><span style={{color:C.muted,fontSize:12}}>{d.shifts.length>0?`${d.shifts.length} kujd.`:""}{d.patients.length>0?` ${d.patients.length} viz.`:""}</span><span style={{color:C.green,fontWeight:700,fontSize:14}}>{fmtE(d.total)}</span></div>;})}</div></div>;})}
    </>}
  </div>);
}

function ListView({records,onEdit,onDelete,institutions}){
  const[hf,setHf]=useState("ALL");
  const sorted=useMemo(()=>[...records].filter(r=>hf==="ALL"||r.hospital===hf).sort((a,b)=>b.date.localeCompare(a.date)),[records,hf]);
  return(<div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}><button onClick={()=>setHf("ALL")} style={{padding:"6px 14px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13,border:`1px solid ${hf==="ALL"?C.frz:C.border}`,background:hf==="ALL"?C.frz+"20":"transparent",color:hf==="ALL"?C.frz:C.muted}}>Të gjitha</button>{institutions.map(i=><button key={i.id} onClick={()=>setHf(i.id)} style={{padding:"6px 14px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13,border:`1px solid ${hf===i.id?i.color:C.border}`,background:hf===i.id?i.color+"20":"transparent",color:hf===i.id?i.color:C.muted}}>{i.name}</button>)}</div>{sorted.length===0?<div style={{color:C.muted,textAlign:"center",padding:48,fontSize:14}}>Nuk ka regjistrime.</div>:sorted.map(r=><RecordRow key={r.id} r={r} onEdit={onEdit} onDelete={onDelete} institutions={institutions}/>)}</div>);
}

function KonfigView({institutions,addInstitution,updateInstitution,removeInstitution,settings,setSetting,records,schedules}){
  const[tab,setTab]=useState("inst"),[form,setForm]=useState(null),[confirm,setConfirm]=useState(null),[msg,setMsg]=useState("");
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const lbl={display:"block",color:C.sub,fontSize:11,fontWeight:700,letterSpacing:0.8,marginBottom:5,textTransform:"uppercase"};
  const inp={width:"100%",boxSizing:"border-box",background:C.surface,border:`1px solid ${C.b2}`,borderRadius:9,padding:"10px 13px",color:C.text,fontSize:15,outline:"none",fontFamily:"inherit",marginBottom:12};
  const defP=type=>type==="public"?{mon:0,fri:0,sat:0,sun:0}:{weekday:0,weekend:0};
  const save=()=>{if(!form.name.trim())return;const sc=form.type==="public"?C.red:form.color,p=form.prices||defP(form.type);if(form.id)updateInstitution(form.id,{name:form.name,type:form.type,color:form.color,schedColor:sc,prices:p});else addInstitution({name:form.name,type:form.type,color:form.color,schedColor:sc,prices:p});setForm(null);};
  const pInp=k=><input type="number" value={form.prices?.[k]||""} onChange={e=>setF("prices",{...form.prices,[k]:Number(e.target.value)})} style={{...inp,marginBottom:0,textAlign:"center",fontSize:14,padding:"8px 6px"}}/>;
  const gcConnected=!!(settings?.gcToken),GC_CLIENT_ID=settings?.gcClientId||"";
  const connectGoogle=()=>{if(!GC_CLIENT_ID){alert("Vendos Google Client ID më poshë.");return;}const r=encodeURIComponent(window.location.origin+window.location.pathname),sc=encodeURIComponent("https://www.googleapis.com/auth/calendar.events");window.location.href=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${GC_CLIENT_ID}&redirect_uri=${r}&response_type=token&scope=${sc}&include_granted_scopes=true`;};
  const exportBackup=()=>{const d=JSON.stringify({records,schedules,institutions,settings,exportedAt:new Date().toISOString()},null,2),b=new Blob([d],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=`regjistri-im-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);setMsg("✓ Backup u shkarkua");setTimeout(()=>setMsg(""),3000);};
  const importBackup=e=>{const f2=e.target.files?.[0];if(!f2)return;const rd=new FileReader();rd.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.records){idbSet("records","data",d.records);localStorage.setItem("dr_v3",JSON.stringify(d.records));}if(d.schedules){idbSet("schedules","data",d.schedules);localStorage.setItem("dr_sched_v1",JSON.stringify(d.schedules));}if(d.institutions){idbSet("institutions","data",d.institutions);localStorage.setItem("dr_institutions_v1",JSON.stringify(d.institutions));}if(d.settings){idbSet("settings","data",d.settings);localStorage.setItem("dr_settings_v1",JSON.stringify(d.settings));}setMsg("✓ Restore u krye — rinis app-in");setTimeout(()=>window.location.reload(),2000);}catch{setMsg("⚠ Skedar i pavlefshëm");}};rd.readAsText(f2);};
  return(<div>
    <div style={{display:"flex",gap:6,marginBottom:20}}>{[["inst","🏛 Institucionet"],["kal","📅 Kalendari"],["backup","💾 Backup"]].map(([id,lb])=><button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px 0",borderRadius:9,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${tab===id?C.frz:C.border}`,background:tab===id?C.frz+"20":"transparent",color:tab===id?C.frz:C.muted,fontWeight:700,fontSize:12}}>{lb}</button>)}</div>
    {tab==="inst"&&<>{institutions.map(inst=><div key={inst.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:8}}><div style={{width:10,height:10,borderRadius:"50%",background:inst.color,flexShrink:0}}/><div style={{flex:1}}><div style={{color:C.text,fontWeight:700,fontSize:14}}>{inst.name}</div><div style={{color:C.muted,fontSize:11}}>{inst.type==="public"?"🏛 Publike":"🏥 Private"}</div></div><button onClick={()=>setForm({...inst,prices:inst.prices||defP(inst.type)})} style={{background:"transparent",border:"none",color:C.sub,cursor:"pointer",fontSize:15}}>✏️</button><button onClick={()=>setConfirm(inst.id)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:15}}>🗑</button></div>)}<button onClick={()=>setForm({name:"",type:"public",color:INST_COLORS[0],prices:defP("public")})} style={{width:"100%",padding:"11px 0",borderRadius:11,cursor:"pointer",fontFamily:"inherit",border:`1px dashed ${C.b2}`,background:"transparent",color:C.sub,fontWeight:700,fontSize:14,marginTop:4}}>+ Shto Institucion</button></>}
    {tab==="kal"&&<>{!gcConnected&&<><div style={{color:C.sub,fontSize:13,marginBottom:16,lineHeight:1.6}}>Lidhu me Google Calendar për të sinkronizuar kujdestaritë. Funksionon në Android dhe iPhone.</div><label style={lbl}>Google OAuth Client ID</label><input value={GC_CLIENT_ID} onChange={e=>setSetting("gcClientId",e.target.value)} placeholder="123456789-xxx.apps.googleusercontent.com" style={inp}/><div style={{color:C.muted,fontSize:11,marginBottom:16,lineHeight:1.5}}>Merr nga console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client ID (Web).</div><button onClick={connectGoogle} style={{width:"100%",padding:"13px 0",borderRadius:11,border:"none",background:GC_CLIENT_ID?"#4285F4":C.muted,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:15}}>🔗 Lidhu me Google</button></>}{gcConnected&&<><div style={{background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:20}}>✅</span><div><div style={{color:C.green,fontWeight:700,fontSize:14}}>I lidhur me Google</div><div style={{color:C.muted,fontSize:12}}>Sinkronizohet automatikisht</div></div></div><button onClick={()=>{setSetting("gcToken",null);setSetting("gcCalendarId",null);setSetting("gcCalendarName",null);}} style={{width:"100%",padding:"11px 0",borderRadius:11,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>Shkëput Google</button></>}</>}
    {tab==="backup"&&<>{msg&&<div style={{padding:"10px 14px",borderRadius:10,background:msg.startsWith("✓")?C.green+"18":C.amber+"18",color:msg.startsWith("✓")?C.green:C.amber,fontSize:13,fontWeight:700,marginBottom:16}}>{msg}</div>}<div style={{color:C.sub,fontSize:13,marginBottom:20,lineHeight:1.6}}>Shkarko të gjitha të dhënat si skedar JSON.</div><div style={{display:"flex",flexDirection:"column",gap:12}}><button onClick={exportBackup} style={{width:"100%",padding:"14px 0",borderRadius:11,border:"none",background:C.frz,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:15}}>⬇ Shkarko Backup</button><div style={{position:"relative"}}><button style={{width:"100%",padding:"14px 0",borderRadius:11,border:`1px solid ${C.border}`,background:"transparent",color:C.sub,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:15}}>⬆ Rikthe nga Backup</button><input type="file" accept=".json" onChange={importBackup} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%"}}/></div></div><div style={{marginTop:20,padding:"12px 14px",background:C.surface,borderRadius:10,border:`1px solid ${C.border}`}}><div style={{color:C.sub,fontSize:12,fontWeight:700,marginBottom:6}}>ÇKA RUHET:</div><div style={{color:C.muted,fontSize:12,lineHeight:1.8}}>✓ Regjistrat · ✓ Orari · ✓ Institucionet · ✓ Cilësimet Google</div></div></>}
    {form&&<div style={{position:"fixed",inset:0,background:"#000000BB",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setForm(null)}><div style={{background:C.card,border:`1px solid ${C.b2}`,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}><div style={{width:36,height:4,borderRadius:2,background:C.muted,margin:"0 auto 20px"}}/><h3 style={{color:C.text,margin:"0 0 18px",fontSize:16}}>{form.id?"Ndrysho":"Institucion i Ri"}</h3><label style={lbl}>Emri</label><input value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="Emri" style={inp}/><label style={lbl}>Lloji</label><div style={{display:"flex",gap:10,marginBottom:16}}>{[["public","🏛 Publike"],["private","🏥 Private"]].map(([v,lb])=><button key={v} onClick={()=>{setF("type",v);setF("prices",defP(v));}} style={{flex:1,padding:"10px 0",borderRadius:9,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${form.type===v?C.frz:C.border}`,background:form.type===v?C.frz+"20":"transparent",color:form.type===v?C.frz:C.muted,fontWeight:700,fontSize:13}}>{lb}</button>)}</div><label style={lbl}>Ngjyra</label><div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>{INST_COLORS.map(col=><button key={col} onClick={()=>setF("color",col)} style={{width:32,height:32,borderRadius:"50%",background:col,border:`2px solid ${form.color===col?"#fff":"transparent"}`,cursor:"pointer",padding:0}}/>)}</div>
    {form.type==="public"&&<><label style={lbl}>Çmimet (€)</label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>{[["mon","E Hënë–Enjte"],["fri","E Premte"],["sat","E Shtunë"],["sun","E Diele"]].map(([k,lb])=><div key={k}><div style={{color:C.muted,fontSize:11,marginBottom:4}}>{lb}</div>{pInp(k)}</div>)}</div></>}
    {form.type==="private"&&<><label style={lbl}>Çmimet (€)</label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>{[["weekday","E Zakonshme"],["weekend","Festë/Weekend"]].map(([k,lb])=><div key={k}><div style={{color:C.muted,fontSize:11,marginBottom:4}}>{lb}</div>{pInp(k)}</div>)}</div></>}
    <div style={{display:"flex",gap:10}}><button onClick={()=>setForm(null)} style={{flex:1,padding:"12px 0",borderRadius:11,border:`1px solid ${C.border}`,background:"transparent",color:C.sub,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>Anulo</button><button onClick={save} disabled={!form.name.trim()} style={{flex:2,padding:"12px 0",borderRadius:11,border:"none",background:form.name.trim()?C.frz:C.muted,color:"#fff",fontWeight:800,cursor:form.name.trim()?"pointer":"default",fontFamily:"inherit",fontSize:14}}>Ruaj</button></div></div></div>}
    {confirm&&<ConfirmDialog title="Largo Institucionin?" message="Ky veprim nuk mund të kthehet mbrapsët." onConfirm={()=>{removeInstitution(confirm);setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}
  </div>);
}

export default function App(){
  const{records,add,remove,update}=useRecords();
  const{schedules,toggle:toggleSched,clear:clearSched,setGcEventId}=useSchedules();
  const{institutions,addInstitution,updateInstitution,removeInstitution}=useInstitutions();
  const{settings,setSetting}=useSettings();
  const[drawer,setDrawer]=useState(null),[modal,setModal]=useState(null),now=new Date();
  useEffect(()=>{const h=window.location.hash;if(h.includes("access_token")){const p=new URLSearchParams(h.slice(1)),t=p.get("access_token");if(t){setSetting("gcToken",t);window.history.replaceState({},"",window.location.pathname);}}},[]);
  useEffect(()=>{const f=()=>{setDrawer(null);setModal(null);};window.addEventListener("popstate",f);return()=>window.removeEventListener("popstate",f);},[]);
  const openDrawer=id=>{window.history.pushState({overlay:id},"");setDrawer(id);};
  const closeDrawer=()=>setDrawer(null),closeModal=()=>setModal(null);
  const openModal=data=>{window.history.pushState({overlay:"modal"},"");setModal(data);};
  const openAdd=date=>{openModal({prefillDate:date||now.toISOString().slice(0,10)});};
  const MENU=[["orari","📅 Orari"],["list","📋 Lista"],["report","📊 Raport"],["konfig","⚙️ Konfig"]];
  return(<div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text,maxWidth:480,margin:"0 auto"}}>
    <div style={{padding:"16px 16px 0",background:C.bg,position:"sticky",top:0,zIndex:50}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <span style={{color:C.text,fontWeight:900,fontSize:22,letterSpacing:-0.5}}>REGJISTRI IM</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>openDrawer("orari")}  style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:"4px 6px",lineHeight:1}}>📅</button>
          <button onClick={()=>openDrawer("report")} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:"4px 6px",lineHeight:1}}>📊</button>
          <button onClick={()=>drawer?closeDrawer():openDrawer("menu")} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,width:38,height:38,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer",padding:0,flexShrink:0}}>{[0,1,2].map(i=><div key={i} style={{width:16,height:2,borderRadius:1,background:C.sub}}/>)}</button>
        </div>
      </div>
    </div>
    <div style={{padding:16,paddingBottom:100}}><CalendarView records={records} schedules={schedules} onAdd={openAdd} institutions={institutions}/></div>
    <div style={{textAlign:"center",padding:"0 0 32px",color:C.muted,fontSize:11}}>zhvilluar për përdorim personal · G.S</div>
    <button onClick={()=>openAdd()} style={{position:"fixed",bottom:28,right:20,width:58,height:58,borderRadius:"50%",background:`linear-gradient(135deg,${C.frz},${C.ftm})`,border:"none",color:"#fff",fontSize:28,cursor:"pointer",boxShadow:`0 4px 20px ${C.frz}66`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:60}}>+</button>
    {drawer==="menu"&&<div style={{position:"fixed",inset:0,zIndex:200}}><div style={{position:"absolute",inset:0}} onClick={closeDrawer}/><div style={{position:"absolute",top:70,right:16,background:C.card,border:`1px solid ${C.b2}`,borderRadius:14,overflow:"hidden",minWidth:180}}>{MENU.map(([id,lb])=><button key={id} onClick={()=>openDrawer(id)} style={{display:"block",width:"100%",padding:"14px 18px",textAlign:"left",background:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,color:C.text,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>{lb}</button>)}</div></div>}
    {drawer&&drawer!=="menu"&&<div style={{position:"fixed",inset:0,zIndex:200}}><div style={{position:"absolute",inset:0,background:"#000000AA"}} onClick={closeDrawer}/><div style={{position:"absolute",bottom:0,left:0,right:0,maxWidth:480,margin:"0 auto",background:C.card,border:`1px solid ${C.b2}`,borderRadius:"20px 20px 0 0",padding:"16px 16px 48px",maxHeight:"88vh",overflowY:"auto"}}><div style={{width:36,height:4,borderRadius:2,background:C.muted,margin:"0 auto 14px"}}/><div style={{display:"flex",gap:6,marginBottom:16}}>{MENU.map(([id,lb])=><button key={id} onClick={()=>openDrawer(id)} style={{flex:1,padding:"8px 0",borderRadius:9,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${drawer===id?C.frz:C.border}`,background:drawer===id?C.frz+"20":"transparent",color:drawer===id?C.frz:C.muted,fontWeight:700,fontSize:11}}>{lb}</button>)}</div>
      {drawer==="orari"  &&<OrariView schedules={schedules} toggle={toggleSched} clear={clearSched} setGcEventId={setGcEventId} institutions={institutions} settings={settings}/>}
      {drawer==="list"   &&<ListView  records={records} onEdit={r=>openModal({editing:r})} onDelete={remove} institutions={institutions}/>}
      {drawer==="report" &&<ReportView records={records} institutions={institutions}/>}
      {drawer==="konfig" &&<KonfigView institutions={institutions} addInstitution={addInstitution} updateInstitution={updateInstitution} removeInstitution={removeInstitution} settings={settings} setSetting={setSetting} records={records} schedules={schedules}/>}
    </div></div>}
    {modal&&!modal.editing&&<Modal onClose={closeModal} onSave={add} institutions={institutions} initial={modal.prefillDate?{hospital:institutions[0]?.id||"FERIZAJ",type:"SHIFT",date:modal.prefillDate,shiftType:institutions[0]?.type==="private"?getPrivateShiftType(modal.prefillDate):"H24",isFesta:false,amount:String(getAutoPrice(institutions[0],modal.prefillDate,institutions[0]?.type==="private"?getPrivateShiftType(modal.prefillDate):"H24",false)),note:""}:undefined}/>}
    {modal?.editing&&<Modal onClose={closeModal} initial={modal.editing} institutions={institutions} onSave={d=>{update(modal.editing.id,d);}}/>}
  </div>);
}
