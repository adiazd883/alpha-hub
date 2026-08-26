"use client";
import { useEffect, useMemo, useState } from "react";

type CaseRow = Record<string,string> & {__row:string};
type Role = "ADMIN"|"TL"|"PARALEGAL"|"PSYCH"|"ANALYST";

const roleLabels:Record<Role,string> = {
  ADMIN:"Admin", TL:"Team Leader", PARALEGAL:"Paralegal", PSYCH:"Psych", ANALYST:"Analyst"
};
const norm=(s:string)=>s.trim().toUpperCase().replace(/\s+/g," ");
const isStatus=(h:string)=>["STATUS","ESTATUS"].includes(norm(h));
const isDelivery=(h:string)=>["FECHA DE ENTREGA","FECHA ENTREGA","DELIVERY DATE"].includes(norm(h));
const isAssignment=(h:string)=>norm(h)==="PARALEGAL ASIGNADO";

export default function Home(){
  const [data,setData]=useState<{headers:string[],rows:CaseRow[],title:string}>({headers:[],rows:[],title:""});
  const [role,setRole]=useState<Role>("ADMIN");
  const [q,setQ]=useState("");
  const [loading,setLoading]=useState(true);
  const [msg,setMsg]=useState("");
  const [err,setErr]=useState("");

  async function load(){
    setLoading(true); setErr("");
    try{ const r=await fetch("/api/cases",{cache:"no-store"}); const j=await r.json(); if(!r.ok) throw new Error(j.error); setData(j); }
    catch(e){setErr(e instanceof Error?e.message:"Error");} finally{setLoading(false);}
  }
  useEffect(()=>{load()},[]);

  const rows=useMemo(()=>data.rows.filter(r=>!q || Object.entries(r).some(([k,v])=>k!=="__row" && v.toLowerCase().includes(q.toLowerCase()))),[data.rows,q]);

  const canEdit=(h:string)=>{
    if(role==="ADMIN") return true;
    if(role==="TL") return isDelivery(h)||isStatus(h)||isAssignment(h);
    return isDelivery(h)||isStatus(h);
  };

  async function save(row:number, header:string, value:string){
    setMsg(""); setErr("");
    try{
      const r=await fetch("/api/cases/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({row,role,changes:{[header]:value}})});
      const j=await r.json(); if(!r.ok) throw new Error(j.error);
      setMsg("Guardado en la Sheet original.");
    }catch(e){setErr(e instanceof Error?e.message:"Error");}
  }

  return <><header className="top"><div className="brand">ALPHA HUB</div><div className="pill">SOURCE: GOOGLE SHEETS</div></header>
  <main className="shell">
    <div className="card">
      <div className="toolbar">
        <select value={role} onChange={e=>setRole(e.target.value as Role)}>{Object.entries(roleLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <input placeholder="Buscar caso, nombre, ID..." value={q} onChange={e=>setQ(e.target.value)}/>
        <button className="btn btnGhost" onClick={load}>Actualizar</button>
        <span className="muted">{data.title ? `Hoja: ${data.title} · ${rows.length} casos` : ""}</span>
      </div>
      {err&&<div className="error">{err}</div>}{msg&&<div className="ok">{msg}</div>}
      {loading?<div className="empty">Cargando casos…</div>:!data.headers.length?<div className="empty">No se encontraron columnas en la Sheet.</div>:
      <div className="tableWrap"><table className="table"><thead><tr>{data.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
        {rows.map(r=><tr key={r.__row}>{data.headers.map(h=><td key={h}>{canEdit(h)?<input className="editable" defaultValue={r[h]||""} onBlur={e=>{if(e.target.value!==r[h])save(Number(r.__row),h,e.target.value)}}/>:<span>{r[h]||"—"}</span>}</td>)}</tr>)}
      </tbody></table></div>}
    </div>
    <p className="muted" style={{marginTop:14}}>Los cambios permitidos se escriben directamente en la Sheet original. El selector de rol de esta primera versión es de prueba; la autenticación real se configura después.</p>
  </main></>;
}
