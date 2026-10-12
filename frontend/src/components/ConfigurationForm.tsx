import {DatePreview} from './DatePreview';
import {Fragment,useEffect,useId,useRef,useState} from 'react';
import {VndInput} from './VndInput';
import {useFormDraft} from './DraftBoundary';

export type Field={
 key:string;
 label:string;
 type?:'text'|'email'|'password'|'tel'|'date'|'time'|'datetime-local'|'number'|'checkbox'|'textarea'|'vnd';
 required?:boolean;
 min?:number;
 max?:number;
 maxLength?:number;
 pattern?:string;
 options?:{value:string;label:string}[];
 section?:string;
};
export type FormValues=Record<string,string|boolean>;

// Remount with a source version key to avoid silently overwriting a user's active draft.
export function ConfigurationForm({fields,initial,disabled,submit,label,validate,onCancel,sectionTabs}:{fields:Field[];initial:FormValues;disabled:boolean;submit:(v:FormValues)=>Promise<void>;label:string;validate?:(v:FormValues)=>string|null;onCancel?:()=>void;sectionTabs?:Record<string,string>}){
 const [values,setValues]=useState(initial);
 const [error,setError]=useState('');
 const sections=[...new Set(fields.map(field=>field.section??''))];
 const [activeSection,setActiveSection]=useState(sections[0]);
 const formId=useId();
 const pendingInvalid=useRef<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null>(null);
 useEffect(()=>{const control=pendingInvalid.current;if(control){pendingInvalid.current=null;control.focus();control.reportValidity();}},[activeSection]);
 const dirty=fields.some(f=>(values[f.key]??'')!==(initial[f.key]??''));
 const otherDraft=useFormDraft(dirty,label,()=>setValues(initial));
 const fieldControl=(f:Field)=><label key={f.key} data-field-key={f.key} className={f.type==='textarea'?'configuration-wide':f.type==='checkbox'?'configuration-check':undefined}>
     <span className="configuration-label">{f.label}{f.required&&<span aria-hidden="true" className="configuration-required"> *</span>}</span>
     {f.options?<select aria-label={f.label} required={f.required} value={String(values[f.key]??'')} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
     :f.type==='vnd'?<VndInput label={f.label} value={String(values[f.key]??'')} onChange={value=>setValues(v=>({...v,[f.key]:value}))} allowZero required={f.required}/>
     :f.type==='textarea'?<textarea aria-label={f.label} maxLength={f.maxLength} required={f.required} value={String(values[f.key]??'')} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}/>
     :f.type==='checkbox'?<input aria-label={f.label} type="checkbox" checked={values[f.key]===true} onChange={e=>setValues(v=>({...v,[f.key]:e.target.checked}))}/>
     :<input aria-label={f.label} type={f.type??'text'} autoComplete={f.type==='password'?'new-password':undefined} required={f.required} min={f.min} max={f.max} maxLength={f.maxLength} pattern={f.pattern} value={String(values[f.key]??'')} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}/>}
     {f.type==='date'&&<DatePreview value={String(values[f.key]??'')}/>}
    </label>;
 return <form className={`configuration-form${sectionTabs?' configuration-tabbed-form':''}`} noValidate={!!sectionTabs} onSubmit={e=>{
  e.preventDefault();
  if(sectionTabs){
   const invalid=[...e.currentTarget.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea')].find(control=>!control.disabled&&!control.validity.valid);
   if(invalid){const key=invalid.closest('[data-field-key]')?.getAttribute('data-field-key');const section=fields.find(field=>field.key===key)?.section??'';if(section!==activeSection){pendingInvalid.current=invalid;setActiveSection(section);}else invalid.reportValidity();return;}
  }
  const message=validate?.(values);setError(message??'');if(!message)void submit(values);
 }}>
  {sectionTabs&&<div className="configuration-section-tabs" role="tablist" aria-label="Nhóm thông tin hồ sơ">{sections.map((section,index)=><button key={section} id={`${formId}-tab-${index}`} type="button" role="tab" aria-selected={section===activeSection} aria-controls={`${formId}-section-${index}`} tabIndex={section===activeSection?0:-1} onClick={()=>setActiveSection(section)} onKeyDown={event=>{
   const next=event.key==='ArrowRight'?(index+1)%sections.length:event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:event.key==='Home'?0:event.key==='End'?sections.length-1:null;
   if(next===null)return;event.preventDefault();setActiveSection(sections[next]);document.getElementById(`${formId}-tab-${next}`)?.focus();
  }}>{sectionTabs[section]??section}</button>)}</div>}
  {error&&<p role="alert" className="booking-error">{error}</p>}
  <fieldset className={`configuration-fields${sectionTabs?' configuration-tabbed-fields':''}`} disabled={disabled||otherDraft}>
   {sectionTabs?sections.map((section,index)=><div className="configuration-tab-panel" role="tabpanel" id={`${formId}-section-${index}`} aria-labelledby={`${formId}-tab-${index}`} key={section} hidden={section!==activeSection}>{fields.filter(field=>(field.section??'')===section).map(fieldControl)}</div>):fields.map((f,index)=><Fragment key={f.key}>
    {f.section&&f.section!==fields[index-1]?.section&&<div className="configuration-field-section"><span>{f.section}</span></div>}
    {fieldControl(f)}
   </Fragment>)}
   <div className="configuration-form-actions"><button className="booking-primary">{label}</button>{onCancel&&<button type="button" className="button-secondary" onClick={onCancel}>Hủy</button>}</div>
  </fieldset>
 </form>;
}
