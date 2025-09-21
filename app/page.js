"use client";
export const dynamic = "force-dynamic";  // disable static pre-render

import React, { useMemo, useState, useEffect } from "react";
import SingleDoctorFTESelector from "./components/SingleDoctorFTESelector";

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

const NL_DAGEN = ["maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag","zondag"];
const NL_DAGEN_SHORT = ["Ma","Di","Wo","Do","Vr","Za","Zo"];

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

/* Regels/limieten */
const GENERAL_CAP_FOR_OVERLAP = 1;   // overlap-arts: max 1 gewone wacht (inslaap/late) per maand
const MAX_CARDIO_WEEKS = 2;          // max 2 cardioweken per maand

/* ---------------------- DATUM HELPERS ---------------------- */
const ymd = (d)=> d.toISOString().slice(0,10);
const addDays = (d,n)=>{ const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const daysInMonth = (y,m)=> new Date(y,m,0).getDate();
const startOfMonth = (y,m)=> new Date(y,m-1,1);
function weekOfMonth(date){
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const diff = Math.floor((date-first)/86400000);
  return Math.floor(diff/7)+1;
}
function getDaysOfMonth(year,month){
  const n = daysInMonth(year,month);
  const first = startOfMonth(year,month);
  const out = [];
  for(let i=0;i<n;i++){
    const dt = addDays(first,i);
    const wd = (dt.getDay()+6)%7;
    out.push({
      date:dt, dateStr:ymd(dt), dayName:NL_DAGEN[wd],
      weekdayIdx:wd, isWeekend:wd>=5, weekNr:weekOfMonth(dt),
    });
  }
  return out;
}
function getMonthGrid(y,m){
  const days = getDaysOfMonth(y,m);
  const firstWd = days.length?days[0].weekdayIdx:0;
  const cells = Math.ceil((firstWd+days.length)/7)*7;
  const weeks=[]; let cur=0;
  for(let i=0;i<cells;i++){
    const wi = Math.floor(i/7); if(!weeks[wi]) weeks[wi]=Array(7).fill(null);
    const ci = i%7;
    if(i>=firstWd && cur<days.length){ weeks[wi][ci]=days[cur]; cur++; }
  }
  return weeks;
}
const monthKey = (y,m)=> `${y}-${String(m).padStart(2,"0")}`;
const prevOf = (y,m)=> (m===1 ? [y-1,12] : [y,m-1]);

/* ---------------------- STORAGE HELPERS ---------------------- */
const ZERO = () => ({ iw:0,iwe:0,lw:0,lwe:0,cw:0,cwe:0 });

function loadYearCounters(year){
  if (typeof window==="undefined") return {};
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem(`counters:${year}`) || "{}"); } catch {}
  for(const d of ALL_DOCTORS){ if(!obj[d]) obj[d]=ZERO(); }
  return obj;
}
function saveYearCounters(year, counters){
  if (typeof window==="undefined") return;
  localStorage.setItem(`counters:${year}`, JSON.stringify(counters));
}
function loadFinalized(year){
  if (typeof window==="undefined") return {};
  try { return JSON.parse(localStorage.getItem(`finalized:${year}`) || "{}"); } catch { return {}; }
}
function saveFinalized(year, final){
  if (typeof window==="undefined") return;
  localStorage.setItem(`finalized:${year}`, JSON.stringify(final));
}

/* ---------------------- INIT RESTRICTIONS ---------------------- */
function initRestrictions(){
  return {
    "dr. bun": { daysNotWork:new Set(["donderdag","vrijdag"]) },
    "dr. calliauw": { daysNotWork:new Set(), noLate:false },
    "dr. de cuyper": { daysNotWork:new Set(["woensdag"]) },
    "dr. du maine": { daysNotWork:new Set(["dinsdag"]) },
    "dr. ghijselings": { daysNotWork:new Set(), first2WeeksUnavailable:true },
    "dr. scholliers": { daysNotWork:new Set(["maandag","dinsdag"]) },
    "dr. vanfleteren": { daysNotWork:new Set(["woensdag"]) },
    "dr. ver eecke": { daysNotWork:new Set(["vrijdag"]) },
    "dr. vanhonacker": { daysNotWork:new Set(), noLate:true },
  };
}

/* ---------------------- FAIRNESS (JAARBALANS) ---------------------- */
/** FTE-gewogen verwachtingen per arts; deficit = expected - actual. */
function buildFairness(counters, fte){
  const ZERO = () => ({ iw:0,iwe:0,lw:0,lwe:0,cw:0,cwe:0 });
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
  for(const d of new Set([...GENERAL_DOCTORS, ...CARDIO_DOCTORS])){
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
  fairness, fte // { enabled:boolean, strength:number, counters:object|null }
}){
  const days = getDaysOfMonth(year,month);
  const roster = {};
  const liw=new Map(), liwe=new Map(), llw=new Map(), llwe=new Map(), lcw=new Map(), lcwe=new Map();
  const loadMap=(role,isWe)=> role==="inslaap"?(isWe?liwe:liw):role==="late"?(isWe?llwe:llw):(isWe?lcwe:lcw);

  const cardioBlocks=new Map();      // doc -> Set(weekNr)
  const cardioAssignee=new Map();    // weekNr -> doc

  const recup=new Map(); // dateStr -> Set(doc)
  const addRecup=(day,doc)=>{
    const recupDate = day.weekdayIdx===4? addDays(day.date,3) : addDays(day.date,1); // vr -> ma
    const key=ymd(recupDate); if(!recup.has(key)) recup.set(key,new Set()); recup.get(key).add(doc);
  };

  const generalMonthCount = new Map();
  let prevI=null, prevL=null, prevC=null;

  const getDNW=(d)=> restrictions[d]?.daysNotWork||new Set();
  const isNoLate=(d)=> !!restrictions[d]?.noLate;
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

    if(role==="cardio"){
      if(negCar.get(d)?.has(day.dateStr)) return false;
    }else{
      if(negGen.get(d)?.has(day.dateStr)) return false;
    }
    return true;
  };

  const pickWeighted=(cands,role,isWe,exclude,day)=>{
    const filtered=cands.filter(d=>!exclude.has(d));
    if(!filtered.length) return null;

    // Positieve desiderata: harde voorkeur (filtert pool)
    const explicitPos = filtered.filter(d =>
      role==="cardio" ? posCar.get(d)?.has(day.dateStr) : posGen.get(d)?.has(day.dateStr)
    );
    const pool = explicitPos.length ? explicitPos : filtered;

    const loads=loadMap(role,isWe);
    const catKey =
  role === "inslaap" ? (isWe ? "iwe" : "iw")
: role === "late"    ? (isWe ? "lwe" : "lw")
:                      (isWe ? "cwe" : "cw");

    let bestScore = Infinity;
    let best = [];
    for(const d of pool){
      const base = loads.get(d) || 0;
      const fair = fairnessActive
  ? (role === "cardio"
      ? (fairnessData?.def?.[d]?.cardioTotal || 0) // total cardio W+WE
      : (fairnessData?.def?.[d]?.[catKey]   || 0)  // inslaap/late by WE/W
    )
  : 0;
      const score = base - alpha * fair; // lager = beter
      if (score < bestScore - 1e-9) { bestScore = score; best=[d]; }
      else if (Math.abs(score - bestScore) < 1e-9) { best.push(d); }
    }
    return best[Math.floor(Math.random()*best.length)];
  };

  for(const day of days){
    const isWe=day.isWeekend, wk=day.weekNr;

    const iC = GENERAL_DOCTORS.filter(d=> isAvail(d,day,"inslaap") && !new Set([prevI,prevL,prevC]).has(d));
    const lC = GENERAL_DOCTORS.filter(d=> isAvail(d,day,"late")    && !new Set([prevI,prevL,prevC]).has(d));
    const cC0 = CARDIO_DOCTORS .filter(d=> isAvail(d,day,"cardio") && !new Set([prevI,prevL]).has(d));

    // INSLAAP
    let inslaap = pickWeighted(iC,"inslaap",isWe,new Set(),day);
    if(!inslaap){
      const fb = GENERAL_DOCTORS.filter(d=> isAvail(d,day,"inslaap") && !new Set([prevI,prevL,prevC]).has(d));
      inslaap = pickWeighted(fb,"inslaap",isWe,new Set(),day);
    }
    if(inslaap) {
      addRecup(day,inslaap);
      if(OVERLAP_SET.has(inslaap)) generalMonthCount.set(inslaap, 1 + (generalMonthCount.get(inslaap)||0));
    }

    // LATE
    let late = pickWeighted(lC.filter(d=>d!==inslaap),"late",isWe,new Set(inslaap?[inslaap]:[]),day);
    if(!late){
      const fb = GENERAL_DOCTORS.filter(d=> d!==inslaap && isAvail(d,day,"late") && !new Set([prevI,prevL,prevC]).has(d));
      late = pickWeighted(fb,"late",isWe,new Set(inslaap?[inslaap]:[]),day);
    }
    if(late && OVERLAP_SET.has(late)) {
      generalMonthCount.set(late, 1 + (generalMonthCount.get(late)||0));
    }

    // CARDIO (weekblok, geen 2 weken na elkaar; max 2/maand) + fairness op weektotaal
    let cardio=null;
    if(cardioAssignee.has(wk)){
      const cand=cardioAssignee.get(wk);
      if(cC0.includes(cand) && cand!==inslaap && cand!==late) cardio=cand;
    }
    if(!cardio){
      const prevWeekDoc = (wk===1 ? (prevMonthCardioDoc || null) : (cardioAssignee.get(wk-1) || null));
      const cC = cC0.filter(d =>
        d!==inslaap && d!==late && d!==prevWeekDoc &&
        ((cardioBlocks.get(d)?.size || 0) < MAX_CARDIO_WEEKS)
      );
      if(cC.length){
        const base = (()=> {
          const explicit = cC.filter(d => posCar.get(d)?.has(day.dateStr));
          return explicit.length ? explicit : cC;
        })();

        let bestScore = Infinity, best=[];
        for(const d of base){
          const blocks = (cardioBlocks.get(d)?.size || 0); // aantal cardioweken deze maand
          const fair = fairnessActive ? (fairnessData?.def?.[d]?.cardioTotal || 0) : 0; // jaar-achterstand op totaal cardio (W+WE)
          const score = blocks - alpha * fair;
          if(score < bestScore - 1e-9){ bestScore=score; best=[d]; }
          else if(Math.abs(score-bestScore)<1e-9){ best.push(d); }
        }
        cardio = best[Math.floor(Math.random()*best.length)];

        if(!cardioAssignee.has(wk)){
          cardioAssignee.set(wk,cardio);
          const s=cardioBlocks.get(cardio)||new Set(); s.add(wk); cardioBlocks.set(cardio,s);
        }
      }
    }

    // Wegschrijven & tellers
    roster[day.dateStr]={ dag:day.dayName, inslaapwacht:inslaap||null, latewacht:late||null, cardiowacht:cardio||null };

    if(inslaap) (isWe?liwe:liw).set(inslaap,1+((isWe?liwe:liw).get(inslaap)||0));
    if(late)    (isWe?llwe:llw).set(late,1+((isWe?llwe:llw).get(late)||0));
    if(cardio)  (isWe?lcwe:lcw).set(cardio,1+((isWe?lcwe:lcw).get(cardio)||0));

    prevI=inslaap; prevL=late; prevC=cardio;
  }

  // Validatie
  const violations={ dnw:[], dayBefore:[], unassigned:[], overlapCap:[], lateOverlap:[], cardioConsecutive:[], cardioMax:[] };
  for(const day of days){
    const r=roster[day.dateStr]; const tm=addDays(day.date,1); const tn=NL_DAGEN[(tm.getDay()+6)%7];
    for(const role of ["inslaapwacht","latewacht","cardiowacht"]){
      const doc=r[role];
      if(!doc){ violations.unassigned.push({date:day.dateStr, dag:day.dayName, role}); continue; }
      const dnw=restrictions[doc]?.daysNotWork||new Set();
      if(dnw.has(day.dayName)) violations.dnw.push({date:day.dateStr, dag:day.dayName, role, doc});
      if(dnw.has(tn) || nonWorkDates.get(doc)?.has(ymd(tm))) violations.dayBefore.push({date:day.dateStr, dag:day.dayName, role, doc});
      if(role==="late" && OVERLAP_SET.has(doc)) violations.lateOverlap.push({date:day.dateStr, dag:day.dayName, doc});
    }
  }
  // Overlap-cap
  for(const doc of OVERLAP_SET){
    const c = (liw.get(doc)||0)+(liwe.get(doc)||0)+(llw.get(doc)||0)+(llwe.get(doc)||0);
    if(c > GENERAL_CAP_FOR_OVERLAP) violations.overlapCap.push({doc, count:c, cap:GENERAL_CAP_FOR_OVERLAP});
  }
  // Cardio restricties
  const weekMap = cardioAssignee;
  const weeks = Array.from(weekMap.keys()).sort((a,b)=>a-b);
  for(const w of weeks){ if(w>1 && weekMap.get(w-1)===weekMap.get(w)) violations.cardioConsecutive.push({week:w,doctor:weekMap.get(w)}); }
  if (prevMonthCardioDoc && weekMap.get(1)===prevMonthCardioDoc) {
    violations.cardioConsecutive.push({week:1,doctor:weekMap.get(1),crossMonth:true});
  }
  for(const [doc, setWeeks] of cardioBlocks.entries()){
    if(setWeeks.size > MAX_CARDIO_WEEKS){
      violations.cardioMax.push({doc, count:setWeeks.size, max:MAX_CARDIO_WEEKS});
    }
  }

  const summary = summarizeByDoctor({roster});
  const cardioWeeks = {}; for (const [w, d] of weekMap.entries()) cardioWeeks[w] = d;

  return { roster, violations, summary, cardioWeeks };
}

function summarizeByDoctor({roster}){
  const iw=new Map(), iwe=new Map(), lw=new Map(), lwe=new Map(), cw=new Map(), cwe=new Map();
  const rows=[];
  for(const [ds,r] of Object.entries(roster)){
    const d=new Date(ds); const we=((d.getDay()+6)%7)>=5;
    if(r.inslaapwacht) (we?iwe:iw).set(r.inslaapwacht,1+((we?iwe:iw).get(r.inslaapwacht)||0));
    if(r.latewacht)    (we?lwe:lw).set(r.latewacht,1+((we?lwe:lw).get(r.latewacht)||0));
    if(r.cardiowacht)  (we?cwe:cw).set(r.cardiowacht,1+((we?cwe:cw).get(r.cardiowacht)||0));
  }
  const all=new Set([...GENERAL_DOCTORS,...CARDIO_DOCTORS]);
  for(const doc of all){
    const a=iw.get(doc)||0,b=iwe.get(doc)||0,c=lw.get(doc)||0,d=lwe.get(doc)||0,e=cw.get(doc)||0,f=cwe.get(doc)||0;
    const total=a+b+c+d+e+f;
    rows.push({doc, iw:a, iwe:b, lw:c, lwe:d, cw:e, cwe:f, total});
  }
  rows.sort((x,y)=> x.doc.localeCompare(y.doc));
  return rows;
}

/* ---------------------- UI SMALL COMPONENTS ---------------------- */
const MODE_OPTIONS = [
  { id: "positive", label: "Positief" },
  { id: "negative", label: "Negatief" },
  { id: "cardio_positive", label: "Cardio +" },
  { id: "cardio_negative", label: "Cardio −" },
  { id: "nonwork",  label: "Niet-werk (data)" },
  { id: "daysnotwork", label: "Vaste dagen" },
];
const MODE_LABELS = Object.fromEntries(MODE_OPTIONS.map(o => [o.id, o.label]));

function ModeButton({active, onClick, children}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs rounded-full border px-3 py-1.5 transition relative
        focus:outline-none focus:ring-2
        ${active
          ? "bg-amber-600 border-amber-600 ring-amber-300"
          : "bg-white border-slate-300 hover:bg-slate-50 ring-transparent"}`}
    >
      <span className={active ? "text-white font-medium" : "text-slate-800 font-medium"}>
        {children}
      </span>
      {active && <span className="ml-1 text-white font-semibold">✓</span>}
    </button>
  );
}
function StatChip({label, value}) {
  return (<span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs"><b>{label}</b> {value}</span>);
}
function Card({children}) { return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">{children}</div>; }

function Toast({shown, children}) {
  if(!shown) return null;
  return (
    <div className="fixed right-4 top-4 z-50 rounded-lg bg-emerald-600 text-white text-sm px-3 py-2 shadow-lg">
      {children}
    </div>
  );
}

/* ---------------------- MAIN PAGE ---------------------- */
export default function Page(){
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

    // FTE state
const [fte, setFte] = useState(() => loadFTE());
useEffect(() => { saveFTE(fte); }, [fte]);

  // Build the list for the FTE selector (uses your existing arrays)
const doctorsForSelector = useMemo(
  () =>
    ALL_DOCTORS.map((name) => ({
      id: name,                            // stable id: use the name
      name,                                // label
      role: CARDIO_DOCTORS.includes(name) ? "Cardio" : "Algemeen",
      fte: fte?.[name] ?? 1,               // current/default FTE for this doctor
    })),
  [fte]
);

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

  // Vorige maand cardio (laatste week)
  useEffect(()=>{
    if(!mounted) return;
    const [py, pm] = prevOf(year, month);
    const val = window.localStorage.getItem(`cardio:last:${monthKey(py,pm)}`) || "";
    setPrevMonthCardioDoc(val);
  }, [mounted, year, month]);

  const grid = useMemo(()=>getMonthGrid(year,month),[year,month]);

  // Toggling desiderata
  const toggleDateForDoctor=(dateStr)=>{
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
    const gpos=new Map(desiderataPosGen); gpos.set(selectedDoctor,new Set()); setPosGen(gpos);
    const gneg=new Map(desiderataNegGen); gneg.set(selectedDoctor,new Set()); setNegGen(gneg);
    const cpos=new Map(desiderataPosCar); cpos.set(selectedDoctor,new Set()); setPosCar(cpos);
    const cneg=new Map(desiderataNegCar); cneg.set(selectedDoctor,new Set()); setNegCar(cneg);
    const w=new Map(nonWorkDates);  w.set(selectedDoctor,new Set()); setNW(w);
  };

  const handleGenerate=()=>{
    setGenerating(true);
    const fairness = {
      enabled: balanceEnabled && !!yearCounters,
      strength: strengthMap[balanceStrength] ?? 0.8,
      counters: yearCounters
    };

const res = generateSchedule({
  year,
  month,
  desiderata: {
    posGen: desiderataPosGen,
    negGen: desiderataNegGen,
    posCar: desiderataPosCar,
    negCar: desiderataNegCar,
  },
  nonWorkDates,
  restrictions,
  prevMonthCardioDoc: prevMonthCardioDoc || null,
  fairness,
  fte,                   
});
    setResult(res);
    setLastGenAt(new Date());

    if (mounted) {
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
    <main className="min-h-screen">
      <Toast shown={flash}>Rooster bijgewerkt</Toast>

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-600">
        <div className="mx-auto max-w-6xl px-4 py-8 text-white">
          <h1 className="text-3xl md:text-4xl font-bold">Wachtrooster Planner</h1>
          <p className="mt-2 opacity-90">Plan maandroosters, markeer definitief en beheer jaartellers per arts.</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 -mt-6 pb-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Controls */}
          <section className="bg-white/90 backdrop-blur rounded-2xl shadow-sm p-4 md:p-5 border">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="text-sm font-semibold">Maand (planning)</label>
                  <input type="month" value={monthInput} onChange={e=>setMonthInput(e.target.value)}
                         className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div>
                  <label className="text-sm font-semibold">Jaar (tellers)</label>
                  <input type="number" min="2023" max="2035" value={counterYear}
                         onChange={e=>setCounterYear(Number(e.target.value))}
                         className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"/>
                  <p className="text-[11px] text-slate-600 mt-1">Jaartellers worden opgeslagen per jaar.</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold">Arts</label>
                <select value={selectedDoctor} onChange={e=>setSelectedDoctor(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400">
                  {ALL_DOCTORS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* FTE selector */}
<details className="rounded-xl border border-slate-200 p-3">
  <summary className="cursor-pointer select-none text-sm font-semibold">
    Beschikbaarheid (FTE)
  </summary>

  <div className="pt-2 space-y-2">
    {/* selector for the chosen doctor only */}
    <SingleDoctorFTESelector
      doctor={selectedDoctor}
      role={CARDIO_DOCTORS.includes(selectedDoctor) ? "Cardio" : "Algemeen"}
      value={fte?.[selectedDoctor] ?? 1}
      onChange={(newFte) =>
        setFte((prev) => ({ ...prev, [selectedDoctor]: newFte }))
      }
    />
  </div>
</details>

              <div>
                <div className="text-sm font-semibold">Modus</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MODE_OPTIONS.map(t=>(
                    <ModeButton key={t.id} active={mode===t.id} onClick={()=>setMode(t.id)}>
                      {t.label}
                    </ModeButton>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-700">
                  <b>Actieve modus:</b> {MODE_LABELS[mode]}
                </div>
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
                <label className="text-sm font-semibold">Cardiowacht vorige maand (laatste week)</label>
                <select
                  value={prevMonthCardioDoc}
                  onChange={(e)=>setPrevMonthCardioDoc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">— onbekend / geen</option>
                  {CARDIO_DOCTORS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <ul className="text-xs text-slate-700 list-disc pl-4 space-y-1">
                <li>Genereer concept-roosters zo vaak je wil: jaartellers blijven ongemoeid.</li>
                <li>Pas na <b>Markeer deze maand als definitief</b> worden tellers bijgewerkt.</li>
              </ul>

              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={clearForDoctor}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Leegmaken (arts)
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-white hover:brightness-110 ${generating ? "bg-amber-500 opacity-90 cursor-wait" : "bg-amber-600"}`}
                >
                  {generating ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin"></span>
                      Genereren…
                    </span>
                  ) : (
                    "Rooster genereren"
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Kalender */}
          <section className="bg-white rounded-2xl shadow-sm p-4 md:p-5 border">
            <h3 className="font-semibold mb-2">Kalender <span className="text-slate-500 text-sm">({monthInput})</span></h3>
            <CalendarGrid
              grid={grid}
              selectedDoctor={selectedDoctor}
              restrictions={restrictions}
              desiderataPosGen={desiderataPosGen}
              desiderataNegGen={desiderataNegGen}
              desiderataPosCar={desiderataPosCar}
              desiderataNegCar={desiderataNegCar}
              nonWorkDates={nonWorkDates}
              mode={mode}
              onCellClick={toggleDateForDoctor}
            />
          </section>

          {/* Resultaat + finalize */}
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
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">Kerncijfers</div>
                    <div className="flex flex-wrap gap-2">
                      <TotalsChips rows={result.summary}/>
                      <CardioWeeksInline cardioWeeks={result.cardioWeeks}/>
                      <ViolationsBadge violations={result.violations}/>
                    </div>
                  </div>
                </Card>

                <details className="rounded-xl border border-slate-200 bg-white">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">Overtredingen / waarschuwingen</summary>
                  <div className="px-3 pb-3 pt-1"><Violations violations={result.violations}/></div>
                </details>

                {isStorageReady ? (
                  <FinalizeBar
                    counterYear={counterYear}
                    month={month}
                    result={result}
                    finalizedMonths={finalizedMonths}
                    yearCounters={yearCounters}
                    setYearCounters={setYearCounters}
                    setFinalizedMonths={setFinalizedMonths}
                  />
                ) : (
                  <Card><div className="text-sm text-slate-600">Tellers laden…</div></Card>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Jaaroverzicht */}
        <section className="mt-6 bg-white rounded-2xl shadow-sm p-4 md:p-5 border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Jaartellers per arts <span className="text-slate-500 text-sm">({counterYear})</span></h3>
            <button
              onClick={resetYear}
              disabled={!isStorageReady}
              className={`rounded-lg border px-3 py-2 text-sm ${isStorageReady ? "border-slate-300 bg-white hover:bg-slate-50" : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"}`}
            >
              Reset jaar
            </button>
          </div>

          {isStorageReady ? (
            <YearCountersTable counters={yearCounters} />
          ) : (
            <div className="text-sm text-slate-600">Tellers laden…</div>
          )}

          {isStorageReady && Object.keys(finalizedMonths).length>0 && (
            <div className="mt-3 text-xs text-slate-600">
              Definitief toegepaste maanden: {Object.keys(finalizedMonths).sort((a,b)=>Number(a)-Number(b)).join(", ")}
            </div>
          )}
        </section>

        {/* Maandroosterweergave */}
        {result && (
          <section className="mt-6 bg-white rounded-2xl shadow-sm p-4 md:p-5 border">
            <h3 className="font-semibold mb-3">Roosterweergave</h3>
            <MonthRoster monthInput={monthInput} roster={result.roster}/>
          </section>
        )}
      </div>
    </main>
  );
}

/* ---------------------- SUBCOMPONENTS ---------------------- */
function CalendarGrid({
  grid, selectedDoctor, restrictions,
  desiderataPosGen, desiderataNegGen, desiderataPosCar, desiderataNegCar,
  nonWorkDates, mode, onCellClick
}){
  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-600 mb-1">
        {NL_DAGEN_SHORT.map(d=><div key={d} className="text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.flatMap((week,wi)=> week.map((cell,ci)=>{
          if(!cell) return <div key={`${wi}-${ci}`} className="aspect-square rounded-lg bg-slate-100" />;
          const ds=cell.dateStr;

          const isPos  = !!desiderataPosGen.get(selectedDoctor)?.has(ds);
          const isNeg  = !!desiderataNegGen.get(selectedDoctor)?.has(ds);
          const isCPos = !!desiderataPosCar.get(selectedDoctor)?.has(ds);
          const isCNeg = !!desiderataNegCar.get(selectedDoctor)?.has(ds);
          const isNW   = !!nonWorkDates.get(selectedDoctor)?.has(ds);
          const isFixedDay = !!restrictions[selectedDoctor]?.daysNotWork?.has(cell.dayName);

          const highlighted =
            (mode==="positive"         && isPos) ||
            (mode==="negative"         && isNeg) ||
            (mode==="cardio_positive"  && isCPos)||
            (mode==="cardio_negative"  && isCNeg)||
            (mode==="nonwork"          && isNW)  ||
            (mode==="daysnotwork"      && isFixedDay);

          let bgImg = "";
          if (isFixedDay) {
            bgImg += "repeating-linear-gradient(45deg, rgba(59,130,246,0.14) 0 6px, rgba(59,130,246,0) 6px 12px)";
          }
          if (isNW) {
            bgImg += (bgImg ? "," : "") + "repeating-linear-gradient(-45deg, rgba(245,158,11,0.12) 0 6px, rgba(245,158,11,0) 6px 12px)";
          }

          return (
            <button
              key={ds}
              onClick={()=> mode==="daysnotwork"? null : onCellClick(ds)}
              title={`${cell.dateStr} – ${cell.dayName}`}
              style={bgImg ? { backgroundImage: bgImg } : undefined}
              className={`aspect-square rounded-lg border p-1 text-left transition
                ${cell.isWeekend? "bg-slate-50":"bg-white"}
                ${highlighted? "border-amber-600 ring-2 ring-amber-300" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>{cell.date.getDate()}</span>
                <span>{cell.dayName.slice(0,2)}</span>
              </div>

              {/* badges (altijd zichtbaar) */}
              <div className="mt-1 flex flex-wrap gap-1">
                {isPos  && <span className="text-[10px] rounded-full border px-2 py-[2px] bg-indigo-50 border-indigo-200">+des</span>}
                {isNeg  && <span className="text-[10px] rounded-full border px-2 py-[2px] bg-rose-50   border-rose-200">-des</span>}
                {isCPos && <span className="text-[10px] rounded-full border px-2 py-[2px] bg-green-50  border-green-200">C+</span>}
                {isCNeg && <span className="text-[10px] rounded-full border px-2 py-[2px] bg-orange-50 border-orange-200">C-</span>}
                {isNW   && <span className="text-[10px] rounded-full border px-2 py-[2px] bg-white     border-slate-300">NW</span>}
                {isFixedDay && <span className="text-[10px] rounded-full border px-2 py-[2px] bg-slate-100 border-slate-300">Vast</span>}
              </div>
            </button>
          );
        }))}
      </div>
    </>
  );
}

function Violations({violations}){
  const v = { dnw:[], dayBefore:[], unassigned:[], overlapCap:[], lateOverlap:[], cardioConsecutive:[], cardioMax:[], ...(violations||{}) };
  const total = v.dnw.length + v.dayBefore.length + v.unassigned.length + v.overlapCap.length + v.lateOverlap.length + v.cardioConsecutive.length + v.cardioMax.length;
  if(total===0) return <div className="text-sm text-emerald-700">OK: regels nageleefd.</div>;
  return (
    <div className="text-sm space-y-3">
      {v.dnw.length>0 && (<div><div className="font-medium">Ingepland op &apos;dagen_niet_werk&apos;:</div><ul className="list-disc pl-6">{v.dnw.map((it,i)=>(<li key={`dnw-${i}`}>{it.date} ({it.dag}) – {it.role}: {it.doc}</li>))}</ul></div>)}
      {v.dayBefore.length>0 && (<div><div className="font-medium">Ingepland op dag voor &apos;dagen_niet_werk&apos; / expliciete niet-werkdatum:</div><ul className="list-disc pl-6">{v.dayBefore.map((it,i)=>(<li key={`db-${i}`}>{it.date} ({it.dag}) – {it.role}: {it.doc}</li>))}</ul></div>)}
      {v.lateOverlap.length>0 && (<div><div className="font-medium">{"Late ingepland voor overlap-arts (niet toegestaan):"}</div><ul className="list-disc pl-6">{v.lateOverlap.map((it,i)=>(<li key={`lo-${i}`}>{it.date} ({it.dag}) – late: {it.doc}</li>))}</ul></div>)}
      {v.cardioConsecutive.length>0 && (
        <div>
          <div className="font-medium">Cardio 2 weken na elkaar dezelfde arts:</div>
          <ul className="list-disc pl-6">
            {v.cardioConsecutive.map((it,i)=>(
              <li key={`cc-${i}`}>week {it.week}: {it.doctor}{it.crossMonth? " (over maandgrens)":""}</li>
            ))}
          </ul>
        </div>
      )}
      {v.cardioMax.length>0 && (
        <div>
          <div className="font-medium">Maximum cardioweken per maand overschreden:</div>
          <ul className="list-disc pl-6">
            {v.cardioMax.map((it,i)=>(<li key={`cm-${i}`}>{it.doc} – {it.count} / {it.max}</li>))}
          </ul>
        </div>
      )}
      {v.overlapCap.length>0 && (<div><div className="font-medium">Cap gewone wachten overschreden (overlap-arts):</div><ul className="list-disc pl-6">{v.overlapCap.map((it,i)=>(<li key={`cap-${i}`}>{it.doc} – {it.count} / {it.cap}</li>))}</ul></div>)}
      {v.unassigned.length>0 && (<div><div className="font-medium">Oningevulde diensten:</div><ul className="list-disc pl-6">{v.unassigned.map((it,i)=>(<li key={`ua-${i}`}>{it.date} ({it.dag}) – {it.role}</li>))}</ul></div>)}
    </div>
  );
}

function TotalsChips({rows}) {
  if(!rows || rows.length===0) return null;
  const sums = rows.reduce((a,r)=>({ iw:a.iw+r.iw, iwe:a.iwe+r.iwe, lw:a.lw+r.lw, lwe:a.lwe+r.lwe, cw:a.cw+r.cw, cwe:a.cwe+r.cwe, total:a.total+r.total }), {iw:0,iwe:0,lw:0,lwe:0,cw:0,cwe:0,total:0});
  return (
    <div className="flex flex-wrap gap-2">
      <StatChip label="Insl W" value={sums.iw}/>
      <StatChip label="Insl WE" value={sums.iwe}/>
      <StatChip label="Late W" value={sums.lw}/>
      <StatChip label="Late WE" value={sums.lwe}/>
      <StatChip label="Cardio W" value={sums.cw}/>
      <StatChip label="Cardio WE" value={sums.cwe}/>
      <StatChip label="Totaal" value={sums.total}/>
    </div>
  );
}
function CardioWeeksInline({ cardioWeeks }) {
  if (!cardioWeeks || Object.keys(cardioWeeks).length === 0) return null;
  const weeks = Object.keys(cardioWeeks).sort((a,b)=>Number(a)-Number(b));
  return (
    <div className="flex flex-wrap gap-1">
      {weeks.map(w => (
        <span key={w} className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs">
          W{w}: {cardioWeeks[w] || "—"}
        </span>
      ))}
    </div>
  );
}
function ViolationsBadge({violations}){
  const v = violations || {};
  const count = (v.dnw?.length||0)+(v.dayBefore?.length||0)+(v.unassigned?.length||0)+(v.overlapCap?.length||0)+(v.lateOverlap?.length||0)+(v.cardioConsecutive?.length||0)+(v.cardioMax?.length||0);
  if(count===0) return <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-1 text-xs">OK</span>;
  return <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-1 text-xs">⚠ {count}</span>;
}

/* Finalize bar */
function FinalizeBar({counterYear, month, result, finalizedMonths, yearCounters, setYearCounters, setFinalizedMonths}){
  const isMonthFinalized = !!finalizedMonths[month];

  const toMapFromSummary = (summaryRows)=>{
    const m = {};
    for(const r of (summaryRows||[])){ m[r.doc] = { iw:r.iw, iwe:r.iwe, lw:r.lw, lwe:r.lwe, cw:r.cw, cwe:r.cwe }; }
    for(const d of ALL_DOCTORS){ if(!m[d]) m[d]=ZERO(); }
    return m;
  };
  const addSnap = (counters, snap)=> {
    const next={...counters};
    for(const d of ALL_DOCTORS){
      const b=next[d]||ZERO(), s=snap[d]||ZERO();
      next[d]={ iw:b.iw+s.iw, iwe:b.iwe+s.iwe, lw:b.lw+s.lw, lwe:b.lwe+s.lwe, cw:b.cw+s.cw, cwe:b.cwe+s.cwe };
    }
    return next;
  };
  const subSnap = (counters, snap)=> {
    const next={...counters};
    for(const d of ALL_DOCTORS){
      const b=next[d]||ZERO(), s=snap[d]||ZERO();
      next[d]={ iw:b.iw-s.iw, iwe:b.iwe-s.iwe, lw:b.lw-s.lw, lwe:b.lwe-s.lwe, cw:b.cw-s.cw, cwe:b.cwe-s.cwe };
    }
    return next;
  };

  const finalize=()=>{
    if(!result || isMonthFinalized) return;
    const snap = toMapFromSummary(result.summary||[]);
    const nextCounters = addSnap(yearCounters, snap);
    const nextFinal = { ...finalizedMonths, [month]: { appliedAt: new Date().toISOString(), rows: snap } };
    setYearCounters(nextCounters); saveYearCounters(counterYear, nextCounters);
    setFinalizedMonths(nextFinal); saveFinalized(counterYear, nextFinal);
  };
  const replaceFinal=()=>{
    if(!result || !isMonthFinalized) return;
    const oldSnap = finalizedMonths[month].rows;
    const newSnap = toMapFromSummary(result.summary||[]);
    const removed = subSnap(yearCounters, oldSnap);
    const nextCounters = addSnap(removed, newSnap);
    const nextFinal = { ...finalizedMonths, [month]: { appliedAt: new Date().toISOString(), rows: newSnap } };
    setYearCounters(nextCounters); saveYearCounters(counterYear, nextCounters);
    setFinalizedMonths(nextFinal); saveFinalized(counterYear, nextFinal);
  };
  const unfinalize=()=>{
    if(!isMonthFinalized) return;
    const oldSnap = finalizedMonths[month].rows;
    const nextCounters = subSnap(yearCounters, oldSnap);
    const nextFinal = { ...finalizedMonths }; delete nextFinal[month];
    setYearCounters(nextCounters); saveYearCounters(counterYear, nextCounters);
    setFinalizedMonths(nextFinal); saveFinalized(counterYear, nextFinal);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold">Definitief &amp; jaartellers</span>{" "}
          <span className="opacity-70">Maand {month} • Status: {isMonthFinalized ? "definitief" : "concept"}</span>
        </div>
        <div className="flex gap-2">
          {!isMonthFinalized && (
            <button onClick={finalize} className="rounded-lg bg-emerald-600 text-white text-sm px-3 py-2 hover:brightness-110">
              Markeer als definitief
            </button>
          )}
          {isMonthFinalized && (
            <>
              <button onClick={replaceFinal} className="rounded-lg bg-blue-600 text-white text-sm px-3 py-2 hover:brightness-110">
                Vervang door huidige
              </button>
              <button onClick={unfinalize} className="rounded-lg bg-rose-600 text-white text-sm px-3 py-2 hover:brightness-110">
                Maak ongedaan
              </button>
            </>
          )}
        </div>
      </div>
      {isMonthFinalized && (
        <div className="text-[11px] text-slate-600 mt-1">
          Laatst toegepast: {new Date(finalizedMonths[month].appliedAt).toLocaleString()}
        </div>
      )}
    </Card>
  );
}

/* Details list per arts */
function DoctorList({rows}) {
  if(!rows || rows.length===0) return <p className="text-sm text-slate-700">Nog geen verdeling.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r)=>(
        <div key={r.doc} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{r.doc}</div>
            <div className="text-sm"><span className="opacity-60 mr-1">totaal</span><b>{r.total}</b></div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatChip label="Insl W" value={r.iw}/>
            <StatChip label="Insl WE" value={r.iwe}/>
            <StatChip label="Late W" value={r.lw}/>
            <StatChip label="Late WE" value={r.lwe}/>
            <StatChip label="Cardio W" value={r.cw}/>
            <StatChip label="Cardio WE" value={r.cwe}/>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Year counters table:
   - algemene kolommen + cardio kolommen + "Totaal cardio"
   - rood = boven GEMIDDELDE enkel voor algemene kolommen
   - "Totaal (algemeen)" = som van inslaap/late; cardio apart
*/
function YearCountersTable({ counters }){
  const ZERO = () => ({ iw:0, iwe:0, lw:0, lwe:0, cw:0, cwe:0 });
  const doctors = Object.keys(counters || {}).sort((a,b)=>a.localeCompare(b));
  const rows = doctors.map(doc => ({ doc, ...(counters?.[doc] || ZERO()) }));

  const genCols = [
    { key: "iw",  label: "Insl W"  },
    { key: "iwe", label: "Insl WE" },
    { key: "lw",  label: "Late W"  },
    { key: "lwe", label: "Late WE" },
  ];
  const cardioCols = [
    { key: "cw", label: "Cardio W" },
    { key: "cwe", label: "Cardio WE" },
  ];

  // Gemiddelden enkel voor algemene kolommen, met uitsluiting van niet-deelnemers (hele jaar 0)
  const genActive = rows.filter(r => (r.iw+r.iwe+r.lw+r.lwe)>0);
  const pool = genActive.length ? genActive : rows;
  const n = Math.max(1, pool.length);
  const avg = genCols.reduce((acc, c) => {
    acc[c.key] = pool.reduce((s, r) => s + (r[c.key] || 0), 0) / n;
    return acc;
  }, {});

  const totalGeneral = (r) => (r.iw||0) + (r.iwe||0) + (r.lw||0) + (r.lwe||0);
  const totalCardio  = (r) => (r.cw||0) + (r.cwe||0);

  const genSum = genCols.reduce((acc,c)=>{ acc[c.key]=rows.reduce((s,r)=>s+(r[c.key]||0),0); return acc; }, {});
  const carSum = cardioCols.reduce((acc,c)=>{ acc[c.key]=rows.reduce((s,r)=>s+(r[c.key]||0),0); return acc; }, {});
  const grandTotalGeneral = rows.reduce((s,r)=> s + totalGeneral(r), 0);
  const grandTotalCardio  = rows.reduce((s,r)=> s + totalCardio(r), 0);

  const GenCell = ({value, avgValue}) => {
    const v = value || 0;
    const over = v > avgValue;
    return (
      <td className={`px-3 py-2 text-right tabular-nums ${over ? "text-red-600 font-semibold" : ""}`}>
        {v}{over ? " ▲" : ""}
      </td>
    );
  };
  const CarCell = ({value}) => (
    <td className="px-3 py-2 text-right tabular-nums">{value||0}</td>
  );

  return (
    <div className="overflow-x-auto">
      <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Arts</th>
              {genCols.map(c => (
                <th key={c.key} className="text-right px-3 py-2">
                  <div className="flex items-baseline justify-end gap-2">
                    <span>{c.label}</span>
                    <span className="text-[10px] text-slate-500" suppressHydrationWarning>
                      gem {avg[c.key].toFixed(1)}
                    </span>
                  </div>
                </th>
              ))}
              {cardioCols.map(c => (
                <th key={c.key} className="text-right px-3 py-2">{c.label}</th>
              ))}
              <th className="text-right px-3 py-2">Totaal (algemeen)</th>
              <th className="text-right px-3 py-2">Totaal cardio</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {rows.map(r => (
              <tr key={r.doc} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{r.doc}</td>
                {genCols.map(c => (
                  <GenCell key={c.key} value={r[c.key]} avgValue={avg[c.key]} />
                ))}
                {cardioCols.map(c => <CarCell key={c.key} value={r[c.key]} />)}
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{totalGeneral(r)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{totalCardio(r)}</td>
              </tr>
            ))}
          </tbody>

          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-3 py-2 font-semibold">Totaal</td>
              {genCols.map(c => (
                <td key={c.key} className="px-3 py-2 text-right tabular-nums">{genSum[c.key]}</td>
              ))}
              {cardioCols.map(c => (
                <td key={c.key} className="px-3 py-2 text-right tabular-nums">{carSum[c.key]}</td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{grandTotalGeneral}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{grandTotalCardio}</td>
            </tr>
            <tr>
              <td colSpan={genCols.length + cardioCols.length + 2} className="px-3 pb-2 pt-0 text-right">
                <span className="text-xs text-slate-500">
                  Rood = boven kolomgemiddelde (alleen algemene diensten). Gemiddelden sluiten niet-deelnemers uit. Cardio wordt apart getoond.
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function MonthRoster({monthInput, roster}){
  const [yy,mm]=monthInput.split("-").map(Number);
  const grid=getMonthGrid(yy,mm);
  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-600 mb-1">
        {NL_DAGEN_SHORT.map(d=><div key={d} className="text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.flatMap((week,wi)=> week.map((cell,ci)=>{
          if(!cell) return <div key={`${wi}-${ci}`} className="aspect-square rounded-lg bg-slate-100" />;
          const r=roster[cell.dateStr];
          return (
            <div key={cell.dateStr}
              className={`aspect-square rounded-lg border p-1 ${cell.isWeekend?"bg-slate-50":"bg-white"} border-slate-200`}>
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>{cell.date.getDate()}</span>
                <span>{cell.dayName.slice(0,2)}</span>
              </div>
              {r ? (
                <div className="mt-1 space-y-1 text-[11px]">
                  <div className="flex gap-2"><span className="w-12 uppercase opacity-60">inslaap</span><span className="truncate">{r.inslaapwacht||"—"}</span></div>
                  <div className="flex gap-2"><span className="w-12 uppercase opacity-60">late</span><span className="truncate">{r.latewacht||"—"}</span></div>
                  <div className="flex gap-2"><span className="w-12 uppercase opacity-60">cardio</span><span className="truncate">{r.cardiowacht||"—"}</span></div>
                </div>
              ) : <div className="text-[11px] text-slate-400">—</div>}
            </div>
          );
        }))}
      </div>
    </>
  );
}
