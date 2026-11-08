// Clean-room check: how much of a new file also appears in third-party code (CatCatch, LinkSwift).
// Usage: node scripts/overlap-check.cjs --corpus <dir-or-file> [--corpus …] <new files…>
// Two measures per new file:
//  - lines: non-trivial lines (≥ 25 characters after trimming) that appear verbatim in the corpus;
//  - structure: share of the new file's 20-token sequences (names and literals replaced by placeholders, so renamed
//    copies are still caught) that also occur in the corpus.
// Exit code 1 when a file passes a threshold (more than 3 identical lines outside an allow list — a few generic ones like 'new TextDecoder()' are common —, structure > 5 %; Ruxget's own files measure 0–1.6 %, CatCatch-derived ones 79–97 %).
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),corpus=[],targets=[];for(let i=0;i<args.length;i++){if(args[i]==='--corpus')corpus.push(args[++i]);else targets.push(args[i]);}
const walk=p=>fs.statSync(p).isDirectory()?fs.readdirSync(p).flatMap(n=>/^(node_modules|\.git)$/.test(n)?[]:walk(path.join(p,n))):/\.(js|mjs|html|css)$/.test(p)?[p]:[];
const strip=text=>text.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:\\])\/\/.*$/gm,'$1');
const KEYWORDS=new Set('break case catch class const continue default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await null true false undefined'.split(' '));
const tokens=text=>(strip(text).match(/[A-Za-z_$][\w$]*|\d[\w.]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|=>|===|!==|&&|\|\||\?\?|\?\.|[^\s\w]/g)||[]).map(t=>/^[A-Za-z_$]/.test(t)?(KEYWORDS.has(t)?t:'I'):/^[\d"'`]/.test(t)?'L':t);
const K=20,grams=list=>{const out=new Set();for(let i=0;i+K<=list.length;i++)out.add(list.slice(i,i+K).join(' '));return out;};
const lines=text=>strip(text).split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>=25);
const ALLOW=[/^<script src=/,/^<link rel="stylesheet"/,/^<meta (charset|name="viewport")/i];
const corpusFiles=corpus.flatMap(walk),corpusLines=new Set(),corpusGrams=new Set();
for(const f of corpusFiles){const t=fs.readFileSync(f,'utf8');lines(t).forEach(l=>corpusLines.add(l));if(/\.m?js$/.test(f))grams(tokens(t)).forEach(g=>corpusGrams.add(g));}
let failed=false;const report=[];
for(const f of targets.flatMap(walk)){const t=fs.readFileSync(f,'utf8');
 const same=lines(t).filter(l=>corpusLines.has(l)&&!ALLOW.some(a=>a.test(l)));
 const g=/\.m?js$/.test(f)?grams(tokens(t)):new Set(),shared=[...g].filter(x=>corpusGrams.has(x)).length,share=g.size?shared/g.size:0;
 const bad=same.length>3||share>0.05;failed||=bad;
 report.push({file:f,identicalLines:same.length,structureShare:+(share*100).toFixed(2),examples:same.slice(0,5)});
 console.log(`${bad?'FAIL':'ok  '} ${path.basename(f)}: ${same.length} identical lines, ${(share*100).toFixed(2)} % shared structure`);
 same.slice(0,5).forEach(l=>console.log('      = '+l.slice(0,140)));
}
console.log(`corpus: ${corpusFiles.length} files, ${corpusLines.size} lines, ${corpusGrams.size} token sequences`);
if(process.env.OVERLAP_REPORT)fs.writeFileSync(process.env.OVERLAP_REPORT,JSON.stringify({corpus:corpus,report},null,1));
process.exitCode=failed?1:0;
