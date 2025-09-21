"use client";
import React, { useMemo, useState, useEffect } from "react";

/* ---------------------- MOUNT GUARD ---------------------- */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/* ---------------------- DATA ---------------------- */
const GENERAL_DOCTORS = [
  "dr. bhutia","dr. bun","dr. calliauw","dr. de cuyper","dr. de mey","dr. du maine",
  "dr. lammens","dr. maryenen","dr. najafi","dr. opsomer","dr. peyls",
  "dr. scholliers","dr. tosi","dr. van laere","dr. vanfleteren","dr. ver eecke",
  "dr. vanhonacker"
];
const CARDIO_DOCTORS = ["dr. beckers","dr. calliauw","dr. ghijselings","dr. verborgh"];
const OVERLAP_DOCTORS = CARDIO_DOCTORS.filter(d => GENERAL_DOCTORS.includes(d));
const OVERLAP_SET = new Set(OVERLAP_DOCTORS);
const ALL_DOCTORS = Array.from(new Set([...GENERAL_DOCTORS, ...CARDIO_DOCTORS]));

/* ---------------------- FTE ---------------------- */
const DEFAULT_FTE = Object.fromEntries(ALL_DOCTORS.map(d => [d, 1]));
function loadFTE(){
  if (typeof window==="undefined") return DEFAULT_FTE;
  try {
    const obj = JSON.parse(localStorage.getItem("fte") || "{}");
    return { ...DEFAULT_FTE, ...obj };
  } catch { return DEFAULT_FTE; }
}
function saveFTE(fte){
  if (typeof window==="undefined") return;
  localStorage.setItem("fte", JSON.stringify(fte));
}

const NL_DAGEN = ["maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag","zondag"];
const NL_DAGEN_SHORT = ["Ma","Di","Wo","Do","Vr","Za","Zo"];

/* Regels/limieten */
const GENERAL_CAP_FOR_OVERLAP = 1;   // overlap-arts: max 1 gewone wacht (inslaap/late) per maand
const MAX_LATE_FOR_NON_OVERLAP = 2;  // non-overlap: max 2 lates per maand
const MAX_GENERAL_FOR_ANYONE = 3;    // absolute cap (inslaap+late) per maand
const MAX_2_CARDIO_MONTHLY = 2;      // max 2 cardio weken per maand

/* ---------------------- UTIL ---------------------- */
function ymd(d){ return d.toISOString().slice(0,10); }
function addDays(d,n){ const c=new Date(d); c.setDate(c.getDate()+n); return c; }
function monthKey(y,m){ return `${y}-${String(m).padStart(2,"0")}`; }

function getDaysOfMonth(year,month){
  const first=new Date(year, month-1, 1); const res=[];
  let d=first; while(d.getMonth()===first.getMonth()){
    const dow=(d.getDay()+6)%7; const isWeekend=dow>=5;
    res.push({
      date:new Date(d), dateStr:ymd(d), dow, isWeekend,
      dayName:NL_DAGEN[dow], dayNameShort:NL_DAGEN_SHORT[dow],
      weekNr:getISOWeek(d)
    });
    d=addDays(d,1);
  }
  return res;
}

function getISOWeek(date){
  const d=new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-dayNum+3);
  const firstThursday=new Date(Date.UTC(d.getUTCFullYear(),0,4));
  const diff = d - firstThursday;
  return 1 + Math.round(diff/ (7*24*3600*1000));
}

/* ---------------------- PERSIST (client) ---------------------- */
function ZERO(){ return { iw:0,iwe:0,lw:0,lwe:0,cw:0,cwe:0 }; }
function loadYearCounters(year){
  if (typeof window==="undefined") return null;
  const key=`counters:${year}`; const raw=localStorage.getItem(key);
  if(!raw) return null; try{ return JSON.parse(raw); }catch{ return null; }
}
function saveYearCounters(year, obj){ if(typeof window!=="undefined") localStorage.setItem(`counters:${year}`, JSON.stringify(obj)); }
function loadFinalized(year){ if(typeof window==="undefined") return null; try{ return JSON.parse(localStorage.getItem(`finalized:${year}`)||"{}"); }catch{ return {}; } }
function saveFinalized(year, obj){ if(typeof window!=="undefined") localStorage.setItem(`finalized:${year}`, JSON.stringify(obj)); }

/* ---------------------- FAIRNESS (JAARBALANS) ---------------------- */
function buildFairness(counters, fte){
  const get = (d)=> counters?.[d] || ZERO();

  const isGenActive = d => {
    const c=get(d); return (c.iw+c.iwe+c.lw+c.lwe) > 0;
  };
  const isCarActive = d => {
    const c=get(d); return (c.cw+c.cwe) > 0;
  };

  const genDocs = GENERAL_DOCTORS.filter(isGenActive);
  const carDocs = CARDIO_DOCTORS.filter(isCarActive);
  const genPool = genDocs.length ? genDocs : GENERAL_DOCTORS;
  const carPool = carDocs.length ? carDocs : CARDIO_DOCTORS;

  const sumFte = (arr)=> arr.reduce((s,d)=> s + (fte?.[d] ?? 1), 0) || 1;
  const genFteSum = sumFte(genPool);
  const carFteSum = sumFte(carPool);

  const totals = { iw:0,iwe:0,lw:0,lwe:0,cw:0,cwe:0 };
  for(const d of genPool){ const c=get(d); totals.iw+=c.iw; totals.iwe+=c.iwe; totals.lw+=c.lw; totals.lwe+=c.lwe; }
  for(const d of carPool){ const c=get(d); totals.cw+=c.cw; totals.cwe+=c.cwe; }

  const def = {};
  for(const d of ALL_DOCTORS){
    const c = get(d);
    const f = fte?.[d] ?? 1;

    const exp_iw  = genPool.includes(d) ? totals.iw  * (f/genFteSum) : 0;
    const exp_iwe = genPool.includes(d) ? totals.iwe * (f/genFteSum) : 0;
    const exp_lw  = genPool.includes(d) ? totals.lw  * (f/genFteSum) : 0;
    const exp_lwe = genPool.includes(d) ? totals.lwe * (f/genFteSum) : 0;

    const exp_cw  = carPool.includes(d) ? totals.cw  * (f/carFteSum) : 0;
    const exp_cwe = carPool.includes(d) ? totals.cwe * (f/carFteSum) : 0;

    def[d] = {
      iw:  exp_iw  - c.iw,
      iwe: exp_iwe - c.iwe,
      lw:  exp_lw  - c.lw,
      lwe: exp_lwe - c.lwe,
      cw:  exp_cw  - c.cw,
      cwe: exp_cwe - c.cwe,
      cardioTotal: (exp_cw + exp_cwe) - (c.cw + c.cwe),
    };
  }

  const mean = { iw:0,iwe:0,lw:0,lwe:0,cw:0,cwe:0 };
  return { mean, def, genPool, carPool };
}

/* ---------------------- PLANNER CORE ---------------------- */
function generateSchedule({
  year, month,
  desiderata, nonWorkDates, restrictions, prevMonthCardioDoc,
  fairness, // { enabled:boolean, strength:number, counters:object|null }
  fte
}){
  const days = getDaysOfMonth(year,month);
  const roster = {};
  const liw=new Map(), liwe=new Map(), llw=new Map(), llwe=new Map(), lcw=new Map(), lcwe=new Map();
  const loadMap=(role,isWe)=> role==="inslaap"?(isWe?liwe:liw):role==="late"?(isWe?llwe:llw):(isWe?lcwe:lcw);

  const cardioBlocks=new Map();      // doc -> Set(weekNr)
  const cardioAssignee=new Map();    // weekNr -> doc

  const recup=new Map(); // dateStr -> Set(doc)
  const addRecup=(day,doc)=>{
    const tm=addDays(day.date,1); const tmKey=ymd(tm);
    const s=new Set(recup.get(tmKey)||[]); s.add(doc); recup.set(tmKey,s);
  };

  const isNoLate=(d)=> restrictions[d]?.noLate || false;
  const getDNW=(d)=> restrictions[d]?.daysNotWork || new Set();
  const first2Off=(d,w)=> d==="dr. ghijselings" && w<=2 && restrictions[d]?.first2WeeksUnavailable;

  const posGen=desiderata.posGen, negGen=desiderata.negGen;
  const posCar=desiderata.posCar, negCar=desiderata.negCar;

  const fairnessActive = fairness?.enabled && fairness?.counters;
  const fairnessData = fairnessActive ? buildFairness(fairness.counters, fte) : null;
  const alpha = fairnessActive ? (fairness.strength || 0.8) : 0;

  const isAvail=(d,day,role)=>{
    if(recup.get(day.dateStr)?.has(d)) return false;
    if(nonWorkDates.get(d)?.has(day.dateStr)) return false;
    if(getDNW(d).has(day.dayName)) return false;
    const tm=addDays(day.date,1);
    const tmName=NL_DAGEN[(tm.getDay()+6)%7];
    if(getDNW(d).has(tmName)) return false;
    if(nonWorkDates.get(d)?.has(ymd(tm))) return false;
    if(first2Off(d,day.weekNr)) return false;

    if(role==="late" && OVERLAP_SET.has(d)) return false;
    if(role==="late" && isNoLate(d)) return false;

    if((role==="inslaap" || role==="late") && OVERLAP_SET.has(d)) {
      const c = generalMonthCount.get(d) || 0;
      if(c >= GENERAL_CAP_FOR_OVERLAP) return false;
    }
    if(role==="late" && !OVERLAP_SET.has(d)){
      const c = (lateMonthCount.get(d) || 0);
      if(c >= MAX_LATE_FOR_NON_OVERLAP) return false;
    }
    if((role==="inslaap" || role==="late")){
      const total = generalMonthCount.get(d) || 0;
      if(total >= MAX_GENERAL_FOR_ANYONE) return false;
    }

    return true;
  };

  const pickWeighted=(candidates, day, role)=>{
    if(!candidates.length) return null;
    const isWe = day.isWeekend;

    const map = loadMap(role,isWe);
    const monthCount = (map.get(day.dateStr) || new Map());

    const scores = candidates.map(d=>{
      let base = 1.0;
      const c = monthCount.get(d) || 0; if(c>0) base -= 0.7; // kleine straf als al die dag gepland

      // desiderata: pos boost, neg straf
      if(role!=="cardio"){
        const pos = (posGen.get(d)||new Set()).has(day.dateStr);
        const neg = (negGen.get(d)||new Set()).has(day.dateStr);
        if(pos) base += 0.25; if(neg) base -= 0.5;
      } else {
        const pos = (posCar.get(d)||new Set()).has(String(day.weekNr));
        const neg = (negCar.get(d)||new Set()).has(String(day.weekNr));
        if(pos) base += 0.25; if(neg) base -= 0.6;
      }

      // fairness (jaar; FTE-gewogen deficiten)
      if(fairnessData){
        const def = fairnessData.def[d] || ZERO();
        const key = role==="inslaap"? (isWe?"iwe":"iw") : role==="late"? (isWe?"lwe":"lw") : (isWe?"cwe":"cw");
        const fair = role==="cardio" ? def.cardioTotal : def[key];
        base -= alpha * fair * 0.1; // schaal klein houden
      }

      return { d, w: Math.max(0.0001, base) };
    });

    const sum = scores.reduce((s,o)=> s+o.w, 0);
    let r = Math.random() * sum;
    for(const s of scores){ r -= s.w; if(r <= 0) return s.d; }
    return scores[scores.length-1].d;
  };

  // maandtellers (hard caps)
  const generalMonthCount=new Map();
  const lateMonthCount=new Map();

  // cardio weken per arts, geen 2/maand en geen opeenvolgende
  const cardioWeeks = {};

  for(const day of days){
    // cardio wordt per week gekozen (één arts verantwoordelijk)
    if(day.dow===0){ // maandag -> blok kiezen
      const weekNr = day.weekNr;
      const weekDays = days.filter(x=>x.weekNr===weekNr);

      // kandidaten cardio (iedereen in CARDIO_DOCTORS, constraints)
      const candidates = CARDIO_DOCTORS.filter(d=>{
        const monthCardio = weekDays.some(wd=> (lcw.get(wd.dateStr)?.get(d)||0) + (lcwe.get(wd.dateStr)?.get(d)||0) > 0);
        const curMonthCnt = weekDays.reduce((s,wd)=> s + ((lcw.get(wd.dateStr)?.get(d)||0) + (lcwe.get(wd.dateStr)?.get(d)||0)), 0);
        if(curMonthCnt >= MAX_2_CARDIO_MONTHLY) return false;
        const lastWeekDoc = cardioAssignee.get(weekNr-1);
        if(lastWeekDoc===d) return false; // geen opeenvolgende weken
        if(prevMonthCardioDoc && weekNr===getISOWeek(new Date(year,month-1,1)) && prevMonthCardioDoc===d) return false;
        return true;
      });

      const pick = pickWeighted(candidates.map(d=>d), day, "cardio");
      if(pick){
        cardioAssignee.set(weekNr, pick);
        cardioWeeks[weekNr] = pick;
        for(const wd of weekDays){
          const map = wd.isWeekend? lcwe : lcw;
          const m = new Map(map.get(wd.dateStr)||new Map());
          m.set(pick, (m.get(pick)||0)+1);
          map.set(wd.dateStr, m);
        }
      }
    }

    // INSLAAP & LATE (dagelijks)
    for(const role of ["inslaap","late"]){
      const candidates = GENERAL_DOCTORS.filter(d=> isAvail(d,day,role));
      const pick = pickWeighted(candidates, day, role);
      if(!pick) continue;

      const map = loadMap(role, day.isWeekend);
      const m = new Map(map.get(day.dateStr)||new Map());
      m.set(pick, (m.get(pick)||0)+1); map.set(day.dateStr,m);

      // maandtellers + recup
      generalMonthCount.set(pick, (generalMonthCount.get(pick)||0) + (role==="inslaap"?1:1));
      if(role==="late") lateMonthCount.set(pick, (lateMonthCount.get(pick)||0)+1);
      if(role==="inslaap") addRecup(day,pick);
    }
  }

  // roster output
  for(const day of days){
    const obj={ inslaap:null, late:null, cardio:null };
    const iw = liw.get(day.dateStr)||new Map(); const iwe=liwe.get(day.dateStr)||new Map();
    const lw = llw.get(day.dateStr)||new Map(); const lwe=llwe.get(day.dateStr)||new Map();
    const cw = lcw.get(day.dateStr)||new Map(); const cwe=lcwe.get(day.dateStr)||new Map();

    obj.inslaap = day.isWeekend ? top1(iwe) : top1(iw);
    obj.late    = day.isWeekend ? top1(lwe) : top1(lw);
    obj.cardio  = day.isWeekend ? top1(cwe) : top1(cw);

    roster[day.dateStr] = obj;
  }

  return { roster, cardioWeeks };
}

function top1(map){
  let best=null, bestv=-1; for(const [k,v] of map.entries()){ if(v>bestv){ best=k; bestv=v; } }
  return best;
}

/* ---------------------- UI HELPERS & COMPONENT ---------------------- */
function initRestrictions(){
  const o={};
  for(const d of ALL_DOCTORS){ o[d] = { noLate:false, daysNotWork:new Set(), first2WeeksUnavailable:false }; }
  return o;
}

export default function App(){ return <Page/>; }

function Page(){
  const mounted = useMounted();

  const today=new Date();
  const [monthInput,setMonthInput]=useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`);
  const [year,month]=monthInput.split("-").map(Number);

  const [restrictions,setRestrictions]=useState(()=>initRestrictions());
  const [selectedDoctor,setSelectedDoctor]=useState(GENERAL_DOCTORS[0]);
  const [mode,setMode]=useState("positive");

  const [desiderataPosGen,setPosGen]=useState(new Map());
  const [desiderataNegGen,setNegGen]=useState(new Map());
  const [desiderataPosCar,setPosCar]=useState(new Map());
  const [desiderataNegCar,setNegCar]=useState(new Map());
  const [nonWorkDates,setNW]=useState(new Map());

  const [result,setResult]=useState(null);
  const [lastGenAt,setLastGenAt]=useState(null);
  const [prevMonthCardioDoc, setPrevMonthCardioDoc] = useState("");

  const [fte, setFte] = useState(()=>loadFTE());
  useEffect(()=>{ if(mounted) saveFTE(fte); }, [mounted, fte]);

  // Jaarselectie voor tellers
  const [counterYear, setCounterYear] = useState(year);

  // Balans (jaar)
  const [balanceEnabled, setBalanceEnabled] = useState(true);
  const [balanceStrength, setBalanceStrength] = useState("normal"); // soft/normal/strong
  const strengthMap = { soft:0.4, normal:0.8, strong:1.2 };

  // Jaartellers & finalized (client-only)
  const [yearCounters, setYearCounters] = useState(null);
  const [finalizedMonths, setFinalizedMonths] = useState(null);

  // UI feedback bij genereren
  const [generating,setGenerating]=useState(false);
  const [flash,setFlash]=useState(false);

  useEffect(()=>{ setCounterYear(year); },[year]);
  useEffect(()=>{
    if(!mounted) return;
    setYearCounters(loadYearCounters(counterYear));
    setFinalizedMonths(loadFinalized(counterYear));
  },[mounted, counterYear]);

  const desiderataToggle=(dateStr)=>{
    if(!selectedDoctor) return;
    const swap = (mapSetter, mapGetter, otherSetter, otherGetter)=>{
      const map = new Map(mapGetter);
      const set = new Set(map.get(selectedDoctor) || []);
      const otherMap = new Map(otherGetter);
      const otherSet = new Set(otherMap.get(selectedDoctor) || []);
      if (set.has(dateStr)) set.delete(dateStr);
      else { set.add(dateStr); if(otherSet.has(dateStr)){ otherSet.delete(dateStr); otherMap.set(selectedDoctor,otherSet); otherSetter(otherMap);} }
      map.set(selectedDoctor,set); mapSetter(map);
    };

    if(mode==="positive") swap(setPosGen,desiderataPosGen,setNegGen,desiderataNegGen);
    else if(mode==="negative") swap(setNegGen,desiderataNegGen,setPosGen,desiderataPosGen);
    else if(mode==="cardio_positive") swap(setPosCar,desiderataPosCar,setNegCar,desiderataNegCar);
    else if(mode==="cardio_negative") swap(setNegCar,desiderataNegCar,setPosCar,desiderataPosCar);
    else if(mode==="nonwork"){
      const m=new Map(nonWorkDates); const s=new Set(m.get(selectedDoctor)||[]);
      s.has(dateStr)?s.delete(dateStr):s.add(dateStr); m.set(selectedDoctor,s); setNW(m);
    }
  };

  const toggleFixedDay=(dayName)=>{
    if(!selectedDoctor) return;
    setRestrictions(prev=>{
      const next={...prev}; const set=new Set(next[selectedDoctor]?.daysNotWork||[]);
      set.has(dayName)?set.delete(dayName):set.add(dayName);
      next[selectedDoctor] = { ...next[selectedDoctor], daysNotWork:set };
      return next;
    });
  };

  const clearForDoctor=()=>{
    if(!selectedDoctor) return;
    setPosGen(m=>{const n=new Map(m); n.delete(selectedDoctor); return n;});
    setNegGen(m=>{const n=new Map(m); n.delete(selectedDoctor); return n;});
    setPosCar(m=>{const n=new Map(m); n.delete(selectedDoctor); return n;});
    setNegCar(m=>{const n=new Map(m); n.delete(selectedDoctor); return n;});
    setNW(m=>{const n=new Map(m); n.delete(selectedDoctor); return n;});
    setRestrictions(prev=>{ const next={...prev}; delete next[selectedDoctor]; return next; });
  };

  const strengthLabel = balanceStrength;

  const handleGenerate = ()=>{
    if(!mounted) return;
    setGenerating(true);
    const fairness = {
      enabled: balanceEnabled && !!yearCounters,
      strength: strengthMap[balanceStrength] ?? 0.8,
      counters: yearCounters
    };

    const res = generateSchedule({
      year, month,
      desiderata:{
        posGen:desiderataPosGen, negGen:desiderataNegGen,
        posCar:desiderataPosCar, negCar:desiderataNegCar,
      },
      nonWorkDates,
      restrictions,
      prevMonthCardioDoc: prevMonthCardioDoc || null,
      fairness,
      fte
    });
    setResult(res);
    setLastGenAt(new Date());

    // persist cardio last of previous month for continuity
    if(typeof window!=="undefined"){
      const weeks = Object.keys(res.cardioWeeks || {}).map(Number);
      if (weeks.length){
        const lastWeek = Math.max(...weeks);
        const doc = res.cardioWeeks[lastWeek] || "";
        window.localStorage.setItem(`cardio:last:${monthKey(year,month)}`, doc);
      }
    }

    // kleine feedback
    setFlash(true);
    setTimeout(()=> setFlash(false), 1500);
    setGenerating(false);
  };

  const resetYear = ()=>{
    if(!mounted || !yearCounters) return;
    if(!confirm(`Jaar ${counterYear} volledig resetten?`)) return;
    const empty = {}; for(const d of ALL_DOCTORS) empty[d]=ZERO();
    setYearCounters(empty); saveYearCounters(counterYear, empty);
    setFinalizedMonths({}); saveFinalized(counterYear, {});
  };

  const isStorageReady = mounted && yearCounters && finalizedMonths;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">On-call Planner</h1>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left sidebar */}
        <aside className="md:col-span-4 space-y-4">
          <section className="bg-white rounded-2xl shadow-sm p-4 md:p-5 border">
            <div className="grid gap-3">
              <div>
                <label className="text-sm text-slate-600">Maand</label>
                <input type="month" className="w-full rounded-lg border px-3 py-2" value={monthInput} onChange={e=>setMonthInput(e.target.value)} />
              </div>

              <div>
                <label className="text-sm text-slate-600">Selecteer arts</label>
                <select className="w-full rounded-lg border px-3 py-2" value={selectedDoctor} onChange={e=>setSelectedDoctor(e.target.value)}>
                  {ALL_DOCTORS.map(d=> <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-600">Modus</label>
                <select className="w-full rounded-lg border px-3 py-2" value={mode} onChange={e=>setMode(e.target.value)}>
                  <option value="positive">Desiderata + (inslaap/late)</option>
                  <option value="negative">Desiderata − (inslaap/late)</option>
                  <option value="cardio_positive">Cardio + (weeknr)</option>
                  <option value="cardio_negative">Cardio − (weeknr)</option>
                  <option value="nonwork">Vrije dagen</option>
                </select>
              </div>

              <div className="flex gap-2 items-center">
                <button className="rounded-lg border px-3 py-2 text-sm" onClick={clearForDoctor}>Wis keuzes voor arts</button>
                <button className={`rounded-lg px-3 py-2 text-sm ${generating?"opacity-50":"bg-black text-white"}`} onClick={handleGenerate} disabled={generating}>
                  {generating?"Bezig…":"Genereer rooster"}
                </button>
              </div>

              {/* FTE per arts */}
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold">FTE per arts</div>
                <div className="mt-2 grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                  {ALL_DOCTORS.map(d=>(
                    <label key={d} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{d}</span>
                      <input
                        type="number" step="0.1" min="0" value={fte[d] ?? 1}
                        onChange={e=> setFte(prev=> ({...prev, [d]: Math.max(0, Number(e.target.value)||0)}))}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-600 mt-1">Deze FTE’s sturen de proportionele verdeling (jaarbasis).</p>
              </div>

              {/* Balans (jaar) */}
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold">Balans (jaar)</div>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={balanceEnabled}
                    onChange={(e)=>setBalanceEnabled(e.target.checked)}
                  />
                  Gebruik jaartellers om te balanceren (ook cardio)
                </label>
                <div className={`mt-2 flex items-center gap-2 ${balanceEnabled ? "" : "opacity-50"}`}>
                  <span className="text-xs text-slate-600">Sterkte</span>
                  <select
                    value={balanceStrength}
                    onChange={(e)=>setBalanceStrength(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    disabled={!balanceEnabled}
                  >
                    <option value="soft">Zacht</option>
                    <option value="normal">Normaal</option>
                    <option value="strong">Sterk</option>
                  </select>
                </div>
              </div>

              {/* Vorige maand cardio */}
              <div>
                <label className="text-sm text-slate-600">Cardiowacht vorige maand (laatste week)</label>
                <select className="w-full rounded-lg border px-3 py-2" value={prevMonthCardioDoc} onChange={e=>setPrevMonthCardioDoc(e.target.value)}>
                  <option value="">Onbekend</option>
                  {CARDIO_DOCTORS.map(d=> <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Jaarbeheer */}
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold">Jaarbeheer {counterYear}</div>
                <div className="flex gap-2 mt-2">
                  <button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>{
                    if(!isStorageReady) return; const next={...yearCounters};
                    const curKey=monthKey(year,counterYear===year?month:1);
                    next[selectedDoctor] = next[selectedDoctor] || ZERO();
                    saveYearCounters(counterYear,next); setYearCounters(next);
                  }}>Opslaan tellers</button>
                  <button className="rounded-lg border px-3 py-2 text-sm" onClick={resetYear}>Reset jaar</button>
                </div>
              </div>

            </div>
          </section>
        </aside>

        {/* Main */}
        <main className="md:col-span-8 space-y-4">
          <section className="bg-white rounded-2xl shadow-sm p-4 md:p-5 border">
            <h3 className="font-semibold mb-2">Kalender</h3>
            {/* calendar UI would be here; omitted for brevity in this excerpt */}
            <p className="text-sm text-slate-600">Gebruik de modi om desiderata en vrije dagen aan te duiden; generate om rooster te bouwen.</p>
          </section>

          <section className="bg-white rounded-2xl shadow-sm p-4 md:p-5 border">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-semibold">Resultaat</h3>
              {lastGenAt && (
                <div className="text-xs text-slate-500" aria-live="polite">
                  Laatst gegenereerd: {lastGenAt.toLocaleTimeString()}
                </div>
              )}
            </div>

            {!result ? (
              <p className="text-sm text-slate-700">Genereer het rooster om het hier te zien.</p>
            ) : (
              <div className="space-y-3">
                {/* render roster here */}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
