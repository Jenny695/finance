/** Classify the observed disclosure cadence, without inserting or filling NAVs. */
export function navSampling(rows){
 if(rows.length<2)return {periodsPerYear:252,regular:false,coverage:0,label:'观测'};
 const gaps=rows.slice(1).map((r,i)=>(Date.parse(r.date)-Date.parse(rows[i].date))/86400000).sort((a,b)=>a-b);
 const median=gaps[Math.floor(gaps.length/2)];
 const weekends=rows.filter(r=>[0,6].includes(new Date(r.date+'T00:00:00Z').getUTCDay())).length/rows.length;
 const periodsPerYear=median<=3?(weekends>=.15?365:252):median>=6&&median<=8?52:median>=25&&median<=35?12:null;
 if(!periodsPerYear)return {periodsPerYear:252,regular:false,coverage:0,label:'不定期'};
 const elapsed=(Date.parse(rows.at(-1).date)-Date.parse(rows[0].date))/86400000;
 const coverage=Math.min(1,rows.length/(elapsed/365.25*periodsPerYear+1));
 // A-share holidays can exceed ten calendar days; density still detects major omissions.
 const limit={252:16,365:8,52:21,12:75}[periodsPerYear];
 return {periodsPerYear,regular:coverage>=.75&&gaps.at(-1)<=limit,coverage,label:{252:'交易日',365:'日度',52:'周度',12:'月度'}[periodsPerYear]};
}
